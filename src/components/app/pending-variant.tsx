'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { InlineAssetPreview } from './inline-asset-preview';

/**
 * PendingVariant — Phase 07f, i18n in 07h.
 *
 * Renders a placeholder card for a generation that's in flight.
 * Polls /api/generations/[id]/status every 2.5s up to 5 minutes,
 * then swaps itself for a real InlineAssetPreview when the asset
 * lands. Labels flow through next-intl so the placeholder reads in
 * the active app locale.
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

export function PendingVariant({ generationId, kind }: PendingVariantProps) {
  const t = useTranslations('Emma');
  const [state, setState] = useState<'pending' | 'failed' | 'timeout'>('pending');
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const deadline = Date.now() + POLL_DEADLINE_MS;

    async function pollOnce(): Promise<'continue' | 'stop'> {
      try {
        const res = await fetch(`/api/generations/${generationId}/status`, { cache: 'no-store' });
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
        // Network blip — keep polling.
      }
      return 'continue';
    }

    async function loop() {
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
      <InlineAssetPreview
        url={resolvedUrl}
        caption={kind === 'mejorar' ? t('pendingCaptionImprove') : t('pendingCaptionVariant')}
      />
    );
  }

  const label =
    state === 'failed'
      ? kind === 'mejorar'
        ? t('pendingFailedImprove')
        : t('pendingFailedVariant')
      : state === 'timeout'
        ? kind === 'mejorar'
          ? t('pendingTimedOutImprove')
          : t('pendingTimedOutVariant')
        : kind === 'mejorar'
          ? t('pendingImproving')
          : t('pendingGenerating');

  return (
    <span className="emma-inline-asset" role="status" aria-label={label}>
      <span className="emma-inline-asset-caption">{label}</span>
      {state === 'pending' ? (
        <span className="emma-tool-skeleton" style={{ display: 'block', height: 80 }} />
      ) : (
        <span
          className="emma-inline-asset-link"
          style={{ display: 'block', padding: 24, color: 'var(--emma-amber)', textAlign: 'center' }}
        >
          {state === 'timeout' ? t('pendingStillRunning') : t('pendingCouldNotGenerate')}
        </span>
      )}
    </span>
  );
}
