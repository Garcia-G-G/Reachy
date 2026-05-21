import 'server-only';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { asset } from '@/server/db/schema/assets';
import { generation } from '@/server/db/schema/generations';
import type { EmmaToolContext } from '../../context';

/**
 * Shared helper for edit-copilot tools (Phase 08c).
 *
 * Resolves `ctx.focusedGenerationId` to a concrete (generationId,
 * assetId) pair the existing server actions need. We always pick
 * the FIRST asset by createdAt — for multi-variant generations the
 * user can still use the manual sidebar buttons, which carry the
 * per-thumb `selected.id`. Optimising for the common single-variant
 * case keeps the chat surface simple.
 */
export interface FocusedTarget {
  generationId: string;
  assetId: string;
  format: string | null;
}

export async function loadFocusedTarget(
  ctx: EmmaToolContext,
): Promise<{ ok: true; data: FocusedTarget } | { ok: false; error: string }> {
  if (!ctx.focusedGenerationId) {
    return { ok: false, error: 'no focused generation — open an asset in the editor first' };
  }
  const [gen] = await db
    .select()
    .from(generation)
    .where(eq(generation.id, ctx.focusedGenerationId))
    .limit(1);
  if (!gen) return { ok: false, error: 'focused generation not found' };
  if (gen.projectId !== ctx.projectId) {
    return { ok: false, error: 'focused generation belongs to a different project' };
  }
  const [first] = await db
    .select({ id: asset.id })
    .from(asset)
    .where(eq(asset.generationId, gen.id))
    .orderBy(asc(asset.createdAt))
    .limit(1);
  if (!first) return { ok: false, error: 'focused generation has no rendered asset yet' };
  return {
    ok: true,
    data: { generationId: gen.id, assetId: first.id, format: gen.format },
  };
}
