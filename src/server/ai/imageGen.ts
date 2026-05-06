import 'server-only';
import sharp from 'sharp';
import type { ImageFormat, ImageFormatSpec, ImageProvider } from '@/lib/image-formats';
import { getFal } from './fal';
import { getFormat } from './formats';
import { getOpenAI } from './openai';

export type { ImageProvider };

export interface GenerateImageInput {
  prompt: string;
  format: ImageFormat;
  provider: ImageProvider;
  model: string; // 'gpt-image-1' for openai; 'fal-ai/flux-2-pro' etc. for fal
  n: 1 | 2 | 4;
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
  const out = await sharp(buf)
    .resize(spec.w, spec.h, { fit: 'cover', position: 'centre' })
    .png({ compressionLevel: 9 })
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

// Approximate cents per image. Tune as providers update pricing; this is for
// recording an estimate, not invoicing.
const COST_CENTS_PER_IMAGE: Record<string, number> = {
  'gpt-image-1': 7,
  'fal-ai/flux-2-pro': 4,
  'fal-ai/flux-2-flex': 3,
  'fal-ai/flux/dev': 1,
  'fal-ai/nano-banana-2': 5,
  'fal-ai/recraft-v3': 4,
};

function estimateCost(model: string, n: number): number {
  const per = COST_CENTS_PER_IMAGE[model] ?? 5;
  return per * n;
}

async function openaiImage(input: GenerateImageInput): Promise<GenerateImageResult> {
  const spec = getFormat(input.format);
  const openai = getOpenAI();
  const size = pickOpenAISize(spec);

  const result = await openai.images.generate({
    model: input.model,
    prompt: input.prompt,
    n: input.n,
    size,
    quality: 'medium',
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
    costCents: estimateCost(input.model, input.n),
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

  return {
    buffers,
    costCents: estimateCost(input.model, input.n),
    contentType: 'image/png',
  };
}

export async function generateImage(input: GenerateImageInput): Promise<GenerateImageResult> {
  if (input.provider === 'openai') return openaiImage(input);
  if (input.provider === 'fal') return falImage(input);
  throw new Error(`Unknown image provider: ${input.provider satisfies never}`);
}

export { IMAGE_PROVIDERS } from '@/lib/image-formats';
