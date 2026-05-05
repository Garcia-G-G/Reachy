import type { Metadata } from 'next';
import { MonoEyebrow } from '@/components/editorial';
import { requireSession } from '@/server/getSession';

export const metadata: Metadata = {
  title: 'Editor’s desk',
};

export default async function AppHomePage() {
  const session = await requireSession();
  const email = session.user.email;
  const name = session.user.name?.trim();
  const greetingName = name && name.length > 0 ? name : email;

  return (
    <div className="mx-auto max-w-[860px]">
      <MonoEyebrow as="div">№ 01 — Mesa de edición</MonoEyebrow>

      <h1
        className="display mt-10"
        style={{ fontSize: 'clamp(48px, 7vw, 96px)', lineHeight: 0.96 }}
      >
        Welcome, <em className="it text-accent">{greetingName}</em>.
      </h1>

      <p
        className="mt-10 max-w-[44ch] text-ink-2"
        style={{
          fontFamily: 'var(--font-fraunces), Georgia, serif',
          fontSize: 21,
          fontWeight: 300,
          lineHeight: 1.45,
        }}
      >
        This is your editor’s desk — empty for now. Phase 03 will give you cabeceras, brand
        identidad, and your first edición.
      </p>

      <hr className="rule-thin mt-16" />

      <dl className="mt-10 grid grid-cols-1 gap-8 text-sm leading-relaxed md:grid-cols-3">
        <div>
          <dt className="mono-eyebrow text-ink-3">Email</dt>
          <dd className="mt-2 font-mono text-ink">{email}</dd>
        </div>
        <div>
          <dt className="mono-eyebrow text-ink-3">Headers</dt>
          <dd className="mt-2 text-ink-2">0 created</dd>
        </div>
        <div>
          <dt className="mono-eyebrow text-ink-3">Editions</dt>
          <dd className="mt-2 text-ink-2">0 in archive</dd>
        </div>
      </dl>
    </div>
  );
}
