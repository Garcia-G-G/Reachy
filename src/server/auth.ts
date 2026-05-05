import 'server-only';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { betterAuth } from 'better-auth';
import { nextCookies } from 'better-auth/next-js';
import { magicLink } from 'better-auth/plugins';
import { env } from '@/env';
import { db } from './db/client';
import * as authSchema from './db/schema/auth';
import { sendMagicLinkEmail } from './email/sendMagicLinkEmail';

function buildSocialProviders() {
  const id = env.GOOGLE_CLIENT_ID;
  const secret = env.GOOGLE_CLIENT_SECRET;
  if (!id || !secret) return undefined;
  return { google: { clientId: id, clientSecret: secret } };
}

export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: 'pg', schema: authSchema }),
  emailAndPassword: { enabled: false },
  socialProviders: buildSocialProviders(),
  // Tighter than the 100/60s default. /sign-in/magic-link is the only abusable
  // endpoint right now (each call sends a Resend email).
  rateLimit: {
    enabled: true,
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
