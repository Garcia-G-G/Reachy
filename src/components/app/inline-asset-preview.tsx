'use client';

import { useTranslations } from 'next-intl';
import { PendingVariant } from './pending-variant';
import { type ChatAssetAction, useChatAssetActions } from './use-chat-asset-actions';

/**
 * InlineAssetPreview — Phase 07f hydration fix, 07h i18n.
 *
 * Renders an image URL emitted inline in Emma's reply as a real
 * asset card with caption + quick-action chips. Span-based markup
 * stays — block elements inside ReactMarkdown's auto-<p> break
 * hydration. All labels route through next-intl so the chips
 * follow the app locale (ES/EN).
 */

interface InlineAssetPreviewProps {
  url: string;
  caption?: string;
}

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

function useChipLabel() {
  const t = useTranslations('Emma');
  return (action: ChatAssetAction, busy: ChatAssetAction | null, savedFlash: boolean): string => {
    if (action === 'mejorar') return busy === 'mejorar' ? t('chipImproveBusy') : t('chipImprove');
    if (action === 'variante') return busy === 'variante' ? t('chipVariantBusy') : t('chipVariant');
    if (savedFlash) return t('chipSaved');
    return busy === 'guardar' ? t('chipSaveBusy') : t('chipSave');
  };
}

export function InlineAssetPreview({ url, caption }: InlineAssetPreviewProps) {
  const t = useTranslations('Emma');
  const chipLabel = useChipLabel();
  const label = caption?.trim() || inferCaptionFromUrl(url);
  const parsed = parseReachyAssetUrl(url);
  const chipsEnabled = Boolean(parsed);
  const actions = useChatAssetActions({
    generationId: parsed?.generationId ?? '00000000-0000-0000-0000-000000000000',
  });

  return (
    // biome-ignore lint/a11y/useSemanticElements: must stay span — <figure> can't descend from <p>, breaks hydration (07f)
    <span className="emma-inline-asset" role="figure" aria-label={label}>
      {label ? <span className="emma-inline-asset-caption">{label}</span> : null}
      <a href={url} target="_blank" rel="noreferrer" className="emma-inline-asset-link">
        {/* biome-ignore lint/a11y/useAltText: caption above + link below carry semantics */}
        <img src={url} alt="" className="emma-inline-asset-image" />
      </a>
      {chipsEnabled ? (
        <>
          <span className="emma-tool-chips emma-inline-asset-chips">
            <button
              type="button"
              onClick={actions.onMejorar}
              disabled={actions.busy !== null}
              aria-label={t('ariaImprove')}
            >
              {chipLabel('mejorar', actions.busy, actions.savedFlash)}
            </button>
            <button
              type="button"
              onClick={actions.onVariante}
              disabled={actions.busy !== null}
              aria-label={t('ariaVariant')}
            >
              {chipLabel('variante', actions.busy, actions.savedFlash)}
            </button>
            <button
              type="button"
              onClick={actions.onGuardar}
              disabled={actions.busy !== null}
              aria-label={t('ariaSave')}
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
