'use client';

import { useTranslations } from 'next-intl';
import { bubbleBounds, makeDragHandlers, type Vec2 } from './use-emma-position';

/**
 * EmmaBubble — Phase 07h collapsed state.
 *
 * 56×56 navy circle with an italic amber `E.` in the center. Sits
 * bottom-right by default; drag-aware. Click opens the panel.
 *
 * Position is FROM the bottom-right corner (x px from right, y px
 * from bottom). The sentinel value (-1, -1) means "use defaults
 * from CSS" — the component reads it and applies the configured
 * margins.
 */

interface EmmaBubbleProps {
  position: Vec2;
  onMove: (next: Vec2) => void;
  onOpen: () => void;
  hasNotification?: boolean;
}

export function EmmaBubble({ position, onMove, onOpen, hasNotification }: EmmaBubbleProps) {
  const t = useTranslations('Emma');
  const useDefault = position.x < 0 || position.y < 0;
  const handlePointerDown = makeDragHandlers({
    start: useDefault
      ? { x: 24, y: 24 } // EMMA_BUBBLE_MARGIN
      : position,
    onMove,
    bounds: bubbleBounds(),
  });

  // We use right/bottom positioning so the bubble glues to the
  // bottom-right corner when the viewport resizes.
  const style: React.CSSProperties = useDefault ? {} : { right: position.x, bottom: position.y };

  // Track click-vs-drag: if pointer moved more than 4px between
  // down and up, treat as a drag (don't open). Tiny state in the
  // pointer handlers below.
  let downX = 0;
  let downY = 0;
  return (
    <button
      type="button"
      className="emma-bubble"
      style={style}
      aria-label={t('preThinkingAria')}
      onPointerDown={(e) => {
        downX = e.clientX;
        downY = e.clientY;
        handlePointerDown(e);
      }}
      onPointerUp={(e) => {
        const dx = Math.abs(e.clientX - downX);
        const dy = Math.abs(e.clientY - downY);
        if (dx < 4 && dy < 4) onOpen();
      }}
    >
      <span className="emma-bubble-mark" aria-hidden="true">
        E<span className="emma-bubble-period">.</span>
      </span>
      {hasNotification ? <span className="emma-bubble-dot" aria-hidden="true" /> : null}
    </button>
  );
}
