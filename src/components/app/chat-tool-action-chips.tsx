'use client';

import { PendingVariant } from './pending-variant';
import { type ChatAssetAction, useChatAssetActions } from './use-chat-asset-actions';

/**
 * ChatToolActionChips — Phase 07f.
 *
 * The mejorar / variante / guardar chip row rendered inside a
 * ChatToolCard's reveal state. Mirrors the chips on
 * InlineAssetPreview and uses the SAME useChatAssetActions hook
 * so the UX is consistent across both surfaces.
 *
 * Tool cards live OUTSIDE a markdown <p> (they render inside an
 * <article className="emma-msg">), so they don't have the
 * hydration constraint — div/button works here. We still use
 * div + span to match the editorial styling tokens.
 */

interface ChatToolActionChipsProps {
  generationId: string;
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

export function ChatToolActionChips({ generationId }: ChatToolActionChipsProps) {
  const actions = useChatAssetActions({ generationId });
  return (
    <div className="emma-tool-chips" style={{ marginTop: 12 }}>
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
