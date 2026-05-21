import 'server-only';
import { tool } from 'ai';
import { z } from 'zod';
import type { EmmaToolContext } from '../context';

/**
 * navigateTo — Phase 07h.
 *
 * Emma signals "take the user to {path}". The tool returns the
 * resolved path; the chat CLIENT watches for navigateTo tool
 * results and calls router.push() on receipt. This split lets the
 * server tool stay pure (no Next/router on the server) while the
 * client handles the side effect.
 *
 * Confirmation is enforced by the system prompt (TOOL_USE_BIAS):
 * Emma must ask before calling. The tool itself does not gatekeep
 * — we trust the persona.
 *
 * Path resolution: `{slug}` placeholder substitutes the current
 * project's slug. If a project is required but absent, the tool
 * returns an error the model can recover from.
 */
export function createNavigateToTool(ctx: EmmaToolContext) {
  return tool({
    description:
      'Navigate the user to a path in the app. ASK FIRST in the prior message ("te llevo a X — ¿okay?"); only call after they confirm. Use {slug} as a placeholder for the current project slug.',
    inputSchema: z
      .object({
        path: z
          .string()
          .min(1)
          .max(400)
          .describe(
            'The destination path. May include {slug} which the server resolves to the current project slug. Examples: "/app/projects/{slug}/library" / "/app/projects/{slug}/identity" / "/app/projects/new-from-upload".',
          ),
        reason: z
          .string()
          .min(1)
          .max(280)
          .optional()
          .describe('Short one-line rationale shown to the user before navigation.'),
      })
      .strict(),
    execute: async (input) => {
      let resolved = input.path;
      if (resolved.includes('{slug}')) {
        const slug = ctx.project.slug ?? null;
        if (!slug) {
          return {
            error:
              'navigation needs a project context but none is loaded — ask the user to pick a project first.',
          };
        }
        resolved = resolved.replaceAll('{slug}', slug);
      }
      return {
        action: 'navigate',
        path: resolved,
        reason: input.reason ?? null,
      };
    },
  });
}
