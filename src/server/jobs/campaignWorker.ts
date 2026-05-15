import 'server-only';
import { UnrecoverableError, Worker } from 'bullmq';
import { eq } from 'drizzle-orm';
import type { LayoutId } from '@/lib/layout-meta';
import { type SoraDuration, snapSoraDuration } from '@/lib/reel-cost';
import { REEL_TEMPLATES, type ReelTemplateKey } from '@/lib/reel-templates';
import { generateChannelCopy } from '@/server/ai/channelCopy';
import { type AssetCriticResult, gradeCopy, gradeImage, gradeReel } from '@/server/ai/critic';
import { getLayout } from '@/server/ai/layoutTemplates';
import { buildImagePrompt } from '@/server/ai/promptBuilder';
import { canonicalizeVisualStyleKey } from '@/server/ai/visualStyles';
import { CAMPAIGN_CONCURRENCY } from '@/server/config/campaignConcurrency';
import { CRITIC_MAX_RETRIES } from '@/server/config/criticThreshold';
import { db } from '@/server/db/client';
import { asset as assetTable } from '@/server/db/schema/assets';
import { brandKit } from '@/server/db/schema/brandKits';
import { campaignAsset } from '@/server/db/schema/campaignAssets';
import { campaign } from '@/server/db/schema/campaigns';
import { generation } from '@/server/db/schema/generations';
import { project } from '@/server/db/schema/projects';
import type { CampaignPlan, PlannedAsset } from '@/server/ingest/planCampaign';
import { getR2Object } from '@/server/storage/r2';
import type { CampaignJobData } from './campaignQueue';
import { createBullConnection, QUEUE_NAMES } from './connection';
import { getImageQueue } from './queue';
import { getVideoQueue } from './videoQueue';

/**
 * Step 4 — campaign worker (the fan-out).
 *
 * For an approved campaign:
 *   1. Load campaign + project + brand kit + product brief snapshot.
 *   2. Up-front: write a campaign_asset row per PlannedAsset (status
 *      = 'pending') so the status page (Step 5) can show progress
 *      without waiting for any pipeline to finish.
 *   3. Dispatch per-kind with concurrency caps from
 *      src/server/config/campaignConcurrency.ts:
 *        image: enqueue image-gen with the brand kit's ref images
 *               (logos / hero photos) as anchor refs.
 *        copy:  inline gpt-4o-mini call to channelCopy.
 *        reel:  enqueue video worker with allowsHumans + tone.
 *   4. Each kind's completion updates the campaign_asset row
 *      (status / generationId / costCents). Image + reel: the
 *      underlying worker writes its generation row, so we just
 *      poll generation.status here to mirror status onto the
 *      campaign_asset row.
 *   5. When all rows are 'done' or 'failed', flip the campaign
 *      to 'done' (or 'failed' if any required asset failed). The
 *      Step-5 status page reads the campaign + asset rows.
 *
 * Error policy: per-asset failures DON'T fail the campaign — each
 * row carries its own status + error message. The campaign itself
 * fails only on a global error (DB down, R2 unavailable).
 */

const PERMANENT_ERROR_PATTERNS = [
  /content[_ ]policy/i,
  /invalid_request/i,
  /unsupported/i,
  /\b400\b/,
  /\b401\b/,
  /\b403\b/,
  /\b404\b/,
];
function isPermanent(message: string): boolean {
  return PERMANENT_ERROR_PATTERNS.some((re) => re.test(message));
}

/** Poll generation.status (image / reel) and mirror back onto the
 *  campaign_asset row. Polls until terminal status or timeout. */
