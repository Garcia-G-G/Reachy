'use server';

import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { QUALITY_TIERS, type QualityTier } from '@/lib/image-models';
import { VISUAL_STYLE_KEYS, type VisualStyleKey } from '@/lib/visual-styles-meta';
import { IMAGE_FORMAT_KEYS, type ImageFormat } from '@/server/ai/formats';
import { generateImage, type ImageProvider } from '@/server/ai/imageGen';
import {
  type BrandColors,
  DEFAULT_LAYOUT_FOR_FORMAT,
  getLayout,
  LAYOUT_IDS,
  type LayoutId,
  type PlannedCopy,
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
  /** AI effort tier — drives reasoning + best-of-K pipelines.
   *   fast      — single-shot images.generate, no extras.
   *   balanced  — gpt-image-2 reasoning_effort='medium' when supported;
   *               otherwise an in-prompt contemplation cue.
   *   high      — reasoning='high' + best-of-K critic: generate 4
   *               candidates, send to gpt-5.4-mini vision critic to
   *               pick the winner. Cost ~5× per delivered variant. */
  effort: z.enum(['fast', 'balanced', 'high']).default('balanced'),
});

// Use z.input (not z.infer / z.output) so callers see fields with
// `.default(...)` as OPTIONAL. The server still gets the populated value
// after parsing; only the client-facing input type relaxes. This lets
// the form omit fields (mode, effort, quality, language, …) and still
// type-check; the server fills them in from the zod default.
export type EnqueueImageGenerationInput = z.input<typeof enqueueInput>;

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

  // Coarse pre-flight prompt — stored on the generation row for audit
  // visibility. The worker REBUILDS the prompt per-variant with the
  // planned copy (which doesn't exist at enqueue time), so this value
  // is a placeholder, NOT the prompt that actually hits gpt-image-2.
  const prompt = buildImagePrompt({
    idea: parsed.data.idea,
    format: parsed.data.format,
    project: { name: proj.name, audience: proj.audience, tone: proj.tone },
    brandKit: kit ?? null,
    language: parsed.data.language,
    visualStyleOverride: parsed.data.visualStyleOverride,
    // For the 'none' path we still need a layout so the prompt builder
    // doesn't reach for an undefined hint — DEFAULT_LAYOUT_FOR_FORMAT
    // gives the typical placement.
    layout: layout ?? getLayout({ format: parsed.data.format }),
    copy: {},
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
        effort: parsed.data.effort,
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
        effort: parsed.data.effort,
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
    copy: {},
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
 * Edit the typography on an existing asset by re-rendering with new
 * copy values. As of the May-2026 AI-typography pivot the AI paints
 * the typography directly into the image, so editing copy means a
 * fresh model call — not a free SVG recomposite.
 *
 * Cost: real dollars. gpt-image-2 high quality is ~$0.21 per image.
 *
 * Two modes:
 *   - quickFix=false (default): fresh images.generate with the new
 *     copy in the [LAYOUT DIRECTIVE]. Gives the model maximum
 *     flexibility but the composition will drift from the original.
 *   - quickFix=true: images.edit using the source asset as a single
 *     reference + a "preserve everything except the listed copy"
 *     prompt. gpt-image-2 has NO adherence/strength knob (cookbook
 *     2026 confirms input_fidelity is a no-op on this model), so
 *     adherence is prompt-engineered, not parameter-engineered.
 *
 * Caller passes new copy; we merge with the source's prior copy so
 * untouched slots carry through.
 */
const rerenderOverlayInput = z.object({
  generationId: z.string().uuid(),
  assetId: z.string().uuid().optional(),
  copy: z.object({
    eyebrow: z.string().trim().max(120).optional(),
    headline: z.string().trim().max(240).optional(),
    subheadline: z.string().trim().max(320).optional(),
    cta: z.string().trim().max(80).optional(),
    wordmark: z.string().trim().max(80).optional(),
  }),
  /** When true, use images.edit with the source asset as reference +
   *  a "preserve everything else" prompt. Faster + more visually
   *  stable for single-slot tweaks. When false (default) fresh
   *  generation with the new copy. */
  quickFix: z.boolean().optional().default(false),
});

export type RerenderOverlayInput = z.input<typeof rerenderOverlayInput>;

const EDIT_COST_CENTS = 21; // gpt-image-2 high-quality ~$0.21 / image

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

  // Daily usage cap.
  const usage = await checkDailyUsage(session.user.id, 'image');
  if (!usage.ok) return { ok: false, error: `daily-cap (${usage.used}/${usage.cap})` };

  // Locate the source asset and its index in the generation.
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

  // Recover aiPromptState. Legacy rows (pre-pivot) have composeState
  // but no aiPromptState — for those we surface a "regenerate first"
  // error so the user re-runs through the new pipeline.
  const sourceParams = (sourceGen.params ?? {}) as {
    aiPromptState?: {
      layoutId?: LayoutId;
      brandColors?: BrandColors;
      copy?: PlannedCopy | PlannedCopy[];
      mode?: 'exploration' | 'multi-strategy' | 'sequence';
      language?: 'en' | 'es';
      model?: string;
      quality?: 'low' | 'medium' | 'high';
    };
    composeState?: unknown; // legacy
  };
  if (!sourceParams.aiPromptState && sourceParams.composeState) {
    return {
      ok: false,
      error: 'legacy generation — re-generate to enable editing under the new AI pipeline',
    };
  }
  const layoutId = sourceParams.aiPromptState?.layoutId;
  if (!layoutId) {
    return {
      ok: false,
      error: 'source generation has no layout — re-render requires a layout-driven asset',
    };
  }
  const layout = getLayout({ layoutId });
  const brandColors: BrandColors = sourceParams.aiPromptState?.brandColors ?? {
    ink: '#14110D',
    paper: '#F1EBDF',
    accent: '#B6481A',
  };
  const language = sourceParams.aiPromptState?.language ?? 'en';

  // Merge supplied copy with the source's prior copy. Empty string =
  // explicit clear; undefined = keep prior.
  const aiPromptCopy = sourceParams.aiPromptState?.copy;
  const previousCopy: PlannedCopy = Array.isArray(aiPromptCopy)
    ? (aiPromptCopy[sourceAssetIdx] ?? {})
    : (aiPromptCopy ?? {});
  const mergedCopy: PlannedCopy = {};
  for (const slot of layout.slots) {
    const incoming = parsed.data.copy[slot];
    if (incoming !== undefined) {
      if (incoming.length > 0) mergedCopy[slot] = incoming;
    } else {
      const prior = previousCopy[slot];
      if (prior) mergedCopy[slot] = prior;
    }
  }

  // Load brand kit for the prompt builder.
  const [kit] = await db.select().from(brandKit).where(eq(brandKit.projectId, proj.id)).limit(1);

  // Build the AI prompt. For quick-fix mode we prepend a
  // preserve-everything directive — gpt-image-2 has no strength knob,
  // so adherence is purely prompt-engineered.
  const basePrompt = buildImagePrompt({
    idea: (sourceGen.params as { idea?: string })?.idea ?? '',
    format: sourceGen.format as ImageFormat,
    project: { name: proj.name, audience: proj.audience, tone: proj.tone },
    brandKit: kit ?? null,
    language,
    layout,
    copy: mergedCopy,
  });

  const changedSlots = layout.slots
    .filter((slot) => mergedCopy[slot] !== previousCopy[slot])
    .map((slot) => `${slot}: "${mergedCopy[slot] ?? ''}"`);
  const preserveDirective = parsed.data.quickFix
    ? `\n\n[PRESERVE]\nThis is a TYPOGRAPHY EDIT of the reference image. Keep EVERYTHING about the reference identical — same composition, same focal subject, same lighting, same colors, same background texture, same overall mood. Change ONLY the text content to the values listed in [LAYOUT DIRECTIVE]. Specifically these slots changed:\n${changedSlots.map((c) => `- ${c}`).join('\n')}\nAll other typography slots keep their prior text. Treat unchanged regions as fixed.`
    : '';
  const editPrompt = basePrompt + preserveDirective;

  // Fetch source asset for quick-fix mode (reference image).
  let sourceImage: Buffer | undefined;
  if (parsed.data.quickFix) {
    try {
      const res = await fetch(sourceAsset.publicUrl);
      if (!res.ok) throw new Error(`fetch ${res.status} ${res.statusText}`);
      sourceImage = Buffer.from(await res.arrayBuffer());
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: `failed to fetch source asset: ${msg}` };
    }
  }

  // Generate. quickFix uses images.edit (source as ref); otherwise
  // fresh generate. Same provider/model as the source generation.
  let renderedBuf: Buffer;
  let costCents = 0;
  let contentType: 'image/png' | 'image/jpeg' = 'image/png';
  try {
    const result = await generateImage({
      prompt: editPrompt,
      format: sourceGen.format as ImageFormat,
      provider: sourceGen.provider as ImageProvider,
      model: sourceGen.model ?? 'gpt-image-2',
      n: 1,
      quality: sourceParams.aiPromptState?.quality ?? 'high',
      sourceImage,
    });
    const buf = result.buffers[0];
    if (!buf) throw new Error('model returned no image');
    renderedBuf = buf;
    costCents = Math.max(result.costCents, EDIT_COST_CENTS);
    contentType = result.contentType;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `image edit failed: ${msg}` };
  }

  // Resize to the source's exact dimensions.
  const sharpMod = (await import('sharp')).default;
  const finalBuf = await sharpMod(renderedBuf, { failOn: 'none' })
    .resize(sourceAsset.width ?? 1080, sourceAsset.height ?? 1080, {
      fit: 'cover',
      position: 'centre',
    })
    .png({ compressionLevel: 6 })
    .toBuffer();

  // Persist as a new generation + asset row. parentAssetId on the
  // new asset links it back to the source for the edits-strip UI.
  const [newGen] = await db
    .insert(generation)
    .values({
      projectId: proj.id,
      type: 'image',
      format: sourceGen.format,
      status: 'done',
      provider: sourceGen.provider,
      model: sourceGen.model,
      prompt: `Edit copy of generation ${sourceGen.id} (${parsed.data.quickFix ? 'quick-fix' : 'fresh'}) — ${changedSlots.join(', ') || 'no-op'}`,
      params: {
        ...(sourceParams as Record<string, unknown>),
        aiPromptState: {
          layoutId,
          mode: 'exploration' as const,
          copy: mergedCopy,
          brandColors,
          model: sourceGen.model,
          quality: sourceParams.aiPromptState?.quality ?? 'high',
          effort: 'balanced' as const,
          language,
          variants: [
            {
              prompt: editPrompt,
              copy: mergedCopy,
              layoutId,
              label: parsed.data.quickFix ? 'edit · quick-fix' : 'edit · fresh',
            },
          ],
        },
        editOf: { generationId: sourceGen.id, assetId: sourceAsset.id, quickFix: parsed.data.quickFix },
      },
      costCents,
      finishedAt: new Date(),
    })
    .returning();
  if (!newGen) return { ok: false, error: 'failed to create generation row' };

  const key = `${proj.id}/${newGen.id}/1.png`;
  const upload = await putR2(key, finalBuf, contentType);
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

