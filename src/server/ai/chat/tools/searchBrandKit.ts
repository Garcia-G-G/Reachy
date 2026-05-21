import 'server-only';
import { tool } from 'ai';
import { z } from 'zod';
import { TOOL_DESCRIPTIONS } from '@/server/config/chatToolDescriptions';
import type { EmmaToolContext } from '../context';

/**
 * searchBrandKit — return the loaded brand kit's fields. Emma already
 * has them in the system prompt, but a tool call lets her surface
 * SPECIFIC fields back to the user inline (e.g. when they ask "what
 * accent color are we using?").
 *
 * The `field` filter narrows the payload so Emma doesn't dump the
 * whole kit when the user only asked one question.
 */
export function createSearchBrandKitTool(ctx: EmmaToolContext) {
  return tool({
    description: TOOL_DESCRIPTIONS.searchBrandKit,
    inputSchema: z
      .object({
        field: z
          .enum(['palette', 'tone', 'voice', 'audience', 'logo', 'visualStyle', 'all'])
          .default('all'),
      })
      .strict(),
    execute: async (input) => {
      const k = ctx.brandKit;
      if (input.field === 'palette') {
        return { palette: { ink: k.primaryColor, paper: k.bgColor, accent: k.accentColor } };
      }
      if (input.field === 'tone') {
        return { tone: ctx.project.tone ?? '(not set)' };
      }
      if (input.field === 'voice') {
        return {
          voice: k.voice ?? null,
        };
      }
      if (input.field === 'audience') {
        return { audience: ctx.project.audience ?? '(not set)' };
      }
      if (input.field === 'logo') {
        return { referenceAssetKeys: k.referenceAssetKeys ?? [] };
      }
      if (input.field === 'visualStyle') {
        return { visualStyle: k.visualStyle ?? '(unset)' };
      }
      // 'all'
      return {
        palette: { ink: k.primaryColor, paper: k.bgColor, accent: k.accentColor },
        tone: ctx.project.tone ?? '(not set)',
        voice: k.voice ?? null,
        audience: ctx.project.audience ?? '(not set)',
        visualStyle: k.visualStyle ?? '(unset)',
        allowsHumans: k.allowsHumans,
        languages: k.languages ?? ['en'],
        referenceAssetKeys: k.referenceAssetKeys ?? [],
      };
    },
  });
}
