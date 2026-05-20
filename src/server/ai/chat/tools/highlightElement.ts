import 'server-only';
import { tool } from 'ai';
import { z } from 'zod';
import type { EmmaToolContext } from '../context';

/**
 * highlightElement — Phase 07h.
 *
 * Emma asks the chat client to pulse a UI element with an amber
 * outline for N ms. Used after navigating somewhere new — Emma
 * says "click here" and the visual highlight reinforces. The
 * client watches for highlightElement tool results, finds the
 * element via `document.querySelector(selector)`, and applies the
 * `.emma-pulse-highlight` class for the requested duration.
 *
 * Selectors must be deliberate — prefer `[data-emma-target="X"]`
 * attributes we plant on important controls, not brittle structural
 * paths. The tool validates the selector shape but trusts Emma to
 * pick existing targets (she sees the feature catalog).
 */

const SELECTOR_RE = /^[a-zA-Z0-9-_#.[\]"=:>\s]+$/;

export function createHighlightElementTool(_ctx: EmmaToolContext) {
  return tool({
    description:
      'Pulse a UI element with an amber outline so the user can locate it visually. Use AFTER navigating somewhere new ("aquí — ¿lo ves?"). Prefer [data-emma-target="X"] selectors when available.',
    inputSchema: z.object({
      selector: z
        .string()
        .min(1)
        .max(280)
        .regex(SELECTOR_RE, 'selector must be a plain CSS selector with no JS/HTML injection')
        .describe(
          'CSS selector for the element to highlight. Prefer data-emma-target attributes; fall back to id/class.',
        ),
      durationMs: z
        .number()
        .int()
        .min(500)
        .max(8000)
        .default(3000)
        .describe('How long the pulse stays visible. 3000ms is the default editorial pace.'),
      label: z
        .string()
        .min(1)
        .max(120)
        .optional()
        .describe('Optional aria-label / overlay text for the highlight.'),
    }),
    execute: async (input) => {
      return {
        action: 'highlight',
        selector: input.selector,
        durationMs: input.durationMs,
        label: input.label ?? null,
      };
    },
  });
}
