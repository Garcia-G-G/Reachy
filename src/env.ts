import 'server-only';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  DATABASE_URL: z.url(),
  REDIS_URL: z.url().optional(),
  BETTER_AUTH_SECRET: z.string().min(32, 'BETTER_AUTH_SECRET must be at least 32 chars'),
  BETTER_AUTH_URL: z.url(),

  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),

  OPENAI_API_KEY: z.string().min(1).optional(),
  FAL_KEY: z.string().min(1).optional(),

  // ElevenLabs v3 TTS. When configured, the reel worker uses ElevenLabs for
  // per-scene narration; falls back to OpenAI gpt-4o-mini-tts otherwise.
  ELEVENLABS_API_KEY: z.string().min(1).optional(),
  // Distinct voices per language so the Spanish reel doesn't sound like an
  // English narrator faking accents and vice versa. Pick voices tagged
  // "narrative/editorial" with a professional-but-laid-back register from
  // https://elevenlabs.io/app/voice-library. ELEVENLABS_VOICE_ID acts as a
  // fallback when only one is set; per-language vars take precedence.
  ELEVENLABS_VOICE_ID: z.string().min(1).optional(),
  ELEVENLABS_VOICE_ID_EN: z.string().min(1).optional(),
  ELEVENLABS_VOICE_ID_ES: z.string().min(1).optional(),
  // Model id for ElevenLabs synthesis. Defaults to 'eleven_v3' (GA March 2026,
  // supports audio tags and 70+ languages). Override per env if you want to
  // pin to 'eleven_multilingual_v2' or 'eleven_turbo_v2_5' for lower latency.
  ELEVENLABS_MODEL_ID: z.string().min(1).optional(),

  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().optional(),
  R2_PUBLIC_URL: z.url().optional(),

  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.email().optional(),
});

const cleaned = Object.fromEntries(
  Object.entries(process.env).map(([k, v]) => [k, v === '' ? undefined : v]),
);

const parsed = schema.safeParse(cleaned);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('\n');
  console.error(`\n[reachy] Invalid environment variables:\n${issues}\n`);
  throw new Error('Invalid environment variables. See errors above.');
}

export const env = parsed.data;
export type Env = z.infer<typeof schema>;
