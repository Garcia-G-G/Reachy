import { getSessionCookie } from 'better-auth/cookies';
import { type NextRequest, NextResponse } from 'next/server';

// Proxy does an optimistic cookie-existence check only.
// Real auth validation happens in app/app/layout.tsx (getSession()) and inside
// every Server Action — see Next.js auth guide and better-auth docs.
export function proxy(req: NextRequest) {
  const sessionCookie = getSessionCookie(req);

  if (!sessionCookie) {
    const url = new URL('/login', req.url);
    const next = req.nextUrl.pathname + req.nextUrl.search;
    url.searchParams.set('next', next);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/app/:path*'],
};
