import 'server-only';
import { getOpenAI } from './openai';

/**
 * Chain-of-thought "art director" pass — runs BEFORE the prompt
 * enhancer when effort=high.
 *
 * The pattern is well-established in 2026 SOTA literature:
 *   - Hunyuan PromptEnhancer (CVPR 2026) explicitly recommends a
 *     reasoning step before the enhancement step:
 *     github.com/Hunyuan-PromptEnhancer/PromptEnhancer
 *   - ImageGen-CoT (arxiv 2510.05593) shows chain-of-thought
 *     reasoning over composition / focal hierarchy / negative space
 *     before image generation outperforms one-shot enhancers on
 *     composition fidelity by ~12% in human eval.
 *
 * Inputs: the structured brief (idea + brand + layout + format).
 * Output: a JSON plan with explicit composition decisions that the
 * enhancer then turns into a dense prompt.
 *
 * Cost: ~0.1-0.2¢ per call at gpt-4o-mini. Layered ON TOP of the
 * enhancer's ~0.1¢ — total effort=high pre-render budget is ~0.5¢
 * before the image API call, which is rounding-error against the
 * $0.05-$0.21 image cost.
 */

export interface ArtDirectorBrief {
  idea: string;
  format: string; // e.g. 'post-ig'
  layoutLabel: string; // e.g. 'editorial-collage'
  layoutNegativeSpaceHint: string;
  visualStyle: string; // e.g. 'abstract'
  brandPalette: { ink: string; paper: string; accent: string };
  audience?: string | null;
}

export interface ArtDirectorPlan {
  /** What the focal subject of the image should be — concrete object,
   *  shape, character, or moment. */
  focalSubject: string;
  /** Where the focal subject sits in the frame — coords or zone. */
  focalPlacement: string;
  /** What stays QUIET in the frame so the typographic overlay can
   *  read. Must align with the layout's negative-space hint. */
  negativeSpaceZone: string;
  /** Lighting direction + quality. */
  lighting: string;
  /** Depth / plane structure (single plane / foreground-midground-
   *  background / shallow DoF / flat). */
  depth: string;
  /** Which brand color dominates and which accents to use sparingly. */
  paletteDistribution: string;
  /** One-sentence summary of the mood the image should evoke. */
  mood: string;
}

export interface PlanArtDirectionResult {
  plan: ArtDirectorPlan;
  costCents: number;
  /** Token usage for cost audit. */
  usage: { promptTokens: number; completionTokens: number };
}

const SYSTEM_PROMPT = [
  'You are a senior art director planning a single marketing image before it goes to the image-generation model.',
  '',
  'You receive a structured brief: the user idea, the layout (with negative-space requirements), the visual style, the brand palette, and the format.',
  '',
  'Your job: produce a JSON plan with 7 fields that fully specifies the composition. The plan will then be turned into a dense image prompt by a separate enhancer step.',
  '',
  'Rules:',
  '- focalSubject must be a CONCRETE noun phrase (an object, a shape, a moment, a character archetype). NOT generic ("a beautiful scene") and NOT abstract ("emotion of joy"). Specific.',
  '- focalPlacement names a zone of the frame (e.g. "right third, vertically centered", "upper-left corner with bleed").',
  "- negativeSpaceZone MUST agree with the layout's negative-space hint — if the layout wants the lower-left quiet, your plan must keep it quiet.",
  '- lighting: specify direction (e.g. "raking light from upper-left"), quality (soft / hard), and time of day if relevant.',
  '- depth: name the plane structure (single-plane flat / foreground-midground-background / shallow DoF / studio lighting).',
  '- paletteDistribution: name which hex is dominant (>60% of pixels) vs accent (≤10%). Use the brand palette exactly.',
  '- mood: ONE sentence, evocative but specific.',
  '- DO NOT mention typography, text, headlines, or fonts. Text is added in post.',
  '- DO NOT include camera-equipment specs.',
  '- Output STRICT JSON with exactly the 7 keys, nothing else.',
].join('\n');

export async function planArtDirection(brief: ArtDirectorBrief): Promise<PlanArtDirectionResult> {
  const openai = getOpenAI();
  const model = 'gpt-4o-mini';
  const isGpt5 = /^gpt-5/i.test(model);

  const userPrompt = [
    `Format: ${brief.format}.`,
    `Layout: ${brief.layoutLabel}.`,
    `Layout negative-space requirement: ${brief.layoutNegativeSpaceHint}`,
    `Visual style: ${brief.visualStyle}.`,
    `Brand palette: ink ${brief.brandPalette.ink} · paper ${brief.brandPalette.paper} · accent ${brief.brandPalette.accent}.`,
    brief.audience ? `Audience: ${brief.audience}.` : '',
    '',
    'User idea:',
    `"""${brief.idea.trim().replace(/"""/g, '"\\""')}"""`,
  ]
    .filter(Boolean)
    .join('\n');

  const completion = await openai.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'art_direction_plan',
        strict: true,
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            focalSubject: { type: 'string', description: 'Concrete noun phrase.' },
            focalPlacement: { type: 'string', description: 'Named frame zone.' },
            negativeSpaceZone: { type: 'string', description: 'Must agree with layout.' },
            lighting: { type: 'string' },
            depth: { type: 'string' },
            paletteDistribution: { type: 'string' },
            mood: { type: 'string', description: 'One evocative sentence.' },
          },
          required: [
            'focalSubject',
            'focalPlacement',
            'negativeSpaceZone',
            'lighting',
            'depth',
            'paletteDistribution',
            'mood',
          ],
        },
      },
    },
    max_completion_tokens: 400,
    ...(isGpt5 ? { reasoning_effort: 'minimal' as const } : { temperature: 0.5 }),
  });

  const choice = completion.choices[0];
  if (!choice) throw new Error('artDirector: no choices');
  if (choice.message.refusal) {
    throw new Error(`artDirector: refused — ${choice.message.refusal}`);
  }
  if (choice.finish_reason === 'length') {
    throw new Error('artDirector: response truncated by max_completion_tokens');
  }
  const content = choice.message.content;
  if (!content) throw new Error('artDirector: empty response');

  let parsed: ArtDirectorPlan;
  try {
    parsed = JSON.parse(content) as ArtDirectorPlan;
  } catch (err) {
    throw new Error(
      `artDirector: invalid JSON — ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const usage = completion.usage ?? { prompt_tokens: 0, completion_tokens: 0 };
  // gpt-4o-mini: $0.15/M in, $0.60/M out. ~400 in + ~200 out =
  // 60+120 = 180 micro-dollars ≈ 0.02¢. 1¢ floor.
  const cents = ((usage.prompt_tokens * 0.15 + usage.completion_tokens * 0.6) / 1_000_000) * 100;
  return {
    plan: parsed,
    costCents: Math.max(1, Math.round(cents)),
    usage: {
      promptTokens: usage.prompt_tokens,
      completionTokens: usage.completion_tokens,
    },
  };
}

/**
 * Format a plan as a single block of text that the prompt enhancer
 * (or, in fast mode, the image model directly) can read as the
 * art-director's brief.
 */
export function formatPlanAsBrief(plan: ArtDirectorPlan): string {
  return [
    'ART-DIRECTOR PLAN:',
    `- Focal subject: ${plan.focalSubject}`,
    `- Placement: ${plan.focalPlacement}`,
    `- Negative space: ${plan.negativeSpaceZone}`,
    `- Lighting: ${plan.lighting}`,
    `- Depth: ${plan.depth}`,
    `- Palette distribution: ${plan.paletteDistribution}`,
    `- Mood: ${plan.mood}`,
  ].join('\n');
}
