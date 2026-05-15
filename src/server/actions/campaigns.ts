'use server';

import { and, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { IMAGE_FORMAT_KEYS } from '@/lib/image-formats';
import { REEL_TEMPLATES } from '@/lib/reel-templates';
import { VISUAL_STYLE_KEYS, type VisualStyleKey } from '@/lib/visual-styles-meta';
import { LAYOUT_IDS, type LayoutId } from '@/server/ai/layoutTemplates';
import { CHANNEL_KEYS, type ChannelKey } from '@/server/config/channelTemplates';
import { db } from '@/server/db/client';
import { campaign } from '@/server/db/schema/campaigns';
import { project } from '@/server/db/schema/projects';
import { getSession } from '@/server/getSession';
import {
  type CampaignPlan,
  estimateSlateCostCents,
  type PlannedAsset,
} from '@/server/ingest/planCampaign';
import { runCampaignPlanForIngestion } from '@/server/ingest/runCampaignPlan';

/**
 * Step 3 server actions.
 *
 * createCampaignFromBrief — invoked from the ingestion worker AND from
 *   the review-page "re-plan" button. Both go through the same pure
 *   orchestrator (runCampaignPlanForIngestion). The action wrapper just
 *   adds the auth check.
 * updateCampaignPlan — saves Garcia's edits from the review UI.
 * approveCampaign — flips status to 'running'. Step 4 will wire the
 *   bulk worker enqueue; for now we log + return ok.
 *
 * Anti-hardcode: option lists in zod come from the SAME catalogs the
 * planner serializes, so any catalog addition flows through to both.
 */

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

// ─── Reel duration enum derived at module load ──────────────────────

const REEL_DURATIONS = Array.from(
  new Set(Object.values(REEL_TEMPLATES).map((t) => t.durationSec)),
).sort((a, b) => a - b);

const reelDurationSchema = z
  .number()
  .int()
  .refine((d) => REEL_DURATIONS.includes(d), {
    message: 'reel duration not in catalog',
  });

const plannedImageAsset = z.object({
  kind: z.literal('image'),
  format: z.enum(IMAGE_FORMAT_KEYS as [string, ...string[]]),
  layoutId: z.enum(LAYOUT_IDS as [LayoutId, ...LayoutId[]]),
  visualStyle: z.enum(VISUAL_STYLE_KEYS as unknown as [VisualStyleKey, ...VisualStyleKey[]]),
  brief: z.string().trim().min(1).max(600),
});

const plannedCopyAsset = z.object({
  kind: z.literal('copy'),
  channel: z.enum(CHANNEL_KEYS as [ChannelKey, ...ChannelKey[]]),
  brief: z.string().trim().min(1).max(600),
  targetWordCount: z.number().int().min(20).max(600).optional(),
});

const plannedReelAsset = z.object({
  kind: z.literal('reel'),
  durationSec: reelDurationSchema,
  visualStyle: z.enum(VISUAL_STYLE_KEYS as unknown as [VisualStyleKey, ...VisualStyleKey[]]),
  brief: z.string().trim().min(1).max(600),
});

const plannedAssetSchema = z.discriminatedUnion('kind', [
  plannedImageAsset,
  plannedCopyAsset,
  plannedReelAsset,
]);

const campaignPlanSchema = z.object({
  assets: z.array(plannedAssetSchema).min(0).max(48),
  rationale: z.string().trim().min(1).max(1200),
  estimatedCostCents: z.number().int().min(0).optional(),
  estimatedDurationMinutes: z.number().int().min(1).max(600),
});

// ─── createCampaignFromBrief ────────────────────────────────────────

const createInput = z.object({
  ingestionId: z.string().uuid(),
  projectId: z.string().uuid(),
});

export async function createCampaignFromBrief(
  input: z.input<typeof createInput>,
): Promise<ActionResult<{ campaignId: string; reused: boolean }>> {
  const session = await getSession();
  if (!session) return { ok: false, error: 'unauthenticated' };

  const parsed = createInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid input' };
  }

  // Ownership: project must belong to the session user.
  const [proj] = await db
    .select({ userId: project.userId })
    .from(project)
    .where(eq(project.id, parsed.data.projectId))
    .limit(1);
  if (!proj) return { ok: false, error: 'project-not-found' };
  if (proj.userId !== session.user.id) return { ok: false, error: 'forbidden' };

  try {
    const result = await runCampaignPlanForIngestion({
      ingestionId: parsed.data.ingestionId,
      projectId: parsed.data.projectId,
    });
    return { ok: true, data: { campaignId: result.campaignId, reused: result.reused } };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

// ─── updateCampaignPlan ─────────────────────────────────────────────

const updateInput = z.object({
  campaignId: z.string().uuid(),
  plan: campaignPlanSchema,
});

export async function updateCampaignPlan(
  input: z.input<typeof updateInput>,
): Promise<ActionResult<{ costCents: number }>> {
  const session = await getSession();
  if (!session) return { ok: false, error: 'unauthenticated' };

  const parsed = updateInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid input' };
  }

  // Ownership: campaign → project → user.
  const [row] = await db
    .select({
      campaignId: campaign.id,
      campaignStatus: campaign.status,
      ownerUserId: project.userId,
    })
    .from(campaign)
    .innerJoin(project, eq(project.id, campaign.projectId))
    .where(eq(campaign.id, parsed.data.campaignId))
    .limit(1);
  if (!row) return { ok: false, error: 'not-found' };
  if (row.ownerUserId !== session.user.id) return { ok: false, error: 'forbidden' };
  if (row.campaignStatus !== 'awaiting_approval' && row.campaignStatus !== 'planning') {
    return { ok: false, error: 'campaign no longer editable' };
  }

  // Recompute the cost estimate from the catalog rates rather than
  // trusting whatever number the client posted. Single source of truth.
  const assets = parsed.data.plan.assets as PlannedAsset[];
  const costCentsEstimated = estimateSlateCostCents(assets);
  const planToStore: CampaignPlan = {
    assets,
    rationale: parsed.data.plan.rationale,
    estimatedCostCents: costCentsEstimated,
    estimatedDurationMinutes: parsed.data.plan.estimatedDurationMinutes,
  };

  await db
    .update(campaign)
    .set({
      plan: planToStore as unknown as Record<string, unknown>,
      costCentsEstimated,
    })
    .where(eq(campaign.id, parsed.data.campaignId));

  return { ok: true, data: { costCents: costCentsEstimated } };
}

// ─── approveCampaign ────────────────────────────────────────────────

const approveInput = z.object({ campaignId: z.string().uuid() });

export async function approveCampaign(
  input: z.input<typeof approveInput>,
): Promise<ActionResult<{ status: 'running' }>> {
  const session = await getSession();
  if (!session) return { ok: false, error: 'unauthenticated' };

  const parsed = approveInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid input' };
  }

  const [row] = await db
    .select({
      campaignId: campaign.id,
      campaignStatus: campaign.status,
      projectId: campaign.projectId,
      ownerUserId: project.userId,
    })
    .from(campaign)
    .innerJoin(project, eq(project.id, campaign.projectId))
    .where(eq(campaign.id, parsed.data.campaignId))
    .limit(1);
  if (!row) return { ok: false, error: 'not-found' };
  if (row.ownerUserId !== session.user.id) return { ok: false, error: 'forbidden' };
  if (row.campaignStatus !== 'awaiting_approval') {
    return { ok: false, error: 'campaign not in awaiting_approval' };
  }

  await db
    .update(campaign)
    .set({ status: 'running', approvedAt: new Date() })
    .where(eq(campaign.id, parsed.data.campaignId));

  // Step 4 — enqueue the bulk-fan-out worker. jobId === campaignId so
  // a double-approve collapses into a single job (BullMQ rejects the
  // second add).
  try {
    const queue = (await import('@/server/jobs/campaignQueue')).getCampaignQueue();
    await queue.add(
      'fan-out',
      { campaignId: parsed.data.campaignId, projectId: row.projectId },
      { jobId: parsed.data.campaignId },
    );
  } catch (err) {
    // Rollback the status flip so the review UI can retry — the
    // campaign is functionally still "awaiting approval" if we
    // couldn't enqueue it.
    await db
      .update(campaign)
      .set({ status: 'awaiting_approval', approvedAt: null })
      .where(eq(campaign.id, parsed.data.campaignId));
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `enqueue failed: ${msg}` };
  }

  return { ok: true, data: { status: 'running' } };
}

