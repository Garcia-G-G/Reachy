import { notFound } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { getProjectBySlug } from '@/server/actions/projects';

interface ArchivePageProps {
  params: Promise<{ slug: string }>;
}

export default async function ArchivePage({ params }: ArchivePageProps) {
  const { slug } = await params;
  const project = await getProjectBySlug(slug);
  if (!project) notFound();

  return <ArchiveContent />;
}

function ArchiveContent() {
  const t = useTranslations('Projects');
  return <p className="text-ink-3 italic">{t('archiveEmpty')}</p>;
}
