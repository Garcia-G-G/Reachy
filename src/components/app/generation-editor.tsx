'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { AskEmmaBlock } from '@/components/app/ask-emma-block';
import { LayoutPreview } from '@/components/app/layout-previews';
import { IMAGE_FORMATS, type ImageFormat } from '@/lib/image-formats';
import {
  DEFAULT_LAYOUT_FOR_FORMAT,
  LAYOUT_IDS,
  LAYOUT_META,
  LAYOUT_SLOTS,
  type LayoutId,
  type LayoutSlot,
} from '@/lib/layout-meta';
import type { VisualStyleKey } from '@/lib/visual-styles-meta';
import {
  enqueueVariations,
  rerenderOverlay,
  swapColors,
  swapLayout,
} from '@/server/actions/images';

/**
 * Dedicated post-render editor. Lives at /generate/image/[generationId].
 *
 * Layout (desktop ≥ lg):
 *   ┌──────────────────────────────────┬──────────────────────────┐
 *   │  BIG CANVAS PREVIEW              │   PERSISTENT SIDEBAR      │
 *   │  (max-w-[1000px], aspect-locked) │   Edit Copy               │
 *   │                                  │   Layout swap             │
 *   │                                  │   Color override          │
 *   │                                  │   Actions                 │
 *   ├──────────────────────────────────┴──────────────────────────┤
 *   │  Frame / variant strip                                       │
 *   └──────────────────────────────────────────────────────────────┘
 *
 * Polls /api/generations/:id/status while the generation is still
 * queued/running. Once done, the polling stops and the sidebar is
 * interactive (rerenderOverlay / swapLayout / swapColors / variations
 * are wired). Each of those actions creates a NEW generation row —
 * we navigate to it via router.push so the user never loses the
 * source state.
 */

export interface EditorAsset {
  id: string;
  publicUrl: string | null;
  width: number | null;
  height: number | null;
}

/** Mirror of generation.params.aiPromptState (post-pivot) or
 *  composeState (legacy). The page-level loader collapses both into
 *  this shape; the `legacy` flag tells the editor whether to allow
 *  editing or surface a read-only banner. */
export interface EditorComposeState {
  layoutId?: LayoutId;
  mode?: 'exploration' | 'sequence' | 'multi-strategy';
  copy?: Record<LayoutSlot, string | undefined> | Array<Record<LayoutSlot, string | undefined>>;
  colors?: { ink: string; paper: string; accent: string };
  variantAxes?: Array<{ layoutId?: LayoutId; label?: string }>;
  /** True when this generation predates the May-2026 AI-typography
   *  pivot (only composeState in params, no aiPromptState). The
   *  editor disables editing affordances for these rows. */
  legacy?: boolean;
}

interface GenerationEditorProps {
  slug: string;
  generationId: string;
  projectId: string;
  projectName: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  errorMessage: string | null;
  costCents: number | null;
  costBreakdown: { cents: number; parts?: Record<string, number | undefined> } | null;
  format: string;
  model: string | null;
  composeState: EditorComposeState | null;
  brandVisualStyle: VisualStyleKey | null;
  assets: EditorAsset[];
}

function formatCents(cents: number | null | undefined): string {
  if (cents == null) return '—';
  if (cents >= 100) return `$${(cents / 100).toFixed(2)}`;
  return `${cents}¢`;
}

