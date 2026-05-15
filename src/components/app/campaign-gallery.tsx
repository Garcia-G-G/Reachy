'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CRITIC_GREEN_BAND_CLIENT as CRITIC_GREEN_BAND,
  CRITIC_WARNING_BAND_CLIENT as CRITIC_WARNING_BAND,
} from '@/lib/critic-thresholds-client';

interface GalleryAsset {
  id: string;
  kind: 'image' | 'copy' | 'reel';
  channel: string | null;
  generationId: string | null;
  copyOutput: string | null;
  status: 'pending' | 'running' | 'done' | 'failed';
  statusDetail: string | null;
  costCents: number;
  criticCostCents: number;
  criticScore: string | null;
  criticIssues: string[];
  retriesCount: number;
  errorMessage: string | null;
  briefSnapshot: string | null;
  createdAt: string;
  finishedAt: string | null;
  asset: {
    publicUrl: string | null;
    width: number | null;
    height: number | null;
    kind: string;
    durationSec: number | null;
  } | null;
}

interface StatusPayload {
  campaign: {
    id: string;
    status: 'planning' | 'awaiting_approval' | 'running' | 'done' | 'failed';
    createdAt: string;
    approvedAt: string | null;
    finishedAt: string | null;
    costCentsEstimated: number;
    costCentsActual: number;
    errorMessage: string | null;
  };
  project: { id: string; slug: string; name: string };
  assets: GalleryAsset[];
}

type FilterKey = 'all' | 'images' | 'copy' | 'reels' | 'warnings';

const POLL_INTERVAL_MS = 2500;

