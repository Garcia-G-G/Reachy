import { redirect } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type ReactNode, Suspense } from 'react';
import { EmmaWidget } from '@/components/app/emma-widget';
import { SidebarHeaders } from '@/components/app/sidebar-headers';
import { SignOutButton } from '@/components/app/sign-out-button';
import { MonoEyebrow } from '@/components/editorial';
import { listProjectsForCurrentUser } from '@/server/actions/projects';
import { getSession } from '@/server/getSession';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login');

  const projects = await listProjectsForCurrentUser();
  const sidebarProjects = projects.map((p) => ({ id: p.id, slug: p.slug, name: p.name }));

  return (
    <AppShell email={session.user.email} projects={sidebarProjects}>
      {children}
    </AppShell>
  );
}

function AppShell({
  email,
  projects,
  children,
}: {
  email: string;
  projects: { id: string; slug: string; name: string }[];
  children: ReactNode;
}) {
  const t = useTranslations('AppShell');

  return (
    <div className="grid min-h-screen grid-cols-1 bg-paper md:grid-cols-[260px_1fr]">
      {/* Mobile masthead */}
      <header className="flex items-center justify-between border-b border-ink px-6 py-4 md:hidden">
        <span className="display text-[20px] leading-none">{t('brand')}</span>
        <Suspense fallback={null}>
          <SignOutButton />
        </Suspense>
      </header>

      <aside className="hidden border-r border-ink md:flex md:flex-col md:justify-between">
        <div className="space-y-12 px-8 pt-10">
          <div>
            <span className="display text-[24px] leading-none">{t('brand')}</span>
            <p className="mono-eyebrow mt-2 text-ink-3">{t('volume')}</p>
          </div>

          <SidebarHeaders projects={projects} />

          <section>
            <MonoEyebrow as="div">{t('thisEditionSection')}</MonoEyebrow>
            <ul className="mt-4 space-y-3 text-sm leading-snug text-ink-2">
              <li className="text-ink-3 italic">{t('noEdition')}</li>
            </ul>
          </section>
        </div>

        <div className="space-y-4 border-t border-rule px-8 py-6">
          <div className="font-mono text-[11px] text-ink-2 break-all">{email}</div>
          <Suspense fallback={null}>
            <SignOutButton />
          </Suspense>
        </div>
      </aside>

      <main className="px-6 py-12 md:px-12 md:py-16">{children}</main>

      {/* Phase 07h — global floating concierge. Mounted at the
          authenticated layout so it follows Garcia through every
          /app/* route. Hidden on /login + public via its own
          isEmmaExcludedRoute check. */}
      <EmmaWidget />
    </div>
  );
}
