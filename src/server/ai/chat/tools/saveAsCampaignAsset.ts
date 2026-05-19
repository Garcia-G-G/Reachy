import 'server-only';
import { tool } from 'ai';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { CHANNEL_TEMPLATES, type ChannelKey } from '@/server/config/channelTemplates';
import { TOOL_DESCRIPTIONS } from '@/server/config/chatToolDescriptions';
import { db } from '@/server/db/client';
import { campaignAsset } from '@/server/db/schema/campaignAssets';
import { campaign } from '@/server/db/schema/campaigns';
import { generation } from '@/server/db/schema/generations';
import type { EmmaToolContext } from '../context';

/**
 * saveAsCampaignAsset — promote a chat-generated asset to a real
 * campaign_asset row so the project library / gallery picks it up.
 *
 * Strategy: every project keeps a single "chat-saves" campaign that
 * Emma lazy-creates the first time she saves something. All chat
 * promotions land in this campaign so they cluster in the library
 * without polluting real campaigns.
 *
 * Channel arg is optional — only meaningful for copy assets.
 */
export function createSaveAsCampaignAssetTool(ctx: EmmaToolContext) {
  const channelKeys = Object.keys(CHANNEL_TEMPLATES) as ChannelKey[];
  return tool({
    description: TOOL_DESCRIPTIONS.saveAsCampaignAsset,
    inputSchema: z.object({
      generationId: z.string().uuid(),
      channel: z
        .enum(channelKeys as [ChannelKey, ...ChannelKey[]])
        .optional()
        .describe('Only meaningful for copy assets — names the channel template.'),
      briefSnapshot: z
        .string()
        .min(1)
        .max(1200)
        .describe('Short description of what this asset is for — surfaced in the library.'),
    }),
    execute: async (input) => {
      // Validate ownership by walking generation → project.
      const [gen] = await db
        .select({
          id: generation.id,
          projectId: generation.projectId,
          type: generation.type,
          costCents: generation.costCents,
        })
        .from(generation)
        .where(and(eq(generation.id, input.generationId), eq(generation.projectId, ctx.projectId)))
        .limit(1);
      if (!gen) return { error: 'generation not found (or owned by a different project)' };

      // Lazy-create the project's "chat-saves" campaign on first save.
      // The `campaign` table has no `name` column, so we mark the saves
      // container via `plan.source === 'emma-chat'` (jsonb is opaque to
      // the planner — it ignores anything it doesn't recognize).
      let [savesCampaign] = await db
        .select()
        .from(campaign)
        .where(
          and(
            eq(campaign.projectId, ctx.projectId),
            sql`${campaign.plan}->>'source' = 'emma-chat'`,
          ),
        )
        .limit(1);
      if (!savesCampaign) {
        const [created] = await db
          .insert(campaign)
          .values({
            projectId: ctx.projectId,
            status: 'done',
            brief: ctx.productBrief ?? null,
            // jsonb marker so the lookup above can find this row on
            // subsequent saves without scanning every campaign.
            plan: { source: 'emma-chat', label: 'Emma · chat saves' },
            costCentsActual: 0,
          })
          .returning();
        if (!created) return { error: 'failed to create the chat-saves campaign' };
        savesCampaign = created;
      }

      // Determine kind. generation.type is one of image/copy/reel.
      const kind = (gen.type ?? 'image') as 'image' | 'copy' | 'reel';
      const [row] = await db
        .insert(campaignAsset)
        .values({
          campaignId: savesCampaign.id,
          kind,
          channel: kind === 'copy' ? (input.channel ?? null) : null,
          generationId: gen.id,
          briefSnapshot: input.briefSnapshot,
          status: 'done',
          costCents: gen.costCents ?? 0,
        })
        .returning();
      if (!row) return { error: 'failed to insert campaign_asset row' };

      return {
        campaignId: savesCampaign.id,
        campaignAssetId: row.id,
        promotedAt: row.createdAt,
      };
    },
  });
}
