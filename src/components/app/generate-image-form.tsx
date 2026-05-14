'use client';

import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';
import {
  IMAGE_FORMAT_CATEGORIES,
  IMAGE_FORMAT_CATEGORY_LABELS,
  IMAGE_FORMATS,
  type ImageFormat,
  type ImageFormatCategory,
  type ImageProvider,
} from '@/lib/image-formats';
import {
  DEFAULT_IMAGE_MODEL,
  DEFAULT_QUALITY_TIER,
  estimateImageCost,
  IMAGE_MODELS,
  IMAGE_MODELS_BY_PROVIDER,
  type ImageModelId,
  QUALITY_TIERS,
  type QualityTier,
} from '@/lib/image-models';
import {
  DEFAULT_LAYOUT_FOR_FORMAT,
  LAYOUT_IDS,
  LAYOUT_META,
  LAYOUT_SLOTS,
  type LayoutId,
  type LayoutSlot,
} from '@/lib/layout-meta';
import {
  DEFAULT_VISUAL_STYLE,
  VISUAL_STYLE_KEYS,
  VISUAL_STYLE_META,
  type VisualStyleKey,
} from '@/lib/visual-styles-meta';
import {
  enqueueImageGeneration,
  enqueueVariations,
  rerenderOverlay,
} from '@/server/actions/images';

interface GenerateImageFormProps {
  projectId: string;
  providerAvailability: { openai: boolean; fal: boolean };
  r2Configured: boolean;
  /** Brand kit visual style — used as the default in the override picker
   *  so the user sees what their project is currently set to. */
  brandVisualStyle: VisualStyleKey | null;
  /** Brand kit's active languages — first one drives the copy planner default. */
  brandLanguages: Array<'en' | 'es'>;
}

interface AssetSummary {
  id: string;
  width: number | null;
  height: number | null;
  publicUrl: string | null;
  storageKey: string | null;
}

/** What the worker recorded about the typography overlay it composited.
 *  Used by the Edit Copy modal to pre-populate slot inputs so users edit
 *  rather than re-type. */
interface ComposeStateSummary {
  layoutId: string | null;
  copy: Record<string, string | undefined>;
}

type RunState =
  | { kind: 'idle' }
  | { kind: 'queueing' }
  | {
      kind: 'running';
      generationId: string;
      status: 'queued' | 'running';
      assets: AssetSummary[];
    }
  | {
      kind: 'done';
      generationId: string;
      assets: AssetSummary[];
      costCents: number | null;
      composeState: ComposeStateSummary | null;
    }
  | { kind: 'failed'; message: string };

const FORMAT_KEYS_BY_CATEGORY: Record<ImageFormatCategory, ImageFormat[]> = (() => {
  const groups: Record<ImageFormatCategory, ImageFormat[]> = {
    social: [],
    web: [],
    email: [],
  };
  for (const [key, spec] of Object.entries(IMAGE_FORMATS)) {
    groups[spec.category].push(key as ImageFormat);
  }
  return groups;
})();

const QUALITY_STORAGE_KEY = 'reachy.imageGen.quality';
const MODEL_STORAGE_KEY = 'reachy.imageGen.model';

function readLocalStorage<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const v = window.localStorage.getItem(key);
    if (v && (allowed as readonly string[]).includes(v)) return v as T;
  } catch {
    // localStorage can throw in private mode — fall through.
  }
  return fallback;
}

function writeLocalStorage(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // ignore — private mode, quota, etc.
  }
}

function formatCents(cents: number): string {
  if (cents >= 100) return `$${(cents / 100).toFixed(2)}`;
  return `${cents}¢`;
}

