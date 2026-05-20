'use client';

import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChatToolActionChips } from './chat-tool-action-chips';

/**
 * ChatImageLightbox — Phase 07g.
 *
 * Minimal full-size modal triggered from the inline image grid.
 * Renders via portal so the overlay isn't constrained by parent
 * stacking contexts. Esc-to-close + click-on-overlay close. The
 * chip row (mejorar / variante / guardar) lives below the image
 * so the user can act on the specific variant they're viewing.
 *
 * Body scroll is locked while the lightbox is open via setting
 * document.body's overflow inline — cleaned up on unmount.
 */

interface ChatImageLightboxProps {
  url: string;
  caption?: string;
  generationId?: string;
  onClose: () => void;
}

export function ChatImageLightbox({ url, caption, generationId, onClose }: ChatImageLightboxProps) {
  const t = useTranslations('Emma');
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  if (typeof window === 'undefined') return null;

  return createPortal(
    // Lightbox backdrop — Esc handler is the primary keyboard close
    // affordance (registered in the useEffect above). We add a no-op
    // onKeyDown so the lint rule is satisfied; the actual key handling
    // lives on `window` so it works regardless of focus.
    // biome-ignore lint/a11y/noStaticElementInteractions: dialog backdrop with explicit role + keyboard close registered via window
    <div
      className="emma-lightbox-overlay"
      onClick={onClose}
      onKeyDown={() => {
        /* window-level Esc handler does the work */
      }}
      role="dialog"
      aria-modal="true"
      aria-label={caption ?? t('lightboxImagePreview')}
    >
      {/* Inner panel stops backdrop click from propagating up so
          clicks INSIDE the lightbox don't close it. */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: presentational container, focusable controls inside */}
      <div
        className="emma-lightbox-panel"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {caption ? <div className="emma-lightbox-caption">{caption}</div> : null}
        {/* biome-ignore lint/a11y/useAltText: caption above carries the label */}
        <img src={url} alt="" className="emma-lightbox-image" />
        {generationId ? (
          <div className="emma-lightbox-chips">
            <ChatToolActionChips generationId={generationId} />
          </div>
        ) : null}
        <button
          type="button"
          className="emma-lightbox-close"
          onClick={onClose}
          aria-label={t('lightboxClose')}
        >
          ×
        </button>
      </div>
    </div>,
    document.body,
  );
}
