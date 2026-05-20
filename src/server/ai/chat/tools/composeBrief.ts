import 'server-only';
import { tool } from 'ai';
import { z } from 'zod';
import { composeBriefServerSide } from '@/server/ai/composeBriefServerSide';
import { type ComposeBriefChannel, resolvePasteLocation } from '@/server/config/pasteLocations';
import type { EmmaToolContext } from '../context';

/**
 * composeBrief — Phase 07i.
 *
 * Emma's primary capability when Garcia says "creame X". She does
 * NOT generate the asset — she composes a complete, human-voiced
 * brief Garcia can paste into the right Reachy page. Returns the
 * brief text + the resolved paste location so the chat client can
 * render a card with [copiar] + [ir a Generate] chips.
 *
 * Voice contract lives in composeBriefServerSide.ts; this tool is
 * the thin Emma-facing interface.
 */

const CHANNELS: readonly ComposeBriefChannel[] = [
  'image-ig',
  'image-linkedin',
  'image-og',
  'image-email-header',
  'image-square',
  'copy-linkedin-long',
  'copy-linkedin-short',
  'copy-x-thread',
  'copy-ig-caption',
  'copy-email-cold',
  'copy-email-warm',
  'copy-blog-outline',
  'copy-press-release',
  'reel-15s',
  'reel-30s',
];

export function createComposeBriefTool(ctx: EmmaToolContext) {
  return tool({
    description:
      'Compose a complete, human-voiced brief that the user can paste into the right Reachy Generate page. ALWAYS use this when the user asks to "create / make / generate / hazme / créame" anything. You do NOT generate the asset; you compose the brief and tell the user where to paste it.',
    inputSchema: z.object({
      channel: z
        .enum(CHANNELS as [ComposeBriefChannel, ...ComposeBriefChannel[]])
        .describe(
          'The target Reachy channel — picks the right paste location (Generate → Image / Copy / Reel) + format preset.',
        ),
      productContext: z
        .string()
        .min(1)
        .max(800)
        .describe(
          "The user's ask in concrete terms — the feature, moment, audience, or angle that should drive the brief. Quote the user verbatim when you can.",
        ),
      voiceHint: z
        .string()
        .max(200)
        .optional()
        .describe(
          'Optional voice direction beyond the brand default (e.g. "more direct than usual", "techie audience, no marketing language").',
        ),
    }),
    execute: async (input) => {
      if (!ctx.project.slug) {
        return {
          error:
            'composeBrief needs a project context to resolve the paste location — ask the user to pick a project first.',
        };
      }
      try {
        const result = await composeBriefServerSide({
          channel: input.channel,
          productContext: input.productContext,
          voiceHint: input.voiceHint,
          project: {
            name: ctx.project.name,
            audience: ctx.project.audience,
            tone: ctx.project.tone,
          },
          brandKit: ctx.brandKit,
          productBrief: ctx.productBrief,
          language: ctx.language,
        });
        const paste = resolvePasteLocation(input.channel, ctx.project.slug);
        return {
          brief: result.brief,
          channel: input.channel,
          path: paste.path,
          field: paste.field,
          formatPreset: paste.formatPreset ?? null,
          pageLabel: ctx.language === 'es' ? paste.pageLabelEs : paste.pageLabelEn,
          costCents: result.costCents,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { error: `composeBrief failed: ${msg}` };
      }
    },
  });
}
