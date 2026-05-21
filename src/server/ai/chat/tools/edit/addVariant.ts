import 'server-only';
import { tool } from 'ai';
import { z } from 'zod';
import { enqueueVariations } from '@/server/actions/images';
import type { EmmaToolContext } from '../../context';
import { loadFocusedTarget } from './_loadFocusedAsset';

/**
 * addVariant — Phase 08c. Wraps enqueueVariations with the focused
 * asset as source. Use this when the user says "dame otra" / "una
 * variante" — same brief, model re-rolls. Optionally accepts a
 * one-line nudge that gets appended to the source brief.
 */
export function createAddVariantTool(ctx: EmmaToolContext) {
  return tool({
    description: [
      'Generate a variant of the focused asset using the same brief.',
      'Use when the user says "dame otra" / "una variante" / "tirá otra vuelta".',
      'Optionally takes a one-line nudge appended to the brief (e.g. "más caliente", "más espacio negativo").',
      'Each call enqueues a NEW generation (~$0.21, 15-30s). The editor navigates to it on success.',
    ].join(' '),
    inputSchema: z
      .object({
        tweakPrompt: z
          .string()
          .max(400)
          .optional()
          .describe('Optional one-line nudge appended to the source brief.'),
      })
      .strict(),
    execute: async (input) => {
      const target = await loadFocusedTarget(ctx);
      if (!target.ok) return { error: target.error };
      const res = await enqueueVariations({
        sourceAssetId: target.data.assetId,
        tweakPrompt: input.tweakPrompt,
      });
      if (!res.ok) return { error: `addVariant failed: ${res.error}` };
      return {
        ok: true,
        action: 'navigate-to-generation',
        newGenerationId: res.data.generationId,
        costCents: 21,
      };
    },
  });
}
