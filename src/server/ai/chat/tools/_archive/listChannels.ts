import 'server-only';
import { tool } from 'ai';
import { z } from 'zod';
import { CHANNEL_TEMPLATES } from '@/server/config/channelTemplates';
import { TOOL_DESCRIPTIONS } from '@/server/config/chatToolDescriptions';
import type { EmmaToolContext } from '../../context';

/**
 * listChannels — return all copy channels with target word counts +
 * tone/structure hints. Used when the user is picking where their copy
 * will live.
 */
export function createListChannelsTool(_ctx: EmmaToolContext) {
  return tool({
    description: TOOL_DESCRIPTIONS.listChannels,
    inputSchema: z.object({}),
    execute: async () => {
      const channels = Object.values(CHANNEL_TEMPLATES).map((c) => ({
        key: c.key,
        label: c.label,
        targetWordCount: c.targetWordCount,
        toneHints: [...c.toneHints],
        structureHints: [...c.structureHints],
      }));
      return { channels };
    },
  });
}
