import 'server-only';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { betterAuth } from 'better-auth';
import { nextCookies } from 'better-auth/next-js';
import { magicLink } from 'better-auth/plugins';
import { env } from '@/env';
import { db } from './db/client';
import * as authSchema from './db/schema/auth';
import { sendMagicLinkEmail } from './email/sendMagicLinkEmail';
import { getRedis } from './redis';

function buildSocialProviders() {
  const id = env.GOOGLE_CLIENT_ID;
  const secret = env.GOOGLE_CLIENT_SECRET;
  if (!id || !secret) return undefined;
  return { google: { clientId: id, clientSecret: secret } };
}

const redis = getRedis();

const secondaryStorage = redis
  ? {
      get: async (key: string) => (await redis.get(key)) ?? null,
      set: async (key: string, value: string, ttl?: number) => {
        if (ttl) await redis.set(key, value, 'EX', ttl);
        else await redis.set(key, value);
      },
      delete: async (key: string) => {
        await redis.del(key);
      },
    }
  : undefined;

export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: 'pg', schema: authSchema }),
  emailAndPassword: { enabled: false },
  socialProviders: buildSocialProviders(),
  secondaryStorage,
  // Tighter than the 100/60s default. /sign-in/magic-link is the only abusable
  // endpoint right now (each call sends a Resend email).
  // Backed by Redis when REDIS_URL is set so the limit holds across instances;
  // falls back to in-memory in pure-local dev.
  rateLimit: {
    enabled: true,
    storage: redis ? 'secondary-storage' : 'memory',
    window: 60,
    max: 60,
    customRules: {
      '/sign-in/magic-link': { window: 60, max: 5 },
    },
  },
  plugins: [
    magicLink({
      expiresIn: 60 * 15,
      disableSignUp: false,
      sendMagicLink: async ({ email, url }) => {
        await sendMagicLinkEmail({ to: email, url });
      },
    }),
    nextCookies(),
  ],
});

export type Auth = typeof auth;
export const isGoogleEnabled = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
