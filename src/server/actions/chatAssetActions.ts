'use server';

import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { ImageFormat } from '@/server/ai/formats';
import { getLayout, type LayoutId } from '@/server/ai/layoutTemplates';
import { buildImagePrompt } from '@/server/ai/promptBuilder';
import { canonicalizeVisualStyleKey } from '@/server/ai/visualStyles';
import { fallbackTweakHint } from '@/server/config/quickActionHints';
import { db } from '@/server/db/client';
import { brandKit } from '@/server/db/schema/brandKits';
import { campaignAsset } from '@/server/db/schema/campaignAssets';
import { campaign } from '@/server/db/schema/campaigns';
import { generation } from '@/server/db/schema/generations';
import { project } from '@/server/db/schema/projects';
import { getSession } from '@/server/getSession';
import { getImageQueue } from '@/server/jobs/queue';

/**
 * Chat asset quick-action server actions — Phase 07f.
 *
 * Three thin actions called from the chat UI when the user clicks
 * the mejorar / variante / guardar chips on a generated asset.
 *
 * Each is session-gated through project.userId ownership. The actions
 * mirror the logic of the Emma tools (regenerateAsset / generateImage
 * / saveAsCampaignAsset) but run WITHOUT an LLM round-trip — the user
 * already has the original asset, no need to ask the model what to do.
 *
 * For mejorar: pulls the most recent critic issues for the asset
 * (stored on the campaign_asset row when the asset was previously
 * graded by the Step-05 critic). Falls back to a generic hint when
 * no critic data exists (chat-only assets).
 */

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

interface OriginalGenerationContext {
  gen: typeof generation.$inferSelect;
  proj: typeof project.$inferSelect;
  kit: typeof brandKit.$inferSelect | null;
}

/** Common: load the original generation + project + brand kit and
 *  verify ownership. Returns null when not owned or missing. */
async function loadGenContext(
  userId: string,
  generationId: string,
): Promise<OriginalGenerationContext | null> {
  const [gen] = await db.select().from(generation).where(eq(generation.id, generationId)).limit(1);
  if (!gen) return null;
  const [proj] = await db
    .select()
    .from(project)
    .where(and(eq(project.id, gen.projectId), eq(project.userId, userId)))
    .limit(1);
  if (!proj) return null;
  const [kit] = await db.select().from(brandKit).where(eq(brandKit.projectId, proj.id)).limit(1);
  return { gen, proj, kit: kit ?? null };
}

// ─── 1. regenerateChatAsset ────────────────────────────────────────

const regenerateInput = z.object({
  generationId: z.string().uuid(),
  tweakHint: z.string().max(400).optional(),
});

