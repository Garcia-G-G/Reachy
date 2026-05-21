import { and, eq, isNull } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/server/db/client';
import { asset } from '@/server/db/schema/assets';
import { generation } from '@/server/db/schema/generations';
import { project } from '@/server/db/schema/projects';
import { getSession } from '@/server/getSession';

/**
 * Lazy detail fetch for the library lightbox — Phase 08.
 *
 * The library page renders 200 thumbnails at a time. Hydrating
 * generation params on every cell would burn page-load latency for
 * data that's only relevant when a user clicks "Vista grande" — so
 * the lightbox calls this endpoint on open and the listing payload
 * stays thin.
 *
 * Auth chain: asset → project → user. Returns the headline + layout
 * + palette + model + cost — enough to label the lightbox without
 * shipping the full generation row.
 */

interface RouteContext {
  params: Promise<{ assetId: string }>;
}

const assetIdSchema = z.string().uuid();

interface PromptStateLike {
  layoutId?: string;
  brandColors?: { ink?: string; paper?: string; accent?: string };
  copy?: { headline?: string } | Array<{ headline?: string }>;
}

function extractHeadline(state: PromptStateLike | undefined): string | null {
  if (!state) return null;
  const copy = state.copy;
  if (Array.isArray(copy)) {
    for (const slot of copy) {
      if (slot?.headline) return slot.headline;
    }
    return null;
  }
  return copy?.headline ?? null;
}

export async function GET(_req: Request, { params }: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  const { assetId: rawAssetId } = await params;
  const parsed = assetIdSchema.safeParse(rawAssetId);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid asset id' }, { status: 400 });
  }
  const assetId = parsed.data;

  // Walk asset → project → user for ownership. Generation row is
  // joined on the asset's generation_id when present.
  const [row] = await db
    .select({
      asset,
      generation,
    })
    .from(asset)
    .leftJoin(generation, eq(generation.id, asset.generationId))
    .innerJoin(
      project,
      and(
        eq(project.id, asset.projectId),
        eq(project.userId, session.user.id),
        isNull(project.archivedAt),
      ),
    )
    .where(eq(asset.id, assetId))
    .limit(1);
  if (!row) {
    return NextResponse.json({ error: 'not-found' }, { status: 404 });
  }

  const gen = row.generation;
  const promptState = (gen?.params ?? null) as
    | (PromptStateLike & { aiPromptState?: PromptStateLike })
    | null;
  const aiState = promptState?.aiPromptState ?? promptState ?? undefined;

  const headline = extractHeadline(aiState);
  const layoutId = aiState?.layoutId ?? null;
  const colors = aiState?.brandColors
    ? {
        ink: aiState.brandColors.ink ?? '#14110D',
        paper: aiState.brandColors.paper ?? '#F1EBDF',
        accent: aiState.brandColors.accent ?? '#B6481A',
      }
    : null;

  return NextResponse.json({
    detail: {
      headline,
      layoutId,
      colors,
      modelId: gen?.model ?? null,
      costCents: gen?.costCents ?? null,
    },
  });
}
