'use client';

import { useState } from 'react';
import type { ReelCostBreakdown } from '@/lib/reel-cost';
import { REEL_TEMPLATES, type ReelEngine, type ReelTemplateKey } from '@/lib/reel-templates';

export interface ReelLibraryRow {
  generationId: string;
  template: ReelTemplateKey;
  status: 'queued' | 'running' | 'done' | 'failed';
  errorMessage: string | null;
  costCents: number | null;
  costBreakdown: ReelCostBreakdown | null;
  createdAt: string;
  finishedAt: string | null;
  videoUrl: string | null;
  durationSec: number | null;
  bytes: number | null;
  engine: ReelEngine;
  tagline: string;
}

export function ReelLibrary({ reels }: { reels: ReelLibraryRow[] }) {
  return (
    <ul className="grid grid-cols-1 gap-12 md:grid-cols-2 xl:grid-cols-3">
      {reels.map((r) => (
        <li key={r.generationId}>
          <ReelCard reel={r} />
        </li>
      ))}
    </ul>
  );
}

function ReelCard({ reel }: { reel: ReelLibraryRow }) {
  const [openVideo, setOpenVideo] = useState(false);
  const date = formatDate(reel.createdAt);
  const tplLabel = REEL_TEMPLATES[reel.template]?.label ?? reel.template;

  return (
    <article className="space-y-4">
      <div className="border border-ink bg-paper-2" style={{ aspectRatio: '9 / 16' }}>
        {reel.videoUrl ? (
          openVideo ? (
            // biome-ignore lint/a11y/useMediaCaption: brand reels have no caption track yet
            <video
              src={reel.videoUrl}
              controls
              autoPlay
              playsInline
              className="block h-full w-full object-cover"
            />
          ) : (
            <button
              type="button"
              onClick={() => setOpenVideo(true)}
              className="block h-full w-full text-left"
              aria-label={`Play reel: ${reel.tagline || tplLabel}`}
            >
              <span className="flex h-full w-full items-center justify-center mono-eyebrow text-ink-3">
                ▶ Play
              </span>
            </button>
          )
        ) : (
          <span className="flex h-full w-full items-center justify-center mono-eyebrow text-ink-3">
            {reel.status === 'failed'
              ? `failed${reel.errorMessage ? ` — ${truncate(reel.errorMessage, 40)}` : ''}`
              : reel.status}
          </span>
        )}
      </div>

      <div className="space-y-1">
        <p
          className="line-clamp-2"
          style={{ fontFamily: 'var(--font-fraunces), Georgia, serif', fontSize: 17 }}
        >
          {reel.tagline || tplLabel}
        </p>
        <p className="mono-eyebrow text-ink-3">
          {date} · {tplLabel} ·{' '}
          {reel.engine === 'sora-pro-720p'
            ? 'Sora 2 Pro'
            : reel.engine === 'sora-base'
              ? 'Sora 2'
              : 'FFmpeg'}
          {typeof reel.durationSec === 'number' && ` · ${reel.durationSec}s`}
          {typeof reel.costCents === 'number' && ` · $${(reel.costCents / 100).toFixed(2)}`}
        </p>
        {reel.costBreakdown && (
          <p className="mono-eyebrow text-ink-3">
            {formatLibraryCostBreakdown(reel.costBreakdown, reel.engine)}
          </p>
        )}
      </div>

      {reel.videoUrl && (
        <div className="flex flex-wrap gap-3">
          <a
            href={reel.videoUrl}
            download
            className="mono-eyebrow text-ink-3 transition-colors hover:text-accent"
          >
            Download
          </a>
          <a
            href={reel.videoUrl}
            target="_blank"
            rel="noreferrer"
            className="mono-eyebrow text-ink-3 transition-colors hover:text-accent"
          >
            Open
          </a>
        </div>
      )}
    </article>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const day = String(d.getDate()).padStart(2, '0');
  const month = d.toLocaleString('en-US', { month: 'short' }).toUpperCase();
  const year = String(d.getFullYear()).slice(-2);
  return `${day} ${month} ${year}`;
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

function formatLibraryCostBreakdown(breakdown: ReelCostBreakdown, engine: ReelEngine): string {
  const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;
  const parts: string[] = [];
  if (typeof breakdown.parts.video === 'number' && breakdown.parts.video > 0) {
    const label =
      engine === 'sora-pro-720p' ? 'Sora Pro' : engine === 'sora-base' ? 'Sora' : 'video';
    parts.push(`${label} ${fmt(breakdown.parts.video)}`);
  }
  if (typeof breakdown.parts.images === 'number' && breakdown.parts.images > 0) {
    parts.push(`images ${fmt(breakdown.parts.images)}`);
  }
  if (breakdown.parts.tts > 0) parts.push(`TTS ${fmt(breakdown.parts.tts)}`);
  if (breakdown.parts.compose > 0) parts.push(`compose ${fmt(breakdown.parts.compose)}`);
  return parts.join(' · ');
}