// ─── getActiveCampaignForIngestion (used by the parsing-page redirect) ─

const getActiveInput = z.object({ ingestionId: z.string().uuid() });

export async function getActiveCampaignForIngestion(
  input: z.input<typeof getActiveInput>,
): Promise<ActionResult<{ campaignId: string; status: string; projectSlug: string } | null>> {
  const session = await getSession();
  if (!session) return { ok: false, error: 'unauthenticated' };
  const parsed = getActiveInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid input' };
  }
  const rows = await db
    .select({
      campaignId: campaign.id,
      campaignStatus: campaign.status,
      ownerUserId: project.userId,
      projectSlug: project.slug,
    })
    .from(campaign)
    .innerJoin(project, eq(project.id, campaign.projectId))
    .where(
      and(
        eq(campaign.ingestionId, parsed.data.ingestionId),
        inArray(campaign.status, ['awaiting_approval', 'running', 'done']),
      ),
    )
    .orderBy(desc(campaign.createdAt))
    .limit(1);
  const row = rows[0];
  if (!row) return { ok: true, data: null };
  if (row.ownerUserId !== session.user.id) return { ok: false, error: 'forbidden' };
  return {
    ok: true,
    data: { campaignId: row.campaignId, status: row.campaignStatus, projectSlug: row.projectSlug },
  };
}
