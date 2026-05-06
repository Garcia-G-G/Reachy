import 'server-only';
import { fal } from '@fal-ai/client';
import { env } from '@/env';

let configured = false;

export function getFal(): typeof fal {
  if (!env.FAL_KEY) {
    throw new Error('FAL_KEY is not set. Add it to .env.local.');
  }
  if (!configured) {
    fal.config({ credentials: env.FAL_KEY });
    configured = true;
  }
  return fal;
}

export function isFalConfigured(): boolean {
  return Boolean(env.FAL_KEY);
}
