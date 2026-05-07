import type { MetadataRoute } from 'next';
import { env } from '@/env';

export default function robots(): MetadataRoute.Robots {
  const base = env.BETTER_AUTH_URL.replace(/\/$/, '');
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Block authenticated/private routes from being crawled.
        disallow: ['/app/', '/api/', '/login'],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
