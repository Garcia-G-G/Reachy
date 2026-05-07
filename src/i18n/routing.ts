import { defineRouting } from 'next-intl/routing';

/**
 * Single source of truth for next-intl routing. Both `src/i18n/request.ts`
 * (server-side translation loading) and `src/proxy.ts` (locale detection +
 * URL rewriting) consume it from here.
 *
 * locales         — supported language codes. ES is primary (Reachy's audience
 *                   is Hispanic indie hackers); EN is the secondary toggle.
 * defaultLocale   — the locale used when no preference can be inferred from
 *                   Accept-Language or the cookie.
 * localePrefix    — 'as-needed' keeps the default locale at `/` (clean URL)
 *                   and prefixes only the non-default locale (`/en/...`).
 *                   Pattern recommended by next-intl 4.x routing docs.
 *                   https://next-intl.dev/docs/routing/configuration
 * localeCookie    — set NEXT_LOCALE so the user's manual choice survives.
 */
export const routing = defineRouting({
  locales: ['es', 'en'] as const,
  defaultLocale: 'es',
  localePrefix: 'as-needed',
  localeCookie: { name: 'NEXT_LOCALE' },
});

export type Locale = (typeof routing.locales)[number];