export async function regenerateChatAsset(
  input: z.input<typeof regenerateInput>,
): Promise<Result<{ generationId: string }>> {
  const session = await getSession();
  if (!session) return { ok: false, error: 'unauthenticated' };
  const parsed = regenerateInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid-input' };
  }

  const ctx = await loadGenContext(session.user.id, parsed.data.generationId);
  if (!ctx) return { ok: false, error: 'not-found' };
  if (ctx.gen.type !== 'image') {
    return { ok: false, error: 'regenerate-only-supports-image' };
  }
  if (!ctx.kit) return { ok: false, error: 'project-missing-brand-kit' };

  // Resolve the tweak hint. Prefer the caller's explicit hint; else
  // pull the most recent critic issues for this generation (when it
  // had been promoted to a campaign_asset previously); else fall
  // back to a language-aware generic hint.
  let resolvedHint = parsed.data.tweakHint?.trim() ?? '';
  if (!resolvedHint) {
    const [withCritic] = await db
      .select({ issues: campaignAsset.criticIssues })
      .from(campaignAsset)
      .where(eq(campaignAsset.generationId, ctx.gen.id))
      .orderBy(desc(campaignAsset.createdAt))
      .limit(1);
    const issues = (withCritic?.issues ?? null) as string[] | null;
    if (issues && issues.length > 0) {
      resolvedHint = `Address these issues: ${issues.slice(0, 4).join(' · ')}.`;
    }
  }
  if (!resolvedHint) {
    const language = (ctx.kit.languages?.[0] ?? 'en') as 'en' | 'es';
    resolvedHint = fallbackTweakHint(language);
  }

  const params = (ctx.gen.params ?? {}) as Record<string, unknown>;
  const originalIdea = typeof params.idea === 'string' ? params.idea : '';
  const layoutId = (params.layoutId as LayoutId) ?? 'hero-centered';
  const visualStyleOverride =
    typeof params.visualStyleOverride === 'string' ? params.visualStyleOverride : null;
  const language = (params.language as 'en' | 'es' | undefined) ?? 'en';
  const format = (ctx.gen.format ?? 'square') as ImageFormat;

  const newIdea = `${originalIdea}\n\nRevision note: ${resolvedHint}`;
  const layout = getLayout({ layoutId });
  const prompt = buildImagePrompt({
    idea: newIdea,
    format,
    project: { name: ctx.proj.name, audience: ctx.proj.audience, tone: ctx.proj.tone },
    brandKit: ctx.kit as never,
    language,
    layout,
    visualStyleOverride: canonicalizeVisualStyleKey(visualStyleOverride),
    copy: {},
    effort: 'high',
  });

  const [newGen] = await db
    .insert(generation)
    .values({
      projectId: ctx.proj.id,
      type: 'image',
      format: ctx.gen.format,
      status: 'queued',
      provider: 'openai',
      model: 'gpt-image-2',
      prompt,
      params: {
        ...params,
        idea: newIdea,
        tweakHint: resolvedHint,
        parentGenerationId: ctx.gen.id,
        source: 'emma-chat-mejorar',
      },
    })
    .returning();
  if (!newGen) return { ok: false, error: 'failed-to-insert-regeneration-row' };

  try {
    await getImageQueue().add(
      'generate',
      {
        generationId: newGen.id,
        projectId: ctx.proj.id,
        prompt,
        format,
        provider: 'openai',
        model: 'gpt-image-2',
        n: 1,
        quality: 'high',
        layoutId,
        idea: newIdea,
        language,
        mode: 'exploration',
        effort: 'high',
      },
      { jobId: newGen.id },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'queue-error';
    await db
      .update(generation)
      .set({ status: 'failed', errorMessage: `queue add failed: ${msg}`, finishedAt: new Date() })
      .where(eq(generation.id, newGen.id));
    return { ok: false, error: 'queue-unreachable' };
  }

  return { ok: true, data: { generationId: newGen.id } };
}

// ─── 2. enqueueChatAssetVariation ──────────────────────────────────

const variationInput = z.object({
  generationId: z.string().uuid(),
});

export async function enqueueChatAssetVariation(
  input: z.input<typeof variationInput>,
): Promise<Result<{ generationId: string }>> {
  const session = await getSession();
  if (!session) return { ok: false, error: 'unauthenticated' };
  const parsed = variationInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid-input' };
  }

  const ctx = await loadGenContext(session.user.id, parsed.data.generationId);
  if (!ctx) return { ok: false, error: 'not-found' };
  if (ctx.gen.type !== 'image') {
    return { ok: false, error: 'variation-only-supports-image' };
  }
  if (!ctx.kit) return { ok: false, error: 'project-missing-brand-kit' };

  const params = (ctx.gen.params ?? {}) as Record<string, unknown>;
  const idea = typeof params.idea === 'string' ? params.idea : '';
  const layoutId = (params.layoutId as LayoutId) ?? 'hero-centered';
  const visualStyleOverride =
    typeof params.visualStyleOverride === 'string' ? params.visualStyleOverride : null;
  const language = (params.language as 'en' | 'es' | undefined) ?? 'en';
  const format = (ctx.gen.format ?? 'square') as ImageFormat;

  const layout = getLayout({ layoutId });
  // Build a fresh prompt from the same params — same brief, but the
  // image worker's per-variant boldness + multi-strategy axes will
  // produce a deliberately different attempt.
  const prompt = buildImagePrompt({
    idea,
    format,
    project: { name: ctx.proj.name, audience: ctx.proj.audience, tone: ctx.proj.tone },
    brandKit: ctx.kit as never,
    language,
    layout,
    visualStyleOverride: canonicalizeVisualStyleKey(visualStyleOverride),
    copy: {},
    effort: 'high',
  });

  const [newGen] = await db
    .insert(generation)
    .values({
      projectId: ctx.proj.id,
      type: 'image',
      format: ctx.gen.format,
      status: 'queued',
      provider: 'openai',
      model: 'gpt-image-2',
      prompt,
      params: {
        ...params,
        parentGenerationId: ctx.gen.id,
        source: 'emma-chat-variante',
      },
    })
    .returning();
  if (!newGen) return { ok: false, error: 'failed-to-insert-variation-row' };

  try {
    await getImageQueue().add(
      'generate',
      {
        generationId: newGen.id,
        projectId: ctx.proj.id,
        prompt,
        format,
        provider: 'openai',
        model: 'gpt-image-2',
        n: 1,
        quality: 'high',
        layoutId,
        idea,
        language,
        mode: 'exploration',
        effort: 'high',
      },
      { jobId: newGen.id },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'queue-error';
    await db
      .update(generation)
      .set({ status: 'failed', errorMessage: `queue add failed: ${msg}`, finishedAt: new Date() })
      .where(eq(generation.id, newGen.id));
    return { ok: false, error: 'queue-unreachable' };
  }

  return { ok: true, data: { generationId: newGen.id } };
}

