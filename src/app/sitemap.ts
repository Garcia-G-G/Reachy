import type { MetadataRoute } from 'next';
import { env } from '@/env';
import { routing } from '@/i18n/routing';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = env.BETTER_AUTH_URL.replace(/\/$/, '');
  const lastModified = new Date();

  // One entry per supported locale. Default-locale URL is `/`; others get
  // their prefix per `localePrefix: 'as-needed'`.
  return routing.locales.map((locale) => ({
    url: locale === routing.defaultLocale ? `${base}/` : `${base}/${locale}`,
    lastModified,
    changeFrequency: 'weekly',
    priority: locale === routing.defaultLocale ? 1.0 : 0.8,
    alternates: {
      languages: Object.fromEntries(
        routing.locales.map((l) => [l, l === routing.defaultLocale ? `${base}/` : `${base}/${l}`]),
      ),
    },
  }));
}
