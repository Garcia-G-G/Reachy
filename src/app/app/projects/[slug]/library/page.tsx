import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { CopyArchive, type CopyArchiveRow } from '@/components/app/copy-archive';
import { LibraryGrid } from '@/components/app/library-grid';
import { LibraryTabs } from '@/components/app/library-tabs';
import { ReelLibrary, type ReelLibraryRow } from '@/components/app/reel-library';
import { MonoEyebrow } from '@/components/editorial';
import { listCopyEditionsForProject } from '@/server/actions/copy';
import { listAssetsForProject } from '@/server/actions/images';
import { getProjectBySlug } from '@/server/actions/projects';
import { listReelsForProject } from '@/server/actions/reels';

interface LibraryPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tab?: string }>;
}

type Tab = 'image' | 'copy' | 'reel';

function normalizeTab(raw: string | undefined): Tab {
  if (raw === 'copy') return 'copy';
  if (raw === 'reel') return 'reel';
  return 'image';
}

export async function generateMetadata({ params }: LibraryPageProps): Promise<Metadata> {
  const t = await getTranslations('Library');
  const { slug } = await params;
  const project = await getProjectBySlug(slug);
  return { title: project ? `${project.name} — ${t('metaTitle')}` : t('metaTitle') };
}

export default async function LibraryPage({ params, searchParams }: LibraryPageProps) {
  const { slug } = await params;
  const sp = await searchParams;
  const tab = normalizeTab(sp.tab);

  const project = await getProjectBySlug(slug);
  if (!project) notFound();

  // Only fetch the data we'll render.
  const imageAssetsP = tab === 'image' ? listAssetsForProject(project.id) : Promise.resolve([]);
  const copyEditionsP =
    tab === 'copy' ? listCopyEditionsForProject(project.id) : Promise.resolve([]);
  const reelsP = tab === 'reel' ? listReelsForProject(project.id) : Promise.resolve([]);
  const [imageAssets, copyEditions, reels] = await Promise.all([
    imageAssetsP,
    copyEditionsP,
    reelsP,
  ]);

  // For the image tab, drop non-image assets so we don't try to render them.
  const imageOnly = imageAssets.filter((a) => a.kind === 'image');

  const copyRows: CopyArchiveRow[] = copyEditions.map((e) => ({
    generationId: e.generationId,
    format: e.format,
    createdAt: e.createdAt,
    costCents: e.costCents,
    status: e.status,
    errorMessage: e.errorMessage,
    esPayload: e.es?.payload ?? null,
    enPayload: e.en?.payload ?? null,
  }));

  const reelRows: ReelLibraryRow[] = reels.map((r) => ({
    generationId: r.generationId,
    template: r.template,
    status: r.status,
    errorMessage: r.errorMessage,
    costCents: r.costCents,
    createdAt: r.createdAt,
    finishedAt: r.finishedAt,
    videoUrl: r.videoUrl,
    durationSec: r.durationSec,
    bytes: r.bytes,
    engine: r.engine,
    tagline: r.tagline,
  }));

  return (
    <Content
      slug={project.slug}
      tab={tab}
      images={imageOnly.map((a) => ({
        id: a.id,
        format: a.format,
        width: a.width,
        height: a.height,
        publicUrl: a.publicUrl,
        storageKey: a.storageKey,
        bytes: a.bytes,
        createdAt: a.createdAt.toISOString(),
      }))}
      copyRows={copyRows}
      reelRows={reelRows}
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

function Content({
  slug,
  tab,
  images,
  copyRows,
  reelRows,
}: {
  slug: string;
  tab: Tab;
  images: LibraryAsset[];
  copyRows: CopyArchiveRow[];
  reelRows: ReelLibraryRow[];
}) {
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

      <LibraryTabs slug={slug} active={tab} />

      {tab === 'image' &&
        (images.length === 0 ? (
          <p className="text-ink-3 italic">{t('empty')}</p>
        ) : (
          <LibraryGrid assets={images} />
        ))}

      {tab === 'copy' &&
        (copyRows.length === 0 ? (
          <p className="text-ink-3 italic">{t('emptyCopy')}</p>
        ) : (
          <CopyArchive editions={copyRows} />
        ))}

      {tab === 'reel' &&
        (reelRows.length === 0 ? (
          <p className="text-ink-3 italic">{t('emptyReel')}</p>
        ) : (
          <ReelLibrary reels={reelRows} />
        ))}
    </div>
  );
}
