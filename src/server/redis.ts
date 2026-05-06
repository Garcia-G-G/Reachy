import 'server-only';
import IORedis, { type Redis } from 'ioredis';
import { env } from '@/env';

let client: Redis | null = null;

export function getRedis(): Redis | null {
  if (!env.REDIS_URL) return null;
  if (client) return client;
  client = new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    lazyConnect: false,
  });
  client.on('error', (err) => {
    console.error('[reachy:redis] error:', err.message);
  });
  return client;
}
