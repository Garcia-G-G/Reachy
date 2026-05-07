import 'server-only';
import { getRedis } from '@/server/redis';

/**
 * Sliding-window-ish rate limiter backed by Redis. Uses INCR + EXPIRE on a
 * per-bucket key. Cheap (one round-trip) and good enough for the polling /
 * action surfaces we want to protect; if abuse hits real volume, swap for a
 * proper sorted-set / token-bucket implementation.
 *
 * Falls open (`{ ok: true }`) when REDIS_URL is unset, so dev without Redis
 * stays usable. The auth flow already requires Redis in production, so a
 * missed bucket only happens when the operator is also bypassing better-auth's
 * rate limit — ack'd risk.
 */
export interface RateLimitArgs {
  /** Stable id for the actor — usually `session.user.id`. */
  key: string;
  /** Bucket name. Two callers with the same name share a budget. */
  bucket: string;
  /** Max calls allowed per `windowSec`. */
  max: number;
  /** Window in seconds. */
  windowSec: number;
}

export interface RateLimitResult {
  ok: boolean;
  /** How many calls have been counted in the current window (after this one). */
  count: number;
  /** Remaining calls in the current window. */
  remaining: number;
  /** Seconds until the bucket resets. */
  resetSec: number;
}

export async function rateLimit(args: RateLimitArgs): Promise<RateLimitResult> {
  const redis = getRedis();
  if (!redis) {
    return { ok: true, count: 0, remaining: args.max, resetSec: args.windowSec };
  }

  const key = `reachy:rl:${args.bucket}:${args.key}`;
  // Multi: increment first; only the first hit per window sets the TTL.
  const pipeline = redis.multi();
  pipeline.incr(key);
  pipeline.ttl(key);
  const replies = await pipeline.exec();

  const countRaw = replies?.[0]?.[1];
  const ttlRaw = replies?.[1]?.[1];
  const count = typeof countRaw === 'number' ? countRaw : Number(countRaw ?? 0);
  let ttl = typeof ttlRaw === 'number' ? ttlRaw : Number(ttlRaw ?? -1);

  if (ttl < 0) {
    // First hit (or expired between INCR and TTL) — set the window.
    await redis.expire(key, args.windowSec);
    ttl = args.windowSec;
  }

  return {
    ok: count <= args.max,
    count,
    remaining: Math.max(0, args.max - count),
    resetSec: ttl,
  };
}
