'use client';

import { useTranslations } from 'next-intl';
import { EMMA_ERROR_CHIPS } from '@/server/config/emmaErrors';

/**
 * ChatErrorCard — Phase 07i.
 *
 * Renders a persisted error-surface chat_message row as a compact
 * retry-able card. Replaces the silent ghosting we had before: the
 * row gets inserted server-side from the stream's onError, and the
 * client renders this card on reload (or live, when the toast fires
 * mid-turn).
 *
 *   ┌──────────────────────────────────────────────────┐
 *   │ ⚠  Emma se trabó por un error transitorio        │
 *   │    OpenAI request_id: req_2a7daf4d…              │
 *   │    [reintentar]  [copiar detalle]                │
 *   └──────────────────────────────────────────────────┘
 */

interface ChatErrorCardProps {
  /** Card title — the friendly first-line summary. */
  title: string;
  /** Subtitle (typically the OpenAI request_id) — null when absent. */
  subtitle: string | null;
  /** Optional retry callback. When set, the [reintentar] chip is
   *  enabled and fires this. */
  onRetry?: () => void;
  /** Locale-aware language for the chip labels. */
  language: 'en' | 'es';
}

export function ChatErrorCard({ title, subtitle, onRetry, language }: ChatErrorCardProps) {
  const _t = useTranslations('Emma');
  const retryLabel = language === 'es' ? EMMA_ERROR_CHIPS.retryEs : EMMA_ERROR_CHIPS.retryEn;
  const copyLabel = language === 'es' ? EMMA_ERROR_CHIPS.copyEs : EMMA_ERROR_CHIPS.copyEn;

  const detailToCopy = [title, subtitle].filter((l): l is string => l !== null).join('\n');

  const handleCopy = () => {
    try {
      void navigator.clipboard.writeText(detailToCopy);
    } catch {
      // clipboard not available — fail silently; the detail is on
      // screen anyway and Garcia can copy by hand.
    }
  };

  return (
    <div className="emma-error-card" role="alert">
      <div className="emma-error-card-icon" aria-hidden="true">
        ⚠
      </div>
      <div className="emma-error-card-body">
        <div className="emma-error-card-title">{title}</div>
        {subtitle ? <div className="emma-error-card-subtitle">{subtitle}</div> : null}
        <div className="emma-error-card-chips">
          {onRetry ? (
            <button type="button" onClick={onRetry}>
              {retryLabel}
            </button>
          ) : null}
          <button type="button" onClick={handleCopy}>
            {copyLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
