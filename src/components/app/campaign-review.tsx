'use client';

import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import {
  ASSET_COST_ESTIMATES_CLIENT,
  CHANNEL_KEYS_CLIENT,
  CHANNEL_META_CLIENT,
  type ChannelKeyClient,
  estimateAssetCentsClient,
  estimateSlateCentsClient,
  type PlannedAssetClient,
  REEL_DURATIONS_CLIENT,
} from '@/lib/campaign-meta-client';
import { IMAGE_FORMAT_KEYS, IMAGE_FORMATS, type ImageFormat } from '@/lib/image-formats';
import { LAYOUT_IDS, LAYOUT_META, type LayoutId } from '@/lib/layout-meta';
import {
  VISUAL_STYLE_KEYS,
  VISUAL_STYLE_META,
  type VisualStyleKey,
} from '@/lib/visual-styles-meta';
import { approveCampaign, updateCampaignPlan } from '@/server/actions/campaigns';
import type { CampaignPlan, PlannedAsset } from '@/server/ingest/planCampaign';
import type { StoredBrief } from '@/server/ingest/runBriefExtraction';

interface BrandKitInfo {
  ink: string;
  paper: string;
  accent: string;
  languages: ('en' | 'es')[];
  visualStyle: string;
  allowsHumans: boolean;
  qualityGateEnabled: boolean;
  referenceAssetKeys: string[];
}

interface ProjectInfo {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  tone: string | null;
}

interface CampaignInfo {
  id: string;
  status: string;
  plan: CampaignPlan | null;
  costCentsEstimated: number;
}

