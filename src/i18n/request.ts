import 'server-only';
import { getRequestConfig } from 'next-intl/server';

const SUPPORTED_LOCALES = ['en'] as const;
type Locale = (typeof SUPPORTED_LOCALES)[number];
const DEFAULT_LOCALE: Locale = 'en';

export default getRequestConfig(async () => {
  const locale: Locale = DEFAULT_LOCALE;
  const messages = (await import(`../../messages/${locale}.json`)).default;
  return { locale, messages };
});
