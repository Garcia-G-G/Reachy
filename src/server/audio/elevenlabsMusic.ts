import 'server-only';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { env } from '@/env';
import type { VisualStyleKey } from '@/lib/visual-styles-meta';
import { getOpenAI } from '@/server/ai/openai';
import {
  FORCE_INSTRUMENTAL,
  MAX_MUSIC_PROMPT_CHARS,
  MUSIC_ENERGY_RANGES,
  MUSIC_OUTPUT_FORMAT,
  type MusicEnergy,
} from '@/server/config/musicSeeds';

/**
 * ElevenLabs Music API — generates a fully-licensed instrumental track
 * that sits under the TTS narration.
 *
 * 2026-05 unhardcode: the prior STYLE_TO_MUSIC_PROMPT static map (one
 * prompt per visualStyle) is gone. Every reel now gets a FRESH music
 * prompt derived from { brief, visualStyle, brandKit voice, duration }
 * via a single gpt-4o-mini structured-output call (~0.2¢). Same brief
 * + same style on a retry yields a similar but not identical prompt;
 * different reels with the same style get visibly different music.
 *
 * SDK shape (verified against @elevenlabs/elevenlabs-js@2.30.0):
 *   client.music.compose({
 *     prompt: string,
 *     musicLengthMs: number,   // 3000 – 600000
 *     modelId: 'music_v1',
 *     forceInstrumental: true,
 *     outputFormat: 'mp3_44100_128',
 *   }) → ReadableStream<Uint8Array>
 */

const PLANNER_MODEL = 'gpt-4o-mini';

let cached: ElevenLabsClient | null = null;
function getClient(): ElevenLabsClient {
  if (!env.ELEVENLABS_API_KEY) throw new Error('ELEVENLABS_API_KEY not set');
  if (!cached) cached = new ElevenLabsClient({ apiKey: env.ELEVENLABS_API_KEY });
  return cached;
}

export interface MusicPlanArgs {
  /** What the reel is about — the planner's PlannedAsset.brief, or
   *  the full reel idea when called outside the autopilot flow. */
  brief: string;
  visualStyle: VisualStyleKey;
  durationSec: number;
  /** Brand voice tone label (`brandKit.voice.tone`) — null when no
   *  brand kit is set. The planner uses it to bias mood. */
  brandTone?: string | null;
  brandKeywords?: readonly string[];
  /** Energy hint — when set, the planner is constrained to that
   *  band's BPM range. Defaults to 'considered' (editorial pulse). */
  energy?: MusicEnergy;
}

export interface MusicPlan {
  prompt: string;
  instrumental: boolean;
  tempoBpm: number;
  mood: string;
  energy: MusicEnergy;
}

const PLAN_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['prompt', 'instrumental', 'tempoBpm', 'mood'],
  properties: {
    prompt: { type: 'string', minLength: 12, maxLength: MAX_MUSIC_PROMPT_CHARS },
    instrumental: { type: 'boolean' },
    tempoBpm: { type: 'integer', minimum: 40, maximum: 200 },
    mood: { type: 'string', minLength: 1, maxLength: 80 },
  },
};

