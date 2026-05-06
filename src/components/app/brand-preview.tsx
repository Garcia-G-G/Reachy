'use client';

import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { MonoEyebrow } from '@/components/editorial';

interface BrandPreviewProps {
  projectName: string;
  primaryColor: string | null;
  secondaryColor: string | null;
  accentColor: string | null;
  bgColor: string | null;
  fontHeading: string | null;
  fontBody: string | null;
}

const DEFAULTS = {
  bg: '#f1ebdf',
  primary: '#14110d',
  secondary: '#4a4338',
  accent: '#b6481a',
  heading: 'Fraunces',
  body: 'Inter',
};

export function BrandPreview({
  projectName,
  primaryColor,
  secondaryColor,
  accentColor,
  bgColor,
  fontHeading,
  fontBody,
}: BrandPreviewProps) {
  const t = useTranslations('Identity');

  const bg = bgColor ?? DEFAULTS.bg;
  const primary = primaryColor ?? DEFAULTS.primary;
  const secondary = secondaryColor ?? DEFAULTS.secondary;
  const accent = accentColor ?? DEFAULTS.accent;
  const heading = fontHeading ?? DEFAULTS.heading;
  const body = fontBody ?? DEFAULTS.body;

  useEffect(() => {
    loadGoogleFont(heading);
    loadGoogleFont(body);
  }, [heading, body]);

  const initials = (projectName || 'R')
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="space-y-4">
      <MonoEyebrow as="div">{t('previewLabel')}</MonoEyebrow>
      <div
        className="aspect-square w-full max-w-[420px] border border-ink"
        style={{ background: bg, color: primary }}
      >
        <div className="flex h-full flex-col justify-between p-8">
          <div className="flex items-start justify-between gap-4">
            <div
              className="flex h-12 w-12 items-center justify-center border"
              style={{ borderColor: primary, color: primary, fontFamily: `'${heading}', serif` }}
            >
              <span className="text-[18px] font-semibold tracking-tight">{initials}</span>
            </div>
            <div className="h-2 w-16" style={{ background: accent }} aria-hidden />
          </div>

          <div className="space-y-3">
            <h3
              className="text-[34px] leading-[1.04] tracking-tight"
              style={{ fontFamily: `'${heading}', serif`, color: primary }}
            >
              {projectName || 'Your header'}
            </h3>
            <p
              className="text-[14px] leading-[1.5]"
              style={{ fontFamily: `'${body}', sans-serif`, color: secondary }}
            >
              A small edition of pieces — covers, posts, and reels — held to the same standard.
            </p>
            <div
              className="font-mono text-[10px] tracking-[0.18em] uppercase"
              style={{ color: secondary }}
            >
              № 01 · Reachy
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Already loaded via next/font/google in app/layout.tsx — no need to fetch again.
const SELF_HOSTED = new Set(['Fraunces', 'Inter', 'JetBrains Mono', 'Instrument Serif']);
const loaded = new Set<string>();

function loadGoogleFont(family: string) {
  if (typeof document === 'undefined') return;
  if (SELF_HOSTED.has(family)) return;
  if (loaded.has(family)) return;
  loaded.add(family);

  const id = `gf-${family.replace(/\s+/g, '-')}`;
  if (document.getElementById(id)) return;

  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  const param = family.replace(/\s+/g, '+');
  link.href = `https://fonts.googleapis.com/css2?family=${param}:wght@400;600&display=swap`;
  document.head.appendChild(link);
}
