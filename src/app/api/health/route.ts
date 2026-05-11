import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export function GET() {
  return NextResponse.json(
    {
      ok: true,
      service: 'reachy-web',
      ts: new Date().toISOString(),
      sha: process.env.GIT_SHA ?? null,
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}
