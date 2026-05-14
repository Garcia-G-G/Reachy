import 'server-only';
import { UnrecoverableError, Worker } from 'bullmq';
import { eq } from 'drizzle-orm';
import { getFormat } from '@/server/ai/formats';
import { generateImage } from '@/server/ai/imageGen';
import { db } from '@/server/db/client';
import { asset } from '@/server/db/schema/assets';
import { generation } from '@/server/db/schema/generations';
import { putR2 } from '@/server/storage/r2';
import { createBullConnection, QUEUE_NAMES } from './connection';
import type { ImageGenJobData } from './queue';

// Errors we don't want BullMQ to retry. OpenAI/fal will reject the same prompt
// the second time too — retrying just burns the wallet a second time.
const PERMANENT_ERROR_PATTERNS = [
  /content[_ ]policy/i,
  /refus/i,
  /invalid_request/i,
  /unsupported/i,
  /model_not_found/i,
  /\b400\b/,
  /\b401\b/,
  /\b403\b/,
  /\b404\b/,
];

function isPermanent(message: string): boolean {
  return PERMANENT_ERROR_PATTERNS.some((re) => re.test(message));
}

export function startImageWorker(): Worker<ImageGenJobData> {
  const worker = new Worker<ImageGenJobData>(
    QUEUE_NAMES.imageGen,
    async (job) => {
      const { generationId, projectId, prompt, format, provider, model, n, quality } = job.data;
      const fm = getFormat(format);

      await db
        .update(generation)
        .set({ status: 'running', errorMessage: null, finishedAt: null })
        .where(eq(generation.id, generationId));

      // Idempotency: wipe any rows from a prior failed attempt so we never
      // double-charge the archive when BullMQ retries this job.
      if (job.attemptsMade > 0) {
        await db.delete(asset).where(eq(asset.generationId, generationId));
      }

      try {
        const result = await generateImage({ prompt, format, provider, model, n, quality });

        // One round-trip insert instead of N. Order is preserved by the array
        // index so `${i+1}.png` keys still align with row order.
        const rows: Array<typeof asset.$inferInsert> = [];
        for (const [i, buf] of result.buffers.entries()) {
          const key = `${projectId}/${generationId}/${i + 1}.png`;
          const upload = await putR2(key, buf, result.contentType);
          rows.push({
            generationId,
            projectId,
            kind: 'image',
            format,
            width: fm.w,
            height: fm.h,
            storageKey: upload.key,
            publicUrl: upload.publicUrl,
            bytes: upload.bytes,
          });
        }
        await db.insert(asset).values(rows);

        await db
          .update(generation)
          .set({
            status: 'done',
            finishedAt: new Date(),
            costCents: result.costCents,
          })
          .where(eq(generation.id, generationId));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[reachy:worker] generation ${generationId} failed:`, message);
        await db
          .update(generation)
          .set({
            status: 'failed',
            errorMessage: message,
            finishedAt: new Date(),
          })
          .where(eq(generation.id, generationId));

        // Don't burn another retry on errors that won't resolve themselves.
        if (isPermanent(message)) {
          throw new UnrecoverableError(message);
        }
        throw err;
      }
    },
    {
      connection: createBullConnection(),
      // Image gen + R2 upload routinely exceeds BullMQ's 30s default lock.
      // Without this, a long-running job is marked stalled, picked up by a
      // second worker, and we double-bill OpenAI.
      lockDuration: 120_000,
      stalledInterval: 30_000,
      // OpenAI image-gen tier-1 is 5 RPM. With concurrency:4 × n:4 we'd trip
      // it on the first burst. Drop to 2 and add a soft per-minute cap.
      concurrency: 2,
      limiter: { max: 6, duration: 60_000 },
    },
  );

  worker.on('failed', (job, err) => {
    console.error(`[reachy:worker] job ${job?.id} failed: ${err.message}`);
  });
  worker.on('completed', (job) => {
    console.log(`[reachy:worker] job ${job.id} completed (gen=${job.data.generationId})`);
  });
  worker.on('error', (err) => {
    console.error('[reachy:worker] worker error:', err.message);
  });

  return worker;
}