/**
 * Swap the layout overlay on an existing asset. Re-composes typography
 * from the asset's stored raw AI background with a NEW layout — same
 * brand colors, same copy slots (mapped where compatible). Costs $0:
 * no AI call, only CPU + R2.
 *
 * Caller passes the new layoutId and (optionally) overridden copy.
 * If copy is omitted we use the source's composeState.copy, mapping
 * by slot key — slots the new layout doesn't have are dropped; slots
 * the new layout introduces that have no prior value stay empty until
 * the user fills them via Edit Copy.
 */
const swapLayoutInput = z.object({
  generationId: z.string().uuid(),
  assetId: z.string().uuid(),
  layoutId: z.enum(LAYOUT_IDS as unknown as [LayoutId, ...LayoutId[]]),
  copy: z
    .object({
      eyebrow: z.string().trim().max(120).optional(),
      headline: z.string().trim().max(240).optional(),
      subheadline: z.string().trim().max(320).optional(),
      cta: z.string().trim().max(80).optional(),
      wordmark: z.string().trim().max(80).optional(),
    })
    .optional(),
});

export type SwapLayoutInput = z.input<typeof swapLayoutInput>;

export async function swapLayout(
  input: SwapLayoutInput,
): Promise<ActionResult<{ generationId: string; assetId: string; publicUrl: string | null }>> {
  const session = await getSession();
  if (!session) return { ok: false, error: 'unauthenticated' };
  const parsed = swapLayoutInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid input' };
  }

  // Ownership check + load.
  const [srcGen] = await db
    .select()
    .from(generation)
    .where(eq(generation.id, parsed.data.generationId))
    .limit(1);
  if (!srcGen) return { ok: false, error: 'not-found' };
  const [proj] = await db
    .select()
    .from(project)
    .where(
      and(
        eq(project.id, srcGen.projectId),
        eq(project.userId, session.user.id),
        isNull(project.archivedAt),
      ),
    )
    .limit(1);
  if (!proj) return { ok: false, error: 'not-found' };

  const srcParams = (srcGen.params ?? {}) as {
    aiPromptState?: {
      brandColors?: BrandColors;
      copy?: PlannedCopy | PlannedCopy[];
      language?: 'en' | 'es';
      quality?: 'low' | 'medium' | 'high';
    };
    composeState?: unknown;
    idea?: string;
  };
  if (!srcParams.aiPromptState && srcParams.composeState) {
    return {
      ok: false,
      error: 'legacy generation — re-generate to enable layout swap under the new AI pipeline',
    };
  }

  // Locate the asset row.
  const siblings = await db
    .select()
    .from(asset)
    .where(eq(asset.generationId, srcGen.id))
    .orderBy(asset.createdAt);
  const idx = siblings.findIndex((a) => a.id === parsed.data.assetId);
  if (idx < 0) return { ok: false, error: 'asset not part of generation' };
  const sourceAsset = siblings[idx];
  if (!sourceAsset) return { ok: false, error: 'asset not found' };

  // Resolve copy: caller's override > source's existing copy (per-frame
  // for sequence). Slots the new layout doesn't request are dropped.
  const newLayout = getLayout({ layoutId: parsed.data.layoutId });
  const aiPromptCopy = srcParams.aiPromptState?.copy;
  const priorCopy: PlannedCopy = Array.isArray(aiPromptCopy)
    ? (aiPromptCopy[idx] ?? {})
    : (aiPromptCopy ?? {});
  const incoming = parsed.data.copy ?? {};
  const nextCopy: PlannedCopy = {};
  for (const slot of newLayout.slots) {
    const fromIncoming = incoming[slot];
    if (fromIncoming && fromIncoming.length > 0) nextCopy[slot] = fromIncoming;
    else if (priorCopy[slot]) nextCopy[slot] = priorCopy[slot];
  }

  const brandColors: BrandColors = srcParams.aiPromptState?.brandColors ?? {
    ink: '#14110D',
    paper: '#F1EBDF',
    accent: '#B6481A',
  };
  const language = srcParams.aiPromptState?.language ?? 'en';

  // Build prompt for the NEW layout with the merged copy. Fresh
  // generation (not edit) since the visual composition changes.
  const [kit] = await db.select().from(brandKit).where(eq(brandKit.projectId, proj.id)).limit(1);
  const swapPrompt = buildImagePrompt({
    idea: srcParams.idea ?? '',
    format: srcGen.format as ImageFormat,
    project: { name: proj.name, audience: proj.audience, tone: proj.tone },
    brandKit: kit ?? null,
    language,
    layout: newLayout,
    copy: nextCopy,
  });

  let renderedBuf: Buffer;
  let costCents = 0;
  let contentType: 'image/png' | 'image/jpeg' = 'image/png';
  try {
    const result = await generateImage({
      prompt: swapPrompt,
      format: srcGen.format as ImageFormat,
      provider: srcGen.provider as ImageProvider,
      model: srcGen.model ?? 'gpt-image-2',
      n: 1,
      quality: srcParams.aiPromptState?.quality ?? 'high',
    });
    const buf = result.buffers[0];
    if (!buf) throw new Error('model returned no image');
    renderedBuf = buf;
    costCents = Math.max(result.costCents, EDIT_COST_CENTS);
    contentType = result.contentType;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `layout swap failed: ${msg}` };
  }

  const sharpMod = (await import('sharp')).default;
  const composed = await sharpMod(renderedBuf, { failOn: 'none' })
    .resize(sourceAsset.width ?? 1080, sourceAsset.height ?? 1080, {
      fit: 'cover',
      position: 'centre',
    })
    .png({ compressionLevel: 6 })
    .toBuffer();

  const [newGen] = await db
    .insert(generation)
    .values({
      projectId: proj.id,
      type: 'image',
      format: srcGen.format,
      status: 'done',
      provider: srcGen.provider,
      model: srcGen.model,
      prompt: `Swap layout (→ ${parsed.data.layoutId}) of generation ${srcGen.id}`,
      params: {
        ...(srcParams as Record<string, unknown>),
        aiPromptState: {
          layoutId: parsed.data.layoutId,
          mode: 'exploration' as const,
          copy: nextCopy,
          brandColors,
          model: srcGen.model,
          quality: srcParams.aiPromptState?.quality ?? 'high',
          effort: 'balanced' as const,
          language,
          variants: [
            {
              prompt: swapPrompt,
              copy: nextCopy,
              layoutId: parsed.data.layoutId,
              label: `swap → ${parsed.data.layoutId}`,
            },
          ],
        },
        layoutSwapOf: { generationId: srcGen.id, assetId: sourceAsset.id },
      },
      costCents,
      finishedAt: new Date(),
    })
    .returning();
  if (!newGen) return { ok: false, error: 'failed to create generation row' };

  const key = `${proj.id}/${newGen.id}/1.png`;
  const upload = await putR2(key, composed, contentType);
  const [newAsset] = await db
    .insert(asset)
    .values({
      generationId: newGen.id,
      projectId: proj.id,
      kind: 'image',
      format: srcGen.format,
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

/**
 * Override brand colors on a single asset's overlay. Same flow as
 * swapLayout but with the colors swapped instead of the layout.
 */
const swapColorsInput = z.object({
  generationId: z.string().uuid(),
  assetId: z.string().uuid(),
  colors: z.object({
    ink: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    paper: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  }),
});

export type SwapColorsInput = z.input<typeof swapColorsInput>;

export async function swapColors(
  input: SwapColorsInput,
): Promise<ActionResult<{ generationId: string; assetId: string; publicUrl: string | null }>> {
  const session = await getSession();
  if (!session) return { ok: false, error: 'unauthenticated' };
  const parsed = swapColorsInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid input' };
  }

  const [srcGen] = await db
    .select()
    .from(generation)
    .where(eq(generation.id, parsed.data.generationId))
    .limit(1);
  if (!srcGen) return { ok: false, error: 'not-found' };
  const [proj] = await db
    .select()
    .from(project)
    .where(
      and(
        eq(project.id, srcGen.projectId),
        eq(project.userId, session.user.id),
        isNull(project.archivedAt),
      ),
    )
    .limit(1);
  if (!proj) return { ok: false, error: 'not-found' };

  const srcParams = (srcGen.params ?? {}) as {
    aiPromptState?: {
      layoutId?: LayoutId;
      copy?: PlannedCopy | PlannedCopy[];
      brandColors?: BrandColors;
      language?: 'en' | 'es';
      quality?: 'low' | 'medium' | 'high';
    };
    composeState?: unknown;
    idea?: string;
  };
  if (!srcParams.aiPromptState && srcParams.composeState) {
    return {
      ok: false,
      error: 'legacy generation — re-generate to enable color swap under the new AI pipeline',
    };
  }
  const layoutId = srcParams.aiPromptState?.layoutId;
  if (!layoutId) {
    return { ok: false, error: 'source generation has no layout' };
  }

  const siblings = await db
    .select()
    .from(asset)
    .where(eq(asset.generationId, srcGen.id))
    .orderBy(asset.createdAt);
  const idx = siblings.findIndex((a) => a.id === parsed.data.assetId);
  if (idx < 0) return { ok: false, error: 'asset not part of generation' };
  const sourceAsset = siblings[idx];
  if (!sourceAsset?.publicUrl) return { ok: false, error: 'asset not found' };

  // Fetch the source asset to use as image-edit reference.
  let sourceImage: Buffer;
  try {
    const res = await fetch(sourceAsset.publicUrl);
    if (!res.ok) throw new Error(`fetch ${res.status}`);
    sourceImage = Buffer.from(await res.arrayBuffer());
  } catch (err) {
    return {
      ok: false,
      error: `failed to fetch source asset: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const layout = getLayout({ layoutId });
  const aiPromptCopy = srcParams.aiPromptState?.copy;
  const priorCopy: PlannedCopy = Array.isArray(aiPromptCopy)
    ? (aiPromptCopy[idx] ?? {})
    : (aiPromptCopy ?? {});
  const language = srcParams.aiPromptState?.language ?? 'en';

  // Build a synthetic brand kit with the new colors for the prompt.
  const [kit] = await db.select().from(brandKit).where(eq(brandKit.projectId, proj.id)).limit(1);
  const recoloredKit = kit
    ? { ...kit, primaryColor: parsed.data.colors.ink, bgColor: parsed.data.colors.paper, accentColor: parsed.data.colors.accent }
    : null;

  const basePrompt = buildImagePrompt({
    idea: srcParams.idea ?? '',
    format: srcGen.format as ImageFormat,
    project: { name: proj.name, audience: proj.audience, tone: proj.tone },
    brandKit: recoloredKit,
    language,
    layout,
    copy: priorCopy,
  });
  const recolorPrompt =
    basePrompt +
    `\n\n[PRESERVE]\nThis is a RECOLOR EDIT of the reference image. Keep EVERYTHING about the reference identical — same composition, same focal subject, same lighting structure, same copy text, same layout. Only the brand palette has changed: shift the dominant colors from the prior palette to the new BRAND PALETTE listed above. All ink-colored regions adopt ${parsed.data.colors.ink}; paper regions adopt ${parsed.data.colors.paper}; accent regions adopt ${parsed.data.colors.accent}.`;

  let renderedBuf: Buffer;
  let costCents = 0;
  let contentType: 'image/png' | 'image/jpeg' = 'image/png';
  try {
    const result = await generateImage({
      prompt: recolorPrompt,
      format: srcGen.format as ImageFormat,
      provider: srcGen.provider as ImageProvider,
      model: srcGen.model ?? 'gpt-image-2',
      n: 1,
      quality: srcParams.aiPromptState?.quality ?? 'high',
      sourceImage,
    });
    const buf = result.buffers[0];
    if (!buf) throw new Error('model returned no image');
    renderedBuf = buf;
    costCents = Math.max(result.costCents, EDIT_COST_CENTS);
    contentType = result.contentType;
  } catch (err) {
    return {
      ok: false,
      error: `recolor failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const sharpMod = (await import('sharp')).default;
  const composed = await sharpMod(renderedBuf, { failOn: 'none' })
    .resize(sourceAsset.width ?? 1080, sourceAsset.height ?? 1080, {
      fit: 'cover',
      position: 'centre',
    })
    .png({ compressionLevel: 6 })
    .toBuffer();

  const [newGen] = await db
    .insert(generation)
    .values({
      projectId: proj.id,
      type: 'image',
      format: srcGen.format,
      status: 'done',
      provider: srcGen.provider,
      model: srcGen.model,
      prompt: `Recolor edit of generation ${srcGen.id}`,
      params: {
        ...(srcParams as Record<string, unknown>),
        aiPromptState: {
          layoutId,
          mode: 'exploration' as const,
          copy: priorCopy,
          brandColors: parsed.data.colors,
          model: srcGen.model,
          quality: srcParams.aiPromptState?.quality ?? 'high',
          effort: 'balanced' as const,
          language,
          variants: [
            { prompt: recolorPrompt, copy: priorCopy, layoutId, label: 'recolor' },
          ],
        },
        colorSwapOf: { generationId: srcGen.id, assetId: sourceAsset.id },
      },
      costCents,
      finishedAt: new Date(),
    })
    .returning();
  if (!newGen) return { ok: false, error: 'failed to create generation row' };

  const key = `${proj.id}/${newGen.id}/1.png`;
  const upload = await putR2(key, composed, contentType);
  const [newAsset] = await db
    .insert(asset)
    .values({
      generationId: newGen.id,
      projectId: proj.id,
      kind: 'image',
      format: srcGen.format,
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

/**
 * Recent image generations for a project — server-loaded data for the
 * form page's "Recent generations" gallery. Returns at most N rows
 * with the first asset's publicUrl + status + format + cost so the
 * gallery can render thumbnails without a second round-trip.
 */
export async function getRecentGenerations({
  projectId,
  limit = 12,
}: {
  projectId: string;
  limit?: number;
}): Promise<
  Array<{
    generationId: string;
    format: string;
    status: string;
    costCents: number | null;
    createdAt: Date;
    firstAssetUrl: string | null;
  }>
> {
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

  const rows = await db
    .select({
      generationId: generation.id,
      format: generation.format,
      status: generation.status,
      costCents: generation.costCents,
      createdAt: generation.createdAt,
    })
    .from(generation)
    .where(and(eq(generation.projectId, proj.id), eq(generation.type, 'image')))
    .orderBy(desc(generation.createdAt))
    .limit(limit);

  if (rows.length === 0) return [];

  // Scope the asset query to JUST the generations we're returning,
  // not the whole project — saves us scanning every asset row on
  // projects with thousands of generated images. inArray + index on
  // (generation_id, created_at) make this a single index seek.
  const generationIds = rows.map((r) => r.generationId);
  const allAssets = await db
    .select({
      generationId: asset.generationId,
      publicUrl: asset.publicUrl,
      createdAt: asset.createdAt,
    })
    .from(asset)
    .where(inArray(asset.generationId, generationIds))
    .orderBy(asset.createdAt);
  const firstByGen = new Map<string, string | null>();
  for (const a of allAssets) {
    if (!a.generationId) continue;
    if (!firstByGen.has(a.generationId)) {
      firstByGen.set(a.generationId, a.publicUrl);
    }
  }

  return rows.map((r) => ({
    generationId: r.generationId,
    format: r.format,
    status: r.status,
    costCents: r.costCents,
    createdAt: r.createdAt,
    firstAssetUrl: firstByGen.get(r.generationId) ?? null,
  }));
}

/**
 * Brand reference images for `images.edit` calls — anchors the model
 * to the user's visual vocabulary across generations. Returns up to 4
 * buffers (the practical sweet spot per OpenAI's prompting guide:
 * gpt-image-2 supports 16 but quality drops past ~4).
 *
 * Sources, in priority order:
 *   1. brandKit.logoUrl (when set).
 *   2. The most recent SUCCESSFUL image generation's first asset for
 *      this project (anchors the model to "what this brand looks like
 *      now"). Skipped when the source is itself a re-render-overlay
 *      row (those don't represent a fresh visual direction).
 *
 * Returns empty array when nothing usable is available. The worker
 * tolerates the empty case — no refs = falls back to images.generate.
 */
export async function getBrandReferenceImages(projectId: string): Promise<Buffer[]> {
  // Thin user-facing wrapper around the worker-safe util in
  // src/server/lib/brandReferences.ts. The worker imports the lib
  // directly (this file's 'use server' directive transitively pulls in
  // next/navigation which breaks worker startup). Session ownership
  // check stays here so external callers can't read arbitrary
  // projects' references.
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
  const { getBrandReferenceImages: load } = await import('@/server/lib/brandReferences');
  return load(proj.id);
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
