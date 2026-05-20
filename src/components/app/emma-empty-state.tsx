'use client';

import { useLocale } from 'next-intl';
import { useState } from 'react';
import { EMMA_STARTER_GLYPH_BG, EMMA_STARTERS } from '@/server/config/emmaStarters';

/**
 * Emma empty state — Phase 07b, 07h locale alignment.
 *
 * 4 starter cards in a 2×2 grid. Each: 22px glyph block + title.
 * NO captions. Cards stagger-enter via CSS animation. Hover lifts
 * -2px + amber arrow shifts right.
 *
 * Locale comes from useLocale() so the starter titles + prompts
 * match the rest of the app chrome.
 */

interface EmmaEmptyStateProps {
  onSelect: (prompt: string) => void;
}

export function EmmaEmptyState({ onSelect }: EmmaEmptyStateProps) {
  const locale = useLocale();
  const isEs = locale === 'es';
  const [leaving, setLeaving] = useState(false);

  const handlePick = (prompt: string) => {
    if (leaving) return;
    setLeaving(true);
    // Wait for the leave animation to finish before submitting so the
    // user reads the cards disappearing before the new message lands.
    window.setTimeout(() => onSelect(prompt), 150);
  };

  return (
    <div className="emma-starter-grid">
      {EMMA_STARTERS.map((s, i) => {
        const title = isEs ? s.titleEs : s.titleEn;
        const prompt = isEs ? s.promptEs : s.promptEn;
        return (
          <button
            key={s.id}
            type="button"
            className={`emma-starter-card ${leaving ? 'is-leaving' : ''}`}
            style={{ animationDelay: `${i * 60}ms` }}
            onClick={() => handlePick(prompt)}
          >
            <span
              className="emma-card-glyph"
              style={{ backgroundColor: EMMA_STARTER_GLYPH_BG[s.glyphColor] }}
            >
              {s.glyph}
            </span>
            <span>{title}</span>
            <span className="emma-card-arrow" aria-hidden="true">
              →
            </span>
          </button>
        );
      })}
    </div>
  );
}