export function CampaignReview(props: {
  ingestionId: string;
  campaign: CampaignInfo;
  project: ProjectInfo;
  brandKit: BrandKitInfo | null;
  briefSnapshot: StoredBrief | null;
}) {
  const initialAssets = (props.campaign.plan?.assets ?? []) as PlannedAssetClient[];
  const [assets, setAssets] = useState<PlannedAssetClient[]>(initialAssets);
  const [skipped, setSkipped] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState<{ index: number; asset: PlannedAssetClient } | null>(null);
  const [adding, setAdding] = useState<PlannedAssetClient | null>(null);
  const [saving, startSaving] = useTransition();
  const [approving, startApproving] = useTransition();

  const activeAssets = useMemo(() => assets.filter((_, i) => !skipped.has(i)), [assets, skipped]);
  const totalCents = useMemo(() => estimateSlateCentsClient(activeAssets), [activeAssets]);

  const finalized = props.campaign.status !== 'awaiting_approval';

  const updateAsset = (index: number, next: PlannedAssetClient) => {
    setAssets((prev) => prev.map((a, i) => (i === index ? next : a)));
  };
  const toggleSkip = (index: number) => {
    setSkipped((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const save = (then?: () => void) => {
    startSaving(async () => {
      const trimmedPlan: CampaignPlan = {
        assets: activeAssets as PlannedAsset[],
        rationale: props.campaign.plan?.rationale ?? '',
        estimatedCostCents: totalCents,
        estimatedDurationMinutes: Math.max(1, Math.round(activeAssets.length * 0.5)),
      };
      const res = await updateCampaignPlan({ campaignId: props.campaign.id, plan: trimmedPlan });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Saved · ~$${(res.data.costCents / 100).toFixed(2)}`);
      then?.();
    });
  };

  const approve = () => {
    if (activeAssets.length === 0) {
      toast.error('No assets to approve');
      return;
    }
    save(() =>
      startApproving(async () => {
        const res = await approveCampaign({ campaignId: props.campaign.id });
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        toast.success('Approved — bulk generation queued');
        window.location.href = `/app/projects/${props.project.slug}/library`;
      }),
    );
  };

  return (
    <div className="space-y-12">
      {/* Project + brief snapshot */}
      <header className="space-y-3">
        <p className="mono-eyebrow text-ink-3">Autopilot · Step 3 · Review</p>
        <h1
          style={{
            fontFamily: 'var(--font-fraunces), Georgia, serif',
            fontSize: 'clamp(40px, 5.5vw, 80px)',
            letterSpacing: '-0.03em',
            lineHeight: 1,
          }}
        >
          {props.project.name}
        </h1>
        {props.project.description && (
          <p className="text-ink-2 max-w-3xl">{props.project.description}</p>
        )}
        {props.briefSnapshot && (
          <p className="mono-eyebrow text-ink-3">
            tone: {props.briefSnapshot.brief.tone} · languages:{' '}
            {props.briefSnapshot.brief.languages.join(', ')} · confidence:{' '}
            {(props.briefSnapshot.brief.confidence * 100).toFixed(0)}%
          </p>
        )}
      </header>

      {/* Brand kit summary */}
      {props.brandKit && (
        <section className="space-y-3 border-t border-ink-3/30 pt-6">
          <h2 className="mono-eyebrow">Brand kit</h2>
          <div className="flex flex-wrap items-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <Swatch hex={props.brandKit.ink} label="ink" />
              <Swatch hex={props.brandKit.paper} label="paper" />
              <Swatch hex={props.brandKit.accent} label="accent" />
            </div>
            <div className="mono-eyebrow text-ink-3">style: {props.brandKit.visualStyle}</div>
            <div className="mono-eyebrow text-ink-3">
              langs: {props.brandKit.languages.join(', ')}
            </div>
            <div className="mono-eyebrow text-ink-3">
              {props.brandKit.allowsHumans ? '✓ humans' : '✗ no humans'} ·{' '}
              {props.brandKit.qualityGateEnabled ? '✓ quality gate' : 'no gate'} ·{' '}
              {props.brandKit.referenceAssetKeys.length} ref
              {props.brandKit.referenceAssetKeys.length === 1 ? '' : 's'}
            </div>
            <a
              href={`/app/projects/${props.project.slug}/identity`}
              className="mono-eyebrow border border-ink px-3 py-1 hover:bg-ink hover:text-paper"
            >
              edit kit
            </a>
          </div>
        </section>
      )}

      {/* Plan */}
      <section className="space-y-4 border-t border-ink-3/30 pt-6">
        <div className="flex items-center justify-between">
          <h2 className="mono-eyebrow">
            Campaign plan · {activeAssets.length} of {assets.length} active
          </h2>
          <span className="mono-eyebrow text-ink-3">
            ~${(totalCents / 100).toFixed(2)} · {Math.max(1, Math.round(activeAssets.length * 0.5))}{' '}
            min
          </span>
        </div>
        {props.campaign.plan?.rationale && (
          <p className="text-sm text-ink-2 italic">{props.campaign.plan.rationale}</p>
        )}

        {assets.length === 0 ? (
          <p className="mono-eyebrow text-ink-3">No assets yet. Add one to get started.</p>
        ) : (
          <ul className="space-y-2">
            {assets.map((asset, i) => (
              <li
                // biome-ignore lint/suspicious/noArrayIndexKey: assets are reorder-stable within this view
                key={i}
                className="border p-3 flex items-start justify-between gap-3"
                style={{
                  borderColor: skipped.has(i) ? 'rgba(20,17,13,0.15)' : 'var(--color-ink, #14110D)',
                  opacity: skipped.has(i) ? 0.45 : 1,
                }}
              >
                <div className="flex-1 min-w-0">
                  <p className="mono-eyebrow text-ink-3">
                    {describeAsset(asset)} · ~${(estimateAssetCentsClient(asset) / 100).toFixed(2)}
                  </p>
                  <p className="mt-1 text-sm">{asset.brief}</p>
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <button
                    type="button"
                    className="mono-eyebrow text-ink-3 hover:text-ink"
                    onClick={() => setEditing({ index: i, asset })}
                    disabled={finalized}
                  >
                    edit
                  </button>
                  <button
                    type="button"
                    className="mono-eyebrow text-ink-3 hover:text-ink"
                    onClick={() => toggleSkip(i)}
                    disabled={finalized}
                  >
                    {skipped.has(i) ? 'unskip' : 'skip'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div>
          <button
            type="button"
            className="mono-eyebrow border border-ink px-4 py-2 hover:bg-ink hover:text-paper disabled:opacity-50"
            onClick={() => setAdding(makeBlankAsset())}
            disabled={finalized}
          >
            + Add asset
          </button>
        </div>
      </section>

      {/* Actions */}
      <footer className="flex flex-wrap items-center justify-end gap-3 border-t border-ink-3/30 pt-6">
        <span className="mono-eyebrow text-ink-3 mr-auto">
          status: {props.campaign.status}
          {props.campaign.status === 'awaiting_approval' ? '' : ' (read-only)'}
        </span>
        <button
          type="button"
          className="mono-eyebrow border border-ink px-4 py-2 hover:bg-ink hover:text-paper disabled:opacity-50"
          onClick={() => save()}
          disabled={finalized || saving}
        >
          {saving ? 'Saving…' : 'Save for later'}
        </button>
        <button
          type="button"
          className="btn-ink disabled:opacity-50"
          onClick={approve}
          disabled={finalized || saving || approving || activeAssets.length === 0}
        >
          {approving ? 'Approving…' : `Approve & generate · ~$${(totalCents / 100).toFixed(2)}`}
        </button>
      </footer>

      {/* Edit modal */}
      {editing && (
        <AssetModal
          mode="edit"
          asset={editing.asset}
          onCancel={() => setEditing(null)}
          onConfirm={(next) => {
            updateAsset(editing.index, next);
            setEditing(null);
          }}
        />
      )}

      {/* Add modal */}
      {adding && (
        <AssetModal
          mode="add"
          asset={adding}
          onCancel={() => setAdding(null)}
          onConfirm={(next) => {
            setAssets((prev) => [...prev, next]);
            setAdding(null);
          }}
        />
      )}
    </div>
  );
}

function describeAsset(a: PlannedAssetClient): string {
  if (a.kind === 'image') {
    const fm = IMAGE_FORMATS[a.format as ImageFormat];
    const layout = LAYOUT_META[a.layoutId as LayoutId];
    return `Image · ${fm ? `${fm.w}×${fm.h}` : a.format} · ${layout?.label ?? a.layoutId} · ${a.visualStyle}`;
  }
  if (a.kind === 'copy') {
    const meta = CHANNEL_META_CLIENT[a.channel as ChannelKeyClient];
    const target = a.targetWordCount ?? meta?.targetWordCount;
    return `Copy · ${meta?.label ?? a.channel} · ~${target ?? '?'} words`;
  }
  return `Reel · ${a.durationSec}s · ${a.visualStyle}`;
}

function makeBlankAsset(): PlannedAssetClient {
  return {
    kind: 'image',
    format: IMAGE_FORMAT_KEYS[0] ?? 'post-ig',
    layoutId: LAYOUT_IDS[0] ?? 'hero-centered',
    visualStyle: VISUAL_STYLE_KEYS[0] ?? 'editorial-collage',
    brief: '',
  };
}

function Swatch({ hex, label }: { hex: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span
        className="inline-block h-4 w-4 border border-ink"
        style={{ background: hex }}
        title={`${label} ${hex}`}
      />
      <span className="mono-eyebrow text-ink-3 text-[10px]">{label}</span>
    </span>
  );
}

// ─── Edit / Add modal ───────────────────────────────────────────────

function AssetModal(props: {
  mode: 'edit' | 'add';
  asset: PlannedAssetClient;
  onCancel: () => void;
  onConfirm: (next: PlannedAssetClient) => void;
}) {
  const [draft, setDraft] = useState<PlannedAssetClient>(props.asset);

  const setKind = (kind: 'image' | 'copy' | 'reel') => {
    if (kind === 'image') {
      setDraft({
        kind: 'image',
        format: IMAGE_FORMAT_KEYS[0] ?? 'post-ig',
        layoutId: LAYOUT_IDS[0] ?? 'hero-centered',
        visualStyle: VISUAL_STYLE_KEYS[0] ?? 'editorial-collage',
        brief: draft.brief ?? '',
      });
    } else if (kind === 'copy') {
      setDraft({
        kind: 'copy',
        channel: CHANNEL_KEYS_CLIENT[0] ?? 'linkedin-post-short',
        brief: draft.brief ?? '',
      });
    } else {
      setDraft({
        kind: 'reel',
        durationSec: REEL_DURATIONS_CLIENT[0] ?? 12,
        visualStyle: VISUAL_STYLE_KEYS[0] ?? 'editorial-collage',
        brief: draft.brief ?? '',
      });
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-6"
      role="dialog"
      aria-modal
      aria-label={props.mode === 'edit' ? 'Edit asset' : 'Add asset'}
    >
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 cursor-default bg-transparent"
        onClick={props.onCancel}
      />
      <div className="relative w-full max-w-xl space-y-5 bg-paper p-8 border border-ink">
        <h3 style={{ fontFamily: 'var(--font-fraunces), Georgia, serif', fontSize: 24 }}>
          {props.mode === 'edit' ? 'Edit asset' : 'Add asset'}
        </h3>

        <label className="block space-y-1">
          <span className="mono-eyebrow text-ink-3">Kind</span>
          <select
            value={draft.kind}
            onChange={(e) => setKind(e.currentTarget.value as 'image' | 'copy' | 'reel')}
            className="field w-full"
          >
            <option value="image">Image</option>
            <option value="copy">Copy</option>
            <option value="reel">Reel</option>
          </select>
        </label>

        {draft.kind === 'image' && (
          <div className="grid grid-cols-3 gap-3">
            <label className="block space-y-1">
              <span className="mono-eyebrow text-ink-3">Format</span>
              <select
                value={draft.format}
                onChange={(e) => setDraft({ ...draft, format: e.currentTarget.value })}
                className="field w-full"
              >
                {IMAGE_FORMAT_KEYS.map((key) => (
                  <option key={key} value={key}>
                    {key} · {IMAGE_FORMATS[key].w}×{IMAGE_FORMATS[key].h}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="mono-eyebrow text-ink-3">Layout</span>
              <select
                value={draft.layoutId}
                onChange={(e) => setDraft({ ...draft, layoutId: e.currentTarget.value })}
                className="field w-full"
              >
                {LAYOUT_IDS.map((id) => (
                  <option key={id} value={id}>
                    {LAYOUT_META[id].label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="mono-eyebrow text-ink-3">Style</span>
              <select
                value={draft.visualStyle}
                onChange={(e) =>
                  setDraft({ ...draft, visualStyle: e.currentTarget.value as VisualStyleKey })
                }
                className="field w-full"
              >
                {VISUAL_STYLE_KEYS.map((key) => (
                  <option key={key} value={key}>
                    {VISUAL_STYLE_META[key].label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        {draft.kind === 'copy' && (
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="mono-eyebrow text-ink-3">Channel</span>
              <select
                value={draft.channel}
                onChange={(e) =>
                  setDraft({ ...draft, channel: e.currentTarget.value as ChannelKeyClient })
                }
                className="field w-full"
              >
                {CHANNEL_KEYS_CLIENT.map((key) => (
                  <option key={key} value={key}>
                    {CHANNEL_META_CLIENT[key].label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="mono-eyebrow text-ink-3">Target words</span>
              <input
                type="number"
                min={20}
                max={600}
                value={
                  draft.targetWordCount ??
                  CHANNEL_META_CLIENT[draft.channel as ChannelKeyClient]?.targetWordCount ??
                  100
                }
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    targetWordCount: Number(e.currentTarget.value) || undefined,
                  })
                }
                className="field w-full"
              />
            </label>
          </div>
        )}

        {draft.kind === 'reel' && (
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="mono-eyebrow text-ink-3">Duration</span>
              <select
                value={String(draft.durationSec)}
                onChange={(e) => setDraft({ ...draft, durationSec: Number(e.currentTarget.value) })}
                className="field w-full"
              >
                {REEL_DURATIONS_CLIENT.map((s) => (
                  <option key={s} value={s}>
                    {s}s
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="mono-eyebrow text-ink-3">Style</span>
              <select
                value={draft.visualStyle}
                onChange={(e) =>
                  setDraft({ ...draft, visualStyle: e.currentTarget.value as VisualStyleKey })
                }
                className="field w-full"
              >
                {VISUAL_STYLE_KEYS.map((key) => (
                  <option key={key} value={key}>
                    {VISUAL_STYLE_META[key].label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        <label className="block space-y-1">
          <span className="mono-eyebrow text-ink-3">Brief</span>
          <textarea
            rows={4}
            value={draft.brief}
            onChange={(e) => setDraft({ ...draft, brief: e.currentTarget.value })}
            className="field w-full resize-y"
            placeholder="What this asset should say or show."
          />
        </label>

        <div className="flex items-center justify-between border-t border-ink-3/30 pt-4">
          <span className="mono-eyebrow text-ink-3">
            ~${(estimateAssetCentsClient(draft) / 100).toFixed(2)} ·{' '}
            {ASSET_COST_ESTIMATES_CLIENT.imageCents ? 'estimate updates with kind/duration' : ''}
          </span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="mono-eyebrow text-ink-3 hover:text-ink"
              onClick={props.onCancel}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn-ink"
              onClick={() => {
                if (!draft.brief.trim()) {
                  toast.error('Brief is required');
                  return;
                }
                props.onConfirm(draft);
              }}
            >
              {props.mode === 'edit' ? 'Save' : 'Add'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
