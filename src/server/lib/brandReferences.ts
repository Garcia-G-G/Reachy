import 'server-only';
import { and, asc, desc, eq } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { asset } from '@/server/db/schema/assets';
import { brandKit } from '@/server/db/schema/brandKits';
import { generation } from '@/server/db/schema/generations';

/**
 * In-process buffer cache for brand reference URLs. Used to avoid
 * re-downloading the same brand logo for every frame of a sequence
 * generation (4 frames = 4 redundant fetches before). TTL is short
 * (10 minutes) so brand kit edits propagate quickly; entries are
 * keyed by URL not project so editing the logo URL evicts cleanly.
 *
 * Map size is intentionally unbounded — at <50 entries per worker
 * process it stays inside Node's heap budget; eviction by TTL keeps
 * the long-running worker healthy without an LRU.
 */
interface CachedRef {
  buffer: Buffer;
  fetchedAt: number;
}
const REF_CACHE_TTL_MS = 10 * 60 * 1000;
const refCache = new Map<string, CachedRef>();

async function fetchAndCache(url: string): Promise<Buffer | null> {
  const cached = refCache.get(url);
  if (cached && Date.now() - cached.fetchedAt < REF_CACHE_TTL_MS) {
    return cached.buffer;
  }
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    refCache.set(url, { buffer: buf, fetchedAt: Date.now() });
    return buf;
  } catch {
    return null;
  }
}

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
export async function getBrandReferenceImages(projectId: string): Promise<Buffer[]> {
  const [kit] = await db.select().from(brandKit).where(eq(brandKit.projectId, projectId)).limit(1);

  const buffers: Buffer[] = [];

  if (kit?.logoUrl) {
    const buf = await fetchAndCache(kit.logoUrl);
    if (buf) buffers.push(buf);
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
      const buf = await fetchAndCache(recentAsset.publicUrl);
      if (buf) buffers.push(buf);
    }
  }

  return buffers;
}
