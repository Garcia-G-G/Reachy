import 'server-only';
import { tool } from 'ai';
import { z } from 'zod';
import { TOOL_DESCRIPTIONS } from '@/server/config/chatToolDescriptions';
import type { EmmaToolContext } from '../../context';

/**
 * iterateImageCopy — Phase 06 quarantined the composeImage SVG-overlay
 * pipeline; the AI now paints typography inline. That means there is
 * NO cheap "re-render with new text" path — changing the headline
 * requires a fresh gpt-image-2 render.
 *
 * For Phase 07 this tool DELEGATES to regenerateAsset with a
 * surgically-phrased hint. We keep the tool name (Emma's persona
 * understands "iterate the headline" as a concept) but the behavior
 * is "regenerate with this exact slot change as the hint".
 *
 * If a future Reachy version reintroduces a SVG-overlay path for
 * cheap typography iteration, this tool's body changes — Emma's
 * callers don't.
 */
export function createIterateImageCopyTool(_ctx: EmmaToolContext) {
  return tool({
    description: TOOL_DESCRIPTIONS.iterateImageCopy,
    inputSchema: z.object({
      generationId: z.string().uuid(),
      slot: z.enum(['eyebrow', 'headline', 'subheadline', 'cta']),
      newText: z.string().min(1).max(200),
    }),
    execute: async (input) => {
      // Delegate to regenerateAsset with a slot-targeted hint.
      // Emma will see this as a regenerateAsset result and respond
      // accordingly. The hint is phrased so the planner overrides
      // the right slot on the next render.
      return {
        delegateTo: 'regenerateAsset',
        suggestedHint: `Keep everything the same EXCEPT the ${input.slot}. The ${input.slot} must read EXACTLY: "${input.newText}". Do not change any other slot.`,
        generationId: input.generationId,
        note: 'iterateImageCopy is a delegate today — the AI renders typography inline, so single-slot iteration requires a full re-render. Use regenerateAsset with the suggestedHint above.',
      };
    },
  });
}
