import 'server-only';
import { hasLocale } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';
import { type Locale, routing } from './routing';

export default getRequestConfig(async ({ requestLocale }) => {
  // requestLocale comes from next-intl's middleware (cookie / URL prefix /
  // Accept-Language). Fall back to the default if anything is off.
  const requested = await requestLocale;
  const locale: Locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

  const messages = (await import(`../../messages/${locale}.json`)).default;
  return { locale, messages };
});
