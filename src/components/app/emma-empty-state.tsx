'use client';

import { useState } from 'react';
import { EMMA_STARTER_GLYPH_BG, EMMA_STARTERS } from '@/server/config/emmaStarters';

/**
 * Emma empty state — Phase 07b.
 *
 * 4 starter cards in a 2×2 grid. Each: 22px glyph block + title.
 * NO captions. NO eyebrows. Cards stagger-enter via CSS animation
 * (see .emma-starter-card in emma-tokens.css). Hover lifts the
 * card -2px and shifts the amber arrow right 3px.
 *
 * Click → submits the card's prompt as a user message + animates
 * the cards out (slide-up + fade) so they disappear cleanly.
 */

interface EmmaEmptyStateProps {
  language: 'en' | 'es';
  onSelect: (prompt: string) => void;
}

export function EmmaEmptyState({ language, onSelect }: EmmaEmptyStateProps) {
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
        const title = language === 'es' ? s.titleEs : s.titleEn;
        const prompt = language === 'es' ? s.promptEs : s.promptEn;
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
