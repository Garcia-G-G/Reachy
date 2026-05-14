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
import { enqueueImageGeneration, rerenderOverlay } from '@/server/actions/images';

interface GenerateImageFormProps {
  projectId: string;
  providerAvailability: { openai: boolean; fal: boolean };
  r2Configured: boolean;
  /** Brand kit visual style — used as the default in the override picker
   *  so the user sees what their project is currently set to. */
  brandVisualStyle: VisualStyleKey | null;
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
}: GenerateImageFormProps) {
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
        language: 'en',
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

      setRun({
        kind: 'running',
        generationId: result.data.generationId,
        status: 'queued',
        assets: [],
      });
      startPolling(result.data.generationId);
    });
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
          layoutId={layoutOverride ?? DEFAULT_LAYOUT_FOR_FORMAT[format]}
          onEditCopy={(asset) =>
            setEditTarget({
              generationId: 'generationId' in run ? run.generationId : '',
              assetId: asset.id,
              publicUrl: asset.publicUrl,
            })
          }
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
            setEditTarget(null);
            toast.success('Overlay re-rendered (no cost — typography only)');
          }}
        />
      )}
    </div>
  );
}

function ResultPanel({
  run,
  t,
  layoutId,
  onEditCopy,
}: {
  run: RunState;
  t: ReturnType<typeof useTranslations<'Generate'>>;
  layoutId: LayoutId | 'none';
  onEditCopy: (asset: AssetSummary) => void;
}) {
  if (run.kind === 'idle') return null;

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
  const grid = assets.length === 1 ? 'grid-cols-1' : 'grid-cols-2';
  const canEdit = layoutId !== 'none' && run.kind === 'done';

  return (
    <div className="space-y-4">
      <div className={`grid gap-3 ${grid}`}>
        {assets.map((a) => (
          <figure key={a.id} className="space-y-2">
            <div className="relative aspect-square border border-ink">
              {a.publicUrl ? (
                <Image
                  src={a.publicUrl}
                  alt=""
                  fill
                  sizes="(min-width: 1024px) 25vw, 50vw"
                  className="object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-paper-2 mono-eyebrow text-ink-3">
                  no public url
                </div>
              )}
            </div>
            <figcaption className="flex items-center justify-between gap-2">
              <span className="mono-eyebrow text-ink-3">
                {a.width ?? '?'} × {a.height ?? '?'}
              </span>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => onEditCopy(a)}
                  className="mono-eyebrow text-ink underline underline-offset-2 hover:text-accent"
                  title="Re-render typography on this background (no AI cost)"
                >
                  Edit copy
                </button>
              )}
            </figcaption>
          </figure>
        ))}
      </div>
      {run.kind === 'done' && (
        <p className="mono-eyebrow text-ink-3">
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
