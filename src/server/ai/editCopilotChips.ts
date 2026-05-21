import 'server-only';

/**
 * Edit-copilot suggestion chips — Phase 08c.
 *
 * Static rule-based generator that inspects the focused generation
 * and returns 2-4 short prompts the user can chip-click to send to
 * Emma. Rule-based (no LLM) keeps this deterministic + fast — the
 * editor mounts thousands of times, an extra LLM round-trip per
 * mount would add cost + latency for no incremental quality.
 *
 * Each chip is { label, prompt } where label is the short button
 * text and prompt is the message we send to Emma when clicked.
 *
 * Order matters — chip 1 is the most-likely action; chip 4 the
 * safest fallback. The UI may truncate to 3 on narrow viewports.
 */

export interface EditChip {
  label: string;
  prompt: string;
}

export interface ChipGenInput {
  headline: string | null;
  layoutId: string | null;
  format: string | null;
  /** Brand voice tone string (e.g. "sobrio, directo, sin marketing"). */
  brandTone: string | null;
}

export function generateEditCopilotChips(input: ChipGenInput): EditChip[] {
  const chips: EditChip[] = [];

  // Rule 1 — long or generic-feeling headline → offer sharper variant.
  if (input.headline) {
    const h = input.headline.trim();
    if (h.length > 50 || /\b(transforma|revoluciona|el mejor|tu solución)\b/i.test(h)) {
      chips.push({
        label: 'headline más afilado',
        prompt:
          'Acortá y filá el headline al máximo (≤8 palabras si se puede), conservando el sentido y la voz de marca.',
      });
    }
  }

  // Rule 2 — feature-stack is the safe default; suggest editorial-collage as a more design-forward swap.
  if (input.layoutId === 'feature-stack' || input.layoutId === 'hero-centered') {
    chips.push({
      label: 'probar editorial',
      prompt: 'Cambiá el layout a editorial-collage para ver una versión con más fuerza visual.',
    });
  }

  // Rule 3 — palette warmth nudge. Always available; cheap creative pivot.
  chips.push({
    label: 'palette más cálida',
    prompt:
      'Generá una versión con el accent más cálido (corrido hacia naranja/rojo) manteniendo ink y paper.',
  });

  // Rule 4 — always include a "give me another variant" escape hatch.
  chips.push({
    label: 'variante',
    prompt: 'Tirá una variante con el mismo brief — quiero ver otra interpretación.',
  });

  return chips.slice(0, 4);
}
