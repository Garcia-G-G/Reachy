'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';

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

export function LibraryGrid({ assets }: { assets: LibraryAsset[] }) {
  const t = useTranslations('Library');
  const [copiedId, setCopiedId] = useState<string | null>(null);

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

  return (
    <ul className="grid grid-cols-1 gap-12 sm:grid-cols-2 xl:grid-cols-3">
      {assets.map((asset) => (
        <li key={asset.id} className="space-y-3">
          <div className="border border-ink">
            {asset.publicUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={asset.publicUrl}
                alt=""
                className="block aspect-square h-full w-full object-cover"
                loading="lazy"
              />
            ) : (
              <div className="mono-eyebrow flex aspect-square items-center justify-center bg-paper-2 text-ink-3">
                no public url
              </div>
            )}
          </div>

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
      ))}
    </ul>
  );
}
