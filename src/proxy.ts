import { getSessionCookie } from 'better-auth/cookies';
import { type NextRequest, NextResponse } from 'next/server';
import createIntlMiddleware from 'next-intl/middleware';
import { routing } from '@/i18n/routing';

const intlMiddleware = createIntlMiddleware(routing);

/**
 * Composed proxy: locale detection (next-intl) for marketing/public routes +
 * optimistic auth check for `/app/:path*`. Real auth validation still happens
 * in app/app/layout.tsx (getSession()) and inside every Server Action.
 *
 * Order matters:
 *  - For `/app/*` we run the auth check FIRST. If unauth'd, redirect to
 *    /login?next=... (no locale rewrite needed — login is auth-gated UI).
 *  - For everything else we let next-intl handle locale prefix / cookie /
 *    Accept-Language detection. With `localePrefix: 'as-needed'`, ES is at `/`
 *    and EN is at `/en`. Static assets, /api, /_next are excluded by matcher.
 */
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith('/app')) {
    const sessionCookie = getSessionCookie(req);
    if (!sessionCookie) {
      const url = new URL('/login', req.url);
      url.searchParams.set('next', pathname + req.nextUrl.search);
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // Public/marketing surface — let next-intl handle locale routing.
  return intlMiddleware(req);
}

export const config = {
  // Run on everything except API routes, Next assets, and any file with an
  // extension (favicon.ico, .svg, etc.). next-intl docs recommend this exact
  // matcher: https://next-intl.dev/docs/routing/middleware
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
