import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { GenerateSubNav } from '@/components/app/generate-sub-nav';
import { getProjectBySlug } from '@/server/actions/projects';

interface GenerateLayoutProps {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}

export default async function GenerateLayout({ children, params }: GenerateLayoutProps) {
  const { slug } = await params;
  const project = await getProjectBySlug(slug);
  if (!project) notFound();

  return (
    <div className="space-y-10">
      <GenerateSubNav slug={project.slug} />
      <div>{children}</div>
    </div>
  );
}
