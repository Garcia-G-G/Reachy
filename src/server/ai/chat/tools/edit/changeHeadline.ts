import 'server-only';
import { tool } from 'ai';
import { z } from 'zod';
import { rerenderOverlay } from '@/server/actions/images';
import type { EmmaToolContext } from '../../context';
import { loadFocusedTarget } from './_loadFocusedAsset';

/**
 * changeHeadline — Phase 08c. Re-render the focused asset's overlay
 * with a new headline (and optionally other slots). Wraps the
 * existing `rerenderOverlay` server action; quickFix=true takes the
 * faster image-edit path for single-slot text tweaks.
 *
 * Use this when the user says:
 *   - "cambia el headline a X"
 *   - "más corto"
 *   - "más sobrio" / "más caliente" → Emma rewrites the headline
 *     in the new tone, then calls this with the rewritten text.
 */
export function createChangeHeadlineTool(ctx: EmmaToolContext) {
  return tool({
    description: [
      'Re-render the focused asset with a new headline (or other copy slot).',
      'Use this when the user asks to change the headline / make it shorter / change the tone — YOU rewrite the text in the new tone, then call this with the rewritten string.',
      'Each call enqueues a NEW generation (~$0.21, 15-30s). The editor will navigate to it on success.',
    ].join(' '),
    inputSchema: z
      .object({
        newHeadline: z
          .string()
          .min(1)
          .max(240)
          .describe('The new headline string — concrete, final, ready to render.'),
        newEyebrow: z.string().max(120).optional(),
        newSubheadline: z.string().max(320).optional(),
        newCta: z.string().max(80).optional(),
        quickFix: z
          .boolean()
          .optional()
          .default(true)
          .describe(
            'Faster single-slot edit path when changing only headline-class text. Defaults true.',
          ),
      })
      .strict(),
    execute: async (input) => {
      const target = await loadFocusedTarget(ctx);
      if (!target.ok) return { error: target.error };
      const res = await rerenderOverlay({
        generationId: target.data.generationId,
        assetId: target.data.assetId,
        copy: {
          headline: input.newHeadline,
          eyebrow: input.newEyebrow,
          subheadline: input.newSubheadline,
          cta: input.newCta,
        },
        quickFix: input.quickFix ?? true,
      });
      if (!res.ok) return { error: `changeHeadline failed: ${res.error}` };
      return {
        ok: true,
        action: 'navigate-to-generation',
        newGenerationId: res.data.generationId,
        newAssetUrl: res.data.publicUrl,
        costCents: 21,
      };
    },
  });
}
