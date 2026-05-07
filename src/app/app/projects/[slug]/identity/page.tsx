import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { IdentityForm } from '@/components/app/identity-form';
import { ProjectBriefSection } from '@/components/app/project-brief-section';
import { getBrandKitForProject } from '@/server/actions/brandKits';
import { getProjectBySlug } from '@/server/actions/projects';
import { getProjectBriefSummary } from '@/server/ai/briefs';

interface IdentityPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: IdentityPageProps): Promise<Metadata> {
  const t = await getTranslations('Identity');
  const { slug } = await params;
  const project = await getProjectBySlug(slug);
  return {
    title: project ? `${project.name} — ${t('metaTitle')}` : t('metaTitle'),
  };
}

export default async function IdentityPage({ params }: IdentityPageProps) {
  const { slug } = await params;
  const project = await getProjectBySlug(slug);
  if (!project) notFound();

  const bundle = await getBrandKitForProject(project.id);
  if (!bundle) notFound();
  const kit = bundle.brandKit;
  const briefSummary = await getProjectBriefSummary(project.id);

  return (
    <div className="space-y-12">
      <IdentityForm
        projectId={project.id}
        projectName={project.name}
        initial={{
          primaryColor: kit?.primaryColor ?? null,
          secondaryColor: kit?.secondaryColor ?? null,
          accentColor: kit?.accentColor ?? null,
          bgColor: kit?.bgColor ?? null,
          fontHeading: kit?.fontHeading ?? null,
          fontBody: kit?.fontBody ?? null,
          voice: kit?.voice ?? null,
          keywords: kit?.keywords ?? [],
          languages: kit?.languages ?? ['en'],
        }}
      />
      <ProjectBriefSection projectId={project.id} initial={briefSummary} />
    </div>
  );
}
