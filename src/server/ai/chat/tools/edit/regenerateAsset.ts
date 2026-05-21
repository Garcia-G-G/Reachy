import 'server-only';
import { tool } from 'ai';
import { z } from 'zod';
import { enqueueVariations } from '@/server/actions/images';
import type { EmmaToolContext } from '../../context';
import { loadFocusedTarget } from './_loadFocusedAsset';

/**
 * regenerateAsset — Phase 08c. Full re-roll informed by a tweak
 * hint. Architecturally the same machinery as addVariant — we wrap
 * enqueueVariations because the source brief + tweakPrompt is
 * exactly the "same idea, course-correct" semantic. The tool reads
 * differently to the model (description emphasises "complete
 * re-roll with hint") so Emma picks the right one when the user
 * asks for "una versión completamente diferente".
 */
export function createRegenerateAssetTool(ctx: EmmaToolContext) {
  return tool({
    description: [
      'Re-roll the focused asset from scratch with a specific tweak direction.',
      'Use when the user wants a fresh take on the same brief ("regenera con headline más afilado", "another pass but warmer", "tira una completamente diferente").',
      'Differs from addVariant in framing only — both enqueue a new variation; this one is the one to pick when the user signals "do it over" rather than "give me another option".',
      'Each call enqueues a NEW generation (~$0.21, 15-30s). The editor navigates to it on success.',
    ].join(' '),
    inputSchema: z
      .object({
        tweakHint: z
          .string()
          .min(1)
          .max(400)
          .describe(
            'Required surgical change direction — name the element + concrete delta. NOT "improve it".',
          ),
      })
      .strict(),
    execute: async (input) => {
      const target = await loadFocusedTarget(ctx);
      if (!target.ok) return { error: target.error };
      const res = await enqueueVariations({
        sourceAssetId: target.data.assetId,
        tweakPrompt: input.tweakHint,
      });
      if (!res.ok) return { error: `regenerateAsset failed: ${res.error}` };
      return {
        ok: true,
        action: 'navigate-to-generation',
        newGenerationId: res.data.generationId,
        costCents: 21,
      };
    },
  });
}
