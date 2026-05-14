import 'server-only';
import { toFile } from 'openai';
import sharp from 'sharp';
import type { ImageFormat, ImageFormatSpec, ImageProvider } from '@/lib/image-formats';
import { estimateImageCost, type ImageModelId, type QualityTier } from '@/lib/image-models';
import { getFal } from './fal';
import { getFormat } from './formats';
import { getOpenAI } from './openai';

/**
 * ─────────────────────────────────────────────────────────────────────────
 * Provider catalog snapshot — 2026-05-14 (refresh before adding models).
 * The full per-model capability table lives in src/lib/image-models.ts;
 * this header just captures the API-level facts the dispatch needs.
 *
 * OpenAI (`openai.images.generate` / `openai.images.edit`):
 *   Active flagship   : gpt-image-2          (released 2026-04-21)
 *   Active prev-flagship: gpt-image-1.5      (released 2025-12-16)
 *   Active legacy     : gpt-image-1
 *   Active budget     : gpt-image-1-mini
 *   REMOVED 2026-05-12: dall-e-3, dall-e-2 — both return errors now.
 *
 *   Parameters honored by all four gpt-image-* models:
 *     model        — exact ID string above
 *     prompt       — text prompt
 *     n            — 1..10 per request
 *     size         — '1024x1024' | '1024x1536' | '1536x1024' | 'auto'
 *                    (gpt-image-2 additionally supports many custom sizes)
 *     quality      — 'low' | 'medium' | 'high' | 'auto'
 *     output_format       — 'png' | 'jpeg' | 'webp'
 *     output_compression  — 0..100 for jpeg/webp (we don't use yet)
 *     background          — 'transparent' supported on gpt-image-1 family
 *                            ONLY (gpt-image-2 dropped transparent bg)
 *
 *   Edit endpoint accepts up to 16 reference images; sweet spot is 1-4.
 *
 * fal.ai (`fal.subscribe(modelId, …)`):
 *   Current entries: flux-2-pro, flux-2-flex, recraft-v3, nano-banana-2,
 *   ideogram/v3 (best for typography).
 *   `quality` is not honored — passed through but ignored on the wire.
 *   Image size is requested as { width, height }; the model may return
 *   close-but-not-exact dimensions, so sharp resize below is the safety
 *   net for every fal call.
 * ─────────────────────────────────────────────────────────────────────────
 */

export type { ImageModelId, ImageProvider, QualityTier };

export interface GenerateImageInput {
  prompt: string;
  format: ImageFormat;
  provider: ImageProvider;
  /** Model ID — see src/lib/image-models.ts for the catalog. Accepts a
   *  free string for backwards-compat with legacy generation rows; the
   *  validator at the action boundary is the gate. */
  model: ImageModelId | string;
  n: 1 | 2 | 4;
  /** OpenAI-family quality tier. fal entries ignore this. Defaults to
   *  'medium' when omitted so legacy callers don't change behavior. */
  quality?: QualityTier;
  /** When set, the OpenAI path runs `images.edit` against this source
   *  buffer instead of `images.generate`. The fal path ignores this.
   *  Used by the "More like this" variation flow. */
  sourceImage?: Buffer;
}

export interface GenerateImageResult {
  buffers: Buffer[];
  costCents: number;
  contentType: 'image/png' | 'image/jpeg';
}

const OPENAI_SIZES = {
  square: '1024x1024',
  landscape: '1536x1024',
  portrait: '1024x1536',
} as const;

type OpenAISize = (typeof OPENAI_SIZES)[keyof typeof OPENAI_SIZES];

function pickOpenAISize(spec: ImageFormatSpec): OpenAISize {
  const ratio = spec.w / spec.h;
  if (Math.abs(ratio - 1) < 0.08) return OPENAI_SIZES.square;
  return ratio > 1 ? OPENAI_SIZES.landscape : OPENAI_SIZES.portrait;
}

async function resizeToFormat(
  buf: Buffer,
  spec: ImageFormatSpec,
): Promise<{ buffer: Buffer; contentType: 'image/png' }> {
  // compressionLevel:9 is 3-5× slower than the libvips default of 6 for ~5%
  // smaller PNGs — bad trade for hot-path image generation. failOn:'none'
  // prevents an arbitrary "warning" from upstream provider output (Apple
  // ColorSync chunks, etc) from blowing up the entire generation.
  // (Future: switch to .webp({ effort: 4, quality: 82 }) — 30-50% smaller R2
  // bills than PNG with the same visual quality. Blocked on the public
  // surface still typing contentType as 'image/png' across the workers.)
  // Source: https://sharp.pixelplumbing.com/api-output#png
  const out = await sharp(buf, { failOn: 'none' })
    .resize(spec.w, spec.h, { fit: 'cover', position: 'centre' })
    .png({ compressionLevel: 6 })
    .toBuffer();
  return { buffer: out, contentType: 'image/png' };
}