export function CampaignGallery(props: {
  campaignId: string;
  projectSlug: string;
  projectName: string;
}) {
  const [data, setData] = useState<StatusPayload | null>(null);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [why, setWhy] = useState<GalleryAsset | null>(null);
  const [networkError, setNetworkError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const statusRef = useRef<string | null>(null);

  useEffect(() => {
    const fetchOnce = async () => {
      try {
        const res = await fetch(`/api/campaigns/${props.campaignId}/status`, {
          cache: 'no-store',
        });
        if (!res.ok) {
          setNetworkError(`status ${res.status}`);
          return;
        }
        const json = (await res.json()) as StatusPayload;
        setData(json);
        setNetworkError(null);
        statusRef.current = json.campaign.status;
      } catch (err) {
        setNetworkError(err instanceof Error ? err.message : 'network error');
      }
    };
    fetchOnce();
    pollRef.current = setInterval(() => {
      if (statusRef.current === 'done' || statusRef.current === 'failed') {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
        return;
      }
      fetchOnce();
    }, POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [props.campaignId]);

  const stats = useMemo(() => {
    if (!data) return null;
    const total = data.assets.length;
    const done = data.assets.filter((a) => a.status === 'done').length;
    const failed = data.assets.filter((a) => a.status === 'failed').length;
    const warnings = data.assets.filter((a) => a.statusDetail === 'quality_warning').length;
    const retried = data.assets.filter((a) => a.retriesCount > 0).length;
    const scores = data.assets
      .map((a) => (a.criticScore ? Number.parseFloat(a.criticScore) : null))
      .filter((v): v is number => v !== null);
    const avgScore =
      scores.length > 0
        ? Number((scores.reduce((acc, v) => acc + v, 0) / scores.length).toFixed(1))
        : null;
    return { total, done, failed, warnings, retried, avgScore };
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    if (filter === 'all') return data.assets;
    if (filter === 'images') return data.assets.filter((a) => a.kind === 'image');
    if (filter === 'copy') return data.assets.filter((a) => a.kind === 'copy');
    if (filter === 'reels') return data.assets.filter((a) => a.kind === 'reel');
    if (filter === 'warnings') {
      return data.assets.filter(
        (a) => a.statusDetail === 'quality_warning' || a.status === 'failed',
      );
    }
    return data.assets;
  }, [data, filter]);

  const images = filtered.filter((a) => a.kind === 'image');
  const copies = filtered.filter((a) => a.kind === 'copy');
  const reels = filtered.filter((a) => a.kind === 'reel');

  if (!data) {
    return (
      <div className="mono-eyebrow text-ink-3">
        {networkError ? `Network: ${networkError}` : 'Loading…'}
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {/* Header */}
      <header className="space-y-3">
        <p className="mono-eyebrow text-ink-3">Autopilot · Step 5 · Gallery</p>
        <h1
          style={{
            fontFamily: 'var(--font-fraunces), Georgia, serif',
            fontSize: 'clamp(40px, 5.5vw, 80px)',
            letterSpacing: '-0.03em',
            lineHeight: 1,
          }}
        >
          {props.projectName}
        </h1>
        {stats && (
          <p className="mono-eyebrow text-ink-3">
            {stats.done}/{stats.total} done
            {stats.retried > 0 ? ` · ${stats.retried} retried` : ''}
            {stats.warnings > 0
              ? ` · ${stats.warnings} quality warning${stats.warnings === 1 ? '' : 's'}`
              : ''}
            {stats.failed > 0 ? ` · ${stats.failed} failed` : ''}
            {stats.avgScore !== null ? ` · avg score ${stats.avgScore}` : ''}
            {' · '}~${(data.campaign.costCentsActual / 100).toFixed(2)}
            {' · status: '}
            {data.campaign.status}
          </p>
        )}
      </header>

      {/* Filters */}
      <nav className="flex flex-wrap items-center gap-2">
        <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>
          All · {data.assets.length}
        </FilterChip>
        <FilterChip active={filter === 'images'} onClick={() => setFilter('images')}>
          Images · {data.assets.filter((a) => a.kind === 'image').length}
        </FilterChip>
        <FilterChip active={filter === 'copy'} onClick={() => setFilter('copy')}>
          Copy · {data.assets.filter((a) => a.kind === 'copy').length}
        </FilterChip>
        <FilterChip active={filter === 'reels'} onClick={() => setFilter('reels')}>
          Reels · {data.assets.filter((a) => a.kind === 'reel').length}
        </FilterChip>
        {stats && stats.warnings + stats.failed > 0 && (
          <FilterChip active={filter === 'warnings'} onClick={() => setFilter('warnings')}>
            Warnings · {stats.warnings + stats.failed}
          </FilterChip>
        )}
        <a
          href={`/app/projects/${props.projectSlug}/library`}
          className="mono-eyebrow text-ink-3 hover:text-ink ml-auto"
        >
          back to library
        </a>
      </nav>

      {/* IMAGES */}
      {images.length > 0 && (
        <section className="space-y-3 border-t border-ink-3/30 pt-6">
          <h2 className="mono-eyebrow">Images · {images.length}</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {images.map((a) => (
              <ImageCard key={a.id} asset={a} onWhy={() => setWhy(a)} />
            ))}
          </div>
        </section>
      )}

      {/* COPY */}
      {copies.length > 0 && (
        <section className="space-y-3 border-t border-ink-3/30 pt-6">
          <h2 className="mono-eyebrow">Copy · {copies.length}</h2>
          <ul className="space-y-2">
            {copies.map((a) => (
              <CopyCard key={a.id} asset={a} onWhy={() => setWhy(a)} />
            ))}
          </ul>
        </section>
      )}

      {/* REELS */}
      {reels.length > 0 && (
        <section className="space-y-3 border-t border-ink-3/30 pt-6">
          <h2 className="mono-eyebrow">Reels · {reels.length}</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {reels.map((a) => (
              <ReelCard key={a.id} asset={a} onWhy={() => setWhy(a)} />
            ))}
          </div>
        </section>
      )}

      {/* Why modal */}
      {why && <WhyModal asset={why} onClose={() => setWhy(null)} />}
    </div>
  );
}

function FilterChip(props: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className="mono-eyebrow border px-3 py-1 hover:bg-ink hover:text-paper"
      style={{
        borderColor: props.active ? 'var(--color-ink, #14110D)' : 'rgba(20,17,13,0.18)',
        background: props.active ? 'var(--color-ink, #14110D)' : 'transparent',
        color: props.active ? 'var(--color-paper, #F1EBDF)' : 'inherit',
      }}
    >
      {props.children}
    </button>
  );
}

// ─── Score badge ────────────────────────────────────────────────────

function ScoreBadge(props: { score: string | null; warning: boolean }) {
  if (!props.score) {
    return <span className="mono-eyebrow text-ink-3">no score</span>;
  }
  const n = Number.parseFloat(props.score);
  const color = props.warning
    ? '#B6481A'
    : n >= CRITIC_GREEN_BAND
      ? '#1F7A3A'
      : n >= CRITIC_WARNING_BAND
        ? '#B89010'
        : '#B6481A';
  return (
    <span
      className="inline-flex items-center justify-center text-xs font-medium border"
      style={{
        background: color,
        color: '#F1EBDF',
        borderColor: color,
        minWidth: 36,
        height: 22,
        padding: '0 6px',
      }}
      title={props.warning ? 'Quality warning — review before posting' : `Critic score ${n}/10`}
    >
      {n.toFixed(1)}
    </span>
  );
}

// ─── Per-kind cards ────────────────────────────────────────────────

function ImageCard({ asset, onWhy }: { asset: GalleryAsset; onWhy: () => void }) {
  const warning = asset.statusDetail === 'quality_warning';
  return (
    <div
      className="border p-2 flex flex-col gap-2"
      style={{ borderColor: warning ? '#B6481A' : 'rgba(20,17,13,0.18)' }}
    >
      <div className="relative aspect-[4/5] bg-paper-2 overflow-hidden flex items-center justify-center">
        {asset.asset?.publicUrl ? (
          // biome-ignore lint/performance/noImgElement: gallery thumbnails are direct R2 URLs
          <img
            src={asset.asset.publicUrl}
            alt={asset.briefSnapshot ?? ''}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="mono-eyebrow text-ink-3 text-xs">
            {asset.status === 'failed' ? 'failed' : asset.status}
            {asset.retriesCount > 0 ? ` · retry ${asset.retriesCount}` : ''}
          </span>
        )}
        <div className="absolute top-2 right-2">
          <ScoreBadge score={asset.criticScore} warning={warning} />
        </div>
      </div>
      <div className="space-y-1">
        <p className="mono-eyebrow text-ink-3 text-[10px] truncate">
          {asset.briefSnapshot ?? '(no brief)'}
        </p>
        <div className="flex items-center justify-between">
          {asset.criticIssues.length > 0 ? (
            <button
              type="button"
              onClick={onWhy}
              className="mono-eyebrow text-ink-3 hover:text-ink text-[10px]"
            >
              why?
            </button>
          ) : (
            <span className="mono-eyebrow text-ink-3 text-[10px]">{asset.status}</span>
          )}
          {asset.asset?.publicUrl && (
            <a
              href={asset.asset.publicUrl}
              download
              className="mono-eyebrow text-ink-3 hover:text-ink text-[10px]"
            >
              ↓
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function CopyCard({ asset, onWhy }: { asset: GalleryAsset; onWhy: () => void }) {
  const warning = asset.statusDetail === 'quality_warning';
  return (
    <li
      className="border p-3 flex flex-col gap-2"
      style={{ borderColor: warning ? '#B6481A' : 'rgba(20,17,13,0.18)' }}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="mono-eyebrow text-ink-3">
          {asset.channel ?? 'copy'} · {asset.status}
          {asset.retriesCount > 0 ? ` · retry ${asset.retriesCount}` : ''}
        </span>
        <ScoreBadge score={asset.criticScore} warning={warning} />
      </div>
      {asset.copyOutput ? (
        <p className="text-sm whitespace-pre-wrap leading-snug max-h-40 overflow-auto">
          {asset.copyOutput}
        </p>
      ) : (
        <p className="mono-eyebrow text-ink-3 text-xs">
          {asset.status === 'failed' ? (asset.errorMessage ?? 'failed') : '...'}
        </p>
      )}
      <div className="flex items-center justify-between">
        {asset.criticIssues.length > 0 ? (
          <button
            type="button"
            onClick={onWhy}
            className="mono-eyebrow text-ink-3 hover:text-ink text-[10px]"
          >
            why?
          </button>
        ) : (
          <span />
        )}
        {asset.copyOutput && (
          <button
            type="button"
            className="mono-eyebrow text-ink-3 hover:text-ink text-[10px]"
            onClick={() => navigator.clipboard?.writeText(asset.copyOutput ?? '')}
          >
            copy
          </button>
        )}
      </div>
    </li>
  );
}

function ReelCard({ asset, onWhy }: { asset: GalleryAsset; onWhy: () => void }) {
  const warning = asset.statusDetail === 'quality_warning';
  return (
    <div
      className="border p-2 flex flex-col gap-2"
      style={{ borderColor: warning ? '#B6481A' : 'rgba(20,17,13,0.18)' }}
    >
      <div className="relative aspect-[9/16] bg-paper-2 overflow-hidden flex items-center justify-center">
        {asset.asset?.publicUrl ? (
          // biome-ignore lint/a11y/useMediaCaption: campaign-gallery reels render without captions
          <video
            src={asset.asset.publicUrl}
            controls
            className="h-full w-full object-cover"
            preload="metadata"
          />
        ) : (
          <span className="mono-eyebrow text-ink-3 text-xs">
            {asset.status === 'failed' ? 'failed' : asset.status}
            {asset.retriesCount > 0 ? ` · retry ${asset.retriesCount}` : ''}
          </span>
        )}
        <div className="absolute top-2 right-2">
          <ScoreBadge score={asset.criticScore} warning={warning} />
        </div>
      </div>
      <p className="mono-eyebrow text-ink-3 text-[10px] truncate">
        {asset.asset?.durationSec ? `${asset.asset.durationSec}s · ` : ''}
        {asset.briefSnapshot ?? '(no brief)'}
      </p>
      <div className="flex items-center justify-between">
        {asset.criticIssues.length > 0 ? (
          <button
            type="button"
            onClick={onWhy}
            className="mono-eyebrow text-ink-3 hover:text-ink text-[10px]"
          >
            why?
          </button>
        ) : (
          <span />
        )}
        {asset.asset?.publicUrl && (
          <a
            href={asset.asset.publicUrl}
            download
            className="mono-eyebrow text-ink-3 hover:text-ink text-[10px]"
          >
            ↓
          </a>
        )}
      </div>
    </div>
  );
}

// ─── Why modal (critic breakdown) ──────────────────────────────────

function WhyModal({ asset, onClose }: { asset: GalleryAsset; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-6"
      role="dialog"
      aria-modal
      aria-label="Critic breakdown"
    >
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 cursor-default bg-transparent"
        onClick={onClose}
      />
      <div className="relative w-full max-w-lg space-y-5 bg-paper p-8 border border-ink">
        <header className="space-y-1">
          <p className="mono-eyebrow text-ink-3">Critic · {asset.kind}</p>
          <div className="flex items-center gap-3">
            <h3 style={{ fontFamily: 'var(--font-fraunces), Georgia, serif', fontSize: 24 }}>
              Score {asset.criticScore ?? '—'}
            </h3>
            {asset.statusDetail === 'quality_warning' && (
              <span className="mono-eyebrow text-[10px]" style={{ color: '#B6481A' }}>
                quality warning
              </span>
            )}
          </div>
          <p className="mono-eyebrow text-ink-3 text-[10px]">
            {asset.retriesCount > 0
              ? `retried ${asset.retriesCount}× · critic cost ~$${(asset.criticCostCents / 100).toFixed(2)}`
              : `critic cost ~$${(asset.criticCostCents / 100).toFixed(2)}`}
          </p>
        </header>

        {asset.criticIssues.length > 0 ? (
          <ul className="space-y-2 text-sm">
            {asset.criticIssues.map((issue) => (
              <li key={issue} className="border-l-2 border-ink-3 pl-3">
                {issue}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-3">
            No issues recorded. The critic accepted this asset on the first pass.
          </p>
        )}

        <footer className="flex items-center justify-end gap-3 border-t border-ink-3/30 pt-4">
          <button
            type="button"
            className="mono-eyebrow text-ink-3 hover:text-ink"
            onClick={onClose}
          >
            close
          </button>
        </footer>
      </div>
    </div>
  );
}
