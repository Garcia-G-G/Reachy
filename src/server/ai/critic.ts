import 'server-only';
import { getOpenAI } from './openai';

/**
 * Best-of-K vision critic for `effort='high'`.
 *
 * Receives N candidate image buffers, sends them to a vision-capable
 * OpenAI model with a strict JSON schema, and returns the index of
 * the candidate the model judges strongest on composition, focal
 * clarity, negative space, palette harmony, and brand alignment.
 *
 * Research note (2026-05-14): gpt-4o is now legacy; gpt-5.4-mini is
 * the sweet-spot vision-capable, JSON-schema-supporting model
 * ($0.75 / $4.50 per 1M input / output). detail='low' is optimal
 * for composition judgment (no OCR needed), fixed at 85 tokens per
 * image. Typical critique: 4 × 85 = 340 image tokens + ~250 text =
 * ~590 input tokens, ~120 output → ~0.1¢ per call.
 *
 * Source URLs:
 *   - https://developers.openai.com/api/docs/guides/images-vision
 *   - https://developers.openai.com/api/docs/guides/structured-outputs
 *   - https://developers.openai.com/api/docs/models/gpt-5.4-nano
 *
 * Falls back to gpt-4o-mini when the gpt-5.x tier isn't available on
 * the account (which is the case for Reachy's current tier in this
 * environment — confirmed via failed completion 2026-05-14). Both
 * accept the same vision + json_schema combo.
 */

import type { Layout } from './layoutTemplates';

export interface CriticCandidate {
  /** Index in the original generation set (0-based). */
  index: number;
  /** Image bytes. The critic encodes these as data URLs so the model
   *  can see them without us re-uploading to R2 first. */
  buffer: Buffer;
}

export interface CriticArgs {
  /** The layout the variants were composed for — drives the critic
   *  prompt ("review for editorial-collage's negative space"). */
  layout: Layout;
  /** The user's brief — the critic should evaluate "best match for THIS". */
  brief: string;
  candidates: CriticCandidate[];
  /** Vision model id. Defaults to gpt-4o-mini (broadly available);
   *  callers on a higher tier can override to gpt-5.4-mini or gpt-5.5
   *  with `reasoning_effort: 'low'` for sharper judgment. */
  model?: string;
}

export interface CriticVerdict {
  /** Index into `candidates[]` of the winner. */
  winnerIndex: number;
  /** The model's brief justification — surfaced in worker logs so we
   *  can audit pick quality without listening through OpenAI usage. */
  reasoning: string;
  costCents: number;
}

const SYSTEM_PROMPT = [
  'You are a senior art director reviewing AI-generated image candidates for a marketing-asset pipeline.',
  '',
  'Judge each candidate on:',
  '  1. Composition strength — does the eye land somewhere intentional?',
  '  2. Focal clarity      — is there ONE clear subject, not a cluttered mess?',
  '  3. Negative space     — does the frame breathe in the right zones for typography overlay?',
  '  4. Palette harmony    — do the dominant hues match the brand brief?',
  '  5. Brand alignment    — does the result feel like a polished marketing asset, not stock or AI-generic?',
  '',
  'Penalize: flat abstract gradients with no focal subject, busy symmetric layouts, garish saturation, off-brand palette drift.',
  '',
  'Return strict JSON: { "winnerIndex": 0|1|2|3, "reasoning": "<one or two short sentences citing the criterion that decided it>" }.',
].join('\n');

function bufferToDataUrl(buf: Buffer, mime = 'image/png'): string {
  return `data:${mime};base64,${buf.toString('base64')}`;
}

export async function pickBest(args: CriticArgs): Promise<CriticVerdict> {
  if (args.candidates.length === 0) {
    throw new Error('critic: candidates[] is empty');
  }
  if (args.candidates.length === 1) {
    // Trivial — no need to spend on a vision call.
    return { winnerIndex: 0, reasoning: 'single candidate', costCents: 0 };
  }

  const openai = getOpenAI();
  const model = args.model ?? 'gpt-4o-mini';

  const userContent: Array<
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string; detail?: 'low' | 'high' | 'auto' } }
  > = [
    {
      type: 'text',
      text: [
        `Layout: ${args.layout.label}. Negative-space directive: ${args.layout.negativeSpaceHint}`,
        `Brief: ${args.brief}`,
        '',
        `Below are ${args.candidates.length} candidates indexed 0..${args.candidates.length - 1}. Pick the winner per the criteria.`,
      ].join('\n'),
    },
    ...args.candidates.map((c) => ({
      type: 'image_url' as const,
      image_url: {
        url: bufferToDataUrl(c.buffer),
        // 'low' = 85 tokens fixed, plenty for composition judgment (no OCR).
        detail: 'low' as const,
      },
    })),
  ];

  const completion = await openai.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'art_direction_verdict',
        strict: true,
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            winnerIndex: {
              type: 'integer',
              minimum: 0,
              maximum: Math.max(0, args.candidates.length - 1),
              description: '0-based index of the winning candidate.',
            },
            reasoning: {
              type: 'string',
              description: 'One or two short sentences citing the deciding criterion.',
            },
          },
          required: ['winnerIndex', 'reasoning'],
        },
      },
    },
    max_completion_tokens: 200,
  });

  const choice = completion.choices[0];
  if (!choice) throw new Error('critic: no choices');
  if (choice.message.refusal) {
    throw new Error(`critic: refused — ${choice.message.refusal}`);
  }
  const content = choice.message.content;
  if (!content) throw new Error('critic: empty response');

  let parsed: { winnerIndex: number; reasoning: string };
  try {
    parsed = JSON.parse(content);
  } catch (err) {
    throw new Error(`critic: invalid JSON — ${err instanceof Error ? err.message : String(err)}`);
  }

  // Cost estimate at gpt-4o-mini ($0.15/M in, $0.60/M out). Bump for
  // gpt-5.x if the caller overrode the model.
  const usage = completion.usage ?? { prompt_tokens: 0, completion_tokens: 0 };
  const isMini = /mini|nano/i.test(model);
  const inRate = isMini ? 0.15 : 5;
  const outRate = isMini ? 0.6 : 30;
  const cents =
    ((usage.prompt_tokens * inRate + usage.completion_tokens * outRate) / 1_000_000) * 100;
  return {
    winnerIndex: parsed.winnerIndex,
    reasoning: parsed.reasoning,
    costCents: Math.max(1, Math.round(cents)),
  };
}
