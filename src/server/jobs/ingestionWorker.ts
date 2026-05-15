import 'server-only';
import { UnrecoverableError, Worker } from 'bullmq';
import { eq } from 'drizzle-orm';
import { MAX_BYTES_PER_INGESTION } from '@/server/config/parserLimits';
import { db } from '@/server/db/client';
import { ingestion } from '@/server/db/schema/ingestion';
import { aggregate } from '@/server/ingest/aggregate';
import { routeAndParse } from '@/server/ingest/dispatch';
import { runBriefExtractionFor } from '@/server/ingest/runBriefExtraction';
import { runCampaignPlanForIngestion } from '@/server/ingest/runCampaignPlan';
import type { ParseCtx, ParsedFile } from '@/server/ingest/types';
import { getR2Object } from '@/server/storage/r2';
import { createBullConnection, QUEUE_NAMES } from './connection';
import type { IngestionJobData } from './ingestionQueue';

/**
 * Ingestion worker — Step 1 of the autopilot rebuild.
 *
 * For each fileRef in the job, fetches the upload bytes from R2,
 * routes through the parser dispatcher, then aggregates everything
 * into an IngestedBundle and writes it to ingestion.bundle.
 *
 * Errors policy:
 *   - A single per-file parser failure does NOT fail the ingestion;
 *     the file lands in `unparsedFiles` with an inline error block.
 *   - A whole-ingestion failure (network down, R2 unavailable, DB
 *     write rejected) flips the row to status='failed' with the
 *     error message in `error_message`.
 *   - Permanent-error patterns short-circuit BullMQ retries so the
 *     wallet isn't drained on a doomed job.
 */

const PERMANENT_ERROR_PATTERNS: RegExp[] = [
  /R2 is not configured/i,
  /R2_BUCKET is not set/i,
  /content[_ ]policy/i,
  /\b400\b/,
  /\b401\b/,
  /\b403\b/,
  /\b404\b/,
];

function isPermanent(message: string): boolean {
  return PERMANENT_ERROR_PATTERNS.some((re) => re.test(message));
}

