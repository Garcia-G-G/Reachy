import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { type Locale, routing } from '@/i18n/routing';

/**
 * Public-landing masthead. 3-column grid (matches docs/design-editorial.html):
 * volume label · brand · nav + locale switcher. The active locale is bold;
 * the alternate links to its own URL prefix.
 */
export function LandingMasthead() {
  const t = useTranslations('Landing.masthead');
  const locale = useLocale() as Locale;

  return (
    <header className="border-b border-ink">
      <div className="mx-auto grid max-w-[1200px] grid-cols-1 items-center gap-3 px-6 py-4 md:grid-cols-[1fr_auto_1fr] md:gap-6 md:px-10">
        <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-2 md:text-left text-center">
          {t('volume')}
        </div>
        <div
          className="display text-center font-semibold"
          style={{
            fontFamily: 'var(--font-fraunces), Georgia, serif',
            fontSize: 28,
            letterSpacing: '-0.02em',
            lineHeight: 1,
          }}
        >
          Reachy
        </div>
        <nav className="flex flex-wrap items-center justify-center gap-4 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-2 md:justify-end md:gap-6">
          <a href="#index" className="transition-colors hover:text-accent">
            {t('navProduct')}
          </a>
          <a href="#spread" className="transition-colors hover:text-accent">
            {t('navSubscription')}
          </a>
          <Link href="/login" className="transition-colors hover:text-accent">
            {t('navSignIn')} →
          </Link>
          <span aria-hidden="true" className="text-rule">
            ·
          </span>
          <LocaleSwitcher current={locale} />
        </nav>
      </div>
    </header>
  );
}

function LocaleSwitcher({ current }: { current: Locale }) {
  const t = useTranslations('Landing.masthead');

  return (
    <span className="flex items-center gap-2">
      {routing.locales.map((l, i) => {
        const isActive = l === current;
        // With localePrefix:'as-needed', the default locale lives at `/` and
        // the others at `/[locale]`. Switching always lands on the homepage.
        const href = l === routing.defaultLocale ? '/' : `/${l}`;
        const label = l === 'es' ? t('switcherEs') : t('switcherEn');
        return (
          <span key={l} className="flex items-center gap-2">
            {i > 0 && (
              <span aria-hidden="true" className="text-rule">
                ·
              </span>
            )}
            {isActive ? (
              <span className="text-ink" aria-current="true">
                {label}
              </span>
            ) : (
              <Link href={href} hrefLang={l} className="transition-colors hover:text-accent">
                {label}
              </Link>
            )}
          </span>
        );
      })}
    </span>
  );
}
