import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { GenerateImageForm } from '@/components/app/generate-image-form';
import { MonoEyebrow } from '@/components/editorial';
import { getBrandKitForProject } from '@/server/actions/brandKits';
import { getProjectBySlug } from '@/server/actions/projects';
import { isFalConfigured } from '@/server/ai/fal';
import { isOpenAIConfigured } from '@/server/ai/openai';
import { isR2Configured } from '@/server/storage/r2';

interface GeneratePageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: GeneratePageProps): Promise<Metadata> {
  const t = await getTranslations('Generate');
  const { slug } = await params;
  const project = await getProjectBySlug(slug);
  return { title: project ? `${project.name} — ${t('metaTitle')}` : t('metaTitle') };
}

export default async function GenerateImagePage({ params }: GeneratePageProps) {
  const { slug } = await params;
  const project = await getProjectBySlug(slug);
  if (!project) notFound();

  const bundle = await getBrandKitForProject(project.id);

  return (
    <GenerateImagePageContent
      projectId={project.id}
      hasBrandKit={Boolean(bundle?.brandKit)}
      providerAvailability={{
        openai: isOpenAIConfigured(),
        fal: isFalConfigured(),
      }}
      r2Configured={isR2Configured()}
    />
  );
}

function GenerateImagePageContent({
  projectId,
  hasBrandKit,
  providerAvailability,
  r2Configured,
}: {
  projectId: string;
  hasBrandKit: boolean;
  providerAvailability: { openai: boolean; fal: boolean };
  r2Configured: boolean;
}) {
  const t = useTranslations('Generate');

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

      <GenerateImageForm
        projectId={projectId}
        providerAvailability={providerAvailability}
        r2Configured={r2Configured}
      />
    </div>
  );
}