/** Single LLM call deriving a per-reel music prompt. Cost ~0.2¢. */
export async function planMusicPrompt(args: MusicPlanArgs): Promise<MusicPlan> {
  const energy: MusicEnergy = args.energy ?? 'considered';
  const range = MUSIC_ENERGY_RANGES[energy];
  const openai = getOpenAI();

  const systemLines = [
    'You are scoring background music for a short marketing reel.',
    'Output a single concise prompt for ElevenLabs Music — instrumentation, mood, tempo, instrumentation cues, and one editorial note.',
    'Music ALWAYS sits under spoken narration; never request vocals; prefer felted percussion, warm strings, plucked synths, brushed kits.',
    'Avoid genre buzzwords ElevenLabs takes too literally (trap, phonk, dubstep).',
    'Tempo MUST be inside the requested BPM range; mood MUST be a 1-3 word descriptor; instrumental MUST be true.',
  ];
  const userLines = [
    `Visual style: ${args.visualStyle}`,
    `Duration: ${args.durationSec}s`,
    `Energy band: ${energy} — BPM ${range.bpmMin}-${range.bpmMax}, mood hint "${range.moodHint}"`,
    args.brandTone ? `Brand voice tone: ${args.brandTone}` : '',
    args.brandKeywords && args.brandKeywords.length > 0
      ? `Brand keywords: ${args.brandKeywords.slice(0, 6).join(', ')}`
      : '',
    `Reel brief: ${args.brief.trim().slice(0, 400)}`,
    '',
    `Output a music prompt that fits THIS reel — not a generic ${args.visualStyle} prompt.`,
  ].filter(Boolean);

  const completion = await openai.chat.completions.create({
    model: PLANNER_MODEL,
    messages: [
      { role: 'system', content: systemLines.join('\n') },
      { role: 'user', content: userLines.join('\n') },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'music_plan', schema: PLAN_JSON_SCHEMA, strict: true },
    },
    temperature: 0.6,
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    // Fall back to a minimal prompt rather than failing the reel.
    return {
      prompt: `Editorial instrumental at ${range.bpmMin}-${range.bpmMax} BPM, ${range.moodHint}. No vocals.`,
      instrumental: true,
      tempoBpm: Math.round((range.bpmMin + range.bpmMax) / 2),
      mood: range.moodHint,
      energy,
    };
  }
  const parsed = JSON.parse(content) as Omit<MusicPlan, 'energy'>;
  // Clamp tempo to the configured energy band so the LLM can't pick
  // something outside the policy range.
  const clampedTempo = Math.min(range.bpmMax, Math.max(range.bpmMin, parsed.tempoBpm));
  return {
    prompt: parsed.prompt.slice(0, MAX_MUSIC_PROMPT_CHARS),
    // FORCE_INSTRUMENTAL policy wins regardless of what the model said.
    instrumental: FORCE_INSTRUMENTAL,
    tempoBpm: clampedTempo,
    mood: parsed.mood,
    energy,
  };
}

export interface ElevenLabsMusicArgs {
  brief: string;
  visualStyle: VisualStyleKey;
  durationSec: number;
  brandTone?: string | null;
  brandKeywords?: readonly string[];
  energy?: MusicEnergy;
}

export interface ElevenLabsMusicResult {
  buffer: Buffer;
  bytes: number;
  costCents: number;
  plan: MusicPlan;
}

/** Generate background music for a reel.
 *
 *  Cost = ~$0.02/sec for ElevenLabs Music + ~0.2¢ for the gpt-4o-mini
 *  planning call. For a 12s reel that's ~25¢ total.
 */
export async function generateMusic(args: ElevenLabsMusicArgs): Promise<ElevenLabsMusicResult> {
  const plan = await planMusicPrompt({
    brief: args.brief,
    visualStyle: args.visualStyle,
    durationSec: args.durationSec,
    brandTone: args.brandTone,
    brandKeywords: args.brandKeywords,
    energy: args.energy,
  });

  const client = getClient();
  const musicLengthMs = Math.max(3000, Math.min(600000, Math.round(args.durationSec * 1000)));

  const startedAt = Date.now();
  console.log(
    `[reachy:music] generateMusic style=${args.visualStyle} energy=${plan.energy} bpm=${plan.tempoBpm} mood="${plan.mood}" durationSec=${args.durationSec} promptBytes=${plan.prompt.length}`,
  );

  const stream = await client.music.compose({
    prompt: plan.prompt,
    musicLengthMs,
    modelId: 'music_v1',
    forceInstrumental: plan.instrumental,
    outputFormat: MUSIC_OUTPUT_FORMAT,
  });

  const reader = stream.getReader();
  const chunks: Buffer[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(Buffer.from(value));
  }
  const buffer = Buffer.concat(chunks);

  // ~$0.02/sec ballpark + LLM planning cost.
  const costCents = Math.max(1, Math.round(args.durationSec * 2)) + 1;
  console.log(
    `[reachy:music] generateMusic ok style=${args.visualStyle} bytes=${buffer.length} costCents=${costCents} elapsedMs=${Date.now() - startedAt} musicPrompt="${plan.prompt.slice(0, 100)}…"`,
  );
  return { buffer, bytes: buffer.length, costCents, plan };
}
