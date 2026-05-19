import 'server-only';
import { getOpenAI } from '@/server/ai/openai';
import { FALLBACK_PALETTE } from '@/server/config/fallbackPalette';
import type { ProductBrief } from './extractBrief';

/**
 * Phase 06 — text-based palette inference.
 *
 * When the autopilot ingestion has no images (pure text upload), the
 * vision pass (extractVisualIdentity) never fires and we have no
 * empirical palette signal. The brief LLM was previously told to
 * "defer to upstream fallback" for paletteHex, which meant text-only
 * uploads ended up wearing the editorial-default warm cream + ink
 * palette no matter what the product actually positioned as.
 *
 * This module fills that gap: it asks gpt-5.5 to pick a 3-color brand
 * palette grounded in the brief's positioning (tone, audience, problem,
 * one-liner). The model is biased toward warm editorial palettes by
 * default but free to pick cold / tech / playful when the brief calls
 * for it.
 *
 * Cost: ~1¢ per ingestion (gpt-5.5 reasoning='medium').
 *
 * Output contract: ALWAYS returns valid 6-digit hex values. On any
 * failure path we fall back to FALLBACK_PALETTE so callers can use the
 * result unconditionally.
 */

const MODEL = 'gpt-5.5';

export interface InferredPalette {
  ink: string;
  paper: string;
  accent: string;
  /** Free-text rationale the model gave. Surfaced in worker logs so
   *  Garcia can sanity-check the picks. */
  reasoning: string;
  costCents: number;
}

const HEX = '^#[0-9a-fA-F]{6}$';

const JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['ink', 'paper', 'accent', 'reasoning'],
  properties: {
    ink: { type: 'string', pattern: HEX },
    paper: { type: 'string', pattern: HEX },
    accent: { type: 'string', pattern: HEX },
    reasoning: { type: 'string', minLength: 1, maxLength: 400 },
  },
};

const SYSTEM_LINES: readonly string[] = [
  'You are a brand designer choosing the visual palette for a new product based ONLY on the text positioning (the autopilot has no images to extract from).',
  '',
  'Rules:',
  '- Return THREE hex values: ink (primary text + dominant tones), paper (background / light tones), accent (CTA / highlight, used sparingly).',
  '- Every value MUST be a real 6-digit hex (#rrggbb). No 3-digit shorthand, no rgb() functions, no color names.',
  "- The palette MUST reflect the product's positioning — NOT a monochrome default. If the brief reads as warm/editorial, lean warm. If it reads as cold/technical, lean cool. If playful, allow a vivid accent.",
  '- DEFAULT bias (when the brief is mid / ambiguous): warm editorial — ink in dark warm brown / charcoal, paper in cream / off-white, accent in burnt orange / terracotta. This is Reachy\'s house palette and reads "considered" by default.',
  '- Cold/tech products (developer tools, infra, fintech): ink in near-black, paper in near-white / cool gray, accent in electric blue / lime / cobalt.',
  '- Playful products (B2C, lifestyle, creator tools): ink can stay dark, paper can carry a tint, accent should be vibrant — coral, magenta, chartreuse.',
  '- Enterprise products: muted palette — deep navy / forest / oxblood ink, neutral paper, restrained accent.',
  '',
  'Output JSON { ink, paper, accent, reasoning }. The reasoning is 1-3 sentences explaining WHY this palette fits the positioning. Be specific — name the cue from the brief that decided it.',
];

function isValidHex(s: string | null | undefined): s is string {
  return typeof s === 'string' && /^#[0-9a-fA-F]{6}$/.test(s);
}

function estimateCostCents(promptTokens: number, completionTokens: number): number {
  // gpt-5.5 pricing: $5/M in, $30/M out.
  const cents = ((promptTokens * 5 + completionTokens * 30) / 1_000_000) * 100;
  return Math.max(1, Math.round(cents));
}

export async function inferPaletteFromText(args: {
  brief: Pick<ProductBrief, 'name' | 'oneLiner' | 'problem' | 'tone' | 'audience'>;
}): Promise<InferredPalette> {
  const openai = getOpenAI();
  const audienceLine = args.brief.audience.map((a) => `${a.role} (${a.painPoint})`).join('; ');

  const userLines = [
    `Product: ${args.brief.name}`,
    `One-liner: ${args.brief.oneLiner}`,
    `Problem: ${args.brief.problem}`,
    `Tone: ${args.brief.tone}`,
    audienceLine ? `Audience: ${audienceLine}` : null,
    '',
    'Pick a 3-color palette that fits THIS positioning. Use the default warm-editorial bias only if the brief gives you no clearer signal.',
  ].filter((l): l is string => l !== null);

  try {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: SYSTEM_LINES.join('\n') },
        { role: 'user', content: userLines.join('\n') },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'brand_palette', schema: JSON_SCHEMA, strict: true },
      },
      reasoning_effort: 'medium' as const,
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error('inferPaletteFromText: empty response');
    const parsed = JSON.parse(content) as {
      ink: string;
      paper: string;
      accent: string;
      reasoning: string;
    };

    const ink = isValidHex(parsed.ink) ? parsed.ink : FALLBACK_PALETTE.ink;
    const paper = isValidHex(parsed.paper) ? parsed.paper : FALLBACK_PALETTE.paper;
    const accent = isValidHex(parsed.accent) ? parsed.accent : FALLBACK_PALETTE.accent;

    const usage = completion.usage ?? { prompt_tokens: 0, completion_tokens: 0 };
    const costCents = estimateCostCents(usage.prompt_tokens, usage.completion_tokens);

    return { ink, paper, accent, reasoning: parsed.reasoning, costCents };
  } catch (err) {
    // Quality loop is opportunistic — never fail the ingestion because
    // palette inference threw. Return FALLBACK and a marker reasoning.
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[reachy:inferPalette] threw — using FALLBACK_PALETTE: ${msg}`);
    return {
      ...FALLBACK_PALETTE,
      reasoning: `inference failed (${msg.slice(0, 100)}); using editorial fallback`,
      costCents: 0,
    };
  }
}

/** Hex sentinel that the brief extractor returns when it couldn't
 *  confidently infer a palette. autoBrandKit checks for this and runs
 *  inferPaletteFromText when ALL three slots come back as the sentinel
 *  (i.e., the brief LLM explicitly punted). */
export const UNKNOWN_PALETTE_SENTINEL = '#000000';

export function briefPaletteIsSentinel(palette: {
  ink: string;
  paper: string;
  accent: string;
}): boolean {
  return (
    palette.ink === UNKNOWN_PALETTE_SENTINEL &&
    palette.paper === UNKNOWN_PALETTE_SENTINEL &&
    palette.accent === UNKNOWN_PALETTE_SENTINEL
  );
}
