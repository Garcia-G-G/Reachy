import 'server-only';
import { tool } from 'ai';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { TOOL_DESCRIPTIONS } from '@/server/config/chatToolDescriptions';
import { db } from '@/server/db/client';
import { brandKit } from '@/server/db/schema/brandKits';
import type { EmmaToolContext } from '../context';

/**
 * extendBrandKit — mutate a brand kit field after the user confirmed
 * in chat. Emma's persona REQUIRES her to get a yes/no before calling
 * this; we trust the agent loop to enforce that conversationally.
 *
 * Scope: limited to the high-signal fields a user would update via
 * chat. The full brand-kit editor still lives at /identity for
 * structural edits.
 */
export function createExtendBrandKitTool(ctx: EmmaToolContext) {
  return tool({
    description: TOOL_DESCRIPTIONS.extendBrandKit,
    inputSchema: z.object({
      field: z.enum(['logoKey', 'palette', 'visualStyle', 'voiceTone', 'allowsHumans']),
      value: z.string().min(1).max(400).describe(TOOL_DESCRIPTIONS.extendBrandKitValueHelp),
    }),
    execute: async (input) => {
      const patch: Partial<typeof brandKit.$inferInsert> = {};

      if (input.field === 'logoKey') {
        const existing = (ctx.brandKit.referenceAssetKeys ?? []) as string[];
        if (existing.includes(input.value)) {
          return { ok: false, error: 'this r2Key is already in the brand kit references' };
        }
        patch.referenceAssetKeys = [input.value, ...existing].slice(0, 16);
      } else if (input.field === 'palette') {
        try {
          const parsed = JSON.parse(input.value) as {
            ink?: string;
            paper?: string;
            accent?: string;
          };
          const hexRe = /^#[0-9a-fA-F]{6}$/;
          if (parsed.ink && hexRe.test(parsed.ink)) patch.primaryColor = parsed.ink;
          if (parsed.paper && hexRe.test(parsed.paper)) patch.bgColor = parsed.paper;
          if (parsed.accent && hexRe.test(parsed.accent)) patch.accentColor = parsed.accent;
          if (Object.keys(patch).length === 0) {
            return { ok: false, error: 'no valid hex values in palette payload' };
          }
        } catch {
          return { ok: false, error: 'palette value must be JSON {ink,paper,accent}' };
        }
      } else if (input.field === 'visualStyle') {
        // Cast through unknown — the column is BrandVisualStyle but the
        // tool input is a free string. Worst case, downstream code
        // canonicalizes via canonicalizeVisualStyleKey when reading.
        patch.visualStyle = input.value as typeof patch.visualStyle;
      } else if (input.field === 'voiceTone') {
        const current = ctx.brandKit.voice ?? { tone: '', doSay: [], dontSay: [] };
        patch.voice = { ...current, tone: input.value.slice(0, 280) };
      } else if (input.field === 'allowsHumans') {
        patch.allowsHumans = input.value.toLowerCase() === 'true';
      }

      const [updated] = await db
        .update(brandKit)
        .set(patch)
        .where(eq(brandKit.id, ctx.brandKit.id))
        .returning();
      if (!updated) return { ok: false, error: 'brand kit update returned no row' };

      return {
        ok: true,
        field: input.field,
        applied: patch,
        message: `brand kit updated — ${input.field}`,
      };
    },
  });
}
