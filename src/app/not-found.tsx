import Link from 'next/link';
import { MonoEyebrow } from '@/components/editorial';

// Global 404 — bare-bones editorial, no provider deps so it survives even
// when something deeper crashed.
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-[720px] flex-col items-start justify-center gap-8 px-8 py-24">
      <MonoEyebrow as="div">№ 404 — Page out of print</MonoEyebrow>
      <h1 className="display" style={{ fontSize: 'clamp(56px, 9vw, 128px)', lineHeight: 0.94 }}>
        Not in this <span className="it">edition</span>.
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
        The page you were looking for does not exist, or it was archived. Head back to the cover and
        try again.
      </p>
      <Link href="/" className="btn-ink">
        ← Back to cover
      </Link>
    </main>
  );
}
