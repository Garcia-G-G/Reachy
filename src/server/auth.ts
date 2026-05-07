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
  // Pin the OAuth scope explicitly. Without this, better-auth still defaults
  // to email+profile, but pinning it keeps a future plugin upgrade from
  // silently widening what we ask Google for.
  return {
    google: {
      clientId: id,
      clientSecret: secret,
      scope: ['email', 'profile'],
    },
  };
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
  // Trust only our canonical origin. Anything else (preview deploys, custom
  // domains) must be added explicitly. Defense in depth against open-redirect
  // chains via callbackURL/next params.
  trustedOrigins: [env.BETTER_AUTH_URL],
  // Force Secure / SameSite=lax cookies in production regardless of any
  // upstream proxy stripping the `https` scheme. In dev we leave the default
  // (HTTP cookies on localhost).
  advanced: {
    useSecureCookies: env.NODE_ENV === 'production',
    defaultCookieAttributes: { sameSite: 'lax' },
  },
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
      // Pin to the documented default so a plugin upgrade can't silently
      // weaken either knob.
      disableSignUp: false,
      allowedAttempts: 1,
      // Hash tokens at rest. Without this, anyone with read access to the
      // verification table (logs, support backup, breached snapshot) can mint
      // a working magic link for any pending sign-in.
      storeToken: 'hashed',
      sendMagicLink: async ({ email, url }) => {
        await sendMagicLinkEmail({ to: email, url });
      },
    }),
    nextCookies(),
  ],
});

export type Auth = typeof auth;
export const isGoogleEnabled = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
