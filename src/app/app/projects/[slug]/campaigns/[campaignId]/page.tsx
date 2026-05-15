import { and, eq } from 'drizzle-orm';
import { notFound, redirect } from 'next/navigation';
import { CampaignGallery } from '@/components/app/campaign-gallery';
import { db } from '@/server/db/client';
import { campaign } from '@/server/db/schema/campaigns';
import { project } from '@/server/db/schema/projects';
import { getSession } from '@/server/getSession';

interface PageProps {
  params: Promise<{ slug: string; campaignId: string }>;
}

export default async function CampaignGalleryPage({ params }: PageProps) {
  const session = await getSession();
  if (!session) redirect('/login');

  const { slug, campaignId } = await params;

  const [proj] = await db
    .select()
    .from(project)
    .where(and(eq(project.slug, slug), eq(project.userId, session.user.id)))
    .limit(1);
  if (!proj) notFound();

  const [campaignRow] = await db
    .select()
    .from(campaign)
    .where(and(eq(campaign.id, campaignId), eq(campaign.projectId, proj.id)))
    .limit(1);
  if (!campaignRow) notFound();

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <CampaignGallery
        campaignId={campaignRow.id}
        projectSlug={proj.slug}
        projectName={proj.name}
      />
    </main>
  );
}
