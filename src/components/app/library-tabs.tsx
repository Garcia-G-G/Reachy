'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';

interface LibraryTabsProps {
  slug: string;
  active: 'image' | 'copy';
}

export function LibraryTabs({ slug, active }: LibraryTabsProps) {
  const t = useTranslations('Library');
  const base = `/app/projects/${slug}/library`;

  const items: Array<{ href: string; label: string; key: 'image' | 'copy' }> = [
    { href: base, label: t('tabImage'), key: 'image' },
    { href: `${base}?tab=copy`, label: t('tabCopy'), key: 'copy' },
  ];

  return (
    <nav aria-label="Archive type" className="flex gap-6">
      {items.map((item) => {
        const isActive = item.key === active;
        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={isActive ? 'page' : undefined}
            className={`mono-eyebrow border-b pb-2 transition-colors ${
              isActive ? 'border-ink text-ink' : 'border-transparent text-ink-3 hover:text-ink'
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
