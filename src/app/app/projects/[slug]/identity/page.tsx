import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { IdentityForm } from '@/components/app/identity-form';
import { getBrandKitForProject } from '@/server/actions/brandKits';
import { getProjectBySlug } from '@/server/actions/projects';

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

  return (
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
  );
}
