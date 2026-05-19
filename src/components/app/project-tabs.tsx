'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

interface ProjectTabsProps {
  slug: string;
}

export function ProjectTabs({ slug }: ProjectTabsProps) {
  const t = useTranslations('Projects');
  const pathname = usePathname();
  const base = `/app/projects/${slug}`;

  const tabs = [
    { href: base, label: t('tabOverview'), match: base },
    // Emma — per-project chat co-pilot (Phase 07). Name "Emma" is the
    // product brand of the chat experience; never localized.
    { href: `${base}/chat`, label: 'Emma', match: `${base}/chat` },
    { href: `${base}/generate/image`, label: t('tabGenerate'), match: `${base}/generate` },
    { href: `${base}/library`, label: t('tabLibrary'), match: `${base}/library` },
    { href: `${base}/identity`, label: t('tabIdentity'), match: `${base}/identity` },
    { href: `${base}/archive`, label: t('tabArchive'), match: `${base}/archive` },
  ];

  return (
    <nav className="border-b border-rule" aria-label="Project sections">
      <ul className="-mb-px flex flex-wrap gap-8">
        {tabs.map((tab) => {
          // Overview tab: only match exact base path. Other tabs: match
          // their section root (e.g. /generate matches /generate/image AND /generate/copy).
          const isActive =
            tab.match === base
              ? pathname === base
              : pathname === tab.match || pathname.startsWith(`${tab.match}/`);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={isActive ? 'page' : undefined}
                className={`mono-eyebrow inline-block border-b-2 pb-3 transition-colors ${
                  isActive ? 'border-ink text-ink' : 'border-transparent text-ink-3 hover:text-ink'
                }`}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
