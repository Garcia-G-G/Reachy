import { type NextRequest, NextResponse } from 'next/server';
import { auth } from '@/server/auth';

export async function middleware(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });

  if (!session) {
    const url = new URL('/login', req.url);
    const next = req.nextUrl.pathname + req.nextUrl.search;
    url.searchParams.set('next', next);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  runtime: 'nodejs',
  matcher: ['/app/:path*'],
};
