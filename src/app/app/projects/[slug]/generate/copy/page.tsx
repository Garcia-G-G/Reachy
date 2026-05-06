import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { GenerateCopyForm } from '@/components/app/generate-copy-form';
import { MonoEyebrow } from '@/components/editorial';
import { getBrandKitForProject } from '@/server/actions/brandKits';
import { getProjectBySlug } from '@/server/actions/projects';
import { isOpenAIConfigured } from '@/server/ai/openai';

interface GenerateCopyPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: GenerateCopyPageProps): Promise<Metadata> {
  const t = await getTranslations('Copy');
  const { slug } = await params;
  const project = await getProjectBySlug(slug);
  return { title: project ? `${project.name} — ${t('metaTitle')}` : t('metaTitle') };
}

export default async function GenerateCopyPage({ params }: GenerateCopyPageProps) {
  const { slug } = await params;
  const project = await getProjectBySlug(slug);
  if (!project) notFound();

  const bundle = await getBrandKitForProject(project.id);

  return (
    <Content
      projectId={project.id}
      hasBrandKit={Boolean(bundle?.brandKit)}
      openaiConfigured={isOpenAIConfigured()}
    />
  );
}

function Content({
  projectId,
  hasBrandKit,
  openaiConfigured,
}: {
  projectId: string;
  hasBrandKit: boolean;
  openaiConfigured: boolean;
}) {
  const t = useTranslations('Copy');

  return (
    <div className="space-y-12">
      <div>
        <MonoEyebrow as="div">{t('eyebrow')}</MonoEyebrow>
        <h2
          className="display mt-6"
          style={{ fontSize: 'clamp(36px, 4.4vw, 56px)', lineHeight: 1.0 }}
        >
          {t('title')}
        </h2>
        <p
          className="mt-6 max-w-[60ch] text-ink-2"
          style={{
            fontFamily: 'var(--font-fraunces), Georgia, serif',
            fontSize: 18,
            fontWeight: 300,
            lineHeight: 1.5,
          }}
        >
          {t('subtitle')}
        </p>
        {!hasBrandKit && <p className="mono-eyebrow mt-6 text-ink-3">{t('noBrandKitNote')}</p>}
      </div>

      <GenerateCopyForm projectId={projectId} openaiConfigured={openaiConfigured} />
    </div>
  );
}
