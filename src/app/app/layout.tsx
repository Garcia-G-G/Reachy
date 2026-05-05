import { redirect } from 'next/navigation';
import { type ReactNode, Suspense } from 'react';
import { SignOutButton } from '@/components/app/sign-out-button';
import { MonoEyebrow } from '@/components/editorial';
import { getSession } from '@/server/getSession';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login');

  return (
    <div className="grid min-h-screen grid-cols-1 bg-paper md:grid-cols-[260px_1fr]">
      {/* Mobile masthead */}
      <header className="flex items-center justify-between border-b border-ink px-6 py-4 md:hidden">
        <span className="display text-[20px] leading-none">Reachy</span>
        <Suspense fallback={null}>
          <SignOutButton />
        </Suspense>
      </header>

      <aside className="hidden border-r border-ink md:flex md:flex-col md:justify-between">
        <div className="space-y-12 px-8 pt-10">
          <div>
            <span className="display text-[24px] leading-none">Reachy</span>
            <p className="mono-eyebrow mt-2 text-ink-3">Vol. 01 · No. 04 · 2026</p>
          </div>

          <section>
            <MonoEyebrow as="div">— Headers</MonoEyebrow>
            <ul className="mt-4 space-y-3 text-sm leading-snug text-ink-2">
              <li className="text-ink-3 italic">No headers yet — create your first cabecera.</li>
            </ul>
          </section>

          <section>
            <MonoEyebrow as="div">— This edition</MonoEyebrow>
            <ul className="mt-4 space-y-3 text-sm leading-snug text-ink-2">
              <li className="text-ink-3 italic">Nothing in flight.</li>
            </ul>
          </section>
        </div>

        <div className="space-y-4 border-t border-rule px-8 py-6">
          <div className="font-mono text-[11px] text-ink-2 break-all">{session.user.email}</div>
          <Suspense fallback={null}>
            <SignOutButton />
          </Suspense>
        </div>
      </aside>

      <main className="px-6 py-12 md:px-12 md:py-16">{children}</main>
    </div>
  );
}
