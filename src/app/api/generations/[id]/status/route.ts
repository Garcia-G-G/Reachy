import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/server/db/client';
import { asset } from '@/server/db/schema/assets';
import { generation } from '@/server/db/schema/generations';
import { project } from '@/server/db/schema/projects';
import { getSession } from '@/server/getSession';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, { params }: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const { id } = await params;

  const [gen] = await db
    .select({
      id: generation.id,
      status: generation.status,
      errorMessage: generation.errorMessage,
      costCents: generation.costCents,
      finishedAt: generation.finishedAt,
      projectId: generation.projectId,
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

  return NextResponse.json(
    {
      id: gen.id,
      status: gen.status,
      errorMessage: gen.errorMessage,
      costCents: gen.costCents,
      finishedAt: gen.finishedAt,
      assets,
    },
    {
      headers: { 'Cache-Control': 'no-store, must-revalidate' },
    },
  );
}
