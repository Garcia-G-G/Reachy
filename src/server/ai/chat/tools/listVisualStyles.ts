import 'server-only';
import { tool } from 'ai';
import { z } from 'zod';
import { VISUAL_STYLE_KEYS } from '@/lib/visual-styles-meta';
import { resolveVisualStyle } from '@/server/ai/visualStyles';
import { TOOL_DESCRIPTIONS } from '@/server/config/chatToolDescriptions';
import type { EmmaToolContext } from '../context';

/**
 * listVisualStyles — return all visual style keys with their labels +
 * one-line descriptors. Helps Emma propose a style that contrasts with
 * the brand kit's default (e.g. "let's try memphis-pattern on this one").
 */
export function createListVisualStylesTool(_ctx: EmmaToolContext) {
  return tool({
    description: TOOL_DESCRIPTIONS.listVisualStyles,
    inputSchema: z.object({}),
    execute: async () => {
      const styles = VISUAL_STYLE_KEYS.map((key) => {
        const entry = resolveVisualStyle(key);
        return { key, label: entry.label, descriptor: entry.promptStatic.slice(0, 200) };
      });
      return { styles };
    },
  });
}
