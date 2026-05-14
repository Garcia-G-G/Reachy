import 'server-only';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { env } from '@/env';

/**
 * ElevenLabs v3 TTS. Replaces OpenAI gpt-4o-mini-tts for reel narration
 * when ELEVENLABS_API_KEY is set. eleven_v3 (GA March 2026) supports
 * 70+ languages, inline audio tags like [whispers]/[excited]/[pause],
 * and far better expressive control than the gpt-4o-mini-tts `instructions`
 * field. Spanish phonemes are native, not anglicized.
 *
 * Falls back transparently to OpenAI when not configured — see the worker's
 * renderSceneTts. The first ELEVENLABS_API_KEY-less render after this lands
 * will log a single warning instead of failing.
 *
 * SDK: `@elevenlabs/elevenlabs-js`. The convert() method returns a web
 * ReadableStream<Uint8Array> that we drain into a Node Buffer for the
 * existing per-scene .mp3 file-writing pipeline.
 */

let cached: ElevenLabsClient | null = null;

/**
 * ElevenLabs is "configured" only when both an API key AND at least one voice
 * are set — without a voice we can't synthesize anything. Per-language voices
 * are preferred; the catch-all ELEVENLABS_VOICE_ID is a fallback.
 */
export function isElevenLabsConfigured(): boolean {
  if (!env.ELEVENLABS_API_KEY) return false;
  return Boolean(
    env.ELEVENLABS_VOICE_ID || env.ELEVENLABS_VOICE_ID_EN || env.ELEVENLABS_VOICE_ID_ES,
  );
}

/**
 * Pick the voice id for a given language. Falls through in priority order:
 *   1. Per-language env (`ELEVENLABS_VOICE_ID_EN` / `_ES`)
 *   2. Catch-all `ELEVENLABS_VOICE_ID`
 *   3. Caller-provided voiceId argument (if synthesizeElevenLabs got one)
 *   4. null → caller falls back to OpenAI TTS
 */
function resolveVoiceId(language: 'es' | 'en', override?: string): string | null {
  if (override) return override;
  if (language === 'es' && env.ELEVENLABS_VOICE_ID_ES) return env.ELEVENLABS_VOICE_ID_ES;
  if (language === 'en' && env.ELEVENLABS_VOICE_ID_EN) return env.ELEVENLABS_VOICE_ID_EN;
  return env.ELEVENLABS_VOICE_ID ?? null;
}

function getClient(): ElevenLabsClient {
  if (!env.ELEVENLABS_API_KEY) {
    throw new Error('ELEVENLABS_API_KEY not set');
  }
  if (!cached) {
    cached = new ElevenLabsClient({ apiKey: env.ELEVENLABS_API_KEY });
  }
  return cached;
}

export interface ElevenLabsSynthArgs {
  text: string;
  language: 'es' | 'en';
  /** Override the env-configured default voice. */
  voiceId?: string;
}

export interface ElevenLabsSynthResult {
  buffer: Buffer;
  bytes: number;
  costCents: number;
}

/**
 * Synthesize speech with ElevenLabs and return MP3 bytes.
 *
 * Pricing as of May 2026 (per the ElevenLabs Creator plan, the one most
 * indie users land on): roughly $0.30 per 1k input characters with v3.
 * Per-scene minimum 1¢ floor matches the rest of the cost ledger.
 *
 * Audio tags: callers can include `[whispers] …` or `[pause]` directly
 * inside `text` — eleven_v3 interprets bracketed cues inline. Currently
 * we don't expose this to the user; the planner / customScript pipes
 * plain text through. Future improvement: have the planner emit
 * appropriate tags for hooks vs takeaways.
 */
export async function synthesizeElevenLabs(
  args: ElevenLabsSynthArgs,
): Promise<ElevenLabsSynthResult> {
  const client = getClient();
  const voiceId = resolveVoiceId(args.language, args.voiceId);
  if (!voiceId) {
    throw new Error(
      `No ElevenLabs voice configured for language=${args.language}. ` +
        `Set ELEVENLABS_VOICE_ID_${args.language.toUpperCase()} or ELEVENLABS_VOICE_ID in .env.local.`,
    );
  }
  const modelId = env.ELEVENLABS_MODEL_ID ?? 'eleven_v3';
  const startedAt = Date.now();
  console.log(
    `[reachy:debug-trace] synthesizeElevenLabs -> convert voiceId=${voiceId} modelId=${modelId} lang=${args.language} textBytes=${args.text.length}`,
  );

  const stream = await client.textToSpeech.convert(voiceId, {
    text: args.text,
    modelId,
    outputFormat: 'mp3_44100_128',
    // Stability vs similarity trade-off: stability=0.5 keeps the voice
    // consistent across calls while leaving room for prosody; style=0.3 lets
    // v3's emotional model nudge inflection without overacting; speaker
    // boost on so Spanish accents stay crisp.
    voiceSettings: {
      stability: 0.5,
      similarityBoost: 0.75,
      style: 0.3,
      useSpeakerBoost: true,
    },
  });

  // convert() returns a web ReadableStream<Uint8Array>. Node 18+'s
  // ReadableStream IS async-iterable at runtime, but TS's lib.dom
  // declarations don't reflect that — drain through the reader API for
  // a type-safe loop.
  const reader = stream.getReader();
  const chunks: Buffer[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(Buffer.from(value));
  }
  const buffer = Buffer.concat(chunks);

  // ~$0.30 per 1k chars on the Creator-tier pricing (300¢/1000 = 0.3¢/char).
  // For typical reel scene text (50 chars) this rounds to <1¢; per-scene
  // 1¢ floor stays aligned with the OpenAI TTS reporting we replaced.
  const costCents = Math.max(1, Math.round((args.text.length / 1000) * 30));
  console.log(
    `[reachy:debug-trace] synthesizeElevenLabs ok voiceId=${voiceId} bytes=${buffer.length} costCents=${costCents} elapsedMs=${Date.now() - startedAt}`,
  );
  return { buffer, bytes: buffer.length, costCents };
}
