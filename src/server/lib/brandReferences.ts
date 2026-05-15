import 'server-only';
import { and, asc, desc, eq } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { asset } from '@/server/db/schema/assets';
import { brandKit } from '@/server/db/schema/brandKits';
import { generation } from '@/server/db/schema/generations';

/**
 * Brand reference image loader for the worker's images.edit calls.
 *
 * Lives in /server/lib/ (no 'use server' directive) so the worker can
 * import it without dragging in next/navigation. The user-facing action
 * version in src/server/actions/images.ts is a thin wrapper around this
 * for server-component usage.
 *
 * Returns up to 4 PNG buffers in priority order:
 *   1. brandKit.logoUrl (when set).
 *   2. Most recent SUCCESSFUL image generation's first asset.
 * Empty array when nothing usable — the worker tolerates that.
 *
 * Skips ownership checks because (a) the worker runs server-side under
 * Reachy's own credentials, (b) the worker already knows the projectId
 * is valid (the action enqueued it). Don't expose this directly to
 * untrusted callers.
 */
export async function getBrandReferenceImages(
  projectId: string,
): Promise<Buffer[]> {
  const [kit] = await db
    .select()
    .from(brandKit)
    .where(eq(brandKit.projectId, projectId))
    .limit(1);

  const buffers: Buffer[] = [];

  if (kit?.logoUrl) {
    try {
      const res = await fetch(kit.logoUrl);
      if (res.ok) {
        buffers.push(Buffer.from(await res.arrayBuffer()));
      }
    } catch {
      // ignore — logo fetch failures are non-fatal.
    }
  }

  const [recentDone] = await db
    .select({ id: generation.id })
    .from(generation)
    .where(
      and(
        eq(generation.projectId, projectId),
        eq(generation.type, 'image'),
        eq(generation.status, 'done'),
      ),
    )
    .orderBy(desc(generation.createdAt))
    .limit(1);
  if (recentDone) {
    const [recentAsset] = await db
      .select({ publicUrl: asset.publicUrl })
      .from(asset)
      .where(eq(asset.generationId, recentDone.id))
      .orderBy(asc(asset.createdAt))
      .limit(1);
    if (recentAsset?.publicUrl) {
      try {
        const res = await fetch(recentAsset.publicUrl);
        if (res.ok) {
          buffers.push(Buffer.from(await res.arrayBuffer()));
        }
      } catch {
        // ignore
      }
    }
  }

  return buffers;
}
