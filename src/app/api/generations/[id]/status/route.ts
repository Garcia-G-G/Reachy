import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { ReelCostBreakdown } from '@/lib/reel-cost';
import { db } from '@/server/db/client';
import { asset } from '@/server/db/schema/assets';
import { generation } from '@/server/db/schema/generations';
import { project } from '@/server/db/schema/projects';
import { getSession } from '@/server/getSession';
import { rateLimit } from '@/server/lib/rateLimit';

interface RouteContext {
  params: Promise<{ id: string }>;
}

const idSchema = z.string().uuid();

export async function GET(_req: Request, { params }: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  // Per-user cap so a logged-in client running setInterval(50) can't hammer
  // the DB. The form polls every 2-6s; 60/min/user covers ~10 simultaneous
  // tabs polling at 1/sec with margin.
  const limit = await rateLimit({
    key: session.user.id,
    bucket: 'gen-status',
    max: 60,
    windowSec: 60,
  });
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'rate-limited' },
      {
        status: 429,
        headers: {
          'Retry-After': String(limit.resetSec),
          'X-RateLimit-Remaining': '0',
        },
      },
    );
  }

  const { id: rawId } = await params;
  // Reject non-UUID ids before they hit the DB — Postgres would otherwise
  // raise an opaque "invalid input syntax for type uuid" 500.
  const parsed = idSchema.safeParse(rawId);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid-id' }, { status: 400 });
  }
  const id = parsed.data;

  const [gen] = await db
    .select({
      id: generation.id,
      status: generation.status,
      errorMessage: generation.errorMessage,
      costCents: generation.costCents,
      finishedAt: generation.finishedAt,
      projectId: generation.projectId,
      params: generation.params,
    })
    .from(generation)
    .innerJoin(project, eq(project.id, generation.projectId))
    .where(and(eq(generation.id, id), eq(project.userId, session.user.id)))
    .limit(1);

  if (!gen) {
    return NextResponse.json({ error: 'not-found' }, { status: 404 });
  }

  const assets = await db
    .select({
      id: asset.id,
      width: asset.width,
      height: asset.height,
      publicUrl: asset.publicUrl,
      storageKey: asset.storageKey,
      format: asset.format,
    })
    .from(asset)
    .where(eq(asset.generationId, gen.id));

  // Per-component cost attribution (e.g. Sora $6 + TTS $0.04 + compose $0.01).
  // The worker writes this into generation.params on success — see videoWorker.ts.
  const genParams = (gen.params ?? {}) as {
    costBreakdown?: ReelCostBreakdown;
    composeState?: {
      layoutId?: string;
      // Exploration: Record<string, string|undefined>
      // Sequence:    Array<Record<string, string|undefined>>
      copy?: Record<string, string | undefined> | Array<Record<string, string | undefined>>;
      mode?: 'exploration' | 'sequence';
    };
  };
  const costBreakdown = genParams.costBreakdown ?? null;
  // composeState is image-pipeline-only — drives the Edit Copy modal's
  // pre-population (so users edit instead of rewrite the headline) and
  // tells the UI which layout this asset belongs to.
  // For sequence rows, copy is an array (one entry per frame) and mode
  // is 'sequence'; the form's modal picks the right index based on which
  // thumbnail the user clicked Edit on.
  const composeState = genParams.composeState
    ? {
        layoutId: genParams.composeState.layoutId ?? null,
        mode: genParams.composeState.mode ?? 'exploration',
        copy: genParams.composeState.copy ?? {},
      }
    : null;

  return NextResponse.json(
    {
      id: gen.id,
      status: gen.status,
      errorMessage: gen.errorMessage,
      costCents: gen.costCents,
      costBreakdown,
      composeState,
      finishedAt: gen.finishedAt,
      assets,
    },
    {
      headers: { 'Cache-Control': 'no-store, must-revalidate' },
    },
  );
}
