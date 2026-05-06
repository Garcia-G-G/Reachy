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
    { href: base, label: t('tabOverview') },
    { href: `${base}/generate/image`, label: t('tabGenerate') },
    { href: `${base}/library`, label: t('tabLibrary') },
    { href: `${base}/identity`, label: t('tabIdentity') },
    { href: `${base}/archive`, label: t('tabArchive') },
  ];

  return (
    <nav className="border-b border-rule" aria-label="Project sections">
      <ul className="-mb-px flex flex-wrap gap-8">
        {tabs.map((tab) => {
          const isActive = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
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
