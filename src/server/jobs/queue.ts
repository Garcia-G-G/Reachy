import 'server-only';
import { Queue } from 'bullmq';
import type { QualityTier } from '@/lib/image-models';
import type { ImageFormat } from '@/server/ai/formats';
import type { ImageProvider } from '@/server/ai/imageGen';
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
