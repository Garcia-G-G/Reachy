import 'server-only';
import IORedis, { type Redis } from 'ioredis';
import { env } from '@/env';

// BullMQ requires `maxRetriesPerRequest: null` and recommends
// `enableReadyCheck: false`. Use a dedicated connection per BullMQ docs.
export function createBullConnection(): Redis {
  if (!env.REDIS_URL) {
    throw new Error('REDIS_URL is required for the image-generation queue.');
  }
  return new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
}

export const QUEUE_NAMES = {
  imageGen: 'image-gen',
} as const;
