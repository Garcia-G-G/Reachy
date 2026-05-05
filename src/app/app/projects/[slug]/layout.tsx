import { notFound } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { ProjectTabs } from '@/components/app/project-tabs';
import { MonoEyebrow } from '@/components/editorial';
import { getProjectBySlug } from '@/server/actions/projects';

interface ProjectLayoutProps {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}

export default async function ProjectLayout({ children, params }: ProjectLayoutProps) {
  const { slug } = await params;
  const project = await getProjectBySlug(slug);
  if (!project) notFound();

  return (
    <ProjectLayoutContent slug={project.slug} name={project.name}>
      {children}
    </ProjectLayoutContent>
  );
}

function ProjectLayoutContent({
  slug,
  name,
  children,
}: {
  slug: string;
  name: string;
  children: ReactNode;
}) {
  const t = useTranslations('Projects');

  return (
    <div className="mx-auto max-w-[1080px]">
      <MonoEyebrow as="div">{t('currentEdition')}</MonoEyebrow>
      <h1 className="display mt-6" style={{ fontSize: 'clamp(48px, 6vw, 84px)', lineHeight: 0.96 }}>
        {name}
      </h1>
      <div className="mt-12">
        <ProjectTabs slug={slug} />
      </div>
      <div className="mt-12">{children}</div>
    </div>
  );
}
