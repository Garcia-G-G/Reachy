import 'server-only';
import { Queue } from 'bullmq';
import type { ImageFormat } from '@/server/ai/formats';
import type { ImageProvider } from '@/server/ai/imageGen';
import { QUEUE_NAMES, createBullConnection } from './connection';

export interface ImageGenJobData {
  generationId: string;
  projectId: string;
  prompt: string;
  format: ImageFormat;
  provider: ImageProvider;
  model: string;
  n: 1 | 2 | 4;
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
  return cached;
}
