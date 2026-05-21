import 'server-only';
import { tool } from 'ai';
import { z } from 'zod';
import { LAYOUT_IDS, type LayoutId } from '@/lib/layout-meta';
import { swapLayout } from '@/server/actions/images';
import type { EmmaToolContext } from '../../context';
import { loadFocusedTarget } from './_loadFocusedAsset';

/**
 * changeLayout — Phase 08c. Re-render the focused asset under a
 * different layout template. Wraps swapLayout — the existing server
 * action handles copy merging (slots the new layout doesn't request
 * are dropped) so Emma only has to pick the layoutId.
 */
export function createChangeLayoutTool(ctx: EmmaToolContext) {
  return tool({
    description: [
      'Switch the focused asset to a different layout (editorial-collage, text-cutout, badge-stamp, card-soft, feature-stack, quote-large, editorial-margin, hero-centered, etc.).',
      'Use when the user says "probá editorial" / "más conceptual" / "cambia el layout" — pick the layoutId that matches the vibe.',
      'Each call enqueues a NEW generation (~$0.21, 15-30s). The editor navigates to it on success.',
    ].join(' '),
    inputSchema: z
      .object({
        layoutId: z
          .enum(LAYOUT_IDS as unknown as [LayoutId, ...LayoutId[]])
          .describe('Target layout id from the LAYOUT_IDS catalog.'),
      })
      .strict(),
    execute: async (input) => {
      const target = await loadFocusedTarget(ctx);
      if (!target.ok) return { error: target.error };
      const res = await swapLayout({
        generationId: target.data.generationId,
        assetId: target.data.assetId,
        layoutId: input.layoutId,
      });
      if (!res.ok) return { error: `changeLayout failed: ${res.error}` };
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
