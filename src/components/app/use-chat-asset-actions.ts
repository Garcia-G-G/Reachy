'use client';

import { useState } from 'react';
import {
  enqueueChatAssetVariation,
  regenerateChatAsset,
  saveChatAssetToLibrary,
} from '@/server/actions/chatAssetActions';

/**
 * Shared hook for the chat asset quick-action chips (mejorar /
 * variante / guardar). Phase 07f.
 *
 * Used by both InlineAssetPreview (when the assistant pastes a raw
 * image URL into a reply) and ChatToolCard (when the assistant
 * generated an image via the generateImage tool). Both call the
 * same server actions so the UX is consistent.
 *
 * State:
 *   - busy:        which chip is currently in-flight (null otherwise)
 *   - savedFlash:  true for 2s after a successful save (chip flashes
 *                  "guardado ✓" briefly)
 *   - error:       last error message (null after the next click)
 *   - pendingIds:  the new generationIds that mejorar / variante
 *                  enqueued and are still resolving. Parent renders
 *                  these via <PendingVariant> until they finish.
 */

export type ChatAssetAction = 'mejorar' | 'variante' | 'guardar';

export interface PendingDerivedAsset {
  generationId: string;
  kind: 'mejorar' | 'variante';
}

export interface UseChatAssetActionsResult {
  busy: ChatAssetAction | null;
  savedFlash: boolean;
  error: string | null;
  pendingIds: PendingDerivedAsset[];
  onMejorar: () => Promise<void>;
  onVariante: () => Promise<void>;
  onGuardar: () => Promise<void>;
  /** Caller can clear the in-memory pendingIds list once it has
   *  consumed them (e.g. after the polling component resolves). */
  dismissPending: (generationId: string) => void;
}

export function useChatAssetActions(opts: { generationId: string }): UseChatAssetActionsResult {
  const [busy, setBusy] = useState<ChatAssetAction | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingIds, setPendingIds] = useState<PendingDerivedAsset[]>([]);

  const onMejorar = async () => {
    if (busy) return;
    setBusy('mejorar');
    setError(null);
    try {
      const res = await regenerateChatAsset({ generationId: opts.generationId });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setPendingIds((prev) => [...prev, { generationId: res.data.generationId, kind: 'mejorar' }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed');
    } finally {
      setBusy(null);
    }
  };

  const onVariante = async () => {
    if (busy) return;
    setBusy('variante');
    setError(null);
    try {
      const res = await enqueueChatAssetVariation({ generationId: opts.generationId });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setPendingIds((prev) => [...prev, { generationId: res.data.generationId, kind: 'variante' }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed');
    } finally {
      setBusy(null);
    }
  };

  const onGuardar = async () => {
    if (busy) return;
    setBusy('guardar');
    setError(null);
    try {
      const res = await saveChatAssetToLibrary({ generationId: opts.generationId });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed');
    } finally {
      setBusy(null);
    }
  };

  const dismissPending = (generationId: string) => {
    setPendingIds((prev) => prev.filter((p) => p.generationId !== generationId));
  };

  return {
    busy,
    savedFlash,
    error,
    pendingIds,
    onMejorar,
    onVariante,
    onGuardar,
    dismissPending,
  };
}
