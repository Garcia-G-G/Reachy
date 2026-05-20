'use client';

import { PendingVariant } from './pending-variant';
import { type ChatAssetAction, useChatAssetActions } from './use-chat-asset-actions';

/**
 * InlineAssetPreview — Phase 07f.
 *
 * Renders an image URL emitted inline in Emma's reply as a real
 * asset card with caption + quick-action chips. The card lives
 * inside a ReactMarkdown-rendered `<p>` element, which is why
 * EVERY structural element here is a `<span>` instead of the
 * semantically nicer `<figure>` / `<figcaption>` / `<div>` —
 * block-level descendants inside a `<p>` trigger the browser's
 * auto-close behavior and break SSR hydration. role="figure" +
 * aria-label preserve accessibility.
 *
 * The mejorar / variante / guardar chips are wired via
 * useChatAssetActions when the URL is parseable as a Reachy
 * generation (R2 path `{projectId}/{generationId}/N.png`). For
 * arbitrary URLs (e.g. unsplash refs Emma pasted) the chips are
 * hidden — there's no generation row to act on.
 */

interface InlineAssetPreviewProps {
  url: string;
  caption?: string;
}

/** Extract { projectId, generationId } from a Reachy R2 public URL.
 *  Storage path pattern from src/server/jobs/imageWorker.ts:
 *    `${projectId}/${generationId}/${i + 1}.png`
 *  → public URL: `https://pub-<id>.r2.dev/{projectId}/{generationId}/N.png`
 *
 *  Returns null when the URL doesn't match the pattern — the chips
 *  hide cleanly in that case. */
const REACHY_ASSET_URL_RE =
  /^https?:\/\/pub-[a-z0-9]+\.r2\.dev\/([0-9a-f-]{36})\/([0-9a-f-]{36})\/\d+\.(png|jpg|jpeg|webp)/i;

function parseReachyAssetUrl(url: string): { projectId: string; generationId: string } | null {
  const m = REACHY_ASSET_URL_RE.exec(url);
  if (!m) return null;
  const projectId = m[1];
  const generationId = m[2];
  if (!projectId || !generationId) return null;
  return { projectId, generationId };
}

function inferCaptionFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.split('/').filter(Boolean);
    return path[path.length - 1] ?? '';
  } catch {
    return '';
  }
}

function chipLabel(
  action: ChatAssetAction,
  busy: ChatAssetAction | null,
  savedFlash: boolean,
): string {
  if (action === 'mejorar') return busy === 'mejorar' ? 'mejorando…' : 'mejorar';
  if (action === 'variante') return busy === 'variante' ? 'generando…' : 'variante';
  if (savedFlash) return 'guardado ✓';
  return busy === 'guardar' ? 'guardando…' : 'guardar';
}

export function InlineAssetPreview({ url, caption }: InlineAssetPreviewProps) {
  const label = caption?.trim() || inferCaptionFromUrl(url);
  const parsed = parseReachyAssetUrl(url);
  const chipsEnabled = Boolean(parsed);

  // The hook is always called (rules of hooks), but its actions only
  // fire when chipsEnabled is true. When parsing failed we pass a
  // sentinel generationId — the hook never reaches the network in
  // that path because we disable the chips before they can click.
  const actions = useChatAssetActions({
    generationId: parsed?.generationId ?? '00000000-0000-0000-0000-000000000000',
  });

  return (
    // biome-ignore lint/a11y/useSemanticElements: must stay span — <figure> can't descend from <p>, breaks hydration (07f)
    <span className="emma-inline-asset" role="figure" aria-label={label}>
      {label ? <span className="emma-inline-asset-caption">{label}</span> : null}
      <a href={url} target="_blank" rel="noreferrer" className="emma-inline-asset-link">
        {/* biome-ignore lint/a11y/useAltText: inline conversational preview — caption above + link below */}
        <img src={url} alt="" className="emma-inline-asset-image" />
      </a>
      {chipsEnabled ? (
        <>
          <span className="emma-tool-chips emma-inline-asset-chips">
            <button
              type="button"
              onClick={actions.onMejorar}
              disabled={actions.busy !== null}
              aria-label="Mejorar la imagen"
            >
              {chipLabel('mejorar', actions.busy, actions.savedFlash)}
            </button>
            <button
              type="button"
              onClick={actions.onVariante}
              disabled={actions.busy !== null}
              aria-label="Generar una variante"
            >
              {chipLabel('variante', actions.busy, actions.savedFlash)}
            </button>
            <button
              type="button"
              onClick={actions.onGuardar}
              disabled={actions.busy !== null}
              aria-label="Guardar al archivo"
            >
              {chipLabel('guardar', actions.busy, actions.savedFlash)}
            </button>
          </span>
          {actions.error ? (
            <span className="emma-inline-asset-error" role="alert">
              {actions.error}
            </span>
          ) : null}
          {actions.pendingIds.map((p) => (
            <PendingVariant key={p.generationId} generationId={p.generationId} kind={p.kind} />
          ))}
        </>
      ) : null}
    </span>
  );
}

InlineAssetPreview.displayName = 'InlineAssetPreview';
