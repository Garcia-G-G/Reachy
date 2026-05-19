import 'server-only';
import { tool } from 'ai';
import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { TOOL_DESCRIPTIONS } from '@/server/config/chatToolDescriptions';
import { db } from '@/server/db/client';
import { asset } from '@/server/db/schema/assets';
import { generation } from '@/server/db/schema/generations';
import type { EmmaToolContext } from '../context';

/**
 * searchAssets — keyword search over the project's prior assets.
 * Useful when the user references prior work: "the LinkedIn post we
 * made last week", "the editorial-collage hero".
 *
 * We search across generation.prompt + generation.params (jsonb cast
 * to text for the ilike). Keyword-only — vector search would be nicer
 * but is out of scope for Phase 07 (no embeddings infra yet).
 */
export function createSearchAssetsTool(ctx: EmmaToolContext) {
  return tool({
    description: TOOL_DESCRIPTIONS.searchAssets,
    inputSchema: z.object({
      query: z.string().min(1).max(200),
      kind: z.enum(['image', 'copy', 'video']).optional(),
      limit: z.number().int().min(1).max(20).default(8),
    }),
    execute: async (input) => {
      const conditions = [eq(generation.projectId, ctx.projectId), eq(generation.status, 'done')];
      if (input.kind) conditions.push(eq(generation.type, input.kind));

      const ilikeQuery = `%${input.query}%`;
      const rows = await db
        .select({
          generationId: generation.id,
          type: generation.type,
          format: generation.format,
          prompt: generation.prompt,
          params: generation.params,
          createdAt: generation.createdAt,
          costCents: generation.costCents,
        })
        .from(generation)
        .where(
          and(
            ...conditions,
            or(
              ilike(generation.prompt, ilikeQuery),
              sql`${generation.params}::text ILIKE ${ilikeQuery}`,
            ),
          ),
        )
        .orderBy(desc(generation.createdAt))
        .limit(input.limit);

      // Hydrate first asset URL for each generation so Emma can
      // reference them inline.
      const enriched = await Promise.all(
        rows.map(async (r) => {
          const [first] = await db
            .select({ publicUrl: asset.publicUrl })
            .from(asset)
            .where(eq(asset.generationId, r.generationId))
            .limit(1);
          const params = (r.params ?? {}) as Record<string, unknown>;
          const idea = typeof params.idea === 'string' ? params.idea : '';
          return {
            generationId: r.generationId,
            kind: r.type,
            format: r.format,
            idea: idea.slice(0, 200),
            assetUrl: first?.publicUrl ?? null,
            createdAt: r.createdAt,
            costCents: r.costCents ?? 0,
          };
        }),
      );
      return { results: enriched };
    },
  });
}
