'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { LibraryLightbox } from './library-lightbox';

interface LibraryAsset {
  id: string;
  /** Phase 08 — present when the asset was rendered through the
   *  AI-typography pipeline. When null we skip the editor link. */
  generationId: string | null;
  format: string | null;
  width: number | null;
  height: number | null;
  publicUrl: string | null;
  storageKey: string | null;
  bytes: number | null;
  createdAt: string;
}

interface LibraryGridProps {
  assets: LibraryAsset[];
  /** Project slug. Phase 08 — required to build the editor link from
   *  asset.generationId. Marked optional defensively so a stale
   *  caller doesn't trigger a runtime error before typecheck catches
   *  it. */
  slug?: string;
}

export function LibraryGrid({ assets, slug }: LibraryGridProps) {
  const t = useTranslations('Library');
  const router = useRouter();
  const searchParams = useSearchParams();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Lightbox state lives in the URL (?asset=<id>) so a reload + back
  // button behave naturally. The grid drives the URL; the lightbox
  // reads it. We keep a memoized index so prev/next is O(1).
  const openAssetId = searchParams.get('asset');
  const indexById = useMemo(() => {
    const m = new Map<string, number>();
    assets.forEach((a, i) => m.set(a.id, i));
    return m;
  }, [assets]);
  const openIndex = openAssetId ? (indexById.get(openAssetId) ?? -1) : -1;

  const setOpenAssetId = useCallback(
    (id: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (id) params.set('asset', id);
      else params.delete('asset');
      const qs = params.toString();
      router.replace(qs ? `?${qs}` : '?', { scroll: false });
    },
    [router, searchParams],
  );

  const goPrev = useCallback(() => {
    if (openIndex < 0) return;
    const next = openIndex === 0 ? assets.length - 1 : openIndex - 1;
    const target = assets[next];
    if (target) setOpenAssetId(target.id);
  }, [assets, openIndex, setOpenAssetId]);

  const goNext = useCallback(() => {
    if (openIndex < 0) return;
    const next = openIndex === assets.length - 1 ? 0 : openIndex + 1;
    const target = assets[next];
    if (target) setOpenAssetId(target.id);
  }, [assets, openIndex, setOpenAssetId]);

  async function copyUrl(asset: LibraryAsset) {
    if (!asset.publicUrl) return;
    try {
      await navigator.clipboard.writeText(asset.publicUrl);
      setCopiedId(asset.id);
      toast.success(t('copied'));
      setTimeout(() => setCopiedId((cur) => (cur === asset.id ? null : cur)), 1500);
    } catch {
      toast.error('Clipboard blocked.');
    }
  }

  // Single keyboard listener for the whole grid — when the lightbox is
  // open, ←/→ navigates, Esc closes, D downloads, E opens editor.
  useEffect(() => {
    if (openIndex < 0) return;
    const handler = (e: KeyboardEvent) => {
      // Don't hijack typing inputs.
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpenAssetId(null);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goPrev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        goNext();
      } else if (e.key === 'd' || e.key === 'D') {
        const a = assets[openIndex];
        if (a?.publicUrl) {
          const link = document.createElement('a');
          link.href = a.publicUrl;
          link.download = '';
          link.target = '_blank';
          link.rel = 'noreferrer';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }
      } else if ((e.key === 'e' || e.key === 'E') && slug) {
        const a = assets[openIndex];
        if (a?.generationId) {
          router.push(`/app/projects/${slug}/generate/image/${a.generationId}`);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [openIndex, assets, slug, router, goPrev, goNext, setOpenAssetId]);

  return (
    <>
      <ul className="grid grid-cols-1 gap-12 sm:grid-cols-2 xl:grid-cols-3">
        {assets.map((asset) => {
          const editorHref =
            slug && asset.generationId
              ? `/app/projects/${slug}/generate/image/${asset.generationId}`
              : null;
          const ImageInner = asset.publicUrl ? (
            <Image
              src={asset.publicUrl}
              alt=""
              fill
              sizes="(min-width: 1280px) 33vw, (min-width: 640px) 50vw, 100vw"
              className="object-cover"
            />
          ) : (
            <div className="mono-eyebrow flex h-full w-full items-center justify-center bg-paper-2 text-ink-3">
              no public url
            </div>
          );
          return (
            <li key={asset.id} className="space-y-3">
              {/* The big thumb is the primary affordance — clicking
                  opens the editor when we have a generationId, falls
                  through to opening the lightbox when we don't (legacy
                  assets without a generation row). */}
              {editorHref ? (
                <Link
                  href={editorHref}
                  className="relative block aspect-square border border-ink transition-colors hover:border-accent"
                  aria-label={`Open editor for ${asset.format ?? 'asset'}`}
                >
                  {ImageInner}
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => setOpenAssetId(asset.id)}
                  className="relative block aspect-square w-full border border-ink transition-colors hover:border-accent"
                  aria-label="Open lightbox"
                >
                  {ImageInner}
                </button>
              )}

              <div className="flex items-baseline justify-between gap-2">
                <p
                  className="truncate text-[15px]"
                  style={{ fontFamily: 'var(--font-fraunces), Georgia, serif' }}
                >
                  {asset.format ?? 'piece'}
                </p>
                <p className="mono-eyebrow text-ink-3">
                  {asset.width ?? '?'}×{asset.height ?? '?'}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => setOpenAssetId(asset.id)}
                  className="mono-eyebrow text-ink-3 transition-colors hover:text-accent"
                >
                  {t('viewLarge')}
                </button>
                {editorHref ? (
                  <Link
                    href={editorHref}
                    className="mono-eyebrow text-ink-3 transition-colors hover:text-accent"
                  >
                    {t('openEditor')}
                  </Link>
                ) : null}
                <button
                  type="button"
                  onClick={() => copyUrl(asset)}
                  disabled={!asset.publicUrl}
                  className="mono-eyebrow text-ink-3 transition-colors hover:text-accent disabled:opacity-40"
                >
                  {copiedId === asset.id ? t('copied') : t('copyUrl')}
                </button>
                {asset.publicUrl && (
                  <a
                    href={asset.publicUrl}
                    target="_blank"
                    rel="noreferrer"
                    download
                    className="mono-eyebrow text-ink-3 transition-colors hover:text-accent"
                  >
                    {t('download')}
                  </a>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {openIndex >= 0 && assets[openIndex] ? (
        <LibraryLightbox
          asset={assets[openIndex]}
          slug={slug ?? null}
          totalCount={assets.length}
          currentIndex={openIndex}
          onClose={() => setOpenAssetId(null)}
          onPrev={goPrev}
          onNext={goNext}
        />
      ) : null}
    </>
  );
}
