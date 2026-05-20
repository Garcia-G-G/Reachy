'use client';

import { useState } from 'react';
import { ChatImageLightbox } from './chat-image-lightbox';

/**
 * ChatImageGrid — Phase 07g.
 *
 * 2×2 grid of image thumbs (degrades to 2-row horizontal stack at
 * narrower widths via CSS). Click a thumb → opens the lightbox.
 *
 * Each item carries an optional generationId so the lightbox can
 * surface the right mejorar / variante / guardar chips.
 */

export interface ChatImageGridItem {
  url: string;
  /** When set, the lightbox chips operate on this generation row.
   *  Absent for non-Reachy URLs (the chips hide cleanly). */
  generationId?: string;
  /** Optional per-thumb label (e.g. "variante 1"). Renders as a
   *  small mono caption beneath the thumb. */
  caption?: string;
}

interface ChatImageGridProps {
  items: ChatImageGridItem[];
}

export function ChatImageGrid({ items }: ChatImageGridProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const active = openIndex !== null ? items[openIndex] : null;

  return (
    <>
      <div className="emma-image-grid" data-count={items.length}>
        {items.map((item, idx) => (
          <button
            // URLs in a grid are unique per asset (R2 keys carry the
            // generation id + variant index), so using the URL alone
            // as the key avoids the array-index anti-pattern. If the
            // same URL ever appears twice we'd render one cell, which
            // is the desired dedupe behavior.
            key={item.url}
            type="button"
            className="emma-image-grid-cell"
            onClick={() => setOpenIndex(idx)}
            aria-label={item.caption ?? `Open image ${idx + 1}`}
            data-tool-cell
          >
            {/* biome-ignore lint/a11y/useAltText: button label carries semantics */}
            <img src={item.url} alt="" />
            {item.caption ? <span className="emma-image-grid-caption">{item.caption}</span> : null}
          </button>
        ))}
      </div>
      {active ? (
        <ChatImageLightbox
          url={active.url}
          caption={active.caption}
          generationId={active.generationId}
          onClose={() => setOpenIndex(null)}
        />
      ) : null}
    </>
  );
}
