import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { LibraryGrid } from '@/components/app/library-grid';
import { MonoEyebrow } from '@/components/editorial';
import { listAssetsForProject } from '@/server/actions/images';
import { getProjectBySlug } from '@/server/actions/projects';

interface LibraryPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: LibraryPageProps): Promise<Metadata> {
  const t = await getTranslations('Library');
  const { slug } = await params;
  const project = await getProjectBySlug(slug);
  return { title: project ? `${project.name} — ${t('metaTitle')}` : t('metaTitle') };
}

export default async function LibraryPage({ params }: LibraryPageProps) {
  const { slug } = await params;
  const project = await getProjectBySlug(slug);
  if (!project) notFound();

  const assets = await listAssetsForProject(project.id);

  return (
    <LibraryPageContent
      assets={assets.map((a) => ({
        id: a.id,
        format: a.format,
        width: a.width,
        height: a.height,
        publicUrl: a.publicUrl,
        storageKey: a.storageKey,
        bytes: a.bytes,
        createdAt: a.createdAt.toISOString(),
      }))}
    />
  );
}

interface LibraryAsset {
  id: string;
  format: string | null;
  width: number | null;
  height: number | null;
  publicUrl: string | null;
  storageKey: string | null;
  bytes: number | null;
  createdAt: string;
}

function LibraryPageContent({ assets }: { assets: LibraryAsset[] }) {
  const t = useTranslations('Library');

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
      </div>

      {assets.length === 0 ? (
        <p className="text-ink-3 italic">{t('empty')}</p>
      ) : (
        <LibraryGrid assets={assets} />
      )}
    </div>
  );
}
