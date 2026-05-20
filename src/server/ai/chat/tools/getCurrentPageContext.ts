import 'server-only';
import { tool } from 'ai';
import { z } from 'zod';
import type { EmmaToolContext } from '../context';

/**
 * getCurrentPageContext — Phase 07h.
 *
 * Returns the route, project, and any focused asset the user is
 * currently looking at. The chat client embeds this in every POST
 * to the stream API, and the handler threads it into the tool
 * context. The tool simply echoes the live values back so the model
 * can reason about them in its reply.
 *
 * Pure read — no side effects. Emma can call this freely.
 */
export function createGetCurrentPageContextTool(ctx: EmmaToolContext) {
  return tool({
    description:
      "Read the user's current page context — route, project (when on a project page), and any focused asset. Call this at the start of any turn where guidance depends on where the user is.",
    inputSchema: z.object({}),
    execute: async () => {
      return {
        route: ctx.currentRoute ?? null,
        projectId: ctx.projectId,
        projectSlug: ctx.project.slug ?? null,
        projectName: ctx.project.name ?? null,
        focusedGenerationId: ctx.focusedGenerationId ?? null,
        language: ctx.language,
      };
    },
  });
}