async function fetchToBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch generated image (${res.status} ${res.statusText})`);
  }
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Cost lookup — delegates to the typed catalog in src/lib/image-models.ts
 * when the model id is recognized, falls back to a flat 5¢ estimate for
 * legacy generation rows whose model string isn't in the catalog (e.g. a
 * row from before the catalog existed). The server-side cap check uses
 * the same helper, so client preview and worker billing stay in sync.
 */
function estimateCost(model: string, quality: QualityTier, n: number): number {
  try {
    return estimateImageCost(model as ImageModelId, quality, n);
  } catch {
    return Math.max(1, 5 * n);
  }
}

async function openaiImage(input: GenerateImageInput): Promise<GenerateImageResult> {
  const spec = getFormat(input.format);
  const openai = getOpenAI();
  const size = pickOpenAISize(spec);
  // Quality tier defaults to 'medium' for callers (worker, video pipeline)
  // that don't supply one. Garcia's image form passes the user's selection.
  const quality = input.quality ?? 'medium';

  // Variation mode: when a sourceImage buffer is provided we call the
  // images.edit endpoint (gpt-image-* family supports it natively, up
  // to 16 reference images). Cost mirrors generate at the same tier
  // because OpenAI bills per output image regardless of endpoint.
  // The toFile helper wraps the Buffer with a filename so the SDK can
  // serialize it as multipart/form-data.
  const result = input.sourceImage
    ? await openai.images.edit({
        model: input.model,
        image: await toFile(input.sourceImage, 'source.png', { type: 'image/png' }),
        prompt: input.prompt,
        n: input.n,
        size,
        quality,
      })
    : await openai.images.generate({
        model: input.model,
        prompt: input.prompt,
        n: input.n,
        size,
        quality,
      });

  if (!result.data || result.data.length === 0) {
    throw new Error('OpenAI returned no images.');
  }

  const buffers: Buffer[] = [];
  for (const item of result.data) {
    let raw: Buffer;
    if (item.b64_json) {
      raw = Buffer.from(item.b64_json, 'base64');
    } else if (item.url) {
      raw = await fetchToBuffer(item.url);
    } else {
      throw new Error('OpenAI image had neither b64_json nor url.');
    }
    const resized = await resizeToFormat(raw, spec);
    buffers.push(resized.buffer);
  }

  return {
    buffers,
    costCents: estimateCost(input.model, quality, input.n),
    contentType: 'image/png',
  };
}

interface FalImageOutput {
  url?: string;
  content_type?: string;
}

interface FalSubscribeResult {
  data?: { images?: FalImageOutput[] };
}

async function falImage(input: GenerateImageInput): Promise<GenerateImageResult> {
  const spec = getFormat(input.format);
  const fal = getFal();

  const result = (await fal.subscribe(input.model, {
    input: {
      prompt: input.prompt,
      image_size: { width: spec.w, height: spec.h },
      num_images: input.n,
    },
    logs: false,
  })) as FalSubscribeResult;

  const images = result.data?.images ?? [];
  if (images.length === 0) {
    throw new Error('fal.ai returned no images.');
  }

  const buffers: Buffer[] = [];
  for (const img of images) {
    if (!img.url) throw new Error('fal.ai image had no url.');
    const raw = await fetchToBuffer(img.url);
    // Most fal models return the requested size already; resize is a no-op when
    // dims already match, and a safety net when they don't.
    const resized = await resizeToFormat(raw, spec);
    buffers.push(resized.buffer);
  }

  // fal.ai entries ignore the quality param — pass medium so the cost
  // estimator returns the entry's flat per-image figure.
  return {
    buffers,
    costCents: estimateCost(input.model, input.quality ?? 'medium', input.n),
    contentType: 'image/png',
  };
}

export async function generateImage(input: GenerateImageInput): Promise<GenerateImageResult> {
  if (input.provider === 'openai') return openaiImage(input);
  if (input.provider === 'fal') return falImage(input);
  throw new Error(`Unknown image provider: ${input.provider satisfies never}`);
}

export { IMAGE_MODELS_BY_PROVIDER } from '@/lib/image-models';
