import 'server-only';
import { UnrecoverableError, Worker } from 'bullmq';
import { eq } from 'drizzle-orm';
import { type BrandColors, composeImage, type PlannedCopy } from '@/server/ai/composeImage';
import { planCopy, planCopySequence } from '@/server/ai/copyPlanner';
import { pickBest } from '@/server/ai/critic';
import { getFormat } from '@/server/ai/formats';
import { generateImage } from '@/server/ai/imageGen';
import { getLayout, type LayoutId, resolveSequenceHint } from '@/server/ai/layoutTemplates';
import { buildImagePrompt, pickVariantAxis } from '@/server/ai/promptBuilder';
import { enhancePrompt } from '@/server/ai/promptEnhancer';
import type { VisualStyleKey } from '@/server/ai/visualStyles';
import { getBrandReferenceImages } from '@/server/lib/brandReferences';
import { db } from '@/server/db/client';
import { asset } from '@/server/db/schema/assets';
import { brandKit } from '@/server/db/schema/brandKits';
import { generation } from '@/server/db/schema/generations';
import { project } from '@/server/db/schema/projects';
import { putR2 } from '@/server/storage/r2';
import { createBullConnection, QUEUE_NAMES } from './connection';
import type { ImageGenJobData } from './queue';

/** Default brand color fallbacks — keep editorial palette so missing
 *  brand kits still produce on-brand output instead of system grey. */