async function watchGeneration(
  generationId: string,
  campaignAssetId: string,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  // First update — link the generation_id so the status page sees
  // the linkage even before the upstream worker finishes.
  await db
    .update(campaignAsset)
    .set({ generationId, status: 'running' })
    .where(eq(campaignAsset.id, campaignAssetId));

  while (Date.now() < deadline) {
    await sleep(2500);
    const [gen] = await db
      .select({
        status: generation.status,
        errorMessage: generation.errorMessage,
        costCents: generation.costCents,
      })
      .from(generation)
      .where(eq(generation.id, generationId))
      .limit(1);
    if (!gen) continue;
    if (gen.status === 'done' || gen.status === 'failed') {
      await db
        .update(campaignAsset)
        .set({
          status: gen.status,
          costCents: gen.costCents ?? 0,
          errorMessage: gen.status === 'failed' ? (gen.errorMessage ?? 'upstream failed') : null,
          finishedAt: new Date(),
        })
        .where(eq(campaignAsset.id, campaignAssetId));
      return;
    }
  }
  // Timed out — flip the row to 'failed' so the campaign can finalize.
  await db
    .update(campaignAsset)
    .set({
      status: 'failed',
      errorMessage: `timed out after ${Math.round(timeoutMs / 1000)}s`,
      finishedAt: new Date(),
    })
    .where(eq(campaignAsset.id, campaignAssetId));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Concurrency gate — run N async tasks at most `limit` at a time. */
async function runWithLimit<T>(tasks: Array<() => Promise<T>>, limit: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const idx = cursor++;
      if (idx >= tasks.length) return;
      const task = tasks[idx];
      if (!task) return;
      try {
        results[idx] = await task();
      } catch (err) {
        // We always want to keep the campaign rolling even if one
        // task throws — log and continue. The campaign_asset row
        // is the source of truth for status.
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[reachy:campaign] task ${idx} threw: ${msg}`);
      }
    }
  }
  const workers = Array.from({ length: Math.max(1, Math.min(limit, tasks.length)) }, () =>
    worker(),
  );
  await Promise.all(workers);
  return results;
}

/** Map a planner reel duration to an actual ReelTemplate. Picks the
 *  template whose totalDurationSec is closest to the requested value.
 *  Snaps the resulting ENGINE duration to a Sora-valid step. */
function resolveReelTemplate(durationSec: number): {
  templateKey: ReelTemplateKey;
  template: (typeof REEL_TEMPLATES)[ReelTemplateKey];
  soraDuration: SoraDuration;
} {
  let best: ReelTemplateKey | null = null;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (const [key, tpl] of Object.entries(REEL_TEMPLATES)) {
    const delta = Math.abs(tpl.durationSec - durationSec);
    if (delta < bestDelta) {
      best = key as ReelTemplateKey;
      bestDelta = delta;
    }
  }
  const templateKey = best ?? ('feature-15s' as ReelTemplateKey);
  const template = REEL_TEMPLATES[templateKey];
  return {
    templateKey,
    template,
    soraDuration: snapSoraDuration(template.durationSec),
  };
}

export function startCampaignWorker(): Worker<CampaignJobData> {
  return new Worker<CampaignJobData>(
    QUEUE_NAMES.campaign,
    async (job) => {
      const { campaignId } = job.data;

      const [row] = await db.select().from(campaign).where(eq(campaign.id, campaignId)).limit(1);
      if (!row) throw new UnrecoverableError(`campaign ${campaignId} not found`);
      if (row.status === 'done' || row.status === 'failed') {
        console.log(`[reachy:campaign] gen ${campaignId} already ${row.status} — skipping`);
        return;
      }

      const plan = (row.plan ?? null) as CampaignPlan | null;
      if (!plan || !Array.isArray(plan.assets) || plan.assets.length === 0) {
        await db
          .update(campaign)
          .set({ status: 'failed', errorMessage: 'no plan to execute', finishedAt: new Date() })
          .where(eq(campaign.id, campaignId));
        throw new UnrecoverableError(`campaign ${campaignId} has no plan`);
      }

      const [proj] = await db.select().from(project).where(eq(project.id, row.projectId)).limit(1);
      if (!proj) throw new UnrecoverableError(`project ${row.projectId} not found`);

      const [kit] = await db
        .select()
        .from(brandKit)
        .where(eq(brandKit.projectId, proj.id))
        .limit(1);

      // Snapshot the brief once for downstream copy generation.
      const briefSnapshot = (row.brief ?? null) as
        | import('@/server/ingest/extractBrief').ProductBrief
        | null;
      if (!briefSnapshot) {
        // The brief snapshot should always be present (Step 2 writes
        // it into the campaign at plan time). Without it copy assets
        // will produce empty output, so we surface a hard failure.
        await db
          .update(campaign)
          .set({
            status: 'failed',
            errorMessage: 'campaign has no brief snapshot',
            finishedAt: new Date(),
          })
          .where(eq(campaign.id, campaignId));
        throw new UnrecoverableError(`campaign ${campaignId} has no brief snapshot`);
      }

      // 1. Write campaign_asset rows up-front (status 'pending') so the
      //    status page can render the slate before any pipeline lands.
      const insertRows = plan.assets.map((asset) => ({
        campaignId,
        kind: asset.kind,
        channel: asset.kind === 'copy' ? asset.channel : null,
        status: 'pending' as const,
        briefSnapshot: asset.brief.slice(0, 1200),
        // Order matters for the status page — index is implied by
        // insertion order; the status page sorts by created_at.
        costCents: 0,
      }));
      const insertedAssetRows = await db.insert(campaignAsset).values(insertRows).returning();
      console.log(`[reachy:campaign] gen ${campaignId} insertedAssets=${insertedAssetRows.length}`);

      // 2. Dispatch — group by kind, run each group with its concurrency cap.
      const imageTasks: Array<() => Promise<void>> = [];
      const copyTasks: Array<() => Promise<void>> = [];
      const reelTasks: Array<() => Promise<void>> = [];

      const refImages = (kit?.referenceAssetKeys ?? []) as string[];
      const language = (kit?.languages ?? ['en'])[0] as 'en' | 'es';

      for (let i = 0; i < plan.assets.length; i++) {
        const asset = plan.assets[i] as PlannedAsset | undefined;
        const rowRecord = insertedAssetRows[i];
        if (!asset || !rowRecord) continue;
        const campaignAssetId = rowRecord.id;

        if (asset.kind === 'image') {
          imageTasks.push(async () => {
            await dispatchWithCritic({
              kind: 'image',
              asset,
              campaignAssetId,
              project: proj,
              brandKitRow: kit,
              language,
              productBrief: briefSnapshot,
            });
          });
        } else if (asset.kind === 'copy') {
          copyTasks.push(async () => {
            await dispatchWithCritic({
              kind: 'copy',
              asset,
              campaignAssetId,
              project: proj,
              brandKitRow: kit,
              language,
              productBrief: briefSnapshot,
            });
          });
        } else if (asset.kind === 'reel') {
          reelTasks.push(async () => {
            await dispatchWithCritic({
              kind: 'reel',
              asset,
              campaignAssetId,
              project: proj,
              brandKitRow: kit,
              language,
              productBrief: briefSnapshot,
            });
          });
        }
      }
      void refImages; // future: pass into reel pipeline once it accepts refs

      // Reels are intentionally serial (existing videoWorker is
      // concurrency=1 inside) so we honor cap=1 here too.
      await Promise.all([
        runWithLimit(imageTasks, CAMPAIGN_CONCURRENCY.image),
        runWithLimit(copyTasks, CAMPAIGN_CONCURRENCY.copy),
        runWithLimit(reelTasks, CAMPAIGN_CONCURRENCY.reel),
      ]);

      // 3. Finalize. Sum costs from each asset row + flip campaign status.
      const finalRows = await db
        .select({ status: campaignAsset.status, costCents: campaignAsset.costCents })
        .from(campaignAsset)
        .where(eq(campaignAsset.campaignId, campaignId));
      const totalCost = finalRows.reduce((acc, r) => acc + (r.costCents ?? 0), 0);
      const failedCount = finalRows.filter((r) => r.status === 'failed').length;
      const finalStatus = failedCount === finalRows.length ? 'failed' : 'done';
      await db
        .update(campaign)
        .set({
          status: finalStatus,
          costCentsActual: totalCost,
          finishedAt: new Date(),
          errorMessage:
            finalStatus === 'failed'
              ? `every asset failed (${failedCount}/${finalRows.length})`
              : null,
        })
        .where(eq(campaign.id, campaignId));

      console.log(
        `[reachy:campaign] gen ${campaignId} ${finalStatus} · assets=${finalRows.length} · failed=${failedCount} · costCents=${totalCost}`,
      );
    },
    {
      connection: createBullConnection(),
      lockDuration: 60 * 60 * 1000,
      stalledInterval: 60 * 1000,
      concurrency: 1,
    },
  );
}

// ─── Per-kind dispatchers ───────────────────────────────────────────

async function dispatchImage(args: {
  asset: Extract<PlannedAsset, { kind: 'image' }>;
  campaignAssetId: string;
  project: typeof project.$inferSelect;
  brandKitRow: typeof brandKit.$inferSelect | undefined;
  language: 'en' | 'es';
}): Promise<void> {
  const { asset, campaignAssetId, project: proj, brandKitRow: kit, language } = args;
  try {
    const layout = getLayout({ layoutId: asset.layoutId as LayoutId });
    const prompt = buildImagePrompt({
      idea: asset.brief,
      format: asset.format,
      project: { name: proj.name, audience: proj.audience, tone: proj.tone },
      brandKit: kit ?? null,
      language,
      layout,
      visualStyleOverride: canonicalizeVisualStyleKey(asset.visualStyle ?? null),
      copy: {},
    });

    // Insert a generation row first so the campaign_asset row can
    // link it before the upstream worker writes.
    const [gen] = await db
      .insert(generation)
      .values({
        projectId: proj.id,
        type: 'image',
        format: asset.format,
        status: 'queued',
        provider: 'openai',
        model: 'gpt-image-2',
        prompt,
        params: {
          idea: asset.brief,
          n: 1,
          language,
          quality: 'high',
          visualStyleOverride: asset.visualStyle,
          layoutId: layout.id,
          mode: 'exploration',
          effort: 'balanced',
          campaignAssetId,
        },
      })
      .returning();
    if (!gen) throw new Error('image generation row insert returned nothing');

    await getImageQueue().add(
      'generate',
      {
        generationId: gen.id,
        projectId: proj.id,
        prompt,
        format: asset.format,
        provider: 'openai',
        model: 'gpt-image-2',
        n: 1,
        quality: 'high',
        layoutId: layout.id as LayoutId,
        idea: asset.brief,
        language,
        mode: 'exploration',
        effort: 'balanced',
      },
      { jobId: gen.id },
    );

    // Watch up to 5 minutes — image-gen tier-1 routinely lands in <60s.
    await watchGeneration(gen.id, campaignAssetId, 5 * 60 * 1000);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db
      .update(campaignAsset)
      .set({ status: 'failed', errorMessage: msg, finishedAt: new Date() })
      .where(eq(campaignAsset.id, campaignAssetId));
    if (isPermanent(msg)) throw new UnrecoverableError(msg);
  }
}

async function dispatchCopy(args: {
  asset: Extract<PlannedAsset, { kind: 'copy' }>;
  campaignAssetId: string;
  brandKitRow: typeof brandKit.$inferSelect | undefined;
  productBrief: import('@/server/ingest/extractBrief').ProductBrief;
  language: 'en' | 'es';
}): Promise<void> {
  const { asset, campaignAssetId, brandKitRow: kit, productBrief, language } = args;
  try {
    await db
      .update(campaignAsset)
      .set({ status: 'running' })
      .where(eq(campaignAsset.id, campaignAssetId));

    const result = await generateChannelCopy({
      brief: asset.brief,
      channel: asset.channel,
      brandKit: kit ?? null,
      productBrief,
      language,
    });

    await db
      .update(campaignAsset)
      .set({
        status: 'done',
        copyOutput: result.text,
        costCents: result.costCents,
        finishedAt: new Date(),
      })
      .where(eq(campaignAsset.id, campaignAssetId));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db
      .update(campaignAsset)
      .set({ status: 'failed', errorMessage: msg, finishedAt: new Date() })
      .where(eq(campaignAsset.id, campaignAssetId));
    if (isPermanent(msg)) throw new UnrecoverableError(msg);
  }
}

async function dispatchReel(args: {
  asset: Extract<PlannedAsset, { kind: 'reel' }>;
  campaignAssetId: string;
  project: typeof project.$inferSelect;
  brandKitRow: typeof brandKit.$inferSelect | undefined;
  // _refImageKeys: kept here for future plumbing into the reel
  //   pipeline (reels currently don't accept R2 refs at the worker
  //   boundary — that's a Step 4.5 polish). Underscore-prefix
  //   signals "intentionally unused" to lint + reviewers.
  _refImageKeys: readonly string[];
}): Promise<void> {
  const { asset, campaignAssetId, project: proj, brandKitRow: kit } = args;
  try {
    const { templateKey, template, soraDuration } = resolveReelTemplate(asset.durationSec);

    // Reel plan needs concrete scene texts; the bulk worker stays
    // hands-off and lets the videoWorker's planner run with the
    // asset.brief as the input (planReel is invoked elsewhere). For
    // now we synthesize a minimal plan using the template's scene
    // structure + a single tagline so the existing pipeline accepts it.
    const minimalPlan = {
      tagline: asset.brief.split(/[.!?]/)[0]?.trim().slice(0, 80) || asset.brief.slice(0, 80),
      scenes: template.scenes.map((scene, i) => ({
        slot: scene.slot,
        durationSec: scene.durationSec,
        textOverlay: i === 0 ? asset.brief.slice(0, 80) : '',
        narration: i === 0 ? asset.brief : '',
        textPosition: scene.textPosition,
        imagePrompt: '',
        background: scene.background ?? ('image' as const),
      })),
    };

    const [gen] = await db
      .insert(generation)
      .values({
        projectId: proj.id,
        type: 'video',
        format: 'reel-cover',
        status: 'queued',
        provider: 'openai',
        model: 'sora-2-pro',
        prompt: asset.brief,
        params: {
          engine: 'sora-pro-720p',
          plan: minimalPlan,
          template: templateKey,
          campaignAssetId,
        },
      })
      .returning();
    if (!gen) throw new Error('reel generation row insert returned nothing');

    await getVideoQueue().add(
      'compose',
      {
        generationId: gen.id,
        projectId: proj.id,
        projectSlug: proj.slug,
        engine: 'sora-pro-720p',
        plan: minimalPlan as never,
        brandColorHex: kit?.primaryColor ?? '#14110D',
        brandTextHex: kit?.bgColor ?? '#F1EBDF',
        visualStyle: canonicalizeVisualStyleKey(asset.visualStyle),
        allowsHumans: kit?.allowsHumans ?? true,
        tone: proj.tone ?? undefined,
      },
      { jobId: gen.id },
    );

    void soraDuration;

    // Reels routinely take 3-8 minutes — give 15min headroom.
    await watchGeneration(gen.id, campaignAssetId, 15 * 60 * 1000);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db
      .update(campaignAsset)
      .set({ status: 'failed', errorMessage: msg, finishedAt: new Date() })
      .where(eq(campaignAsset.id, campaignAssetId));
    if (isPermanent(msg)) throw new UnrecoverableError(msg);
  }
}

// ─── Critic-aware orchestrator ──────────────────────────────────────

/**
 * Step-5 critic loop: dispatches the asset through the per-kind
 * pipeline, fetches the produced artifact, runs gradeImage/Copy/Reel,
 * and either accepts the score or re-dispatches with a retry hint
 * up to CRITIC_MAX_RETRIES times. After exhaustion the asset
 * survives with status_detail='quality_warning' so the campaign
 * still finalizes — Garcia sees the warning in the gallery.
 *
 * When brand_kit.quality_gate_enabled === false, the loop runs once
 * with no grading (cheap exploration mode).
 */
async function dispatchWithCritic(args: {
  kind: 'image' | 'copy' | 'reel';
  asset: PlannedAsset;
  campaignAssetId: string;
  project: typeof project.$inferSelect;
  brandKitRow: typeof brandKit.$inferSelect | undefined;
  language: 'en' | 'es';
  productBrief: import('@/server/ingest/extractBrief').ProductBrief;
}): Promise<void> {
  const { kind, campaignAssetId, brandKitRow: kit, language } = args;
  const qualityGate = kit?.qualityGateEnabled ?? true;
  let retryHint: string | undefined;
  let cumulativeCriticCents = 0;

  for (let attempt = 0; attempt <= CRITIC_MAX_RETRIES; attempt++) {
    const effectiveBrief =
      attempt === 0 || !retryHint
        ? args.asset.brief
        : `${args.asset.brief}\n\nRevision note: ${retryHint}`;
    const asset = mutateBrief(args.asset, effectiveBrief);

    if (kind === 'image' && asset.kind === 'image') {
      await dispatchImage({
        asset,
        campaignAssetId,
        project: args.project,
        brandKitRow: kit,
        language,
      });
    } else if (kind === 'copy' && asset.kind === 'copy') {
      await dispatchCopy({
        asset,
        campaignAssetId,
        brandKitRow: kit,
        productBrief: args.productBrief,
        language,
      });
    } else if (kind === 'reel' && asset.kind === 'reel') {
      await dispatchReel({
        asset,
        campaignAssetId,
        project: args.project,
        brandKitRow: kit,
        _refImageKeys: [],
      });
    }

    const [row] = await db
      .select()
      .from(campaignAsset)
      .where(eq(campaignAsset.id, campaignAssetId))
      .limit(1);
    if (!row) return;
    if (row.status === 'failed') return;
    if (!qualityGate) return;

    let result: AssetCriticResult | null = null;
    try {
      result = await runGraderForRow({ row, kind, args });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        `[reachy:campaign] gen ${args.campaignAssetId} grader threw — accepting asset: ${msg}`,
      );
      return;
    }
    cumulativeCriticCents += result.costCents;

    if (result.passes) {
      await db
        .update(campaignAsset)
        .set({
          criticScore: result.score.toFixed(1),
          criticIssues: result.issues,
          criticCostCents: cumulativeCriticCents,
        })
        .where(eq(campaignAsset.id, campaignAssetId));
      console.log(
        `[reachy:campaign] gen ${campaignAssetId} ${kind} graded · score=${result.score} · pass · attempt=${attempt + 1}`,
      );
      return;
    }

    await db
      .update(campaignAsset)
      .set({
        criticScore: result.score.toFixed(1),
        criticIssues: result.issues,
        criticCostCents: cumulativeCriticCents,
        retriesCount: attempt + 1,
      })
      .where(eq(campaignAsset.id, campaignAssetId));

    if (attempt >= CRITIC_MAX_RETRIES) {
      await db
        .update(campaignAsset)
        .set({ statusDetail: 'quality_warning' })
        .where(eq(campaignAsset.id, campaignAssetId));
      console.log(
        `[reachy:campaign] gen ${campaignAssetId} ${kind} graded · score=${result.score} · WARNING after ${attempt + 1} attempts`,
      );
      return;
    }

    retryHint = result.retryHint ?? result.issues.slice(0, 2).join(' · ');
    console.log(
      `[reachy:campaign] gen ${campaignAssetId} ${kind} graded · score=${result.score} · retry ${attempt + 1}/${CRITIC_MAX_RETRIES} · hint="${(retryHint ?? '').slice(0, 100)}"`,
    );
  }
}

function mutateBrief(asset: PlannedAsset, brief: string): PlannedAsset {
  if (asset.kind === 'image') return { ...asset, brief };
  if (asset.kind === 'copy') return { ...asset, brief };
  return { ...asset, brief };
}

async function runGraderForRow(args: {
  row: typeof campaignAsset.$inferSelect;
  kind: 'image' | 'copy' | 'reel';
  args: {
    asset: PlannedAsset;
    campaignAssetId: string;
    project: typeof project.$inferSelect;
    brandKitRow: typeof brandKit.$inferSelect | undefined;
    language: 'en' | 'es';
    productBrief: import('@/server/ingest/extractBrief').ProductBrief;
  };
}): Promise<AssetCriticResult> {
  const { row, kind } = args;
  const brandKitForCritic = (args.args.brandKitRow ?? null) as
    | import('@/server/actions/brandKits').BrandKit
    | null;

  if (kind === 'copy') {
    return gradeCopy({
      text: row.copyOutput ?? '',
      channel: (row.channel ??
        'linkedin-post-short') as import('@/server/config/channelTemplates').ChannelKey,
      brief: row.briefSnapshot ?? '',
      brandKit: brandKitForCritic,
      language: args.args.language,
    });
  }

  if (kind === 'image') {
    if (!row.generationId) throw new Error('grader: image missing generationId');
    const [imageAsset] = await db
      .select({ storageKey: assetTable.storageKey })
      .from(assetTable)
      .where(eq(assetTable.generationId, row.generationId))
      .limit(1);
    if (!imageAsset?.storageKey) throw new Error('grader: image asset row not found');
    const buf = await getR2Object(imageAsset.storageKey);
    const imageAssetTyped = args.args.asset as Extract<PlannedAsset, { kind: 'image' }>;
    return gradeImage({
      buffer: buf,
      brief: row.briefSnapshot ?? '',
      layoutLabel: imageAssetTyped.layoutId,
      brandKit: brandKitForCritic,
      language: args.args.language,
    });
  }

  if (!row.generationId) throw new Error('grader: reel missing generationId');
  const [reelAsset] = await db
    .select({ storageKey: assetTable.storageKey })
    .from(assetTable)
    .where(eq(assetTable.generationId, row.generationId))
    .limit(1);
  if (!reelAsset?.storageKey) throw new Error('grader: reel asset row not found');
  return gradeReel({
    videoR2Key: reelAsset.storageKey,
    brief: row.briefSnapshot ?? '',
    brandKit: brandKitForCritic,
    language: args.args.language,
  });
}
