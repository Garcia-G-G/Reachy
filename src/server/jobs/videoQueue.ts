import 'server-only';
import { Queue } from 'bullmq';
import type { ReelEngine, ReelPlan } from '@/lib/reel-templates';
import { createBullConnection, QUEUE_NAMES } from './connection';

/**
 * Job payload for the video worker. The worker picks the engine: ffmpeg
 * composes from already-generated images; veo calls fal.ai and polls.
 */
export interface VideoGenJobData {
  generationId: string;
  projectId: string;
  projectSlug: string;
  engine: ReelEngine;
  plan: ReelPlan;
  /** Brand colors used by the FFmpeg engine for `background:'brand'` scenes. */
  brandColorHex: string;
  brandTextHex: string;
  /** For engine='ffmpeg': absolute R2 publicUrl of each image-backed scene's image. */
  sceneImageUrls?: Array<string | null>;
}

let cached: Queue<VideoGenJobData> | null = null;

export function getVideoQueue(): Queue<VideoGenJobData> {
  if (cached) return cached;
  cached = new Queue<VideoGenJobData>(QUEUE_NAMES.videoGen, {
    connection: createBullConnection(),
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: 'exponential', delay: 10_000 },
      removeOnComplete: { count: 100, age: 60 * 60 * 24 * 7 },
      removeOnFail: { count: 100, age: 60 * 60 * 24 * 30 },
    },
  });
  cached.on('error', (err) => {
    console.error('[reachy:queue] video-gen error:', err.message);
  });
  return cached;
}
