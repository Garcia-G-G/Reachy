'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

interface GenerateSubNavProps {
  slug: string;
}

export function GenerateSubNav({ slug }: GenerateSubNavProps) {
  const t = useTranslations('Generate');
  const pathname = usePathname();
  const base = `/app/projects/${slug}/generate`;

  const items = [
    { href: `${base}/image`, label: t('subNavImage') },
    { href: `${base}/copy`, label: t('subNavCopy') },
    { href: `${base}/reel`, label: t('subNavReel') },
  ];

  return (
    <nav aria-label="Generate type" className="flex gap-6">
      {items.map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
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
