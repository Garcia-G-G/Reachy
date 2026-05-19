'use client';

import { useEffect, useState } from 'react';
import {
  EMMA_SIZE_DEFAULT,
  EMMA_SIZE_OPTIONS,
  EMMA_SIZE_STORAGE_KEY,
  type EmmaSize,
} from '@/server/config/emmaTokens';

/**
 * Emma size toggle — Phase 07b.
 *
 * Three buttons [S] [M] [L]. Active button inverts (navy bg / paper
 * text). Persists to localStorage[EMMA_SIZE_STORAGE_KEY]; hydration
 * happens after mount to avoid SSR/CSR class mismatch flicker.
 *
 * The parent passes onChange so it can update the .size-* class on
 * the .emma-canvas — width / padding / font-size animate via CSS
 * transitions in emma-tokens.css.
 */

interface EmmaSizeToggleProps {
  value: EmmaSize;
  onChange: (next: EmmaSize) => void;
}

export function EmmaSizeToggle({ value, onChange }: EmmaSizeToggleProps) {
  return (
    <div className="emma-size-toggle" role="radiogroup" aria-label="Emma chat size">
      {EMMA_SIZE_OPTIONS.map((opt) => (
        <button key={opt} type="button" aria-pressed={value === opt} onClick={() => onChange(opt)}>
          {opt.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

/** Hook — reads stored size on mount, persists changes. Returns the
 *  current size + a setter. SSR renders with EMMA_SIZE_DEFAULT;
 *  effect runs once on mount to hydrate from localStorage. */
export function useEmmaSize(): [EmmaSize, (next: EmmaSize) => void] {
  const [size, setSize] = useState<EmmaSize>(EMMA_SIZE_DEFAULT);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(EMMA_SIZE_STORAGE_KEY);
      if (raw && (EMMA_SIZE_OPTIONS as readonly string[]).includes(raw)) {
        setSize(raw as EmmaSize);
      }
    } catch {
      // localStorage unavailable (private mode / SSR) — keep default.
    }
  }, []);

  const updateSize = (next: EmmaSize) => {
    setSize(next);
    try {
      window.localStorage.setItem(EMMA_SIZE_STORAGE_KEY, next);
    } catch {
      // ignore storage errors; the UI still works for the session.
    }
  };

  return [size, updateSize];
}
