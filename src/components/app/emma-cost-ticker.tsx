'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Emma cost ticker — Phase 07b.
 *
 * Animates the running cost via requestAnimationFrame: old → new
 * value over the cost-count duration (see motion.css). Amber dot
 * pulses on every update via a CSS class toggle.
 *
 * Locale: ES uses comma as the decimal separator. Detected from the
 * `language` prop, not from navigator (so SSR matches CSR).
 */

interface EmmaCostTickerProps {
  cents: number;
  language: 'en' | 'es';
}

/** Pull the cost-count duration from the CSS custom property so the
 *  rAF loop matches the motion-token system (and goes to 0ms when
 *  prefers-reduced-motion is on). */
function readMotionDurationMs(varName: string, fallback: number): number {
  if (typeof window === 'undefined') return fallback;
  const raw = window.getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  if (raw.endsWith('ms')) return Number.parseFloat(raw);
  if (raw.endsWith('s')) return Number.parseFloat(raw) * 1000;
  return fallback;
}

function formatCents(cents: number, language: 'en' | 'es'): string {
  const usd = cents / 100;
  return new Intl.NumberFormat(language === 'es' ? 'es-MX' : 'en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(usd);
}

export function EmmaCostTicker({ cents, language }: EmmaCostTickerProps) {
  const [displayedCents, setDisplayedCents] = useState(cents);
  const [isPulsing, setIsPulsing] = useState(false);
  const prevCentsRef = useRef(cents);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const from = prevCentsRef.current;
    const to = cents;
    if (from === to) return;
    prevCentsRef.current = to;

    setIsPulsing(true);
    // The dot pulse + cost-count both live in motion.css. Read the
    // cost-count duration from the CSS var so reduced-motion drops
    // both to instant.
    const duration = readMotionDurationMs('--motion-duration-cost-count', 500);
    const pulseDuration = readMotionDurationMs('--motion-duration-cost-pulse', 400);

    if (duration === 0) {
      setDisplayedCents(to);
      setIsPulsing(false);
      return;
    }

    const start = performance.now();
    const step = (now: number) => {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / duration);
      // ease-out cubic
      const eased = 1 - (1 - t) ** 3;
      const value = Math.round(from + (to - from) * eased);
      setDisplayedCents(value);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(step);
      }
    };
    rafRef.current = requestAnimationFrame(step);

    const pulseTimer = window.setTimeout(() => setIsPulsing(false), pulseDuration);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      window.clearTimeout(pulseTimer);
    };
  }, [cents]);

  return (
    <span className="emma-cost" aria-live="polite">
      <span className={`emma-cost-dot ${isPulsing ? 'is-pulsing' : ''}`} aria-hidden="true" />
      {formatCents(displayedCents, language)}
    </span>
  );
}
