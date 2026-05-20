'use client';

import { useTranslations } from 'next-intl';
import { PendingVariant } from './pending-variant';
import { type ChatAssetAction, useChatAssetActions } from './use-chat-asset-actions';

/**
 * ChatToolActionChips — Phase 07f, i18n in 07h.
 *
 * The mejorar / variante / guardar chip row rendered inside a
 * ChatToolCard's reveal state. Mirrors the chips on
 * InlineAssetPreview and uses the SAME useChatAssetActions hook
 * so the UX is consistent across both surfaces.
 *
 * Strings flow through next-intl so EN locale renders English
 * chips ("improve / variant / save") and ES renders Spanish.
 */

interface ChatToolActionChipsProps {
  generationId: string;
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

export function ChatToolActionChips({ generationId }: ChatToolActionChipsProps) {
  const t = useTranslations('Emma');
  const chipLabel = useChipLabel();
  const actions = useChatAssetActions({ generationId });
  return (
    <div className="emma-tool-chips" style={{ marginTop: 12 }}>
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
      {actions.error ? (
        <span
          role="alert"
          style={{
            fontFamily: 'var(--emma-font-mono)',
            fontSize: 10,
            color: 'var(--emma-amber)',
            letterSpacing: '0.06em',
            marginLeft: 8,
          }}
        >
          {actions.error}
        </span>
      ) : null}
      {actions.pendingIds.map((p) => (
        <div key={p.generationId} style={{ marginTop: 8, gridColumn: '1 / -1' }}>
          <PendingVariant generationId={p.generationId} kind={p.kind} />
        </div>
      ))}
    </div>
  );
}
