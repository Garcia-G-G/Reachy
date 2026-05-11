'use client';

import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from 'react';

interface RevealProps {
  children: ReactNode;
  delay?: number;
  as?: 'div' | 'section' | 'article' | 'li';
  className?: string;
  style?: CSSProperties;
}

/**
 * One-shot scroll reveal. Adds `is-visible` once the element enters the
 * viewport so CSS can run an entrance animation. Respects
 * `prefers-reduced-motion` by short-circuiting straight to visible.
 */
export function Reveal({
  children,
  delay = 0,
  as: Tag = 'div',
  className = '',
  style,
}: RevealProps) {
  const ref = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setVisible(true);
      return;
    }
    const node = ref.current;
    if (!node) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setVisible(true);
            obs.disconnect();
            break;
          }
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, []);

  return (
    <Tag
      // biome-ignore lint/suspicious/noExplicitAny: polymorphic ref
      ref={ref as any}
      className={`reveal ${visible ? 'is-visible' : ''} ${className}`.trim()}
      style={{ ...style, transitionDelay: `${delay}ms`, animationDelay: `${delay}ms` }}
    >
      {children}
    </Tag>
  );
}
