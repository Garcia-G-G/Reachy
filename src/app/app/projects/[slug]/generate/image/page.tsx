import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { GenerateImageForm } from '@/components/app/generate-image-form';
import { MonoEyebrow } from '@/components/editorial';
import type { VisualStyleKey } from '@/lib/visual-styles-meta';
import { getBrandKitForProject } from '@/server/actions/brandKits';
import { getRecentGenerations } from '@/server/actions/images';
import { getProjectBySlug } from '@/server/actions/projects';
import { isFalConfigured } from '@/server/ai/fal';
import { isOpenAIConfigured } from '@/server/ai/openai';
import { canonicalizeVisualStyleKey } from '@/server/ai/visualStyles';
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
  const recents = await getRecentGenerations({ projectId: project.id, limit: 12 });

  // First language in the brand kit drives the default for copy planner.
  // Falls back to 'es' (Reachy's primary market) if no brand kit is set.
  const brandLanguages = (bundle?.brandKit?.languages ?? ['es']) as Array<'en' | 'es'>;

  // Canonicalize the brand kit's visualStyle before handing it to the
  // form — older brand_kit rows carry legacy keys (editorial,
  // paper-cutout, flat-2d, infographic, isometric, abstract) that
  // disappeared in the May-2026 visual-style rewrite. The client form
  // looks the key up directly in VISUAL_STYLE_META and crashes on a
  // miss; canonicalizing here maps the legacy value to its current
  // equivalent (e.g. 'abstract' → 'editorial-collage').
  const brandVisualStyle: VisualStyleKey | null = bundle?.brandKit?.visualStyle
    ? canonicalizeVisualStyleKey(bundle.brandKit.visualStyle)
    : null;

  return (
    <GenerateImagePageContent
      slug={slug}
      projectId={project.id}
      hasBrandKit={Boolean(bundle?.brandKit)}
      brandVisualStyle={brandVisualStyle}
      brandLanguages={brandLanguages}
      providerAvailability={{
        openai: isOpenAIConfigured(),
        fal: isFalConfigured(),
      }}
      r2Configured={isR2Configured()}
      recents={recents.map((r) => ({
        generationId: r.generationId,
        format: r.format,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
        firstAssetUrl: r.firstAssetUrl,
        costCents: r.costCents,
      }))}
    />
  );
}

interface RecentRow {
  generationId: string;
  format: string;
  status: string;
  createdAt: string;
  firstAssetUrl: string | null;
  costCents: number | null;
}

function GenerateImagePageContent({
  slug,
  projectId,
  hasBrandKit,
  brandVisualStyle,
  brandLanguages,
  providerAvailability,
  r2Configured,
  recents,
}: {
  slug: string;
  projectId: string;
  hasBrandKit: boolean;
  brandVisualStyle: VisualStyleKey | null;
  brandLanguages: Array<'en' | 'es'>;
  providerAvailability: { openai: boolean; fal: boolean };
  r2Configured: boolean;
  recents: RecentRow[];
}) {
  const t = useTranslations('Generate');

  return (
    <div className="mx-auto max-w-[860px] space-y-12">
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
        slug={slug}
        projectId={projectId}
        providerAvailability={providerAvailability}
        r2Configured={r2Configured}
        brandVisualStyle={brandVisualStyle}
        brandLanguages={brandLanguages}
      />

      {recents.length > 0 && (
        <section className="space-y-4 border-ink-3/30 border-t pt-12">
          <h3 className="mono-eyebrow">Recent generations</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {recents.map((r) => (
              <Link
                key={r.generationId}
                href={`/app/projects/${slug}/generate/image/${r.generationId}`}
                className="block space-y-1"
              >
                <div
                  className="relative overflow-hidden border border-ink-3/20 bg-paper-2 transition hover:border-ink"
                  style={{ aspectRatio: '1 / 1' }}
                >
                  {r.firstAssetUrl ? (
                    // biome-ignore lint/performance/noImgElement: small thumb
                    <img src={r.firstAssetUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="mono-eyebrow flex h-full w-full items-center justify-center text-ink-3">
                      {r.status}
                    </span>
                  )}
                </div>
                <div className="mono-eyebrow text-[10px] text-ink-3 truncate">
                  {r.format} · {r.costCents != null ? `${r.costCents}¢` : '—'}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