export function GenerationEditor(props: GenerationEditorProps) {
  const {
    slug,
    generationId,
    projectName,
    status: initialStatus,
    format,
    model,
    composeState: initialComposeState,
    brandVisualStyle,
    assets: initialAssets,
  } = props;

  const [status, setStatus] = useState(initialStatus);
  const [errorMessage, setErrorMessage] = useState(props.errorMessage);
  const [costCents, setCostCents] = useState(props.costCents);
  const [assets, setAssets] = useState<EditorAsset[]>(initialAssets);
  const [composeState, setComposeState] = useState(initialComposeState);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Refs hold the latest status so the poll callback can decide to
  // stop without us re-binding the interval on every status transition
  // (the previous version listed `status` in the dep array — that
  // tore down and rebuilt the timer on every poll response, wasting
  // a setInterval/clearInterval pair each tick).
  const statusRef = useRef(status);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    // If we already landed in a terminal state on first render (i.e.
    // the user opened an old gen URL), skip the poll entirely.
    if (statusRef.current === 'done' || statusRef.current === 'failed') return;
    pollRef.current = setInterval(async () => {
      if (statusRef.current === 'done' || statusRef.current === 'failed') {
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
        return;
      }
      try {
        const res = await fetch(`/api/generations/${generationId}/status`, {
          cache: 'no-store',
        });
        if (!res.ok) return;
        const json = (await res.json()) as {
          status: 'queued' | 'running' | 'done' | 'failed';
          errorMessage: string | null;
          costCents: number | null;
          assets: EditorAsset[];
          composeState: EditorComposeState | null;
        };
        setStatus(json.status);
        setErrorMessage(json.errorMessage);
        setCostCents(json.costCents);
        setAssets(json.assets);
        if (json.composeState) setComposeState(json.composeState);
      } catch {
        // ignore network blips — next tick retries.
      }
    }, 2_000);
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [generationId]);

  const fm = IMAGE_FORMATS[format as ImageFormat] ?? { w: 1080, h: 1080, label: format };
  const aspect = `${fm.w} / ${fm.h}`;
  const selected = assets[Math.min(selectedIdx, Math.max(0, assets.length - 1))] ?? null;
  const isSequence = composeState?.mode === 'sequence';
  const isMultiStrategy = composeState?.mode === 'multi-strategy';
  const isLegacy = Boolean(composeState?.legacy);

  // Resolve the per-asset layout (multi-strategy variants can have
  // different layouts per slot). Falls back to composeState.layoutId
  // or the format default.
  const resolvedLayoutId: LayoutId =
    (isMultiStrategy && composeState?.variantAxes?.[selectedIdx]?.layoutId) ||
    composeState?.layoutId ||
    DEFAULT_LAYOUT_FOR_FORMAT[format as ImageFormat] ||
    'hero-centered';

  // Resolve the per-asset copy.
  const initialCopy: Record<LayoutSlot, string> = (() => {
    const empty: Record<LayoutSlot, string> = {
      eyebrow: '',
      headline: '',
      subheadline: '',
      cta: '',
      wordmark: '',
    };
    const csCopy = composeState?.copy;
    if (!csCopy) return empty;
    if (Array.isArray(csCopy)) {
      const entry: Record<LayoutSlot, string | undefined> = csCopy[selectedIdx] ?? {
        eyebrow: undefined,
        headline: undefined,
        subheadline: undefined,
        cta: undefined,
        wordmark: undefined,
      };
      return {
        eyebrow: entry.eyebrow ?? '',
        headline: entry.headline ?? '',
        subheadline: entry.subheadline ?? '',
        cta: entry.cta ?? '',
        wordmark: entry.wordmark ?? '',
      };
    }
    return {
      eyebrow: csCopy.eyebrow ?? '',
      headline: csCopy.headline ?? '',
      subheadline: csCopy.subheadline ?? '',
      cta: csCopy.cta ?? '',
      wordmark: csCopy.wordmark ?? '',
    };
  })();

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-baseline justify-between gap-4 border-ink-3/30 border-b pb-4">
        <div>
          <Link
            href={`/app/projects/${slug}/generate/image`}
            className="mono-eyebrow text-ink-3 hover:text-ink"
          >
            ← Back to form
          </Link>
          <h2
            className="mt-2"
            style={{
              fontFamily: 'var(--font-fraunces), Georgia, serif',
              fontSize: 28,
              lineHeight: 1.1,
            }}
          >
            {projectName} · Generation #{generationId.slice(0, 8)}
          </h2>
          <p className="mono-eyebrow mt-2 text-ink-3">
            {fm.label}
            {model ? ` · ${model}` : ''}
            {' · '}
            cost {formatCents(costCents)}
            {' · '}
            status <span className={status === 'failed' ? 'text-accent' : ''}>{status}</span>
            {composeState?.mode ? ` · mode: ${composeState.mode}` : ''}
          </p>
          {brandVisualStyle && (
            <p className="mono-eyebrow text-ink-3">brand style: {brandVisualStyle}</p>
          )}
        </div>
      </div>

      {/* Main: canvas + sidebar */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* Canvas */}
        <div>
          {status === 'failed' ? (
            <div role="alert" className="border border-accent p-6 text-sm text-accent">
              Failed — {errorMessage}
            </div>
          ) : status !== 'done' || !selected ? (
            <div
              className="mx-auto flex max-w-[1000px] flex-col items-center justify-center border border-ink-3/30 bg-paper-2 text-ink-3"
              style={{ aspectRatio: aspect }}
            >
              <span className="mb-4 block h-2 w-2 animate-pulse bg-accent" aria-hidden />
              <span className="mono-eyebrow">{status === 'queued' ? 'queued' : 'rendering'}</span>
            </div>
          ) : (
            <figure
              className="relative mx-auto max-w-[1000px] overflow-hidden border border-ink"
              style={{
                aspectRatio: aspect,
                boxShadow: '0 1px 0 0 rgba(20,17,13,0.05), 0 24px 56px -16px rgba(20,17,13,0.2)',
              }}
            >
              {selected.publicUrl ? (
                // biome-ignore lint/performance/noImgElement: large canvas; next/image is overkill here
                <img src={selected.publicUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center mono-eyebrow text-ink-3">
                  no public url
                </div>
              )}
            </figure>
          )}

          {/* Variant strip */}
          {assets.length > 1 && (
            <div className="mx-auto mt-6 flex max-w-[1000px] flex-wrap items-center justify-center gap-3">
              {assets.map((a, i) => {
                const isActive = i === selectedIdx;
                const label = isMultiStrategy
                  ? (composeState?.variantAxes?.[i]?.label ?? `${i + 1}`)
                  : `${i + 1}`;
                return (
                  <span key={a.id} className="flex flex-col items-center gap-1">
                    <span className="flex items-center gap-3">
                      {isSequence && i > 0 && (
                        <span
                          className="mono-eyebrow text-ink-3"
                          style={{ fontSize: 18 }}
                          aria-hidden
                        >
                          →
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => setSelectedIdx(i)}
                        className="block overflow-hidden bg-paper-2"
                        style={{
                          width: 96,
                          aspectRatio: aspect,
                          border: `1px solid ${isActive ? 'var(--ink, #14110D)' : 'transparent'}`,
                          boxShadow: isActive
                            ? '0 1px 0 0 rgba(20,17,13,0.05), 0 8px 24px -8px rgba(20,17,13,0.25)'
                            : 'none',
                          transition: 'box-shadow 120ms ease, border-color 120ms ease',
                        }}
                        aria-pressed={isActive}
                        aria-label={`Show ${isSequence ? 'frame' : 'variant'} ${i + 1}`}
                      >
                        {a.publicUrl ? (
                          // biome-ignore lint/performance/noImgElement: small thumb
                          <img src={a.publicUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <span className="block h-full w-full" />
                        )}
                      </button>
                    </span>
                    <span className="mono-eyebrow text-[10px] text-ink-3">{label}</span>
                  </span>
                );
              })}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <aside className="space-y-8">
          {isLegacy && (
            <section
              className="space-y-2 border p-3"
              style={{ borderColor: 'rgba(20,17,13,0.18)', background: 'var(--paper, #F1EBDF)' }}
            >
              <h3 className="mono-eyebrow">Legacy generation</h3>
              <p className="text-sm leading-relaxed">
                This generation uses the legacy SVG-overlay pipeline. Edit-copy / layout-swap /
                color-swap require the new AI pipeline — re-generate from the brief to enable
                editing.
              </p>
            </section>
          )}

          <EditCopyBlock
            disabled={status !== 'done' || !selected || pendingAction !== null || isLegacy}
            initialCopy={initialCopy}
            layoutId={resolvedLayoutId}
            onSubmit={async ({ copy, quickFix }) => {
              if (!selected) return;
              setPendingAction('edit-copy');
              const res = await rerenderOverlay({
                generationId,
                assetId: selected.id,
                copy,
                quickFix,
              });
              setPendingAction(null);
              if (!res.ok) {
                toast.error(`Edit copy failed: ${res.error}`);
                return;
              }
              toast.success(`Edit rendered · ~$0.21`);
              window.location.href = `/app/projects/${slug}/generate/image/${res.data.generationId}`;
            }}
          />

          <LayoutBlock
            currentLayoutId={resolvedLayoutId}
            disabled={status !== 'done' || !selected || pendingAction !== null || isLegacy}
            onPick={async (layoutId) => {
              if (!selected) return;
              setPendingAction('swap-layout');
              const res = await swapLayout({
                generationId,
                assetId: selected.id,
                layoutId,
              });
              setPendingAction(null);
              if (!res.ok) {
                toast.error(`Swap layout failed: ${res.error}`);
                return;
              }
              toast.success(`Layout → ${layoutId} · ~$0.21`);
              window.location.href = `/app/projects/${slug}/generate/image/${res.data.generationId}`;
            }}
          />

          <ColorsBlock
            colors={composeState?.colors ?? { ink: '#14110D', paper: '#F1EBDF', accent: '#B6481A' }}
            disabled={status !== 'done' || !selected || pendingAction !== null || isLegacy}
            onSubmit={async (colors) => {
              if (!selected) return;
              setPendingAction('swap-colors');
              const res = await swapColors({ generationId, assetId: selected.id, colors });
              setPendingAction(null);
              if (!res.ok) {
                toast.error(`Swap colors failed: ${res.error}`);
                return;
              }
              toast.success(`Colors swapped · ~$0.21`);
              window.location.href = `/app/projects/${slug}/generate/image/${res.data.generationId}`;
            }}
          />

          <ActionsBlock
            disabled={status !== 'done' || !selected}
            assetUrl={selected?.publicUrl ?? null}
            generationId={generationId}
            isSequence={Boolean(isSequence) && assets.length > 1}
            assets={assets}
            pendingAction={pendingAction}
            onMoreLikeThis={async () => {
              if (!selected) return;
              setPendingAction('variations');
              const res = await enqueueVariations({ sourceAssetId: selected.id });
              setPendingAction(null);
              if (!res.ok) {
                toast.error(`More like this failed: ${res.error}`);
                return;
              }
              window.location.href = `/app/projects/${slug}/generate/image/${res.data.generationId}`;
            }}
          />

          {/* Phase 08c — edit copilot. Mounts as the 5th sidebar
              block; bootstraps its own thread + chips, pins Emma to
              this generation via clientContext.focusedGenerationId.
              The global EmmaWidget auto-hides while this is alive
              (data-emma-inline-mounted on body). */}
          {status === 'done' && !isLegacy ? (
            <EditorAskEmma generationId={generationId} slug={slug} />
          ) : null}
        </aside>
      </div>
    </div>
  );
}

/** Thin wrapper that resolves the current pathname for AskEmmaBlock's
 *  clientContext.currentRoute and wires the onNewGeneration callback
 *  to the same navigation the manual sidebar buttons use. */
function EditorAskEmma({ generationId, slug }: { generationId: string; slug: string }) {
  const pathname = usePathname() ?? `/app/projects/${slug}/generate/image/${generationId}`;
  return (
    <AskEmmaBlock
      generationId={generationId}
      projectSlug={slug}
      currentRoute={pathname}
      onNewGeneration={(newId) => {
        window.location.href = `/app/projects/${slug}/generate/image/${newId}`;
      }}
    />
  );
}

// ──────────────────────────────────────────────────────────────────────
// Sidebar blocks — kept inline because they only render here.
// ──────────────────────────────────────────────────────────────────────

function EditCopyBlock({
  disabled,
  initialCopy,
  layoutId,
  onSubmit,
}: {
  disabled: boolean;
  initialCopy: Record<LayoutSlot, string>;
  layoutId: LayoutId;
  onSubmit: (args: {
    copy: Record<LayoutSlot, string | undefined>;
    quickFix: boolean;
  }) => Promise<void>;
}) {
  const [values, setValues] = useState<Record<LayoutSlot, string>>(initialCopy);
  const [quickFix, setQuickFix] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
  useEffect(() => {
    setValues(initialCopy);
  }, [
    initialCopy.eyebrow,
    initialCopy.headline,
    initialCopy.subheadline,
    initialCopy.cta,
    initialCopy.wordmark,
  ]);

  const slots = LAYOUT_SLOTS[layoutId] ?? ['headline'];

  return (
    <section className="space-y-3">
      <h3 className="mono-eyebrow">Edit copy</h3>
      <div className="space-y-3">
        {slots.map((slot) => (
          <label key={slot} className="block space-y-1">
            <span className="mono-eyebrow block text-ink-3 capitalize">{slot}</span>
            <input
              type="text"
              value={values[slot]}
              onChange={(e) => setValues((v) => ({ ...v, [slot]: e.target.value }))}
              disabled={disabled}
              className="field"
              placeholder={`Enter ${slot}…`}
            />
          </label>
        ))}
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={quickFix}
          onChange={(e) => setQuickFix(e.target.checked)}
          disabled={disabled}
          className="mt-0.5"
        />
        <span className="flex-1 leading-snug">
          <span className="block font-medium">Quick text fix</span>
          <span className="block text-xs text-ink-3">
            Edits with the source as a reference; only the listed text changes, the rest of the
            composition stays. Faster, more stable for single-slot tweaks.
          </span>
        </span>
      </label>

      <div
        className="border p-2 text-xs leading-snug"
        style={{ borderColor: 'rgba(20,17,13,0.18)' }}
      >
        <span className="mono-eyebrow block text-ink-3">Cost</span>
        <span>
          Editing text triggers a fresh AI render. ~$0.21 per edit · ~15 seconds. Every edit is
          saved as a new variant — flip between original and edits in the strip above.
        </span>
      </div>

      <button
        type="button"
        disabled={disabled}
        onClick={() =>
          onSubmit({
            copy: {
              eyebrow: values.eyebrow || undefined,
              headline: values.headline || undefined,
              subheadline: values.subheadline || undefined,
              cta: values.cta || undefined,
              wordmark: values.wordmark || undefined,
            },
            quickFix,
          })
        }
        className="btn-ink w-full disabled:opacity-50"
      >
        {disabled ? 'Working…' : `Apply edit · ~$0.21${quickFix ? ' (quick-fix)' : ''}`}
      </button>
    </section>
  );
}

function LayoutBlock({
  currentLayoutId,
  disabled,
  onPick,
}: {
  currentLayoutId: LayoutId;
  disabled: boolean;
  onPick: (layoutId: LayoutId) => Promise<void>;
}) {
  return (
    <section className="space-y-3">
      <h3 className="mono-eyebrow">Layout</h3>
      <div className="grid grid-cols-3 gap-2">
        {LAYOUT_IDS.map((id) => {
          const active = id === currentLayoutId;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onPick(id)}
              disabled={disabled || active}
              className="flex flex-col items-center gap-1 border p-2 disabled:cursor-not-allowed"
              style={{
                borderColor: active ? 'var(--ink, #14110D)' : 'rgba(20,17,13,0.18)',
                background: active ? 'var(--paper, #F1EBDF)' : 'transparent',
              }}
              title={LAYOUT_META[id].tagline}
            >
              <LayoutPreview layoutId={id} />
              <span className="mono-eyebrow text-[9px] text-ink-3 text-center leading-tight">
                {LAYOUT_META[id].label}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function ColorsBlock({
  colors,
  disabled,
  onSubmit,
}: {
  colors: { ink: string; paper: string; accent: string };
  disabled: boolean;
  onSubmit: (colors: { ink: string; paper: string; accent: string }) => Promise<void>;
}) {
  const [draft, setDraft] = useState(colors);
  // Re-seed when the parent passes new colors (asset swap). Tracking
  // individual channels avoids object-identity churn.
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
  useEffect(() => {
    setDraft(colors);
  }, [colors.ink, colors.paper, colors.accent]);

  const changed =
    draft.ink !== colors.ink || draft.paper !== colors.paper || draft.accent !== colors.accent;

  return (
    <section className="space-y-3">
      <h3 className="mono-eyebrow">Colors (overrides brand kit for this asset)</h3>
      <div className="space-y-2">
        {(['ink', 'paper', 'accent'] as const).map((slot) => (
          <label key={slot} className="flex items-center gap-3">
            <span className="mono-eyebrow w-16 text-ink-3">{slot}</span>
            <input
              type="color"
              value={draft[slot]}
              onChange={(e) => setDraft((d) => ({ ...d, [slot]: e.target.value }))}
              disabled={disabled}
              className="h-8 w-12 cursor-pointer border border-ink/20"
            />
            <input
              type="text"
              value={draft[slot]}
              onChange={(e) => setDraft((d) => ({ ...d, [slot]: e.target.value }))}
              disabled={disabled}
              className="field flex-1 font-mono text-xs"
              maxLength={7}
            />
          </label>
        ))}
      </div>
      <button
        type="button"
        disabled={disabled || !changed}
        onClick={() => onSubmit(draft)}
        className="btn-ink w-full disabled:opacity-50"
      >
        {changed ? 'Apply colors · $0' : 'Colors match brand'}
      </button>
    </section>
  );
}

function ActionsBlock({
  disabled,
  assetUrl,
  generationId,
  isSequence,
  assets,
  pendingAction,
  onMoreLikeThis,
}: {
  disabled: boolean;
  assetUrl: string | null;
  generationId: string;
  isSequence: boolean;
  assets: EditorAsset[];
  pendingAction: string | null;
  onMoreLikeThis: () => Promise<void>;
}) {
  async function downloadCarousel() {
    try {
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      for (const [i, a] of assets.entries()) {
        if (!a.publicUrl) continue;
        const res = await fetch(a.publicUrl);
        if (!res.ok) continue;
        zip.file(`${String(i + 1).padStart(2, '0')}.png`, await res.blob());
      }
      const out = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(out);
      const link = document.createElement('a');
      link.href = url;
      link.download = `reachy-carousel-${generationId.slice(0, 8)}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch (err) {
      toast.error(`Carousel zip failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return (
    <section className="space-y-2">
      <h3 className="mono-eyebrow">Actions</h3>
      <button
        type="button"
        disabled={disabled}
        onClick={onMoreLikeThis}
        className="mono-eyebrow block w-full border border-ink px-3 py-2 text-left hover:bg-ink hover:text-paper disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pendingAction === 'variations' ? 'Queueing…' : '+ More like this'}
      </button>
      {assetUrl && (
        <a
          href={assetUrl}
          download={`reachy-${generationId.slice(0, 8)}.png`}
          className="mono-eyebrow block w-full border border-ink px-3 py-2 text-left hover:bg-ink hover:text-paper"
        >
          ↓ Download PNG
        </a>
      )}
      {isSequence && (
        <button
          type="button"
          onClick={downloadCarousel}
          className="mono-eyebrow block w-full border border-ink px-3 py-2 text-left hover:bg-ink hover:text-paper"
        >
          ↓ Download as carousel (zip)
        </button>
      )}
    </section>
  );
}
