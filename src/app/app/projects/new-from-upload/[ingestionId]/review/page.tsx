import { and, desc, eq } from 'drizzle-orm';
import { notFound, redirect } from 'next/navigation';
import { CampaignReview } from '@/components/app/campaign-review';
import { db } from '@/server/db/client';
import { brandKit } from '@/server/db/schema/brandKits';
import { campaign } from '@/server/db/schema/campaigns';
import { ingestion } from '@/server/db/schema/ingestion';
import { project } from '@/server/db/schema/projects';
import { getSession } from '@/server/getSession';
import type { CampaignPlan } from '@/server/ingest/planCampaign';
import type { StoredBrief } from '@/server/ingest/runBriefExtraction';

interface PageProps {
  params: Promise<{ ingestionId: string }>;
}

export default async function CampaignReviewPage({ params }: PageProps) {
  const session = await getSession();
  if (!session) redirect('/login');

  const { ingestionId } = await params;

  const [ingestionRow] = await db
    .select()
    .from(ingestion)
    .where(eq(ingestion.id, ingestionId))
    .limit(1);
  if (!ingestionRow) notFound();
  if (ingestionRow.userId !== session.user.id) notFound();

  // Latest campaign for this ingestion (any status); fail gracefully
  // if the worker hasn't planned yet.
  const [campaignRow] = await db
    .select()
    .from(campaign)
    .where(eq(campaign.ingestionId, ingestionId))
    .orderBy(desc(campaign.createdAt))
    .limit(1);

  if (!campaignRow) {
    // Brief extraction may still be running OR may have failed. Send
    // the user back to the parsing page where the polling card shows
    // the truth.
    redirect(`/app/projects/new-from-upload/${ingestionId}/parsing`);
  }

  const [proj] = await db
    .select()
    .from(project)
    .where(and(eq(project.id, campaignRow.projectId), eq(project.userId, session.user.id)))
    .limit(1);
  if (!proj) notFound();

  const [kit] = await db.select().from(brandKit).where(eq(brandKit.projectId, proj.id)).limit(1);

  const bundle = (ingestionRow.bundle ?? null) as ({ brief?: StoredBrief } & Record<string, unknown>) | null;
  const storedBrief = bundle?.brief ?? null;

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <CampaignReview
        ingestionId={ingestionId}
        campaign={{
          id: campaignRow.id,
          status: campaignRow.status,
          plan: (campaignRow.plan ?? null) as CampaignPlan | null,
          costCentsEstimated: campaignRow.costCentsEstimated,
        }}
        project={{
          id: proj.id,
          slug: proj.slug,
          name: proj.name,
          description: proj.description,
          tone: proj.tone,
        }}
        brandKit={
          kit
            ? {
                ink: kit.primaryColor ?? '#14110D',
                paper: kit.bgColor ?? '#F1EBDF',
                accent: kit.accentColor ?? '#B6481A',
                languages: (kit.languages ?? ['en']) as ('en' | 'es')[],
                visualStyle: kit.visualStyle,
                allowsHumans: kit.allowsHumans,
                qualityGateEnabled: kit.qualityGateEnabled,
                referenceAssetKeys: (kit.referenceAssetKeys ?? []) as string[],
              }
            : null
        }
        briefSnapshot={storedBrief}
      />
    </main>
  );
}