// ─── 3. saveChatAssetToLibrary ─────────────────────────────────────

const saveInput = z.object({
  generationId: z.string().uuid(),
  briefSnapshot: z.string().max(1200).optional(),
});

export async function saveChatAssetToLibrary(
  input: z.input<typeof saveInput>,
): Promise<Result<{ campaignAssetId: string; alreadySaved: boolean }>> {
  const session = await getSession();
  if (!session) return { ok: false, error: 'unauthenticated' };
  const parsed = saveInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid-input' };
  }

  const ctx = await loadGenContext(session.user.id, parsed.data.generationId);
  if (!ctx) return { ok: false, error: 'not-found' };

  // Idempotency — re-clicking guardar must not duplicate the row.
  const [existingRow] = await db
    .select({ id: campaignAsset.id })
    .from(campaignAsset)
    .where(eq(campaignAsset.generationId, ctx.gen.id))
    .limit(1);
  if (existingRow) {
    return { ok: true, data: { campaignAssetId: existingRow.id, alreadySaved: true } };
  }

  // Find or lazy-create the project's chat-saves container. We mark
  // it via plan.source='emma-chat' so the lookup is fast on repeat
  // saves and the gallery can group these together.
  let [savesCampaign] = await db
    .select()
    .from(campaign)
    .where(and(eq(campaign.projectId, ctx.proj.id), sql`${campaign.plan}->>'source' = 'emma-chat'`))
    .limit(1);
  if (!savesCampaign) {
    const [created] = await db
      .insert(campaign)
      .values({
        projectId: ctx.proj.id,
        status: 'done',
        brief: null,
        plan: { source: 'emma-chat', label: 'Emma · chat saves' },
        costCentsActual: 0,
      })
      .returning();
    if (!created) return { ok: false, error: 'failed-to-create-saves-campaign' };
    savesCampaign = created;
  }

  const params = (ctx.gen.params ?? {}) as Record<string, unknown>;
  const idea = typeof params.idea === 'string' ? params.idea : '';
  const briefSnapshot = parsed.data.briefSnapshot ?? idea.slice(0, 1200);
  const kind = (ctx.gen.type ?? 'image') as 'image' | 'copy' | 'reel';

  const [row] = await db
    .insert(campaignAsset)
    .values({
      campaignId: savesCampaign.id,
      kind,
      channel: null,
      generationId: ctx.gen.id,
      briefSnapshot,
      status: 'done',
      costCents: ctx.gen.costCents ?? 0,
    })
    .returning();
  if (!row) return { ok: false, error: 'failed-to-insert-campaign-asset' };

  return { ok: true, data: { campaignAssetId: row.id, alreadySaved: false } };
}
