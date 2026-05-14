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

  // Load the source asset to recompose. The asset row carries the
  // public_url of the COMPOSED image (background + previous overlay).
  // We re-fetch the COMPOSITE because that's what we have — re-overlaying
  // on top of a previous overlay would stack typography. Acceptable for
  // a first iteration; v2 will persist the raw background separately.
  const [sourceAsset] = parsed.data.assetId
    ? await db
        .select()
        .from(asset)
        .where(and(eq(asset.id, parsed.data.assetId), eq(asset.generationId, sourceGen.id)))
        .limit(1)
    : await db
        .select()
        .from(asset)
        .where(eq(asset.generationId, sourceGen.id))
        .orderBy(desc(asset.createdAt))
        .limit(1);
  if (!sourceAsset?.publicUrl) {
    return { ok: false, error: 'no-source-asset' };
  }

  // Recover the layout + colors used by the original render. Saved in
  // params.composeState by the worker after a successful compose.
  const sourceParams = (sourceGen.params ?? {}) as {
    composeState?: {
      layoutId?: LayoutId;
      colors?: BrandColors;
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

  // Fetch the existing composite from R2 — this is the "background" the
  // user wants to keep. Acceptable v1 trade-off (re-overlays on a
  // previous overlay; v2 will store the raw background separately so
  // we can layer crisply without stacking text on text).
  let backgroundBuf: Buffer;
  try {
    const res = await fetch(sourceAsset.publicUrl);
    if (!res.ok) throw new Error(`fetch ${res.status} ${res.statusText}`);
    const arr = await res.arrayBuffer();
    backgroundBuf = Buffer.from(arr);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `failed to fetch source asset: ${msg}` };
  }

  const filteredCopy: PlannedCopy = {};
  for (const slot of layout.slots) {
    const v = parsed.data.copy[slot];
    if (v && v.length > 0) filteredCopy[slot] = v;
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
  const [newGen] = await db
    .insert(generation)
    .values({
      projectId: proj.id,
      type: 'image',
      format: sourceGen.format,
      status: 'done',
      provider: sourceGen.provider,
      model: sourceGen.model,
      prompt: `Re-render overlay of generation ${sourceGen.id}`,
      params: {
        ...sourceParams,
        composeState: {
          layoutId,
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
