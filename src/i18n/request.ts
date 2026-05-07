import 'server-only';
import { cookies, headers } from 'next/headers';
import { hasLocale } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';
import { type Locale, routing } from './routing';

const LOCALE_COOKIE = 'NEXT_LOCALE';

function pickFromAcceptLanguage(header: string | null): Locale | undefined {
  if (!header) return undefined;
  const tags = header
    .split(',')
    .map((t) => t.split(';')[0]?.trim().toLowerCase())
    .filter((t): t is string => Boolean(t));
  for (const tag of tags) {
    const base = tag.split('-')[0];
    if (hasLocale(routing.locales, base)) return base as Locale;
  }
  return undefined;
}

export default getRequestConfig(async ({ requestLocale }) => {
  // requestLocale comes from next-intl's middleware. For routes intentionally
  // outside the middleware (e.g. /login — see src/proxy.ts) it is undefined,
  // so we read the NEXT_LOCALE cookie and Accept-Language manually before
  // falling back to the default. Without this, /login always rendered in
  // the default locale regardless of the user's preference.
  const requested = await requestLocale;
  let locale: Locale;
  if (hasLocale(routing.locales, requested)) {
    locale = requested;
  } else {
    const cookieLocale = (await cookies()).get(LOCALE_COOKIE)?.value;
    if (hasLocale(routing.locales, cookieLocale)) {
      locale = cookieLocale;
    } else {
      const accept = (await headers()).get('accept-language');
      locale = pickFromAcceptLanguage(accept) ?? routing.defaultLocale;
    }
  }

  const messages = (await import(`../../messages/${locale}.json`)).default;
  return { locale, messages };
});
