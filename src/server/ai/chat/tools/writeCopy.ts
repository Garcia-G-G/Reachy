import 'server-only';
import { tool } from 'ai';
import { z } from 'zod';
import { generateChannelCopy } from '@/server/ai/channelCopy';
import { CHANNEL_TEMPLATES, type ChannelKey } from '@/server/config/channelTemplates';
import { TOOL_DESCRIPTIONS } from '@/server/config/chatToolDescriptions';
import type { EmmaToolContext } from '../context';

/**
 * writeCopy — generate a single piece of channel copy. Inline call
 * (no queue), uses the Phase-06-upgraded channelCopy module so the
 * exemplars + self-critique loop apply. Returns the text + cost so
 * Emma can show it in the chat bubble.
 */
export function createWriteCopyTool(ctx: EmmaToolContext) {
  const channelEnum = Object.keys(CHANNEL_TEMPLATES) as ChannelKey[];
  return tool({
    description: TOOL_DESCRIPTIONS.writeCopy,
    inputSchema: z.object({
      channel: z.enum(channelEnum as [ChannelKey, ...ChannelKey[]]),
      brief: z
        .string()
        .min(1)
        .max(2000)
        .describe('Per-asset directive — what this specific piece is about.'),
      targetWords: z.number().int().min(20).max(2000).optional(),
    }),
    execute: async (input) => {
      if (!ctx.productBrief) {
        return {
          error:
            'no product brief loaded for this project — channel copy needs the brief to ground itself. Ask Garcia to run autopilot ingest first, or fall back to a manual brief.',
        };
      }
      const result = await generateChannelCopy({
        brief: input.brief,
        channel: input.channel,
        brandKit: ctx.brandKit,
        productBrief: ctx.productBrief,
        language: ctx.language,
      });
      return {
        text: result.text,
        wordCount: result.wordCount,
        costCents: result.costCents,
        modelUsed: result.modelUsed,
        channel: input.channel,
      };
    },
  });
}
