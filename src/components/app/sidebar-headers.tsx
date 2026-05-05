'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

interface SidebarProject {
  id: string;
  slug: string;
  name: string;
}

interface SidebarHeadersProps {
  projects: SidebarProject[];
}

export function SidebarHeaders({ projects }: SidebarHeadersProps) {
  const t = useTranslations('AppShell');
  const pathname = usePathname();

  return (
    <section>
      <div className="flex items-center justify-between">
        <span className="mono-eyebrow">{t('headersSection')}</span>
        <Link
          href="/app/projects/new"
          className="mono-eyebrow text-ink-3 transition-colors hover:text-accent"
        >
          {t('newHeader')}
        </Link>
      </div>

      {projects.length === 0 ? (
        <p className="mt-4 text-sm leading-snug text-ink-3 italic">{t('noHeaders')}</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {projects.map((p, idx) => {
            const href = `/app/projects/${p.slug}`;
            const isActive = pathname === href || pathname.startsWith(`${href}/`);
            const num = String(idx + 1).padStart(2, '0');
            return (
              <li key={p.id}>
                <Link
                  href={href}
                  className={`flex items-baseline gap-3 text-sm transition-colors ${
                    isActive ? 'text-accent' : 'text-ink-2 hover:text-ink'
                  }`}
                  style={{
                    fontFamily: 'var(--font-fraunces), Georgia, serif',
                    fontSize: 14,
                  }}
                >
                  <span className="font-mono text-[10px] tracking-widest text-ink-3">{num}</span>
                  <span className="truncate">{p.name}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
