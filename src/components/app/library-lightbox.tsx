'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';

/**
 * LibraryLightbox — Phase 08.
 *
 * Click "Vista grande" on a library cell → this opens. The image
 * sits on a dark backdrop at max-h 90vh; the right panel surfaces
 * lazy-fetched generation metadata (headline, layout, palette,
 * model, cost). All chrome typography uses control-tokens; the
 * caption surface stays editorial-friendly.
 *
 * Keyboard nav (←/→/Esc/D/E) is handled by LibraryGrid because the
 * URL ?asset state lives there — keeping the listener in one place
 * avoids "two listeners both fight to handle ArrowLeft" bugs.
 */

interface LightboxAsset {
  id: string;
  generationId: string | null;
  format: string | null;
  width: number | null;
  height: number | null;
  publicUrl: string | null;
  bytes: number | null;
  createdAt: string;
}

interface LibraryLightboxProps {
  asset: LightboxAsset;
  slug: string | null;
  totalCount: number;
  currentIndex: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}

interface AssetDetail {
  headline: string | null;
  layoutId: string | null;
  colors: { ink: string; paper: string; accent: string } | null;
  modelId: string | null;
  costCents: number | null;
}

function formatBytes(bytes: number | null): string {
  if (bytes == null) return '—';
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function formatCents(cents: number | null): string {
  if (cents == null) return '—';
  if (cents >= 100) return `$${(cents / 100).toFixed(2)}`;
  return `${cents}¢`;
}

export function LibraryLightbox({
  asset,
  slug,
  totalCount,
  currentIndex,
  onClose,
  onPrev,
  onNext,
}: LibraryLightboxProps) {
  const t = useTranslations('Library');
  const [detail, setDetail] = useState<AssetDetail | null>(null);
  const [loading, setLoading] = useState(false);

  // Reset + fetch fresh metadata whenever the open asset id changes.
  // Aborts in flight when the user keyboard-spams arrows so we don't
  // race to commit a stale response.
  useEffect(() => {
    setDetail(null);
    setLoading(true);
    const ctrl = new AbortController();
    void fetch(`/api/assets/${asset.id}/detail`, { signal: ctrl.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as { detail: AssetDetail };
      })
      .then((data) => {
        setDetail(data.detail);
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        // Soft fail — the chrome still renders without metadata.
        setDetail({ headline: null, layoutId: null, colors: null, modelId: null, costCents: null });
      })
      .finally(() => {
        // Only flip loading off if we didn't get aborted.
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, [asset.id]);

  const editorHref =
    slug && asset.generationId
      ? `/app/projects/${slug}/generate/image/${asset.generationId}`
      : null;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="!max-w-[min(1200px,96vw)] !p-0 bg-paper text-ink !ring-0 sm:max-w-[min(1200px,96vw)]"
        showCloseButton={false}
      >
        <div className="flex flex-col lg:flex-row gap-0 max-h-[92vh]">
          <div className="flex-1 flex items-center justify-center bg-ink/92 p-4 lg:p-6 relative overflow-hidden">
            {asset.publicUrl ? (
              // biome-ignore lint/performance/noImgElement: lightbox needs raw img — Next/Image's fill mode boxes the natural aspect we want preserved
              <img
                src={asset.publicUrl}
                alt={asset.format ?? 'asset'}
                className="max-h-[88vh] max-w-full object-contain"
              />
            ) : (
              <div className="mono-eyebrow text-paper-2">no public url</div>
            )}
            {/* Prev / next + index pill. Bottom-center so it doesn't
                fight the metadata panel. */}
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-3">
              <button
                type="button"
                onClick={onPrev}
                className="mono-eyebrow text-paper px-3 py-1 border border-paper/40 hover:border-paper transition-colors"
                aria-label={t('lightboxPrev')}
              >
                ← {t('lightboxPrev')}
              </button>
              <span className="mono-eyebrow text-paper/70 text-xs">
                {currentIndex + 1} / {totalCount}
              </span>
              <button
                type="button"
                onClick={onNext}
                className="mono-eyebrow text-paper px-3 py-1 border border-paper/40 hover:border-paper transition-colors"
                aria-label={t('lightboxNext')}
              >
                {t('lightboxNext')} →
              </button>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="absolute top-3 right-3 mono-eyebrow text-paper px-3 py-1 border border-paper/40 hover:border-paper transition-colors"
              aria-label={t('lightboxClose')}
            >
              {t('lightboxClose')} · esc
            </button>
          </div>

          {/* Metadata side panel. Fixed 320px on desktop; stacks
              full-width below image on narrow viewports. */}
          <aside className="w-full lg:w-[320px] shrink-0 bg-paper p-6 overflow-y-auto">
            <span className="ctrl-picker-header-label block mb-3">{t('lightboxMetadata')}</span>
            <dl className="space-y-3 text-sm">
              <Row label="Format" value={asset.format ?? '—'} />
              <Row label="Dimensions" value={`${asset.width ?? '?'} × ${asset.height ?? '?'}`} />
              <Row label="Size" value={formatBytes(asset.bytes)} />
              <Row label="Created" value={new Date(asset.createdAt).toLocaleString()} />
              {loading ? (
                <div className="mono-eyebrow text-ink-3 italic">{t('lightboxLoading')}</div>
              ) : detail ? (
                <>
                  {detail.headline ? (
                    <div>
                      <dt className="mono-eyebrow text-ink-3">Headline</dt>
                      <dd
                        className="mt-1 text-[15px] leading-snug"
                        style={{ fontFamily: 'var(--font-fraunces), Georgia, serif' }}
                      >
                        {detail.headline}
                      </dd>
                    </div>
                  ) : null}
                  {detail.layoutId ? <Row label="Layout" value={detail.layoutId} /> : null}
                  {detail.modelId ? <Row label="Model" value={detail.modelId} /> : null}
                  {detail.costCents != null ? (
                    <Row label="Cost" value={formatCents(detail.costCents)} />
                  ) : null}
                  {detail.colors ? (
                    <div>
                      <dt className="mono-eyebrow text-ink-3">Palette</dt>
                      <dd className="mt-2 flex gap-2">
                        <Swatch hex={detail.colors.ink} title="ink" />
                        <Swatch hex={detail.colors.paper} title="paper" />
                        <Swatch hex={detail.colors.accent} title="accent" />
                      </dd>
                    </div>
                  ) : null}
                </>
              ) : null}
            </dl>

            <div className="mt-6 flex flex-col gap-2">
              {asset.publicUrl ? (
                <a
                  href={asset.publicUrl}
                  download
                  target="_blank"
                  rel="noreferrer"
                  className="mono-eyebrow text-ink-2 hover:text-accent transition-colors"
                >
                  ↓ {t('download')} · D
                </a>
              ) : null}
              {editorHref ? (
                <Link
                  href={editorHref}
                  className="mono-eyebrow text-ink-2 hover:text-accent transition-colors"
                >
                  ✎ {t('openEditor')} · E
                </Link>
              ) : null}
            </div>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="mono-eyebrow text-ink-3">{label}</dt>
      <dd className="text-right text-ink">{value}</dd>
    </div>
  );
}

function Swatch({ hex, title }: { hex: string; title: string }) {
  return (
    <span
      title={`${title}: ${hex}`}
      className="inline-block w-6 h-6 border border-ink-3"
      style={{ background: hex }}
    />
  );
}
