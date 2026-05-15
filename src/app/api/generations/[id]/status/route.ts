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
    // Post-pivot (May 2026): the AI now renders typography directly,
    // so the prior overlay-pipeline `composeState` is replaced by
    // `aiPromptState` which captures the per-variant prompt + copy.
    // Old rows still carry `composeState`; the editor falls back to
    // a read-only banner for those.
    aiPromptState?: {
      layoutId?: string;
      copy?: Record<string, string | undefined> | Array<Record<string, string | undefined>>;
      mode?: 'exploration' | 'sequence' | 'multi-strategy';
      brandColors?: { ink: string; paper: string; accent: string };
      variantAxes?: Array<{ layoutId?: string; label?: string }>;
    };
    composeState?: {
      layoutId?: string;
      copy?: Record<string, string | undefined> | Array<Record<string, string | undefined>>;
      mode?: 'exploration' | 'sequence' | 'multi-strategy';
      colors?: { ink: string; paper: string; accent: string };
      variantAxes?: Array<{ layoutId?: string; label?: string }>;
    };
  };
  const costBreakdown = genParams.costBreakdown ?? null;

  // Prefer aiPromptState (post-pivot). Fall back to composeState (pre-
  // pivot legacy rows) and expose it under the same `composeState` key
  // so existing UI consumers keep working. The editor checks the
  // `legacy` flag to decide whether to allow editing.
  const stateSource = genParams.aiPromptState ?? genParams.composeState ?? null;
  const composeState = stateSource
    ? {
        layoutId: stateSource.layoutId ?? null,
        mode: stateSource.mode ?? 'exploration',
        copy: stateSource.copy ?? {},
        colors: genParams.aiPromptState?.brandColors ?? genParams.composeState?.colors ?? undefined,
        variantAxes: stateSource.variantAxes ?? undefined,
        legacy: !genParams.aiPromptState && Boolean(genParams.composeState),
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