export function startIngestionWorker(): Worker<IngestionJobData> {
  const worker = new Worker<IngestionJobData>(
    QUEUE_NAMES.ingestion,
    async (job) => {
      const { ingestionId, userId, fileRefs } = job.data;

      await db
        .update(ingestion)
        .set({ status: 'parsing', errorMessage: null, finishedAt: null })
        .where(eq(ingestion.id, ingestionId));

      console.log(
        `[reachy:ingest] gen ${ingestionId} files=${fileRefs.length} totalBytes=${fileRefs.reduce(
          (a, f) => a + f.bytes,
          0,
        )}`,
      );

      try {
        const totalBytes = fileRefs.reduce((acc, f) => acc + f.bytes, 0);
        if (totalBytes > MAX_BYTES_PER_INGESTION) {
          throw new UnrecoverableError(
            `ingestion total ${totalBytes} bytes exceeds cap ${MAX_BYTES_PER_INGESTION}`,
          );
        }

        const extractedPrefix = `uploads/${userId}/${ingestionId}/extracted`;
        const parsedFiles: ParsedFile[] = [];
        const unparsedFiles: string[] = [];

        const ctx: ParseCtx = {
          userId,
          ingestionId,
          extractedPrefix,
          routeAndParse: async (input) => {
            try {
              return await routeAndParse({
                filename: input.filename,
                mime: input.mime,
                buffer: input.buffer,
                ctx,
              });
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              console.warn(
                `[reachy:ingest] gen ${ingestionId} nested file ${input.filename} parser error: ${msg}`,
              );
              return null;
            }
          },
        };

        for (const ref of fileRefs) {
          let buf: Buffer;
          try {
            buf = await getR2Object(ref.r2Key);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(
              `[reachy:ingest] gen ${ingestionId} R2 fetch failed for ${ref.originalName}: ${msg}`,
            );
            unparsedFiles.push(`${ref.originalName} (R2 fetch failed)`);
            continue;
          }
          try {
            const parsed = await routeAndParse({
              filename: ref.originalName,
              mime: ref.mime,
              buffer: buf,
              ctx,
            });
            if (parsed) {
              parsedFiles.push(parsed);
            } else {
              unparsedFiles.push(`${ref.originalName} (no parser route)`);
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(
              `[reachy:ingest] gen ${ingestionId} parser error for ${ref.originalName}: ${msg}`,
            );
            unparsedFiles.push(`${ref.originalName} (parser error: ${msg})`);
          }
        }

        const bundle = aggregate({
          ingestionId,
          parsedFiles,
          unparsedFiles: unparsedFiles.length > 0 ? unparsedFiles : undefined,
        });

        await db
          .update(ingestion)
          .set({
            status: 'ready',
            bundle: bundle as unknown as Record<string, unknown>,
            finishedAt: new Date(),
          })
          .where(eq(ingestion.id, ingestionId));

        console.log(
          `[reachy:ingest] gen ${ingestionId} ready · ${bundle.textBlocks.length} blocks · ${bundle.images.length} images · ${bundle.tables.length} tables · ${bundle.codeContext.length} code-files · mix=${JSON.stringify(bundle.fileTypeMix)}`,
        );

        // Step 2 — brief extraction. Failure here does NOT regress the
        // ingestion status to 'failed' (the bundle is still good).
        // Step 3's approval UI shows a "re-extract" button when
        // bundle.brief is missing or carries an autofillError.
        try {
          const briefRes = await runBriefExtractionFor(ingestionId);
          const b = briefRes.stored;
          console.log(
            `[reachy:ingest] gen ${ingestionId} brief ready · project=${b.projectSlug ?? '(not created)'} · tone=${b.brief.tone} · langs=${b.brief.languages.join(',')} · cost=${b.costCents}¢ · model=${b.briefModel} · vision=${b.visionModel ?? 'skipped'}`,
          );

          // Step 3 — campaign plan. Only runs when Step 2 auto-created
          // a project (no project ⇒ no campaign can be linked). Plan
          // failures DO NOT regress the ingestion — the review page
          // surfaces a "re-plan" affordance.
          if (b.projectId) {
            try {
              const planRes = await runCampaignPlanForIngestion({
                ingestionId,
                projectId: b.projectId,
              });
              console.log(
                `[reachy:ingest] gen ${ingestionId} campaign ${planRes.reused ? 'reused' : 'planned'} · campaign=${planRes.campaignId} · assets=${planRes.plan.assets.length} · cost=${planRes.costCents}¢ · model=${planRes.modelUsed}`,
              );
            } catch (planErr) {
              const planMsg = planErr instanceof Error ? planErr.message : String(planErr);
              console.warn(
                `[reachy:ingest] gen ${ingestionId} campaign plan failed — ingestion + brief still ready: ${planMsg}`,
              );
            }
          }
        } catch (briefErr) {
          const briefMsg = briefErr instanceof Error ? briefErr.message : String(briefErr);
          console.warn(
            `[reachy:ingest] gen ${ingestionId} brief extraction failed — ingestion still ready: ${briefMsg}`,
          );
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[reachy:ingest] gen ${ingestionId} failed:`, message);
        await db
          .update(ingestion)
          .set({
            status: 'failed',
            errorMessage: message,
            finishedAt: new Date(),
          })
          .where(eq(ingestion.id, ingestionId));
        if (isPermanent(message)) {
          throw new UnrecoverableError(message);
        }
        throw err;
      }
    },
    {
      connection: createBullConnection(),
      // Ingestion can chew through a deck + a repo zip in well under
      // 30s but a 100MB upload + R2 round-trips warrants headroom.
      lockDuration: 180_000,
      stalledInterval: 30_000,
      concurrency: 2,
    },
  );

  worker.on('failed', (job, err) => {
    console.error(`[reachy:ingest] job ${job?.id} failed: ${err.message}`);
  });
  worker.on('completed', (job) => {
    console.log(`[reachy:ingest] job ${job.id} completed (ing=${job.data.ingestionId})`);
  });
  worker.on('error', (err) => {
    console.error('[reachy:ingest] worker error:', err.message);
  });

  return worker;
}
