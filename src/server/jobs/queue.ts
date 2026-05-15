import 'server-only';
import { Queue } from 'bullmq';
import type { QualityTier } from '@/lib/image-models';
import type { ImageFormat } from '@/server/ai/formats';
import type { ImageProvider } from '@/server/ai/imageGen';
import type { LayoutId } from '@/server/ai/layoutTemplates';
import { createBullConnection, QUEUE_NAMES } from './connection';

export interface ImageGenJobData {
  generationId: string;
  projectId: string;
  prompt: string;
  format: ImageFormat;
  provider: ImageProvider;
  model: string;
  n: 1 | 2 | 4;
  /** OpenAI quality tier. Omitted (or 'medium') matches pre-tier behavior;
   *  ignored by fal.ai entries. The form persists user's pick to
   *  localStorage and threads it here on each enqueue. */
  quality?: QualityTier;
  /** Marketing-grade overlay layout. When set, the worker plans copy
   *  with the LLM and composites brand-fontd typography on top of the
   *  AI background. When undefined, the AI output is returned raw (used
   *  by the video pipeline's scene image generation). */
  layoutId?: LayoutId;
  /** The user's raw idea — used by the copy planner. Stored separately
   *  from `prompt` because `prompt` is what we send to the IMAGE model
   *  (background-only directive) and `idea` is what we send to the LLM
   *  for headline / eyebrow generation. */
  idea?: string;
  /** Language for the planned copy. */
  language?: 'en' | 'es';
  /** Variation mode: when set, the worker calls OpenAI's images.edit
   *  with this URL's bytes as the source image instead of images.generate.
   *  Used by the "More like this" flow — keeps the original visual but
   *  applies an edit prompt for variations / nudges. */
  sourceRawUrl?: string;
  /** Plain-English nudge appended to the combined edit prompt when in
   *  variation mode ("warmer, more centered, more negative space"). */
  tweakPrompt?: string;
  /** Generation mode:
   *    exploration → N independent attempts (current default).
   *    sequence    → N frames generated serially; frame K uses frame
   *                  K-1 as the images.edit source. The worker drives
   *                  the serial loop + per-frame copy planning. */
  mode?: 'exploration' | 'sequence';
  /** AI effort tier:
   *    fast      → single-shot images.generate, no extras.
   *    balanced  → reasoning_effort='medium' when the model supports it.
   *    high      → reasoning_effort='high' + best-of-K critic (4
   *                internal candidates → gpt-5.4-mini vision pick). */
  effort?: 'fast' | 'balanced' | 'high';
}

let cached: Queue<ImageGenJobData> | null = null;

export function getImageQueue(): Queue<ImageGenJobData> {
  if (cached) return cached;
  cached = new Queue<ImageGenJobData>(QUEUE_NAMES.imageGen, {
    connection: createBullConnection(),
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: 'exponential', delay: 5_000 },
      removeOnComplete: { count: 200, age: 60 * 60 * 24 * 7 },
      removeOnFail: { count: 200, age: 60 * 60 * 24 * 30 },
    },
  });
  cached.on('error', (err) => {
    // BullMQ surfaces internal connection errors via this event. Without a
    // listener Node treats them as unhandled and crashes the dev server.
    console.error('[reachy:queue] image-gen error:', err.message);
  });
  return cached;
}
