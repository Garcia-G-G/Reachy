import 'server-only';
import { tool } from 'ai';
import { z } from 'zod';
import { LAYOUTS } from '@/server/ai/layoutTemplates';
import { TOOL_DESCRIPTIONS } from '@/server/config/chatToolDescriptions';
import type { EmmaToolContext } from '../../context';

/**
 * listLayouts — return all layout IDs with label + slot list.
 * Emma calls this when helping the user pick a layout.
 */
export function createListLayoutsTool(_ctx: EmmaToolContext) {
  return tool({
    description: TOOL_DESCRIPTIONS.listLayouts,
    inputSchema: z.object({}),
    execute: async () => {
      const layouts = Object.values(LAYOUTS).map((l) => ({
        id: l.id,
        label: l.label,
        slots: [...l.slots],
        negativeSpaceHint: l.negativeSpaceHint,
      }));
      return { layouts };
    },
  });
}
