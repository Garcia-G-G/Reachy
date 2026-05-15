'use server';

import { and, desc, eq, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { QUALITY_TIERS, type QualityTier } from '@/lib/image-models';
import { VISUAL_STYLE_KEYS, type VisualStyleKey } from '@/lib/visual-styles-meta';
import { type BrandColors, composeImage, type PlannedCopy } from '@/server/ai/composeImage';
import { IMAGE_FORMAT_KEYS, type ImageFormat } from '@/server/ai/formats';
import type { ImageProvider } from '@/server/ai/imageGen';
import {
  DEFAULT_LAYOUT_FOR_FORMAT,
  getLayout,
  LAYOUT_IDS,
  type LayoutId,
} from '@/server/ai/layoutTemplates';
import { buildImagePrompt } from '@/server/ai/promptBuilder';
import { db } from '@/server/db/client';
import { asset } from '@/server/db/schema/assets';
import { brandKit } from '@/server/db/schema/brandKits';
import { generation } from '@/server/db/schema/generations';
import { project } from '@/server/db/schema/projects';
import { getSession } from '@/server/getSession';
import { getImageQueue } from '@/server/jobs/queue';
import { checkDailyUsage } from '@/server/lib/usage-cap';
import { putR2 } from '@/server/storage/r2';

const enqueueInput = z.object({
  projectId: z.string().uuid(),
  idea: z.string().trim().min(3).max(600),
  format: z.enum(IMAGE_FORMAT_KEYS as [ImageFormat, ...ImageFormat[]]),
  provider: z.enum(['openai', 'fal']),
  model: z.string().trim().min(2).max(80),
  n: z.union([z.literal(1), z.literal(2), z.literal(4)]),
  language: z.enum(['en', 'es']).default('en'),
  /** OpenAI quality tier. fal.ai entries ignore this. Default 'high'
   *  matches the marketing-grade pipeline; users drop to medium/low
   *  explicitly when iterating cheaply. */
  quality: z.enum(QUALITY_TIERS as unknown as [QualityTier, ...QualityTier[]]).default('high'),
  /** Optional one-off visualStyle override for this generation. */
  visualStyleOverride: z
    .enum(VISUAL_STYLE_KEYS as unknown as [VisualStyleKey, ...VisualStyleKey[]])
    .optional(),
  /** Marketing-grade overlay layout. When omitted, defaults per the
   *  per-format mapping in layoutTemplates. Pass `'none'` to opt out
   *  entirely (raw AI output, no copy plan, no overlay) — used by
   *  power users who want the bare background. */
  layoutId: z
    .union([z.enum(LAYOUT_IDS as unknown as [LayoutId, ...LayoutId[]]), z.literal('none')])
    .optional(),
  /** Generation mode.
   *   exploration (default): N independent attempts at the same prompt.
   *                          Backwards-compatible — fal models + raw
   *                          layouts use this.
   *   sequence:               N frames generated SERIALLY. Frame 1 is
   *                          a fresh generation; frames 2..N use the
   *                          previous frame as a reference (images.edit)
   *                          + a layout-defined sequenceHint to drive
   *                          intentional motion. Read as an IG carousel
   *                          or short build (set-up → punch). Each
   *                          frame gets its own PlannedCopy entry so
   *                          typography progresses too. */
  mode: z.enum(['exploration', 'sequence']).default('exploration'),
});

export type EnqueueImageGenerationInput = z.infer<typeof enqueueInput>;

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

export async function enqueueImageGeneration(
  input: EnqueueImageGenerationInput,
): Promise<ActionResult<{ generationId: string; projectSlug: string }>> {
  const session = await getSession();
  if (!session) return { ok: false, error: 'unauthenticated' };

  const parsed = enqueueInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid input' };
  }

  // Ownership + archive check in one round-trip. Archived projects are
  // read-only — the dashboard already hides them, but a stale tab could still
  // POST here. Refuse cleanly.
  const [proj] = await db
    .select()
    .from(project)
    .where(
      and(
        eq(project.id, parsed.data.projectId),
        eq(project.userId, session.user.id),
        isNull(project.archivedAt),
      ),
    )
    .limit(1);
  if (!proj) return { ok: false, error: 'not-found' };

  // Per-user daily cap. Failures count too — they hit the upstream provider.
  const usage = await checkDailyUsage(session.user.id, 'image');
  if (!usage.ok) return { ok: false, error: `daily-cap (${usage.used}/${usage.cap})` };

  const [kit] = await db.select().from(brandKit).where(eq(brandKit.projectId, proj.id)).limit(1);

  // Resolve layout BEFORE building the image prompt — promptBuilder needs
  // the layout's negativeSpaceHint to know where to leave the frame quiet
  // for the typographic overlay.
  const resolvedLayoutId: LayoutId | 'none' =
    parsed.data.layoutId ?? DEFAULT_LAYOUT_FOR_FORMAT[parsed.data.format];
  const layout = resolvedLayoutId === 'none' ? null : getLayout({ layoutId: resolvedLayoutId });

  const prompt = buildImagePrompt({
    idea: parsed.data.idea,
    format: parsed.data.format,
    project: { name: proj.name, audience: proj.audience, tone: proj.tone },
    brandKit: kit ?? null,
    language: parsed.data.language,
    visualStyleOverride: parsed.data.visualStyleOverride,
    // For the 'none' path we still need a layout so the prompt builder
    // doesn't reach for an undefined hint — DEFAULT_LAYOUT_FOR_FORMAT
    // gives the typical placement; the worker just skips the overlay.
    layout: layout ?? getLayout({ format: parsed.data.format }),
  });

  // Insert generation row first so the worker has a target to update.
  const [gen] = await db
    .insert(generation)
    .values({
      projectId: proj.id,
      type: 'image',
      format: parsed.data.format,
      status: 'queued',
      provider: parsed.data.provider,
      model: parsed.data.model,
      prompt,
      params: {
        idea: parsed.data.idea,
        n: parsed.data.n,
        language: parsed.data.language,
        quality: parsed.data.quality,
        visualStyleOverride: parsed.data.visualStyleOverride ?? null,
        layoutId: resolvedLayoutId,
        mode: parsed.data.mode,
      },
    })
    .returning();
  if (!gen) return { ok: false, error: 'enqueue failed' };

  try {
    // jobId = generationId so a double-submit (network retry, double click)
    // collapses into a single job. BullMQ rejects the second add with the same
    // jobId — we treat that as already-enqueued and return ok.
    await getImageQueue().add(
      'generate',
      {
        generationId: gen.id,
        projectId: proj.id,
        prompt,
        format: parsed.data.format as ImageFormat,
        provider: parsed.data.provider as ImageProvider,
        model: parsed.data.model,
        n: parsed.data.n,
        quality: parsed.data.quality,
        layoutId: layout ? layout.id : undefined,
        idea: parsed.data.idea,
        language: parsed.data.language,
        mode: parsed.data.mode,
      },
      { jobId: gen.id },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'queue error';
    await db
      .update(generation)
      .set({ status: 'failed', errorMessage: `queue add failed: ${msg}`, finishedAt: new Date() })
      .where(eq(generation.id, gen.id));
    return { ok: false, error: 'queue-unreachable' };
  }

  revalidatePath(`/app/projects/${proj.slug}/library`, 'layout');
  revalidatePath(`/app/projects/${proj.slug}/generate/image`, 'layout');
  return { ok: true, data: { generationId: gen.id, projectSlug: proj.slug } };
}

/**
 * Enqueue 4 variations of an existing asset. Uses OpenAI's images.edit
 * with the source RAW background as the seed image, so the variant
 * keeps the source visual style while exploring different composition.
 *
 * Cost: same per-image as a fresh generation at the source's quality
 * tier × 4 variants. The copy plan + compose runs per-variant.
 *
 * Architecture: lifts model / quality / layout / idea / language from
 * the source generation's params so the user doesn't have to restate
 * them. The optional tweakPrompt is appended to the AI prompt to push
 * the model in a specific direction ("warmer", "more centered", etc.).
 */
const enqueueVariationsInput = z.object({
  /** Source asset id to vary. Its parent generation must have a
   *  composeState with at least one rawAssets entry — i.e. it was
   *  rendered through the marketing-grade pipeline. */
  sourceAssetId: z.string().uuid(),
  /** Optional plain-English nudge appended to the AI prompt. */
  tweakPrompt: z.string().trim().max(400).optional(),
  /** Optional override for the variant idea. Defaults to the source's
   *  idea so variations honour the original brief by default. */
  ideaOverride: z.string().trim().min(3).max(600).optional(),
});

export type EnqueueVariationsInput = z.infer<typeof enqueueVariationsInput>;

export async function enqueueVariations(
  input: EnqueueVariationsInput,
): Promise<ActionResult<{ generationId: string; projectSlug: string }>> {
  const session = await getSession();
  if (!session) return { ok: false, error: 'unauthenticated' };

  const parsed = enqueueVariationsInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid input' };
  }

  // Look up the source asset (and through it, the source generation +
  // project). Ownership is enforced at the project level — userId on
  // the project row.
  const [src] = await db
    .select({
      asset,
      generation,
      project,
    })
    .from(asset)
    .innerJoin(generation, eq(generation.id, asset.generationId))
    .innerJoin(project, eq(project.id, asset.projectId))
    .where(
      and(
        eq(asset.id, parsed.data.sourceAssetId),
        eq(project.userId, session.user.id),
        isNull(project.archivedAt),
      ),
    )
    .limit(1);
  if (!src) return { ok: false, error: 'not-found' };

  // Daily cap check — variations cost like fresh generations.
  const usage = await checkDailyUsage(session.user.id, 'image');
  if (!usage.ok) return { ok: false, error: `daily-cap (${usage.used}/${usage.cap})` };

  // Recover compose state from the source so we run the variation with
  // the same model + quality + layout + idea + language as the original.
  const sourceParams = (src.generation.params ?? {}) as {
    idea?: string;
    language?: 'en' | 'es';
    quality?: 'low' | 'medium' | 'high' | 'auto';
    visualStyleOverride?: string | null;
    layoutId?: LayoutId | 'none';
    composeState?: {
      layoutId?: LayoutId;
      rawAssets?: Array<{ key: string; publicUrl: string | null }>;
    };
  };

  // Find the raw background URL for THIS asset within the source
  // generation. rawAssets[] is parallel to the asset insertion order;
  // we need the index of `parsed.data.sourceAssetId` within the
  // generation's assets sorted by createdAt.
  const siblings = await db
    .select({ id: asset.id })
    .from(asset)
    .where(eq(asset.generationId, src.generation.id))
    .orderBy(asset.createdAt);
  const sourceAssetIdx = siblings.findIndex((a) => a.id === parsed.data.sourceAssetId);
  const rawAsset = sourceParams.composeState?.rawAssets?.[sourceAssetIdx];
  const sourceRawUrl = rawAsset?.publicUrl ?? src.asset.publicUrl;
  if (!sourceRawUrl) {
    return { ok: false, error: 'source asset has no public url to fetch' };
  }

  // Recover ALL the original render settings — model, quality, layout,
  // idea, language. Sensible defaults if any are missing on legacy rows.
  const provider = (src.generation.provider ?? 'openai') as ImageProvider;
  const model = src.generation.model ?? 'gpt-image-1';
  const format = src.generation.format as ImageFormat;
  const quality = sourceParams.quality ?? 'high';
  const idea = parsed.data.ideaOverride ?? sourceParams.idea ?? '';
  const language = sourceParams.language ?? 'en';
  const sourceLayoutId = sourceParams.composeState?.layoutId ?? sourceParams.layoutId;
  // Variation always uses an overlay-enabled layout — even if the
  // original was raw, we fall back to the format default so the user
  // gets brand typography on top.
  const variationLayoutId: LayoutId | 'none' =
    sourceLayoutId && sourceLayoutId !== 'none'
      ? sourceLayoutId
      : DEFAULT_LAYOUT_FOR_FORMAT[format];

  const layout = getLayout({ layoutId: variationLayoutId });

  // Re-build the AI prompt using the SAME pipeline as fresh generations
  // — buildImagePrompt knows how to inject the layout's negativeSpaceHint
  // and the brand kit's palette/style. The worker will further prepend
  // a "variation, tweak: …" cue at edit time.
  const [kit] = await db
    .select()
    .from(brandKit)
    .where(eq(brandKit.projectId, src.project.id))
    .limit(1);
  const prompt = buildImagePrompt({
    idea,
    format,
    project: {
      name: src.project.name,
      audience: src.project.audience,
      tone: src.project.tone,
    },
    brandKit: kit ?? null,
    language,
    visualStyleOverride: (sourceParams.visualStyleOverride ?? undefined) as
      | VisualStyleKey
      | undefined,
    layout,
  });

  const [gen] = await db
    .insert(generation)
    .values({
      projectId: src.project.id,
      type: 'image',
      format,
      status: 'queued',
      provider,
      model,
      prompt,
      params: {
        idea,
        n: 4,
        language,
        quality,
        layoutId: variationLayoutId,
        sourceAssetId: parsed.data.sourceAssetId,
        sourceGenerationId: src.generation.id,
        tweakPrompt: parsed.data.tweakPrompt ?? null,
      },
    })
    .returning();
  if (!gen) return { ok: false, error: 'enqueue failed' };

  try {
    await getImageQueue().add(
      'generate',
      {
        generationId: gen.id,
        projectId: src.project.id,
        prompt,
        format,
        provider,
        model,
        n: 4,
        quality,
        layoutId: variationLayoutId,
        idea,
        language,
        sourceRawUrl,
        tweakPrompt: parsed.data.tweakPrompt,
      },
      { jobId: gen.id },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'queue error';
    await db
      .update(generation)
      .set({ status: 'failed', errorMessage: `queue add failed: ${msg}`, finishedAt: new Date() })
      .where(eq(generation.id, gen.id));
    return { ok: false, error: 'queue-unreachable' };
  }

  revalidatePath(`/app/projects/${src.project.slug}/library`, 'layout');
  revalidatePath(`/app/projects/${src.project.slug}/generate/image`, 'layout');
  return { ok: true, data: { generationId: gen.id, projectSlug: src.project.slug } };
}

/**
 * Re-render the typography overlay on an existing asset with new copy.
 * Loads the original AI background from R2, runs composeImage with the
 * caller-supplied copy + the asset's saved colors + layout, uploads the
 * new composite under a fresh asset row.
 *
 * Cost: ZERO dollars to the user — no AI call, only CPU + R2. Reachy
 * eats the storage and bandwidth, which is microcents per render. This
 * is the iteration loop that makes the marketing-grade pipeline feel
 * like a design tool instead of a slot machine.
 *
 * Architecture note: we re-download the original AI background from R2
 * (storage_key #1 of the source generation) and recompose. The background
 * is the expensive bit — keeping it pristine and re-overlaying is the
 * essence of the deterministic-typography approach.
 */
const rerenderOverlayInput = z.object({
  /** Source generation whose first asset (or the asset matching
   *  assetId, if provided) is the background to recompose. */
  generationId: z.string().uuid(),
  /** Optional specific asset within the source generation. Defaults
   *  to the first asset in the row. */
  assetId: z.string().uuid().optional(),
  /** New copy slots — only the keys the layout uses are honored;
   *  unused keys are ignored. */
  copy: z.object({
    eyebrow: z.string().trim().max(120).optional(),
    headline: z.string().trim().max(240).optional(),
    subheadline: z.string().trim().max(320).optional(),
    cta: z.string().trim().max(80).optional(),
    wordmark: z.string().trim().max(80).optional(),
  }),
});

export type RerenderOverlayInput = z.infer<typeof rerenderOverlayInput>;

export async function rerenderOverlay(
  input: RerenderOverlayInput,
): Promise<ActionResult<{ generationId: string; assetId: string; publicUrl: string | null }>> {
  const session = await getSession();
  if (!session) return { ok: false, error: 'unauthenticated' };

  const parsed = rerenderOverlayInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid input' };
  }

  // Load source generation + ownership check.
  const [sourceGen] = await db
    .select()
    .from(generation)
    .where(eq(generation.id, parsed.data.generationId))
    .limit(1);
  if (!sourceGen) return { ok: false, error: 'not-found' };

  const [proj] = await db
    .select()
    .from(project)
    .where(
      and(
        eq(project.id, sourceGen.projectId),
        eq(project.userId, session.user.id),
        isNull(project.archivedAt),
      ),
    )
    .limit(1);
  if (!proj) return { ok: false, error: 'not-found' };

  // Load the source asset row for dimensions. We also need its INDEX
  // within the generation (1, 2, 3, …) so we can pick the matching raw
  // background from composeState.rawAssets[].
  const sourceAssets = await db
    .select()
    .from(asset)
    .where(eq(asset.generationId, sourceGen.id))
    .orderBy(asset.createdAt);
  const sourceAssetIdx = parsed.data.assetId
    ? sourceAssets.findIndex((a) => a.id === parsed.data.assetId)
    : 0;
  const sourceAsset = sourceAssetIdx >= 0 ? sourceAssets[sourceAssetIdx] : null;
  if (!sourceAsset?.publicUrl) {
    return { ok: false, error: 'no-source-asset' };
  }

  // Recover the layout + colors + raw bg pointer from the original
  // render. composeState is written by the worker only on the
  // overlay-enabled path, so a missing composeState means "this asset
  // was a raw AI background, no typography to re-render".
  //
  // composeState.copy shape depends on composeState.mode:
  //   exploration: a single PlannedCopy shared across all assets.
  //   sequence:    PlannedCopy[] parallel to rawAssets[]/assets[]. The
  //                modal pre-populates from frame[sourceAssetIdx]; we
  //                only replace THAT frame's copy, leaving siblings
  //                untouched.
  const sourceParams = (sourceGen.params ?? {}) as {
    composeState?: {
      layoutId?: LayoutId;
      colors?: BrandColors;
      copy?: PlannedCopy | PlannedCopy[];
      rawAssets?: Array<{ key: string; publicUrl: string | null }>;
      mode?: 'exploration' | 'sequence';
    };
  };
  const layoutId = sourceParams.composeState?.layoutId;
  if (!layoutId) {
    return {
      ok: false,
      error: 'source generation has no layout — re-render requires an overlay-enabled asset',
    };
  }
  const layout = getLayout({ layoutId });
  const colors: BrandColors = sourceParams.composeState?.colors ?? {
    ink: '#14110D',
    paper: '#F1EBDF',
    accent: '#B6481A',
  };
  const isSequenceSource = sourceParams.composeState?.mode === 'sequence';

  // Fetch the RAW AI background (no previous overlay) — that's what
  // makes "Edit copy" produce a clean replace instead of stacking text.
  // Falls back to the composite if rawAssets is missing (legacy rows
  // before this field was added) — those WILL stack on re-render and
  // produce a clearly-buggy result that signals the user should regen.
  const rawPointer = sourceParams.composeState?.rawAssets?.[sourceAssetIdx];
  const backgroundUrl = rawPointer?.publicUrl ?? sourceAsset.publicUrl;

  let backgroundBuf: Buffer;
  try {
    const res = await fetch(backgroundUrl);
    if (!res.ok) throw new Error(`fetch ${res.status} ${res.statusText}`);
    const arr = await res.arrayBuffer();
    backgroundBuf = Buffer.from(arr);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `failed to fetch source asset: ${msg}` };
  }

  // Merge user-supplied copy with the previously-rendered copy. The user
  // edits one or two slots and expects the rest to stay — overwriting
  // with empty strings is almost never what they want. Caller can pass
  // an explicit empty string to clear a slot; undefined keeps it.
  //
  // Sequence: previousCopy is THIS FRAME's PlannedCopy[K], not the
  // shared dict. The form's modal already pre-populates from the
  // matching frame (see /api/generations/:id/status which returns
  // composeState.copy as an array when mode='sequence').
  const composeStateCopy = sourceParams.composeState?.copy;
  const previousCopy: PlannedCopy = (() => {
    if (Array.isArray(composeStateCopy)) {
      return composeStateCopy[sourceAssetIdx] ?? {};
    }
    return composeStateCopy ?? {};
  })();
  const filteredCopy: PlannedCopy = {};
  for (const slot of layout.slots) {
    const incoming = parsed.data.copy[slot];
    if (incoming !== undefined) {
      // Empty string explicitly clears; non-empty replaces.
      if (incoming.length > 0) filteredCopy[slot] = incoming;
    } else {
      // Untouched slot: keep the previous render's value.
      const prior = previousCopy[slot];
      if (prior) filteredCopy[slot] = prior;
    }
  }

  let composed: Buffer;
  try {
    composed = await composeImage({
      background: backgroundBuf,
      width: sourceAsset.width ?? 1080,
      height: sourceAsset.height ?? 1080,
      layout,
      copy: filteredCopy,
      colors,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `compose failed: ${msg}` };
  }

  // Persist as a NEW generation row + asset so the library shows it as
  // a distinct iteration. Free in $ terms — costCents=0, no AI call.
  //
  // For sequence sources: the new row carries a single-asset composeState
  // (mode='exploration') because the result is one re-rendered frame, not
  // a sequence. The user can still edit-copy on the new row — it'll be
  // treated as exploration on the second pass.
  const [newGen] = await db
    .insert(generation)
    .values({
      projectId: proj.id,
      type: 'image',
      format: sourceGen.format,
      status: 'done',
      provider: sourceGen.provider,
      model: sourceGen.model,
      prompt: `Re-render overlay of generation ${sourceGen.id}${isSequenceSource ? ` (frame ${sourceAssetIdx + 1})` : ''}`,
      params: {
        ...sourceParams,
        composeState: {
          layoutId,
          mode: 'exploration' as const,
          copy: filteredCopy,
          colors,
        },
        rerenderOf: sourceGen.id,
      },
      costCents: 0,
      finishedAt: new Date(),
    })
    .returning();
  if (!newGen) return { ok: false, error: 'failed to create generation row' };

  const key = `${proj.id}/${newGen.id}/1.png`;
  const upload = await putR2(key, composed, 'image/png');
  const [newAsset] = await db
    .insert(asset)
    .values({
      generationId: newGen.id,
      projectId: proj.id,
      kind: 'image',
      format: sourceGen.format,
      width: sourceAsset.width,
      height: sourceAsset.height,
      storageKey: upload.key,
      publicUrl: upload.publicUrl,
      bytes: upload.bytes,
    })
    .returning();
  if (!newAsset) return { ok: false, error: 'failed to create asset row' };

  revalidatePath(`/app/projects/${proj.slug}/library`, 'layout');
  revalidatePath(`/app/projects/${proj.slug}/generate/image`, 'layout');
  return {
    ok: true,
    data: { generationId: newGen.id, assetId: newAsset.id, publicUrl: upload.publicUrl },
  };
}

export async function listGenerationsForProject(
  projectId: string,
): Promise<(typeof generation.$inferSelect)[]> {
  const session = await getSession();
  if (!session) return [];

  const [proj] = await db
    .select({ id: project.id })
    .from(project)
    .where(
      and(
        eq(project.id, projectId),
        eq(project.userId, session.user.id),
        isNull(project.archivedAt),
      ),
    )
    .limit(1);
  if (!proj) return [];

  return db
    .select()
    .from(generation)
    .where(eq(generation.projectId, proj.id))
    .orderBy(desc(generation.createdAt))
    .limit(100);
}

export async function listAssetsForProject(
  projectId: string,
): Promise<(typeof asset.$inferSelect)[]> {
  const session = await getSession();
  if (!session) return [];

  const [proj] = await db
    .select({ id: project.id })
    .from(project)
    .where(
      and(
        eq(project.id, projectId),
        eq(project.userId, session.user.id),
        isNull(project.archivedAt),
      ),
    )
    .limit(1);
  if (!proj) return [];

  return db
    .select()
    .from(asset)
    .where(eq(asset.projectId, proj.id))
    .orderBy(desc(asset.createdAt))
    .limit(200);
}
