import 'server-only';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { env } from '@/env';
import type { VisualStyleKey } from '@/lib/visual-styles-meta';

/**
 * ElevenLabs Music API — generates a fully-licensed instrumental music
 * track to sit under the TTS narration. Uses the same ELEVENLABS_API_KEY
 * as the voice synth; no Pixabay / Free Music Archive scraping.
 *
 * SDK shape (verified against @elevenlabs/elevenlabs-js@2.30.0):
 *   client.music.compose({
 *     prompt: string,
 *     musicLengthMs: number,   // 3000 – 600000
 *     modelId: 'music_v1',
 *     forceInstrumental: true, // we always want no vocals under TTS
 *     outputFormat: 'mp3_44100_128',
 *   }) → ReadableStream<Uint8Array>
 *
 * Per-style prompts below were tuned to match each visualStyle's mood —
 * editorial leans calm/strings, abstract leans ambient/synth, etc. They
 * intentionally avoid genre buzzwords ElevenLabs would interpret too
 * literally ("trap", "phonk") and keep instrumentation specific so the
 * output sits cleanly under spoken voice without competing for attention.
 */

const STYLE_TO_MUSIC_PROMPT: Record<VisualStyleKey, string> = {
  editorial:
    'Calm editorial documentary score, gentle piano with subtle warm strings underneath, slow tempo around 72 BPM, premium magazine feel, no vocals, no drums on the downbeat, sits quietly under a narrator.',
  'paper-cutout':
    'Warm acoustic indie folk, plucked nylon-string guitar with light shaker and brushed snare, cozy hand-made feel, mid-tempo around 95 BPM, no vocals, leaves room for a narrator on top.',
  'flat-2d':
    'Upbeat playful explainer music, ukulele with light hand claps and soft synth pads, friendly and curious, around 110 BPM, no vocals, mixed quietly so a narrator stays clearly on top.',
  infographic:
    'Clean modern minimal electronic, subtle four-on-the-floor at 100 BPM with soft synth pads, data-driven and confident, no vocals, sits quietly under a narrator.',
  isometric:
    'Dreamy synthwave with soft arpeggios and warm pads, mid-tempo around 95 BPM, modern indie-tech ambient, no vocals, leaves space for spoken voice.',
  abstract:
    'Cinematic ambient drone with slowly evolving warm pads and subtle sub-bass, premium tech keynote feel, around 70 BPM, no percussion, no vocals, sits well under a narrator.',
};

let cached: ElevenLabsClient | null = null;
function getClient(): ElevenLabsClient {
  if (!env.ELEVENLABS_API_KEY) throw new Error('ELEVENLABS_API_KEY not set');
  if (!cached) cached = new ElevenLabsClient({ apiKey: env.ELEVENLABS_API_KEY });
  return cached;
}

export interface ElevenLabsMusicArgs {
  visualStyle: VisualStyleKey;
  durationSec: number;
  /** Optional mood override appended to the style prompt (e.g. "warm and uplifting"). */
  mood?: string;
}

export interface ElevenLabsMusicResult {
  buffer: Buffer;
  bytes: number;
  costCents: number;
}

/**
 * Generate a background music track for a reel. Returns MP3 bytes the
 * caller writes to disk and feeds into FFmpeg's amix at -22 LUFS-ish
 * (volume ≈ 0.15) so it sits clearly under the narration.
 *
 * Pricing (May 2026 Creator-tier reference): ElevenLabs charges per
 * second of generated music; ~$0.02/sec is the public ballpark. For a
 * 12s reel that's ~$0.24, well inside the $20 cap. The actual rate
 * varies by plan tier — we record the duration and the caller can
 * reconcile with the dashboard if precise tracking matters.
 */
export async function generateMusic(args: ElevenLabsMusicArgs): Promise<ElevenLabsMusicResult> {
  const client = getClient();
  const promptBase = STYLE_TO_MUSIC_PROMPT[args.visualStyle];
  const prompt = args.mood ? `${promptBase} Mood: ${args.mood}.` : promptBase;
  // The Music API floors at 3000ms; clamp.
  const musicLengthMs = Math.max(3000, Math.min(600000, Math.round(args.durationSec * 1000)));

  const startedAt = Date.now();
  console.log(
    `[reachy:music] generateMusic style=${args.visualStyle} durationSec=${args.durationSec} musicLengthMs=${musicLengthMs} promptBytes=${prompt.length}`,
  );

  const stream = await client.music.compose({
    prompt,
    musicLengthMs,
    modelId: 'music_v1',
    forceInstrumental: true,
    outputFormat: 'mp3_44100_128',
  });

  // Drain web-stream into a Node Buffer — same pattern as the TTS wrapper.
  const reader = stream.getReader();
  const chunks: Buffer[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(Buffer.from(value));
  }
  const buffer = Buffer.concat(chunks);

  // ~$0.02/sec ballpark. Per-reel rounding: 12s → 24¢, plus 1¢ floor.
  const costCents = Math.max(1, Math.round(args.durationSec * 2));
  console.log(
    `[reachy:music] generateMusic ok style=${args.visualStyle} bytes=${buffer.length} costCents=${costCents} elapsedMs=${Date.now() - startedAt}`,
  );
  return { buffer, bytes: buffer.length, costCents };
}
