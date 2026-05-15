import 'server-only';
import { getOpenAI } from '@/server/ai/openai';
import {
  VISION_INSTRUCTION_LINES,
  VISION_SYSTEM_LINES,
} from '@/server/config/briefExtractionPrompts';
import { FALLBACK_PALETTE } from '@/server/config/fallbackPalette';
import { getR2Object } from '@/server/storage/r2';
import type { BundleImage } from './aggregate';
import { hashContent } from './util';

/**
 * Vision pass over a small selection of bundle images to extract a
 * brand-identity summary: dominant 3-color palette, single-word style
 * descriptor, and which image (if any) looks most like a logo.
 *
 * Skipped entirely when bundle.images.length === 0 — the caller falls
 * back to the brief's text-derived palette, or to FALLBACK_PALETTE.
 *
 * Vision model: gpt-4o (still the best multi-image-vision +
 * JSON-schema model in May 2026 per the critic.ts research note;
 * gpt-5.x has stronger pure reasoning but isn't a vision upgrade for
 * brand-style inference).
 */

export interface VisualIdentity {
  paletteHex: { ink: string; paper: string; accent: string };
  styleDescriptor: string;
  logoR2Key: string | null;
  confidence: number;
}

export interface ExtractVisualIdentityResult {
  identity: VisualIdentity | null;
  costCents: number;
  modelUsed: string | null;
  imagesConsidered: number;
}

export const DEFAULT_VISION_MODEL = 'gpt-4o';
const PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
};

/** Max images sent to the vision model per pass. More than 3 inflates
 *  cost without measurable quality gain — the model picks one dominant
 *  reading across them anyway. */
const MAX_VISION_IMAGES = 3;
/** Max bytes per image we send through — anything bigger gets dropped.
 *  Vision tokenizes the image regardless, so cost is mostly
 *  dimension-driven; this just avoids stuffing a 25MB poster into
 *  one round-trip. */
const MAX_VISION_IMAGE_BYTES = 4 * 1024 * 1024;

const JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['paletteHex', 'styleDescriptor', 'logoR2Key', 'confidence'],
  properties: {
    paletteHex: {
      type: 'object',
      additionalProperties: false,
      required: ['ink', 'paper', 'accent'],
      properties: {
        ink: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
        paper: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
        accent: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
      },
    },
    styleDescriptor: { type: 'string', minLength: 1, maxLength: 32 },
    logoR2Key: { type: ['string', 'null'], maxLength: 400 },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
  },
};

/** Rank-pick the top-N images by (a) size (larger = more brand-
 *  weighted), (b) perceptual uniqueness (drop near-duplicates via a
 *  cheap hash). Logos and hero photos tend to sit at the top after
 *  this. */
function pickTopImages(images: readonly BundleImage[], n: number): BundleImage[] {
  // Hash-based dedup: persistExtractedImage already stores SHA-256-
  // prefixed R2 keys, so identical bytes share a key. Across uploads
  // we may still see visually similar images with different keys, but
  // that's a Step-2-future-pass concern; here we drop literal dupes.
  const seen = new Set<string>();
  const unique: BundleImage[] = [];
  for (const img of images) {
    const key = hashContent(img.r2Key);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(img);
  }
  return [...unique].sort((a, b) => b.bytes - a.bytes).slice(0, n);
}

function buildSystemPrompt(): string {
  return VISION_SYSTEM_LINES.join('\n');
}

function buildUserText(imageRefs: BundleImage[]): string {
  const lines: string[] = [];
  lines.push(...VISION_INSTRUCTION_LINES);
  lines.push('');
  lines.push('The images you see correspond, in order, to these R2 keys:');
  imageRefs.forEach((img, i) => {
    const pal =
      img.palette && img.palette.length > 0 ? ` (sharp palette ${img.palette.join(', ')})` : '';
    lines.push(`${i + 1}. ${img.r2Key}${pal}`);
  });
  lines.push('');
  lines.push('Refer to the keys verbatim when populating logoR2Key.');
  return lines.join('\n');
}

function estimateCostCents(model: string, promptTokens: number, completionTokens: number): number {
  const rate = PRICING[model] ?? PRICING['gpt-4o-mini'];
  if (!rate) return 0;
  const cents = ((promptTokens * rate.input + completionTokens * rate.output) / 1_000_000) * 100;
  return Math.max(1, Math.round(cents));
}

function bufferToDataUrl(buf: Buffer, mime: string): string {
  return `data:${mime};base64,${buf.toString('base64')}`;
}

export async function extractVisualIdentity(args: {
  images: readonly BundleImage[];
  model?: string;
}): Promise<ExtractVisualIdentityResult> {
  if (!args.images || args.images.length === 0) {
    return { identity: null, costCents: 0, modelUsed: null, imagesConsidered: 0 };
  }

  const picked = pickTopImages(args.images, MAX_VISION_IMAGES);
  if (picked.length === 0) {
    return { identity: null, costCents: 0, modelUsed: null, imagesConsidered: 0 };
  }

  // Pull bytes for each picked image. Drop oversized entries instead
  // of failing the whole pass.
  const inlined: Array<{ buf: Buffer; mime: string; ref: BundleImage }> = [];
  for (const img of picked) {
    try {
      const buf = await getR2Object(img.r2Key);
      if (buf.byteLength > MAX_VISION_IMAGE_BYTES) continue;
      inlined.push({ buf, mime: img.mime, ref: img });
    } catch {}
  }
  if (inlined.length === 0) {
    return { identity: null, costCents: 0, modelUsed: null, imagesConsidered: 0 };
  }

  const model = args.model ?? DEFAULT_VISION_MODEL;
  const openai = getOpenAI();

  const userContent: Array<
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string; detail?: 'low' | 'high' | 'auto' } }
  > = [
    { type: 'text', text: buildUserText(inlined.map((i) => i.ref)) },
    ...inlined.map((i) => ({
      type: 'image_url' as const,
      image_url: { url: bufferToDataUrl(i.buf, i.mime), detail: 'low' as const },
    })),
  ];

  const completion = await openai.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: buildSystemPrompt() },
      { role: 'user', content: userContent },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'brand_visual_identity',
        schema: JSON_SCHEMA,
        strict: true,
      },
    },
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    return {
      identity: null,
      costCents: 0,
      modelUsed: model,
      imagesConsidered: inlined.length,
    };
  }
  let parsed: VisualIdentity;
  try {
    parsed = JSON.parse(content) as VisualIdentity;
  } catch {
    return { identity: null, costCents: 0, modelUsed: model, imagesConsidered: inlined.length };
  }

  // Defensive normalization — palette must contain real hex values.
  for (const slot of ['ink', 'paper', 'accent'] as const) {
    if (!/^#[0-9a-fA-F]{6}$/.test(parsed.paletteHex?.[slot] ?? '')) {
      parsed.paletteHex = parsed.paletteHex ?? { ...FALLBACK_PALETTE };
      parsed.paletteHex[slot] = FALLBACK_PALETTE[slot];
    }
  }

  // Validate logoR2Key — must match one of the inlined references or
  // be null. The model occasionally returns hallucinated paths.
  const validKeys = new Set(inlined.map((i) => i.ref.r2Key));
  if (parsed.logoR2Key && !validKeys.has(parsed.logoR2Key)) {
    parsed.logoR2Key = null;
  }

  const usage = completion.usage ?? { prompt_tokens: 0, completion_tokens: 0 };
  const costCents = estimateCostCents(model, usage.prompt_tokens, usage.completion_tokens);

  return {
    identity: parsed,
    costCents,
    modelUsed: model,
    imagesConsidered: inlined.length,
  };
}
