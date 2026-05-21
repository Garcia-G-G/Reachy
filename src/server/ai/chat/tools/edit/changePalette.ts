import 'server-only';
import { tool } from 'ai';
import { z } from 'zod';
import { swapColors } from '@/server/actions/images';
import type { EmmaToolContext } from '../../context';
import { loadFocusedTarget } from './_loadFocusedAsset';

/**
 * changePalette — Phase 08c. Re-render the focused asset under a
 * different ink/paper/accent palette. Emma figures out the hex
 * codes (when the user says "más cálido" she shifts accent toward
 * red/orange relative to the current value); we keep the server
 * tool dumb — it just validates hex and calls swapColors.
 */
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function createChangePaletteTool(ctx: EmmaToolContext) {
  return tool({
    description: [
      'Swap the focused asset to a new ink/paper/accent palette.',
      'Use when the user asks for a different palette — YOU pick three concrete hex codes that match the request ("más cálido" → bump accent toward orange/red; "monocroma" → tonal palette; etc.).',
      'Each call enqueues a NEW generation (~$0.21, 15-30s). The editor navigates to it on success.',
    ].join(' '),
    inputSchema: z
      .object({
        ink: z.string().regex(HEX_RE).describe('Foreground / type color (hex #RRGGBB).'),
        paper: z.string().regex(HEX_RE).describe('Background color (hex #RRGGBB).'),
        accent: z.string().regex(HEX_RE).describe('Accent color (hex #RRGGBB).'),
      })
      .strict(),
    execute: async (input) => {
      const target = await loadFocusedTarget(ctx);
      if (!target.ok) return { error: target.error };
      const res = await swapColors({
        generationId: target.data.generationId,
        assetId: target.data.assetId,
        colors: { ink: input.ink, paper: input.paper, accent: input.accent },
      });
      if (!res.ok) return { error: `changePalette failed: ${res.error}` };
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
