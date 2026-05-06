'use client';

import { useEffect } from 'react';
import { MonoEyebrow } from '@/components/editorial';

// (app) error boundary — must be a Client Component per Next 16. Receives
// `reset` to retry the failed segment. We log to console so the upstream
// error reporter (when wired) can pick it up.
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[reachy:error-boundary]', error);
  }, [error]);

  return (
    <main className="mx-auto flex max-w-[720px] flex-col items-start gap-8 p-12">
      <MonoEyebrow as="div">— Something is off</MonoEyebrow>
      <h1 className="display" style={{ fontSize: 'clamp(40px, 5vw, 64px)', lineHeight: 1 }}>
        Edition <span className="it">interrupted</span>.
      </h1>
      <p
        className="text-ink-2"
        style={{
          fontFamily: 'var(--font-fraunces), Georgia, serif',
          fontSize: 18,
          fontWeight: 300,
          lineHeight: 1.5,
        }}
      >
        Something went wrong while loading this page. Try again — if it keeps failing, the dev
        terminal has more detail.
      </p>
      {error.digest && <p className="mono-eyebrow text-ink-3">Reference: {error.digest}</p>}
      <button type="button" onClick={reset} className="btn-ink">
        ↻ Try again
      </button>
    </main>
  );
}
