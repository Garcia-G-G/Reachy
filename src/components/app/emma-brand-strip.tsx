'use client';

import { useRef, useState } from 'react';
import type { BrandKit } from '@/server/actions/brandKits';

/**
 * Emma brand strip — Phase 07b.
 *
 * Collapsed: 3 × 10px circles (ink / paper / amber from the project
 * brand kit, NOT Emma's chrome amber). Click → panel slides DOWN
 * revealing 24×24 swatches with hex labels, voice rules + audience
 * chips. Click again to collapse.
 *
 * Height transitions from 0 → measured content height over the
 * slow motion duration so the panel feels intentional, not jumpy.
 */

interface EmmaBrandStripProps {
  brandKit: BrandKit;
  audience: string | null;
  recentThumbUrls?: readonly string[];
}

export function EmmaBrandStrip({ brandKit, audience, recentThumbUrls = [] }: EmmaBrandStripProps) {
  const [expanded, setExpanded] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const contentHeight = contentRef.current?.scrollHeight ?? 0;

  const ink = brandKit.primaryColor ?? 'var(--emma-ink)';
  const paper = brandKit.bgColor ?? 'var(--emma-paper)';
  const accent = brandKit.accentColor ?? 'var(--emma-amber)';
  const voice = brandKit.voice;

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="emma-swatch-row"
        aria-expanded={expanded}
        aria-label="Brand details"
      >
        <span className="emma-swatch" style={{ backgroundColor: ink }} />
        <span className="emma-swatch" style={{ backgroundColor: paper }} />
        <span className="emma-swatch" style={{ backgroundColor: accent }} />
      </button>
      <div
        style={{
          height: expanded ? contentHeight : 0,
          overflow: 'hidden',
          transition: 'height var(--motion-duration-slow) var(--motion-easing-out)',
        }}
        aria-hidden={!expanded}
      >
        <div
          ref={contentRef}
          className="pt-3"
          style={{
            opacity: expanded ? 1 : 0,
            transition: 'opacity var(--motion-duration-base) var(--motion-easing-out)',
          }}
        >
          <div className="grid grid-cols-3 gap-3">
            <BrandSwatchTile label="ink" value={ink} />
            <BrandSwatchTile label="paper" value={paper} />
            <BrandSwatchTile label="accent" value={accent} />
          </div>
          {voice ? (
            <dl
              className="mt-4"
              style={{
                fontFamily: 'var(--emma-font-mono)',
                fontSize: 10,
                color: 'var(--emma-ink-65)',
              }}
            >
              {voice.tone ? (
                <div className="mb-2">
                  <dt style={{ letterSpacing: '0.1em', textTransform: 'uppercase' }}>tone</dt>
                  <dd style={{ marginTop: 2, color: 'var(--emma-ink)' }}>{voice.tone}</dd>
                </div>
              ) : null}
              {voice.doSay && voice.doSay.length > 0 ? (
                <div className="mb-2">
                  <dt style={{ letterSpacing: '0.1em', textTransform: 'uppercase' }}>do say</dt>
                  <dd style={{ marginTop: 2, color: 'var(--emma-ink)' }}>
                    {voice.doSay.join(' · ')}
                  </dd>
                </div>
              ) : null}
              {voice.dontSay && voice.dontSay.length > 0 ? (
                <div className="mb-2">
                  <dt style={{ letterSpacing: '0.1em', textTransform: 'uppercase' }}>avoid</dt>
                  <dd style={{ marginTop: 2, color: 'var(--emma-ink)' }}>
                    {voice.dontSay.join(' · ')}
                  </dd>
                </div>
              ) : null}
            </dl>
          ) : null}
          {audience ? (
            <div
              className="mt-2"
              style={{
                fontFamily: 'var(--emma-font-mono)',
                fontSize: 10,
                color: 'var(--emma-ink-65)',
              }}
            >
              <span style={{ letterSpacing: '0.1em', textTransform: 'uppercase' }}>audience</span>{' '}
              <span style={{ color: 'var(--emma-ink)' }}>{audience}</span>
            </div>
          ) : null}
          {recentThumbUrls.length > 0 ? (
            <div className="mt-3 flex gap-2">
              {recentThumbUrls.slice(0, 6).map((u) => (
                /* biome-ignore lint/a11y/useAltText: thumbnail strip */
                <img key={u} src={u} alt="" className="emma-mood-thumb" style={{ opacity: 0.85 }} />
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function BrandSwatchTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-start gap-1">
      <span
        style={{
          backgroundColor: value,
          width: 24,
          height: 24,
          border: '0.5px solid var(--emma-ink-12)',
        }}
      />
      <span
        style={{
          fontFamily: 'var(--emma-font-mono)',
          fontSize: 9,
          color: 'var(--emma-ink-65)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </span>
      <span style={{ fontFamily: 'var(--emma-font-mono)', fontSize: 10, color: 'var(--emma-ink)' }}>
        {value}
      </span>
    </div>
  );
}