export function GenerateImageForm({
  projectId,
  providerAvailability,
  r2Configured,
  brandVisualStyle,
  brandLanguages,
}: GenerateImageFormProps) {
  // Default planner language = first active brand kit language. Falls back
  // to 'es' if the brand kit has no languages set (Reachy is ES-primary).
  // Previously hardcoded to 'en' which produced English copy on every render
  // regardless of brand setting (bug found 2026-05-14).
  const plannerLanguage: 'en' | 'es' = brandLanguages[0] ?? 'es';
  const t = useTranslations('Generate');
  const tCommon = useTranslations('common');

  // Resolve the first model the user can actually use — prefer the
  // persisted choice, then the catalog default, then anything available.
  const persistedModel = readLocalStorage<ImageModelId>(
    MODEL_STORAGE_KEY,
    Object.keys(IMAGE_MODELS) as ImageModelId[],
    DEFAULT_IMAGE_MODEL,
  );
  const persistedQuality = readLocalStorage<QualityTier>(
    QUALITY_STORAGE_KEY,
    QUALITY_TIERS,
    DEFAULT_QUALITY_TIER,
  );

  const initialModelId: ImageModelId | null = (() => {
    if (providerAvailability[IMAGE_MODELS[persistedModel].provider]) return persistedModel;
    if (providerAvailability[IMAGE_MODELS[DEFAULT_IMAGE_MODEL].provider]) {
      return DEFAULT_IMAGE_MODEL;
    }
    const firstAvailable = (Object.keys(IMAGE_MODELS) as ImageModelId[]).find(
      (id) => providerAvailability[IMAGE_MODELS[id].provider],
    );
    return firstAvailable ?? null;
  })();

  const [idea, setIdea] = useState('');
  const [format, setFormat] = useState<ImageFormat>('square');
  const [modelId, setModelId] = useState<ImageModelId | null>(initialModelId);
  const [quality, setQuality] = useState<QualityTier>(persistedQuality);
  // null = use brand kit's visualStyle. Any key = one-off override.
  const [visualStyleOverride, setVisualStyleOverride] = useState<VisualStyleKey | null>(null);
  // null = use per-format default. 'none' = raw AI output (no overlay).
  // Any LayoutId = pick that layout.
  const [layoutOverride, setLayoutOverride] = useState<LayoutId | 'none' | null>(null);
  const [n, setN] = useState<1 | 2 | 4>(1);
  const [run, setRun] = useState<RunState>({ kind: 'idle' });
  const [pending, startTransition] = useTransition();
  // Edit-copy modal state. Open when an asset id is set.
  const [editTarget, setEditTarget] = useState<{
    generationId: string;
    assetId: string;
    publicUrl: string | null;
  } | null>(null);
  // More-like-this modal state. Open when an asset is set.
  const [moreLikeThisTarget, setMoreLikeThisTarget] = useState<{
    assetId: string;
    publicUrl: string | null;
  } | null>(null);
  // Which thumbnail is currently being shown in the large preview.
  // Reset to 0 whenever the run kicks off a new generation.
  const [selectedAssetIdx, setSelectedAssetIdx] = useState(0);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // Persist model + quality on change so the form remembers across sessions.
  useEffect(() => {
    if (modelId) writeLocalStorage(MODEL_STORAGE_KEY, modelId);
  }, [modelId]);
  useEffect(() => {
    writeLocalStorage(QUALITY_STORAGE_KEY, quality);
  }, [quality]);

  const modelEntry = modelId ? IMAGE_MODELS[modelId] : null;
  const qualitySupported = modelEntry?.supportsQualityTier ?? false;
  const effectiveQuality = qualitySupported ? quality : 'medium';

  // Live cost preview — recomputes on every dep change. The same helper
  // runs server-side in the cap check so client and server agree.
  const costCents = useMemo(() => {
    if (!modelId) return 0;
    return estimateImageCost(modelId, effectiveQuality, n);
  }, [modelId, effectiveQuality, n]);

  function startPolling(generationId: string) {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/generations/${generationId}/status`, {
          cache: 'no-store',
        });
        if (!res.ok) {
          if (res.status === 404) {
            stopPolling();
            setRun({ kind: 'failed', message: t('errorPoll') });
          }
          return;
        }
        const json: {
          status: 'queued' | 'running' | 'done' | 'failed';
          errorMessage: string | null;
          costCents: number | null;
          assets: AssetSummary[];
          composeState: ComposeStateSummary | null;
        } = await res.json();

        if (json.status === 'done') {
          stopPolling();
          setRun({
            kind: 'done',
            generationId,
            assets: json.assets,
            costCents: json.costCents,
            composeState: json.composeState,
          });
        } else if (json.status === 'failed') {
          stopPolling();
          setRun({ kind: 'failed', message: json.errorMessage ?? t('failedCaption') });
        } else {
          setRun({
            kind: 'running',
            generationId,
            status: json.status,
            assets: json.assets,
          });
        }
      } catch {
        // ignore transient network blips; the next tick will retry
      }
    }, 2_000);
  }

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!modelEntry || !modelId) {
      toast.error(tCommon('errorGeneric'));
      return;
    }

    setRun({ kind: 'queueing' });
    startTransition(async () => {
      const result = await enqueueImageGeneration({
        projectId,
        idea: idea.trim(),
        format,
        provider: modelEntry.provider as ImageProvider,
        model: modelId,
        n,
        language: plannerLanguage,
        quality: effectiveQuality,
        visualStyleOverride: visualStyleOverride ?? undefined,
        layoutId: layoutOverride ?? undefined,
      });

      if (!result.ok) {
        const msg = t('errorEnqueue');
        setRun({ kind: 'failed', message: msg });
        toast.error(msg);
        return;
      }

      setSelectedAssetIdx(0);
      setRun({
        kind: 'running',
        generationId: result.data.generationId,
        status: 'queued',
        assets: [],
      });
      startPolling(result.data.generationId);
    });
  }

  /** Regenerate with the EXACT same form state — useful when the user
   *  liked the brief but wants another shot at the visuals. */
  function handleRegenerate() {
    if (!modelEntry || !modelId || idea.trim().length < 3) {
      toast.error(tCommon('errorGeneric'));
      return;
    }
    setRun({ kind: 'queueing' });
    startTransition(async () => {
      const result = await enqueueImageGeneration({
        projectId,
        idea: idea.trim(),
        format,
        provider: modelEntry.provider as ImageProvider,
        model: modelId,
        n,
        language: plannerLanguage,
        quality: effectiveQuality,
        visualStyleOverride: visualStyleOverride ?? undefined,
        layoutId: layoutOverride ?? undefined,
      });
      if (!result.ok) {
        const msg = t('errorEnqueue');
        setRun({ kind: 'failed', message: msg });
        toast.error(msg);
        return;
      }
      setSelectedAssetIdx(0);
      setRun({
        kind: 'running',
        generationId: result.data.generationId,
        status: 'queued',
        assets: [],
      });
      startPolling(result.data.generationId);
    });
  }

  /** Kick off a variations job for a specific asset. Server fetches the
   *  raw bg from R2 and uses openai.images.edit. */
  async function handleSubmitVariations(args: { tweakPrompt: string }) {
    if (!moreLikeThisTarget) return;
    const result = await enqueueVariations({
      sourceAssetId: moreLikeThisTarget.assetId,
      tweakPrompt: args.tweakPrompt.trim() || undefined,
    });
    if (!result.ok) {
      toast.error(`Variations failed: ${result.error}`);
      return;
    }
    setMoreLikeThisTarget(null);
    setSelectedAssetIdx(0);
    setRun({
      kind: 'running',
      generationId: result.data.generationId,
      status: 'queued',
      assets: [],
    });
    startPolling(result.data.generationId);
  }

  const formDisabled = pending || run.kind === 'queueing' || run.kind === 'running';
  const noProvider = !modelEntry;

  // Active brand style for the override picker's "default" label.
  const activeBrandStyle = brandVisualStyle ?? DEFAULT_VISUAL_STYLE;

  return (
    <div className="grid grid-cols-1 gap-12 lg:grid-cols-[7fr_5fr]">
      <form onSubmit={onSubmit} className="space-y-10" noValidate>
        <div>
          <label htmlFor="gen-idea" className="mono-eyebrow mb-3 block">
            {t('fieldIdea')}
          </label>
          <textarea
            id="gen-idea"
            rows={4}
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            disabled={formDisabled}
            placeholder={t('fieldIdeaPlaceholder')}
            className="field resize-y placeholder:text-ink-3"
            maxLength={600}
            required
          />
        </div>

        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
          <div>
            <label htmlFor="gen-format" className="mono-eyebrow mb-3 block">
              {t('fieldFormat')}
            </label>
            <select
              id="gen-format"
              value={format}
              onChange={(e) => setFormat(e.target.value as ImageFormat)}
              disabled={formDisabled}
              className="field cursor-pointer"
            >
              {IMAGE_FORMAT_CATEGORIES.map((category) => (
                <optgroup key={category} label={IMAGE_FORMAT_CATEGORY_LABELS[category]}>
                  {FORMAT_KEYS_BY_CATEGORY[category].map((key) => (
                    <option key={key} value={key}>
                      {IMAGE_FORMATS[key].label} — {IMAGE_FORMATS[key].w}×{IMAGE_FORMATS[key].h}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="gen-engine" className="mono-eyebrow mb-3 block">
              {t('fieldEngine')}
            </label>
            <select
              id="gen-engine"
              value={modelId ?? ''}
              onChange={(e) => setModelId(e.target.value as ImageModelId)}
              disabled={formDisabled || noProvider}
              className="field cursor-pointer"
            >
              {IMAGE_MODELS_BY_PROVIDER.map((g) => (
                <optgroup
                  key={g.provider}
                  label={g.label}
                  disabled={!providerAvailability[g.provider]}
                >
                  {g.models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            {modelEntry && (
              <p className="mt-2 text-xs text-ink-3 leading-tight">
                {modelEntry.tagline}
                {modelEntry.note && (
                  <>
                    {' '}
                    <span className="text-ink-3/70">· {modelEntry.note}</span>
                  </>
                )}
              </p>
            )}
            {modelEntry && (
              <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-mono uppercase tracking-wider text-ink-3">
                {modelEntry.rendersTextWell && (
                  <span className="border border-ink-3/30 px-1.5 py-0.5">Text</span>
                )}
                {modelEntry.supportsEdit && (
                  <span className="border border-ink-3/30 px-1.5 py-0.5">Edit</span>
                )}
                {modelEntry.supportsReferenceImages && (
                  <span className="border border-ink-3/30 px-1.5 py-0.5">Refs</span>
                )}
              </div>
            )}
          </div>
        </div>

        <fieldset className="space-y-3" disabled={!qualitySupported}>
          <legend className="mono-eyebrow mb-3 block">
            Quality
            {!qualitySupported && (
              <span className="ml-2 text-ink-3 normal-case">— not configurable for this model</span>
            )}
          </legend>
          <div className="flex gap-3 flex-wrap">
            {QUALITY_TIERS.map((tier) => {
              const active = tier === effectiveQuality;
              const tierCost = modelEntry ? estimateImageCost(modelEntry.id, tier, n) : 0;
              return (
                <label
                  key={tier}
                  className={`cursor-pointer border px-3 py-2 text-sm transition ${
                    active ? 'border-ink bg-ink text-paper' : 'border-ink-3/30 hover:border-ink'
                  }`}
                  aria-disabled={!qualitySupported}
                >
                  <input
                    type="radio"
                    name="quality"
                    value={tier}
                    checked={tier === quality}
                    onChange={() => setQuality(tier)}
                    disabled={formDisabled || !qualitySupported}
                    className="sr-only"
                  />
                  <span
                    className="capitalize"
                    style={{ fontFamily: 'var(--font-fraunces), Georgia, serif' }}
                  >
                    {tier}
                  </span>
                  <span
                    className={`ml-2 font-mono text-xs ${active ? 'text-paper/70' : 'text-ink-3'}`}
                  >
                    {formatCents(tierCost)}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div>
          <label htmlFor="gen-style" className="mono-eyebrow mb-3 block">
            Visual style
            <span className="ml-2 text-ink-3 normal-case">
              — default: <strong>{VISUAL_STYLE_META[activeBrandStyle].label}</strong>
            </span>
          </label>
          <select
            id="gen-style"
            value={visualStyleOverride ?? ''}
            onChange={(e) =>
              setVisualStyleOverride(
                e.target.value === '' ? null : (e.target.value as VisualStyleKey),
              )
            }
            disabled={formDisabled}
            className="field cursor-pointer"
          >
            <option value="">
              Use brand default ({VISUAL_STYLE_META[activeBrandStyle].label})
            </option>
            {VISUAL_STYLE_KEYS.map((key) => (
              <option key={key} value={key}>
                {VISUAL_STYLE_META[key].label} — {VISUAL_STYLE_META[key].tagline}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="gen-layout" className="mono-eyebrow mb-3 block">
            Layout
            <span className="ml-2 text-ink-3 normal-case">
              — default for {IMAGE_FORMATS[format].label}:{' '}
              <strong>{LAYOUT_META[DEFAULT_LAYOUT_FOR_FORMAT[format]].label}</strong>
            </span>
          </label>
          <select
            id="gen-layout"
            value={layoutOverride ?? ''}
            onChange={(e) => {
              const v = e.target.value;
              if (v === '') setLayoutOverride(null);
              else if (v === 'none') setLayoutOverride('none');
              else setLayoutOverride(v as LayoutId);
            }}
            disabled={formDisabled}
            className="field cursor-pointer"
          >
            <option value="">
              Format default ({LAYOUT_META[DEFAULT_LAYOUT_FOR_FORMAT[format]].label})
            </option>
            {LAYOUT_IDS.map((id) => (
              <option key={id} value={id}>
                {LAYOUT_META[id].label} — {LAYOUT_META[id].tagline}
              </option>
            ))}
            <option value="none">No overlay (raw AI background)</option>
          </select>
        </div>

        <fieldset className="space-y-3">
          <legend className="mono-eyebrow mb-3 block">{t('fieldVariants')}</legend>
          <div className="flex gap-6">
            {[1, 2, 4].map((value) => (
              <label key={value} className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="n"
                  value={value}
                  checked={n === value}
                  onChange={() => setN(value as 1 | 2 | 4)}
                  disabled={formDisabled}
                  className="accent-ink"
                />
                <span style={{ fontFamily: 'var(--font-fraunces), Georgia, serif', fontSize: 16 }}>
                  {value}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="space-y-2">
          {!r2Configured && (
            <p className="mono-eyebrow text-accent">
              R2 storage is not configured — uploads will fail.
            </p>
          )}
          {noProvider && (
            <p className="mono-eyebrow text-accent">
              No image provider configured. Set OPENAI_API_KEY or FAL_KEY.
            </p>
          )}
        </div>

        <div className="flex items-center gap-6 flex-wrap">
          <button
            type="submit"
            disabled={formDisabled || noProvider || idea.trim().length < 3}
            className="btn-ink disabled:opacity-50"
          >
            {formDisabled ? t('submitting') : t('submit')}
          </button>
          {modelEntry && (
            <span className="mono-eyebrow text-ink-3">
              Est. cost · <strong className="text-ink">{formatCents(costCents)}</strong>
              {n > 1 && <span className="text-ink-3/70"> ({n} variants)</span>}
            </span>
          )}
        </div>
      </form>

      <aside className="space-y-4">
        <ResultPanel
          run={run}
          t={t}
          format={format}
          layoutId={layoutOverride ?? DEFAULT_LAYOUT_FOR_FORMAT[format]}
          selectedAssetIdx={selectedAssetIdx}
          onSelectAsset={setSelectedAssetIdx}
          onEditCopy={(asset) =>
            setEditTarget({
              generationId: 'generationId' in run ? run.generationId : '',
              assetId: asset.id,
              publicUrl: asset.publicUrl,
            })
          }
          onMoreLikeThis={(asset) =>
            setMoreLikeThisTarget({ assetId: asset.id, publicUrl: asset.publicUrl })
          }
          onRegenerate={handleRegenerate}
          regenerateDisabled={formDisabled || noProvider || idea.trim().length < 3}
        />
      </aside>
      {editTarget?.generationId && (
        <EditCopyModal
          target={editTarget}
          layoutId={
            (run.kind === 'done' && (run.composeState?.layoutId as LayoutId | null)) ||
            layoutOverride ||
            DEFAULT_LAYOUT_FOR_FORMAT[format]
          }
          initialCopy={(run.kind === 'done' && run.composeState?.copy) || {}}
          onClose={() => setEditTarget(null)}
          onRendered={(publicUrl, newAssetId) => {
            setRun((current) => {
              if (current.kind !== 'done') return current;
              return {
                ...current,
                assets: [
                  {
                    id: newAssetId,
                    publicUrl,
                    width: current.assets[0]?.width ?? null,
                    height: current.assets[0]?.height ?? null,
                    storageKey: null,
                  },
                  ...current.assets,
                ],
              };
            });
            setSelectedAssetIdx(0);
            setEditTarget(null);
            toast.success('Overlay re-rendered (no cost — typography only)');
          }}
        />
      )}
      {moreLikeThisTarget && (
        <MoreLikeThisModal
          target={moreLikeThisTarget}
          initialIdea={idea}
          onClose={() => setMoreLikeThisTarget(null)}
          onSubmit={handleSubmitVariations}
        />
      )}
    </div>
  );
}

/**
 * IG-style result panel: 1 big preview centered (max-w-600, format aspect)
 * + horizontal thumb strip below + toolbar of asset actions. Clicking a
 * thumb swaps the preview; selected thumb gets a 1px ink border + soft
 * shadow. Dimensions move to a tooltip on the preview.
 */
function ResultPanel({
  run,
  t,
  format,
  layoutId,
  selectedAssetIdx,
  onSelectAsset,
  onEditCopy,
  onMoreLikeThis,
  onRegenerate,
  regenerateDisabled,
}: {
  run: RunState;
  t: ReturnType<typeof useTranslations<'Generate'>>;
  format: ImageFormat;
  layoutId: LayoutId | 'none';
  selectedAssetIdx: number;
  onSelectAsset: (idx: number) => void;
  onEditCopy: (asset: AssetSummary) => void;
  onMoreLikeThis: (asset: AssetSummary) => void;
  onRegenerate: () => void;
  regenerateDisabled: boolean;
}) {
  if (run.kind === 'idle') return null;

  // Aspect ratio drives the preview frame so a 9:16 reel cover doesn't
  // squish into a square. Always uses the FORMAT's intrinsic aspect, not
  // the asset's reported width/height (those are sometimes null until
  // the worker finishes ffprobing).
  const fm = IMAGE_FORMATS[format];
  const aspect = `${fm.w} / ${fm.h}`;

  if (run.kind === 'queueing' || (run.kind === 'running' && run.assets.length === 0)) {
    const caption =
      run.kind === 'queueing' || (run.kind === 'running' && run.status === 'queued')
        ? t('queuedCaption')
        : t('runningCaption');
    return (
      <div className="border border-ink p-8 text-center">
        <span className="mx-auto mb-4 block h-2 w-2 animate-pulse bg-accent" aria-hidden />
        <span className="mono-eyebrow text-ink-3">{caption}</span>
      </div>
    );
  }

  if (run.kind === 'failed') {
    return (
      <div role="alert" className="border border-accent p-6 text-sm text-accent">
        {t('failedCaption')} — {run.message}
      </div>
    );
  }

  const assets = run.assets;
  if (assets.length === 0) return null;
  const safeIdx = Math.min(Math.max(0, selectedAssetIdx), assets.length - 1);
  const selected = assets[safeIdx] ?? assets[0];
  if (!selected) return null;
  const canEdit = layoutId !== 'none' && run.kind === 'done';
  const dimsLabel = `${selected.width ?? fm.w} × ${selected.height ?? fm.h}`;
  const isDownloadable = Boolean(selected.publicUrl);

  // box-shadow values — kept inline so we don't add a new tailwind layer
  // for this one-off "selected thumb" treatment. Soft print-feel shadow:
  // a tight inner offset plus a softer outer glow in the ink tone.
  const selectedShadow = '0 1px 0 0 rgba(20,17,13,0.05), 0 8px 24px -8px rgba(20,17,13,0.25)';

  return (
    <div className="space-y-5">
      {/* Big preview */}
      <figure
        className="relative mx-auto w-full max-w-[600px] overflow-hidden border border-ink bg-paper-2"
        style={{ aspectRatio: aspect }}
        title={dimsLabel}
      >
        {selected.publicUrl ? (
          <Image
            src={selected.publicUrl}
            alt=""
            fill
            sizes="(min-width: 1024px) 600px, 90vw"
            className="object-cover"
            unoptimized
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center mono-eyebrow text-ink-3">
            no public url
          </div>
        )}
        <figcaption className="sr-only">{dimsLabel}</figcaption>
      </figure>

      {/* Toolbar */}
      <div className="mx-auto flex max-w-[600px] flex-wrap items-center justify-center gap-2">
        {canEdit && (
          <button
            type="button"
            onClick={() => onMoreLikeThis(selected)}
            className="mono-eyebrow border border-ink px-3 py-2 hover:bg-ink hover:text-paper"
            title="Generate 4 variations of this image (same model, same cost as fresh)"
          >
            + More like this
          </button>
        )}
        {canEdit && (
          <button
            type="button"
            onClick={() => onEditCopy(selected)}
            className="mono-eyebrow border border-ink px-3 py-2 hover:bg-ink hover:text-paper"
            title="Re-render typography on this background ($0)"
          >
            Edit copy
          </button>
        )}
        <button
          type="button"
          onClick={onRegenerate}
          disabled={regenerateDisabled}
          className="mono-eyebrow border border-ink px-3 py-2 hover:bg-ink hover:text-paper disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-paper disabled:hover:text-ink"
          title="Run the same brief again with a fresh AI background"
        >
          ↻ Regenerate
        </button>
        {isDownloadable && selected.publicUrl && (
          <a
            href={selected.publicUrl}
            download={`reachy-${selected.id}.png`}
            className="mono-eyebrow border border-ink px-3 py-2 hover:bg-ink hover:text-paper"
            title="Download this image as PNG"
          >
            ↓ Download
          </a>
        )}
      </div>

      {/* Thumb strip — only show when there's more than one variant. */}
      {assets.length > 1 && (
        <div className="mx-auto flex max-w-[600px] flex-wrap justify-center gap-3">
          {assets.map((a, i) => {
            const isActive = i === safeIdx;
            return (
              <button
                type="button"
                key={a.id}
                onClick={() => onSelectAsset(i)}
                className="block overflow-hidden bg-paper-2"
                style={{
                  width: 80,
                  aspectRatio: aspect,
                  border: `1px solid ${isActive ? 'var(--ink, #14110D)' : 'transparent'}`,
                  boxShadow: isActive ? selectedShadow : 'none',
                  transition: 'box-shadow 120ms ease, border-color 120ms ease',
                }}
                aria-label={`Show variant ${i + 1}`}
                aria-pressed={isActive}
              >
                {a.publicUrl ? (
                  // Plain img is fine here — small, no need for next/image.
                  // biome-ignore lint/performance/noImgElement: 80px thumb
                  <img src={a.publicUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="block h-full w-full" />
                )}
              </button>
            );
          })}
        </div>
      )}

      {run.kind === 'done' && (
        <p className="mono-eyebrow text-center text-ink-3">
          {t('doneCaption')}
          {typeof run.costCents === 'number' && ` · ${t('costNote', { cents: run.costCents })}`}
        </p>
      )}
    </div>
  );
}

interface EditCopyModalProps {
  target: { generationId: string; assetId: string; publicUrl: string | null };
  layoutId: LayoutId | 'none';
  /** Previous copy for this asset — pre-populates the inputs so users
   *  edit a slot instead of having to retype every field. */
  initialCopy: Record<string, string | undefined>;
  onClose: () => void;
  onRendered: (publicUrl: string, assetId: string) => void;
}

function EditCopyModal({ target, layoutId, initialCopy, onClose, onRendered }: EditCopyModalProps) {
  // Layout 'none' shouldn't open the modal in the first place (the Edit
  // Copy button is hidden), but defensively bail.
  const slots: readonly LayoutSlot[] = layoutId === 'none' ? [] : LAYOUT_SLOTS[layoutId];
  const [values, setValues] = useState<Record<LayoutSlot, string>>({
    eyebrow: initialCopy.eyebrow ?? '',
    headline: initialCopy.headline ?? '',
    subheadline: initialCopy.subheadline ?? '',
    cta: initialCopy.cta ?? '',
    wordmark: initialCopy.wordmark ?? '',
  });
  const [submitting, setSubmitting] = useState(false);

  async function handleRender() {
    setSubmitting(true);
    try {
      const result = await rerenderOverlay({
        generationId: target.generationId,
        assetId: target.assetId,
        copy: {
          eyebrow: values.eyebrow || undefined,
          headline: values.headline || undefined,
          subheadline: values.subheadline || undefined,
          cta: values.cta || undefined,
          wordmark: values.wordmark || undefined,
        },
      });
      if (!result.ok) {
        toast.error(`Re-render failed: ${result.error}`);
        return;
      }
      if (!result.data.publicUrl) {
        toast.error('Re-rendered but R2 returned no public URL');
        return;
      }
      onRendered(result.data.publicUrl, result.data.assetId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-6"
      role="dialog"
      aria-modal
      aria-label="Edit overlay copy"
    >
      {/* Backdrop button — covers the whole viewport and closes the modal
          on click or Enter/Space. Using a real <button> instead of a
          click-only <div> satisfies the a11y rules and gives keyboard
          users a focusable exit. */}
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 cursor-default bg-transparent"
        onClick={onClose}
      />
      <div className="relative w-full max-w-xl space-y-6 bg-paper p-8 border border-ink">
        <div>
          <h3 style={{ fontFamily: 'var(--font-fraunces), Georgia, serif', fontSize: 28 }}>
            Edit overlay copy
          </h3>
          <p className="mono-eyebrow mt-2 text-ink-3">
            Re-renders typography on the existing background · $0.00 · {'<'} 1s
          </p>
        </div>

        <div className="space-y-4">
          {slots.map((slot) => (
            <div key={slot}>
              <label htmlFor={`copy-${slot}`} className="mono-eyebrow mb-2 block capitalize">
                {slot}
              </label>
              <input
                id={`copy-${slot}`}
                type="text"
                value={values[slot]}
                onChange={(e) => setValues((v) => ({ ...v, [slot]: e.target.value }))}
                className="field"
                placeholder={`Enter the ${slot}…`}
              />
            </div>
          ))}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-ink-3/30 pt-6">
          <button
            type="button"
            className="mono-eyebrow text-ink-3 hover:text-ink"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn-ink disabled:opacity-50"
            onClick={handleRender}
            disabled={submitting}
          >
            {submitting ? 'Re-rendering…' : 'Re-render overlay'}
          </button>
        </div>
      </div>
    </div>
  );
}

interface MoreLikeThisModalProps {
  target: { assetId: string; publicUrl: string | null };
  initialIdea: string;
  onClose: () => void;
  onSubmit: (args: { tweakPrompt: string }) => Promise<void>;
}

function MoreLikeThisModal({ target, initialIdea, onClose, onSubmit }: MoreLikeThisModalProps) {
  const [tweakPrompt, setTweakPrompt] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    try {
      await onSubmit({ tweakPrompt });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-6"
      role="dialog"
      aria-modal
      aria-label="Generate variations"
    >
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 cursor-default bg-transparent"
        onClick={onClose}
      />
      <div className="relative w-full max-w-lg space-y-6 bg-paper p-8 border border-ink">
        <div>
          <h3 style={{ fontFamily: 'var(--font-fraunces), Georgia, serif', fontSize: 28 }}>
            More like this
          </h3>
          <p className="mono-eyebrow mt-2 text-ink-3">
            4 variations · same idea + same brand · only the visuals change
          </p>
        </div>

        {target.publicUrl && (
          <div className="flex justify-center">
            {/* biome-ignore lint/performance/noImgElement: small preview */}
            <img src={target.publicUrl} alt="" className="max-h-40 border border-ink" />
          </div>
        )}

        <div>
          <label htmlFor="vary-idea" className="mono-eyebrow mb-2 block">
            Idea (locked)
          </label>
          <textarea
            id="vary-idea"
            rows={2}
            value={initialIdea}
            disabled
            className="field resize-none cursor-not-allowed opacity-75"
          />
        </div>

        <div>
          <label htmlFor="vary-tweak" className="mono-eyebrow mb-2 block">
            Tweak (optional)
          </label>
          <textarea
            id="vary-tweak"
            rows={2}
            value={tweakPrompt}
            onChange={(e) => setTweakPrompt(e.target.value)}
            placeholder="warmer, more centered, more negative space"
            maxLength={400}
            className="field resize-y placeholder:text-ink-3"
          />
          <p className="mono-eyebrow mt-2 text-ink-3">
            Cost · ~$0.76 (4 × current model + quality)
          </p>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-ink-3/30 pt-6">
          <button
            type="button"
            className="mono-eyebrow text-ink-3 hover:text-ink"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn-ink disabled:opacity-50"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? 'Queuing…' : 'Generate 4 variations'}
          </button>
        </div>
      </div>
    </div>
  );
}
