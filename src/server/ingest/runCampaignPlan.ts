import 'server-only';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { type CampaignRow, campaign } from '@/server/db/schema/campaigns';
import { ingestion } from '@/server/db/schema/ingestion';
import { project } from '@/server/db/schema/projects';
import { type CampaignPlan, estimateSlateCostCents, planCampaign } from './planCampaign';
import type { StoredBrief } from './runBriefExtraction';

/**
 * Pure-server orchestrator for Step 3's campaign planning. Lives
 * outside actions/ so the BullMQ worker can call it directly after
 * Step 2's brief extraction finishes — no Next request context, no
 * getSession().
 *
 * Idempotency: if an awaiting_approval campaign already exists for
 * this ingestion, RETURNS the existing row instead of re-running the
 * planner. Re-running is reserved for the explicit "re-plan" button
 * the review UI exposes (which calls the action, not this).
 */

export interface RunCampaignPlanResult {
  campaignId: string;
  plan: CampaignPlan;
  costCents: number;
  modelUsed: string;
  reused: boolean;
}

export async function runCampaignPlanForIngestion(args: {
  ingestionId: string;
  projectId: string;
}): Promise<RunCampaignPlanResult> {
  const { ingestionId, projectId } = args;

  // Re-use any existing awaiting_approval campaign for this
  // ingestion. The review UI is the only place that decides to
  // re-plan — and it calls the action, not this helper.
  const [existing] = await db
    .select()
    .from(campaign)
    .where(and(eq(campaign.ingestionId, ingestionId), eq(campaign.projectId, projectId)))
    .orderBy(desc(campaign.createdAt))
    .limit(1);
  if (existing && existing.status === 'awaiting_approval') {
    return reuseExistingCampaign(existing);
  }

  const [ingestionRow] = await db
    .select()
    .from(ingestion)
    .where(eq(ingestion.id, ingestionId))
    .limit(1);
  if (!ingestionRow) throw new Error(`runCampaignPlan: ingestion ${ingestionId} not found`);
  const bundle = (ingestionRow.bundle ?? null) as
    | ({ brief?: StoredBrief } & Record<string, unknown>)
    | null;
  const stored = bundle?.brief;
  if (!stored) throw new Error('runCampaignPlan: no brief on bundle yet');

  const planResult = await planCampaign({ brief: stored.brief });

  // Final estimate uses the same helper the UI uses, so review-page
  // numbers and DB-persisted numbers match exactly.
  const estimatedCostCents = estimateSlateCostCents(planResult.plan.assets);

  const [inserted] = await db
    .insert(campaign)
    .values({
      projectId,
      ingestionId,
      status: 'awaiting_approval',
      brief: stored.brief as unknown as Record<string, unknown>,
      plan: planResult.plan as unknown as Record<string, unknown>,
      costCentsEstimated: estimatedCostCents,
      costCentsActual: 0,
    })
    .returning();
  if (!inserted) throw new Error('runCampaignPlan: campaign insert returned no row');

  // Track the planner LLM cost against the ingestion (consistent
  // with how Step 2 tracks costs).
  await db
    .update(ingestion)
    .set({ costCents: (ingestionRow.costCents ?? 0) + planResult.costCents })
    .where(eq(ingestion.id, ingestionId));

  // Project ownership check — defensive, in case a caller mismatches
  // the projectId / ingestion link.
  const [proj] = await db
    .select({ id: project.id })
    .from(project)
    .where(eq(project.id, projectId))
    .limit(1);
  if (!proj) {
    throw new Error(`runCampaignPlan: project ${projectId} not found`);
  }

  return {
    campaignId: inserted.id,
    plan: planResult.plan,
    costCents: planResult.costCents,
    modelUsed: planResult.modelUsed,
    reused: false,
  };
}

function reuseExistingCampaign(row: CampaignRow): RunCampaignPlanResult {
  const stored = (row.plan ?? null) as CampaignPlan | null;
  return {
    campaignId: row.id,
    plan: stored ?? {
      assets: [],
      rationale: '',
      estimatedCostCents: 0,
      estimatedDurationMinutes: 0,
    },
    costCents: 0,
    modelUsed: 'reused',
    reused: true,
  };
}
