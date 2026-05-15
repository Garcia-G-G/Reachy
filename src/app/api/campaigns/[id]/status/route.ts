import { asc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/server/db/client';
import { asset as assetTable } from '@/server/db/schema/assets';
import { campaignAsset } from '@/server/db/schema/campaignAssets';
import { campaign } from '@/server/db/schema/campaigns';
import { project } from '@/server/db/schema/projects';
import { getSession } from '@/server/getSession';

/**
 * Polling endpoint for the autopilot campaign gallery (Step 5). The
 * page hydrates from the server on first render; the client poller
 * hits this route every ~2s while the campaign is `running` to mirror
 * live status into the gallery without a full re-render.
 *
 * Returns the campaign row + every campaign_asset row + (for image /
 * reel rows) the linked asset's R2 publicUrl so the gallery can
 * thumbnail without a second round-trip.
 */

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  const { id } = await ctx.params;

  const rows = await db
    .select({
      campaignId: campaign.id,
      campaignStatus: campaign.status,
      campaignCreatedAt: campaign.createdAt,
      campaignFinishedAt: campaign.finishedAt,
      campaignApprovedAt: campaign.approvedAt,
      campaignCostEstimated: campaign.costCentsEstimated,
      campaignCostActual: campaign.costCentsActual,
      campaignErrorMessage: campaign.errorMessage,
      projectId: campaign.projectId,
      projectSlug: project.slug,
      projectName: project.name,
      ownerUserId: project.userId,
    })
    .from(campaign)
    .innerJoin(project, eq(project.id, campaign.projectId))
    .where(eq(campaign.id, id))
    .limit(1);
  const meta = rows[0];
  if (!meta) return NextResponse.json({ error: 'not-found' }, { status: 404 });
  if (meta.ownerUserId !== session.user.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const assetRows = await db
    .select({
      id: campaignAsset.id,
      kind: campaignAsset.kind,
      channel: campaignAsset.channel,
      generationId: campaignAsset.generationId,
      copyOutput: campaignAsset.copyOutput,
      status: campaignAsset.status,
      statusDetail: campaignAsset.statusDetail,
      costCents: campaignAsset.costCents,
      criticCostCents: campaignAsset.criticCostCents,
      criticScore: campaignAsset.criticScore,
      criticIssues: campaignAsset.criticIssues,
      retriesCount: campaignAsset.retriesCount,
      errorMessage: campaignAsset.errorMessage,
      briefSnapshot: campaignAsset.briefSnapshot,
      createdAt: campaignAsset.createdAt,
      finishedAt: campaignAsset.finishedAt,
    })
    .from(campaignAsset)
    .where(eq(campaignAsset.campaignId, id))
    .orderBy(asc(campaignAsset.createdAt));

  // Pull the linked asset publicUrls for image/reel rows so the
  // gallery can thumbnail without a second round-trip.
  const generationIds = assetRows.map((r) => r.generationId).filter((v): v is string => Boolean(v));
  const assets =
    generationIds.length === 0
      ? []
      : await db
          .select({
            generationId: assetTable.generationId,
            publicUrl: assetTable.publicUrl,
            width: assetTable.width,
            height: assetTable.height,
            kind: assetTable.kind,
            durationSec: assetTable.durationSec,
          })
          .from(assetTable);
  const assetByGenId = new Map<string, (typeof assets)[number]>();
  for (const a of assets) {
    if (a.generationId) assetByGenId.set(a.generationId, a);
  }

  const enriched = assetRows.map((r) => ({
    ...r,
    asset: r.generationId ? (assetByGenId.get(r.generationId) ?? null) : null,
  }));

  return NextResponse.json(
    {
      campaign: {
        id: meta.campaignId,
        status: meta.campaignStatus,
        createdAt: meta.campaignCreatedAt,
        approvedAt: meta.campaignApprovedAt,
        finishedAt: meta.campaignFinishedAt,
        costCentsEstimated: meta.campaignCostEstimated,
        costCentsActual: meta.campaignCostActual,
        errorMessage: meta.campaignErrorMessage,
      },
      project: {
        id: meta.projectId,
        slug: meta.projectSlug,
        name: meta.projectName,
      },
      assets: enriched,
    },
    { headers: { 'Cache-Control': 'no-store, must-revalidate' } },
  );
}
