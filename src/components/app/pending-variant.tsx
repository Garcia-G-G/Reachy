'use client';

import { useEffect, useState } from 'react';
import { InlineAssetPreview } from './inline-asset-preview';

/**
 * PendingVariant — Phase 07f.
 *
 * Renders a placeholder card for a generation that's in flight
 * (image worker spinning, asset not yet stored in R2). Polls the
 * existing /api/generations/[id]/status endpoint every 2.5s until
 * the generation completes or 5 minutes elapse.
 *
 * When the asset lands → swaps itself for a real InlineAssetPreview
 * (so the chips on the new asset work just like the original).
 * On failure → shows a minimal error marker; on timeout → idem.
 *
 * Used by InlineAssetPreview and ChatToolCard via the pendingIds
 * array returned from useChatAssetActions.
 */

interface PendingVariantProps {
  generationId: string;
  kind: 'mejorar' | 'variante';
}

interface StatusResponse {
  id: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  errorMessage: string | null;
  assets: Array<{ publicUrl: string | null }>;
}

const POLL_INTERVAL_MS = 2500;
const POLL_DEADLINE_MS = 5 * 60 * 1000;

function kindLabel(kind: 'mejorar' | 'variante', state: 'pending' | 'failed' | 'timeout'): string {
  if (state === 'failed') return `${kind} · fallo`;
  if (state === 'timeout') return `${kind} · tardó demasiado`;
  return kind === 'mejorar' ? 'mejorando…' : 'generando…';
}

export function PendingVariant({ generationId, kind }: PendingVariantProps) {
  const [state, setState] = useState<'pending' | 'failed' | 'timeout'>('pending');
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const deadline = Date.now() + POLL_DEADLINE_MS;

    async function pollOnce(): Promise<'continue' | 'stop'> {
      try {
        const res = await fetch(`/api/generations/${generationId}/status`, {
          cache: 'no-store',
        });
        if (!res.ok) return 'continue';
        const data = (await res.json()) as StatusResponse;
        if (data.status === 'done') {
          const url = data.assets.find((a) => a.publicUrl)?.publicUrl ?? null;
          if (!cancelled) {
            if (url) setResolvedUrl(url);
            else setState('failed');
          }
          return 'stop';
        }
        if (data.status === 'failed') {
          if (!cancelled) setState('failed');
          return 'stop';
        }
      } catch {
        // Network blips — keep polling until the deadline.
      }
      return 'continue';
    }

    async function loop() {
      // First poll immediately so a fast-completing job doesn't wait
      // for the initial interval.
      const first = await pollOnce();
      if (cancelled || first === 'stop') return;
      while (!cancelled && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        if (cancelled) return;
        const next = await pollOnce();
        if (next === 'stop') return;
      }
      if (!cancelled) setState('timeout');
    }

    void loop();
    return () => {
      cancelled = true;
    };
  }, [generationId]);

  if (resolvedUrl) {
    return (
      <InlineAssetPreview url={resolvedUrl} caption={kind === 'mejorar' ? 'mejora' : 'variante'} />
    );
  }

  return (
    <span className="emma-inline-asset" role="status" aria-label={kindLabel(kind, state)}>
      <span className="emma-inline-asset-caption">{kindLabel(kind, state)}</span>
      {state === 'pending' ? (
        <span className="emma-tool-skeleton" style={{ display: 'block', height: 80 }} />
      ) : (
        <span
          className="emma-inline-asset-link"
          style={{ display: 'block', padding: 24, color: 'var(--emma-amber)', textAlign: 'center' }}
        >
          {state === 'timeout' ? 'sigue corriendo · revisa el archivo' : 'no se pudo generar'}
        </span>
      )}
    </span>
  );
}
