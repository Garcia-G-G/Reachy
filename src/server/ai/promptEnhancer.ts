import 'server-only';
import { getOpenAI } from './openai';

/**
 * Pre-render prompt enhancer for `effort='balanced'` and `effort='high'`.
 *
 * Research note (2026-05-14): the OpenAI `images.generate` / `images.edit`
 * endpoints do NOT expose a `reasoning_effort` parameter for gpt-image-2,
 * despite third-party blog posts claiming a `thinking` or `reasoning_effort`
 * knob. We confirmed against the official API reference and the gpt-image-2
 * model page — no such parameter exists today.
 *
 * Source URLs:
 *   - https://developers.openai.com/api/reference/python/resources/images/methods/generate
 *   - https://developers.openai.com/api/docs/models/gpt-image-2
 *
 * Workaround: when the user picks 'balanced' or 'high' effort we run a
 * pre-planning pass through gpt-5.4-mini that takes the structured brief
 * + brand + layout + style and returns a denser, more art-direction-grade
 * image prompt. The image model then renders against THAT instead of the
 * raw template output. The "reasoning" happens upstream in the planner.
 *
 * Cost: ~0.1¢ per call at gpt-5.4-mini's pricing ($0.75/$4.50 per 1M).
 */

export interface EnhancePromptArgs {
  /** The buildImagePrompt() output — already includes editorial directive,
   *  style, layout hint, brand palette, brief, no-text guardrail. */
  basePrompt: string;
  /** Effort tier — drives the temperature + max_tokens budget. */
  effort: 'balanced' | 'high';
  /** Optional language hint for the prompt enhancement output. The base
   *  prompt's no-text guardrail is bilingual; the enhanced prompt stays
   *  in English regardless (image models prefer English for art-direction
   *  language). */
  language?: 'en' | 'es';
  /** Optional planner model override. Defaults to gpt-5.4-mini. */
  model?: string;
}

export interface EnhancePromptResult {
  /** The enhanced prompt — what we send to images.generate / images.edit. */
  prompt: string;
  /** Cost in cents (rounded up, 1¢ floor). */
  costCents: number;
  /** Token usage for debugging / cost audit. */
  usage: { promptTokens: number; completionTokens: number };
}

const SYSTEM_PROMPT = [
  'You are a senior art director writing prompts for an image-generation model.',
  '',
  "You will receive a structured brief: editorial directive, visual style, layout negative-space hint, brand palette (hex), and the user's subject brief.",
  'Your job: produce a SINGLE final prompt that the image model will render against.',
  '',
  'Rules for the output prompt:',
  '- 80–180 words. Dense, specific, art-direction language. Avoid generic adjectives ("beautiful", "stunning", "amazing").',
  '- Lead with the FOCAL element of the composition described concretely (a specific object / form / character archetype).',
  '- Specify lighting (direction, quality, mood) and depth (foreground/midground/background or single-plane).',
  '- Specify the dominant palette using the exact hex values from the brief.',
  '- Honour the layout negative-space hint literally — name the zone that must stay calm.',
  '- End with a one-line restatement of the no-text guardrail: "ABSOLUTELY NO TEXT in the image."',
  '- DO NOT include the words "background only" or "nothing else" — they produce empty gradients.',
  '- DO NOT mention typography, headlines, eyebrows, captions, or fonts — text is post-production.',
  '- DO NOT include camera-equipment specs (focal length, lens model, ISO) unless the brief is photographic.',
  '- Output ONLY the final prompt body. No preamble, no labels, no JSON. Plain text.',
].join('\n');

export async function enhancePrompt(args: EnhancePromptArgs): Promise<EnhancePromptResult> {
  const openai = getOpenAI();
  const model = args.model ?? 'gpt-4o-mini';

  // High effort gets a longer budget so the planner can produce a more
  // specific brief; balanced caps tighter to keep cost predictable.
  const maxCompletionTokens = args.effort === 'high' ? 600 : 400;
  // gpt-5.x rejects custom temperatures; pre-flight against the model id.
  const isGpt5 = /^gpt-5/i.test(model);

  const completion = await openai.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: args.basePrompt },
    ],
    ...(isGpt5
      ? { reasoning_effort: args.effort === 'high' ? ('medium' as const) : ('low' as const) }
      : { temperature: 0.7 }),
    max_completion_tokens: maxCompletionTokens,
  });

  const choice = completion.choices[0];
  if (!choice) throw new Error('promptEnhancer: no choices');
  if (choice.message.refusal) {
    throw new Error(`promptEnhancer: refused — ${choice.message.refusal}`);
  }
  // Truncated completions can emit partial / unusable prompts. Fall
  // back to the caller's basePrompt below instead of shipping a stub.
  if (choice.finish_reason === 'length') {
    return {
      prompt: args.basePrompt,
      costCents: 1,
      usage: {
        promptTokens: completion.usage?.prompt_tokens ?? 0,
        completionTokens: completion.usage?.completion_tokens ?? 0,
      },
    };
  }
  const text = choice.message.content?.trim();
  if (!text) {
    // Fall back to the base prompt — better to ship the original than
    // fail the whole generation. The image model still gets the
    // structured editorial directive from buildImagePrompt.
    return {
      prompt: args.basePrompt,
      costCents: 1,
      usage: {
        promptTokens: completion.usage?.prompt_tokens ?? 0,
        completionTokens: completion.usage?.completion_tokens ?? 0,
      },
    };
  }

  // Coarse cost estimate. gpt-4o-mini ≈ $0.15/M input, $0.60/M output.
  // gpt-5.4-mini ≈ $0.75/M input, $4.50/M output (per the May 2026
  // pricing). We default to gpt-4o-mini for compatibility (Reachy's
  // existing OpenAI tier confirmed to support it); upgrade the model
  // arg if/when gpt-5.4-mini is reliably available.
  const usage = completion.usage ?? { prompt_tokens: 0, completion_tokens: 0 };
  const isMini = /mini|nano/i.test(model);
  const inRate = isMini ? 0.75 : 5;
  const outRate = isMini ? 4.5 : 30;
  const cents =
    ((usage.prompt_tokens * inRate + usage.completion_tokens * outRate) / 1_000_000) * 100;
  return {
    prompt: text,
    costCents: Math.max(1, Math.round(cents)),
    usage: {
      promptTokens: usage.prompt_tokens,
      completionTokens: usage.completion_tokens,
    },
  };
}
