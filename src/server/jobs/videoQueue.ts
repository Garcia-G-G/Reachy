import 'server-only';
import { Queue } from 'bullmq';
import type { ReelEngine, ReelPlan } from '@/lib/reel-templates';
import type { VisualStyleKey } from '@/server/ai/visualStyles';
import { createBullConnection, QUEUE_NAMES } from './connection';

/**
 * Job payload for the video worker. The worker picks the engine: ffmpeg
 * composes from already-generated images; sora-* generates the visuals
 * per scene via OpenAI Sora 2 and then composes.
 */
export interface VideoGenJobData {
  generationId: string;
  projectId: string;
  projectSlug: string;
  engine: ReelEngine;
  plan: ReelPlan;
  /** Brand colors used for `background:'brand'` scenes. */
  brandColorHex: string;
  brandTextHex: string;
  /** Visual style — picks the background music track (public/music/<key>.mp3).
   *  Defaults to 'editorial' if the project has no brandKit yet. */
  visualStyle?: VisualStyleKey;
  /** For engine='ffmpeg': absolute R2 publicUrl of each image-backed scene's image. */
  sceneImageUrls?: Array<string | null>;
  /** Brand-kit toggle for whether the reel may show humans / faces.
   *  Defaults to true server-side when the brand kit's
   *  `allows_humans` column is null (pre-Step-2 row). The video
   *  worker reads this to pick the human-constraint directive for
   *  the Sora prompt (see src/server/config/reelDirectives.ts). */
  allowsHumans?: boolean;
  /** Brand-kit tone (snapshot at enqueue time). The video worker
   *  uses this to pick a voice from the curated catalog when no
   *  ENV-pinned voice override is set. */
  tone?: string;
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