const FALLBACK_COLORS: BrandColors = {
  ink: '#14110D',
  paper: '#F1EBDF',
  accent: '#B6481A',
};

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
      const {
        generationId,
        projectId,
        prompt,
        format,
        provider,
        model,
        n,
        quality,
        layoutId,
        idea,
        language,
        sourceRawUrl,
        tweakPrompt,
        mode,
        effort,
      } = job.data;
      const effortTier: 'fast' | 'balanced' | 'high' = effort ?? 'balanced';
      const fm = getFormat(format);
      // Sequence mode is gated on (a) explicit mode='sequence', (b) a
      // layout (sequence without typography overlay has nothing to
      // progress), and (c) n ≥ 2 (a one-frame sequence is just a
      // generation). Anything else falls through to exploration.
      const sequenceMode = mode === 'sequence' && Boolean(layoutId) && n >= 2;
      // Best-of-K critic mode. Only valid for OpenAI provider (we need
      // the vision critic to judge), exploration only, layout-gated
      // (the critic uses layout.negativeSpaceHint to judge composition).
      const criticMode =
        effortTier === 'high' && !sequenceMode && provider === 'openai' && Boolean(layoutId);

      await db
        .update(generation)
        .set({ status: 'running', errorMessage: null, finishedAt: null })
        .where(eq(generation.id, generationId));

      // Single audit-line per job: which model / provider / quality / n /
      // layout actually got picked up. Helps diagnose dropdown bugs (e.g.
      // "only gpt-image-2 is selectable") without needing to query the
      // DB — tail the worker log and you can see exactly what each
      // generation row was running with.
      console.log(
        `[reachy:image] gen ${generationId} provider=${provider} model=${model} quality=${quality ?? 'medium'} n=${n} layout=${layoutId ?? 'none'} variation=${sourceRawUrl ? 'yes' : 'no'} mode=${sequenceMode ? 'sequence' : 'exploration'} effort=${effortTier} critic=${criticMode ? 'yes' : 'no'}`,
      );

      // Idempotency: wipe any rows from a prior failed attempt so we never
      // double-charge the archive when BullMQ retries this job.
      if (job.attemptsMade > 0) {
        await db.delete(asset).where(eq(asset.generationId, generationId));
      }

      try {
        // Marketing-grade pipeline:
        //   1. AI renders the BACKGROUND (prompt forbids text in the pixels).
        //   2. copyPlanner LLM-generates eyebrow/headline/etc. for the slots
        //      this layout needs.
        //   3. composeImage overlays brand-fontd typography on top with exact
        //      brand hex colors.
        //
        // Two top-level branches:
        //   • Exploration mode (default) — one images.generate (or .edit
        //     when sourceRawUrl is set), N parallel outputs, one shared
        //     PlannedCopy.
        //   • Sequence mode               — N serial calls. Frame K uses
        //     frame K-1 as the images.edit reference. Each frame gets its
        //     OWN PlannedCopy (planned in one LLM call up-front).

        // Variation mode: when sourceRawUrl is set we fetch that bg from R2
        // and pass it to openai.images.edit. The model treats it as the
        // reference image for the new variant — keeps composition close to
        // the source while honouring the tweakPrompt. Variation mode is
        // mutually exclusive with sequence mode at the action layer.
        let sourceImage: Buffer | undefined;
        if (sourceRawUrl) {
          const sourceRes = await fetch(sourceRawUrl);
          if (!sourceRes.ok) {
            throw new Error(
              `variation source fetch failed: ${sourceRes.status} ${sourceRes.statusText}`,
            );
          }
          sourceImage = Buffer.from(await sourceRes.arrayBuffer());
        }
        const editPrompt = sourceRawUrl
          ? [
              tweakPrompt?.trim()
                ? `Variation. Tweak the composition: ${tweakPrompt.trim()}.`
                : 'Generate a variation: keep the visual style and palette of the source, vary the specific composition (different shapes, slightly different layout, fresh take on the same vibe).',
              prompt,
            ].join(' ')
          : prompt;

        // Load project + brand kit ONCE so both branches can share. The
        // compose branch only runs when layoutId is set; sequence mode
        // requires it.
        const layout = layoutId ? getLayout({ layoutId }) : null;
        const [proj] = await db.select().from(project).where(eq(project.id, projectId)).limit(1);
        const [kit] = proj
          ? await db.select().from(brandKit).where(eq(brandKit.projectId, proj.id)).limit(1)
          : [];
        let colors: BrandColors = FALLBACK_COLORS;
        if (kit) {
          colors = {
            ink: kit.primaryColor ?? FALLBACK_COLORS.ink,
            paper: kit.bgColor ?? FALLBACK_COLORS.paper,
            accent: kit.accentColor ?? FALLBACK_COLORS.accent,
          };
        }

        // Outputs the unified DB write below consumes regardless of branch.
        const composedBuffers: Buffer[] = [];
        const rawUploads: Array<{ key: string; publicUrl: string | null }> = [];
        // For exploration: single PlannedCopy shared across all frames.
        // For sequence:    PlannedCopy[] parallel to composedBuffers.
        let copy: PlannedCopy = {};
        let sequenceCopies: PlannedCopy[] | null = null;
        let imageCostCents = 0;
        let copyCostCents = 0;
        let composeCostCents = 0;
        let contentType: 'image/png' | 'image/jpeg' = 'image/png';
        // Multi-strategy bookkeeping — populated by the exploration
        // branch when n > 1 + layout is set. Persisted into
        // composeState.variantAxes so the UI can show per-variant
        // labels ("Variant 2 — paper-cutout style").
        let multiStrategyVariantLayouts: LayoutId[] = [];
        let multiStrategyVariantLabels: string[] = [];
        let isMultiStrategy = false;

        if (sequenceMode && layout) {
          // ── SEQUENCE MODE ────────────────────────────────────────────────
          // Plan all N frames of copy in one LLM call so the narrative is
          // coherent (set-up → punch). Each frame's compose uses copies[K].
          const seqPlan = await planCopySequence({
            idea: idea ?? '',
            layout,
            language: language ?? 'en',
            project: proj
              ? { name: proj.name, audience: proj.audience, tone: proj.tone }
              : { name: 'Project', audience: null, tone: null },
            brandKit: kit ?? null,
            frames: n,
          });
          sequenceCopies = seqPlan.copies;
          copyCostCents = seqPlan.costCents;
          composeCostCents = n; // 1¢ per frame compose floor.

          const sharpMod = (await import('sharp')).default;
          let previousFrameBuffer: Buffer | undefined;

          for (let frameIdx = 0; frameIdx < n; frameIdx++) {
            const result = await generateImage({
              prompt,
              format,
              provider,
              model,
              n: 1,
              quality,
              // sourceImage carries the variation user-source path; in
              // sequence mode we ONLY pass previousFrameBuffer via the
              // sequence field (not as sourceImage) so the two flows
              // don't fight inside imageGen. They're mutually exclusive
              // at the action layer.
              sequence: {
                frameIndex: frameIdx,
                totalFrames: n,
                previousFrameBuffer,
                sequenceHint: resolveSequenceHint(layout, frameIdx, n),
              },
            });
            imageCostCents += result.costCents;
            contentType = result.contentType;
            const rawFrame = result.buffers[0];
            if (!rawFrame) {
              throw new Error(`sequence frame ${frameIdx + 1}/${n}: model returned no image`);
            }
            // Resize raw → upload raw → compose → push.
            const sized = await sharpMod(rawFrame, { failOn: 'none' })
              .resize(fm.w, fm.h, { fit: 'cover', position: 'centre' })
              .png({ compressionLevel: 6 })
              .toBuffer();
            const rawKey = `${projectId}/${generationId}/${frameIdx + 1}-raw.png`;
            const rawUpload = await putR2(rawKey, sized, 'image/png');
            rawUploads.push({ key: rawUpload.key, publicUrl: rawUpload.publicUrl });

            const frameCopy = sequenceCopies[frameIdx] ?? {};
            const composed = await composeImage({
              background: sized,
              width: fm.w,
              height: fm.h,
              layout,
              copy: frameCopy,
              colors,
            });
            composedBuffers.push(composed);
            previousFrameBuffer = sized;
            console.log(
              `[reachy:image] gen ${generationId} sequence frame ${frameIdx + 1}/${n} composed`,
            );
          }
        } else {
          // ── EXPLORATION MODE ─────────────────────────────────────────────
          // Multi-strategy: when n > 1 and we have a layout, each variant
          // rotates one or two axes (layout / style) per pickVariantAxis()
          // so the user gets genuinely different attempts instead of N
          // near-duplicates. Per-variant prompt + per-variant copy plan.
          // Sequence mode + variation mode (sourceRawUrl) skip this and
          // use the single shared prompt.
          //
          // effort = high triggers best-of-K critic per variant. The
          // worker generates K=4 candidates from gpt-image-* in a single
          // .generate(n=4) call, ships them to the vision critic, and
          // keeps the winner.
          const sharpMod = (await import('sharp')).default;
          const multiStrategyOn = Boolean(layout) && n > 1 && !sourceRawUrl;
          // Brand refs anchor outputs to the project's prior visual
          // vocabulary. Only loaded when we actually need them (avoids
          // a wasted R2 fetch on the variation path which uses its own
          // sourceImage).
          const brandRefsP = !sourceRawUrl
            ? getBrandReferenceImages(projectId)
            : Promise.resolve([]);
          const brandRefs = await brandRefsP;

          // Track per-variant compose state for the params write below.
          const variantLayoutIds: Array<LayoutId | 'none'> = [];
          const variantCopies: PlannedCopy[] = [];
          const variantLabels: string[] = [];

          for (let varIdx = 0; varIdx < n; varIdx++) {
            // Resolve per-variant layout + style.
            let activeLayout = layout;
            let activeStyle: VisualStyleKey | null = null;
            let strategyLabel = 'requested';
            let strategyHint: string | null = null;
            if (multiStrategyOn && layout) {
              const baseStyleKey = (kit?.visualStyle ?? 'abstract') as VisualStyleKey;
              const axis = pickVariantAxis(varIdx, layout.id, baseStyleKey);
              if (axis.layoutOverride) {
                activeLayout = getLayout({ layoutId: axis.layoutOverride });
              }
              if (axis.styleOverride) activeStyle = axis.styleOverride;
              strategyLabel = axis.label;
              strategyHint = axis.strategyHint;
            }

            // Per-variant prompt. For the FIRST variant in single-shot
            // mode we keep using the worker's already-built editPrompt
            // (covers the variation flow's prefix). For multi-strategy
            // variants we rebuild via buildImagePrompt with the
            // perturbed axes — the action's enqueued prompt was built
            // for the requested axes, so it'd be stale for variant 2..N.
            let perVariantPrompt: string;
            if (multiStrategyOn && layout) {
              perVariantPrompt = buildImagePrompt({
                idea: idea ?? '',
                format,
                project: proj
                  ? { name: proj.name, audience: proj.audience, tone: proj.tone }
                  : { name: 'Project', audience: null, tone: null },
                brandKit: kit ?? null,
                language: language ?? 'en',
                visualStyleOverride: activeStyle ?? undefined,
                layout: activeLayout ?? layout,
                effort: effortTier,
                strategyHint: strategyHint ?? undefined,
              });
            } else {
              perVariantPrompt = editPrompt;
            }

            // Optional pre-render prompt enhancer for balanced + high.
            // Adds ~0.1¢ per call but produces noticeably better image
            // prompts than the raw template.
            if (
              (effortTier === 'balanced' || effortTier === 'high') &&
              provider === 'openai' &&
              !sourceRawUrl
            ) {
              try {
                const enhanced = await enhancePrompt({
                  basePrompt: perVariantPrompt,
                  effort: effortTier,
                });
                perVariantPrompt = enhanced.prompt;
                copyCostCents += enhanced.costCents;
              } catch (err) {
                console.warn(
                  `[reachy:image] gen ${generationId} variant ${varIdx + 1}/${n} enhancer failed — using raw prompt: ${err instanceof Error ? err.message : String(err)}`,
                );
              }
            }

            // Generate. effort=high uses K=4 internal candidates per
            // variant; otherwise a single shot.
            const kCandidates = criticMode ? 4 : 1;
            const candidateBatch = await generateImage({
              prompt: perVariantPrompt,
              format,
              provider,
              model,
              n: kCandidates as 1 | 2 | 4,
              quality,
              sourceImage,
              brandReferenceImages: brandRefs,
            });
            imageCostCents += candidateBatch.costCents;
            contentType = candidateBatch.contentType;

            // Pick the winning candidate.
            let winnerBuf: Buffer;
            const firstCandidate = candidateBatch.buffers[0];
            if (!firstCandidate) {
              throw new Error(`variant ${varIdx + 1}/${n}: model returned no image`);
            }
            if (criticMode && candidateBatch.buffers.length > 1) {
              try {
                const verdict = await pickBest({
                  // criticMode requires layoutId at the top of the
                  // worker, so `layout` is guaranteed non-null here.
                  // activeLayout falls back to layout when multi-
                  // strategy hasn't perturbed the axis.
                  layout: activeLayout ?? (layout as NonNullable<typeof layout>),
                  brief: idea ?? perVariantPrompt.slice(0, 240),
                  candidates: candidateBatch.buffers.map((buf, i) => ({
                    index: i,
                    buffer: buf,
                  })),
                });
                copyCostCents += verdict.costCents;
                winnerBuf = candidateBatch.buffers[verdict.winnerIndex] ?? firstCandidate;
                console.log(
                  `[reachy:image] gen ${generationId} variant ${varIdx + 1}/${n} critic picked candidate ${verdict.winnerIndex + 1}/${candidateBatch.buffers.length}: ${verdict.reasoning}`,
                );
              } catch (err) {
                console.warn(
                  `[reachy:image] gen ${generationId} critic failed — keeping candidate 1: ${err instanceof Error ? err.message : String(err)}`,
                );
                winnerBuf = firstCandidate;
              }
            } else {
              winnerBuf = firstCandidate;
            }

            // Resize + upload raw + compose.
            if (activeLayout) {
              const sized = await sharpMod(winnerBuf, { failOn: 'none' })
                .resize(fm.w, fm.h, { fit: 'cover', position: 'centre' })
                .png({ compressionLevel: 6 })
                .toBuffer();
              const rawKey = `${projectId}/${generationId}/${varIdx + 1}-raw.png`;
              const rawUpload = await putR2(rawKey, sized, 'image/png');
              rawUploads.push({ key: rawUpload.key, publicUrl: rawUpload.publicUrl });

              // Per-variant copy plan against THIS variant's layout.
              const planForVariant = await planCopy({
                idea: idea ?? '',
                layout: activeLayout,
                language: language ?? 'en',
                project: proj
                  ? { name: proj.name, audience: proj.audience, tone: proj.tone }
                  : { name: 'Project', audience: null, tone: null },
                brandKit: kit ?? null,
              });
              copyCostCents += planForVariant.costCents;
              composeCostCents += 1;
              if (varIdx === 0) copy = planForVariant.copy; // legacy single-copy carrier
              variantCopies.push(planForVariant.copy);
              variantLayoutIds.push(activeLayout.id);
              variantLabels.push(strategyLabel);

              const composed = await composeImage({
                background: sized,
                width: fm.w,
                height: fm.h,
                layout: activeLayout,
                copy: planForVariant.copy,
                colors,
              });
              composedBuffers.push(composed);
            } else {
              composedBuffers.push(winnerBuf);
            }
          }

          // Surface multi-strategy bookkeeping to the params writer.
          if (multiStrategyOn) {
            isMultiStrategy = true;
            sequenceCopies = variantCopies;
            multiStrategyVariantLayouts = variantLayoutIds.filter(
              (id): id is LayoutId => id !== 'none',
            );
            multiStrategyVariantLabels = variantLabels;
          }
        }

        // One round-trip insert instead of N. Order is preserved by the array
        // index so `${i+1}.png` keys still align with row order.
        const rows: Array<typeof asset.$inferInsert> = [];
        for (const [i, buf] of composedBuffers.entries()) {
          const key = `${projectId}/${generationId}/${i + 1}.png`;
          const upload = await putR2(key, buf, contentType);
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

        // Total cost: AI-image cost (sum across all calls for sequence mode)
        // + copy planner LLM call + compose floor. Persisted to the
        // generation row so the UI's "Cost: X¢" tally reflects the wallet.
        // Composition state (layout + copy + colors + raw pointers) is
        // persisted in params so the re-render-overlay action can rebuild
        // the same asset cheaply without re-querying the brand kit.
        const totalCostCents = imageCostCents + copyCostCents + composeCostCents;
        const [existingGen] = await db
          .select({ params: generation.params })
          .from(generation)
          .where(eq(generation.id, generationId))
          .limit(1);
        const mergedParams = {
          ...((existingGen?.params as Record<string, unknown>) ?? {}),
          ...(layout
            ? {
                composeState: {
                  layoutId: layout.id,
                  // composeState.mode discriminates downstream:
                  //   exploration    — single shared PlannedCopy (n=1
                  //                    or multi-strategy disabled).
                  //   multi-strategy — PlannedCopy[] + variant labels +
                  //                    per-variant layoutIds (n > 1).
                  //   sequence       — PlannedCopy[] for serial frames.
                  mode: sequenceMode
                    ? ('sequence' as const)
                    : isMultiStrategy
                      ? ('multi-strategy' as const)
                      : ('exploration' as const),
                  copy: sequenceMode || isMultiStrategy ? (sequenceCopies ?? []) : copy,
                  colors,
                  // Parallel arrays to assets[] order — index i of rawUploads
                  // is the raw background for asset i. rerenderOverlay uses
                  // this to recompose without stacking text on text.
                  rawAssets: rawUploads,
                  // Sequence-specific metadata.
                  ...(sequenceMode
                    ? {
                        sequenceMeta: {
                          totalFrames: n,
                          frameTexts: sequenceCopies ?? [],
                        },
                      }
                    : {}),
                  // Multi-strategy bookkeeping — per-variant layouts +
                  // human labels for the UI's "Variant 2 — alt style"
                  // chip and for the per-variant edit-copy / swap path.
                  ...(isMultiStrategy
                    ? {
                        variantAxes: multiStrategyVariantLayouts.map((id, i) => ({
                          layoutId: id,
                          label: multiStrategyVariantLabels[i] ?? `variant ${i + 1}`,
                        })),
                      }
                    : {}),
                },
                costBreakdown: {
                  cents: totalCostCents,
                  parts: {
                    image: imageCostCents,
                    copy: copyCostCents,
                    compose: composeCostCents,
                  },
                },
              }
            : {}),
        };

        await db
          .update(generation)
          .set({
            status: 'done',
            finishedAt: new Date(),
            costCents: totalCostCents,
            params: mergedParams,
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
