import 'server-only';
import { getOpenAI } from './openai';

/**
 * Single gpt-4o-mini call deriving fresh SFX-stinger descriptions for
 * a reel. Replaces the prior 3 hardcoded description strings in
 * videoWorker.ts. The LLM call costs ~0.2¢ — cheaper than the audio
 * generation itself, and the descriptions land in elevenlabsSfx.ts's
 * disk cache after the first reel renders.
 *
 * Wording rule: descriptions must be PUNCHY ("bright", "snap",
 * "thump") — earlier soft phrasings ("subtle", "gentle") asked
 * ElevenLabs for whispers that vanished under the narration mix.
 * The system prompt enforces this.
 */

export interface PlanSfxArgs {
  brief: string;
  visualStyle: string;
  durationSec: number;
  /** Per-scene tagline → narration text, used so the LLM tunes the
   *  stingers to the actual reel pacing instead of producing a
   *  generic three-pack. */
  scenes: ReadonlyArray<{ slot: string; durationSec: number; narration: string }>;
  brandTone?: string | null;
}

export interface SfxPlan {
  intro: string;
  midpoint: string;
  outro: string;
}

const PLANNER_MODEL = 'gpt-4o-mini';

const SFX_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['intro', 'midpoint', 'outro'],
  properties: {
    intro: { type: 'string', minLength: 12, maxLength: 240 },
    midpoint: { type: 'string', minLength: 12, maxLength: 240 },
    outro: { type: 'string', minLength: 12, maxLength: 240 },
  },
};

export async function planSfxStingers(args: PlanSfxArgs): Promise<SfxPlan> {
  const openai = getOpenAI();

  const systemLines = [
    'You design 3 short ElevenLabs SFX stinger descriptions for a marketing reel.',
    'Each description is ONE sentence (no bullets), 15-40 words, PUNCHY language.',
    'Required tone: present + audible. Use words like bright, crisp, punchy, snap, thump, swell, hit.',
    'Forbidden: subtle, gentle, soft, whisper, faint, calm, smooth — these come back as whispers under the narration mix.',
    'Tune the three stingers to the reel pacing: intro should feel like the reel STARTING; midpoint like a turn or reveal; outro like a button-press confirming the close.',
    'Avoid genre buzzwords (trap, phonk, dubstep). No music phrases — these are HITS, not loops.',
  ];

  const sceneLines = args.scenes
    .slice(0, 6)
    .map((s, i) => `${i + 1}. (${s.slot}, ${s.durationSec}s) ${s.narration.slice(0, 120)}`);

  const userLines = [
    `Visual style: ${args.visualStyle}`,
    `Total duration: ${args.durationSec}s`,
    args.brandTone ? `Brand tone: ${args.brandTone}` : '',
    `Reel brief: ${args.brief.trim().slice(0, 300)}`,
    '',
    `Scenes:`,
    ...sceneLines,
    '',
    'Return JSON { intro, midpoint, outro } where each value is a stinger description tuned to THIS reel — not a generic three-pack.',
  ].filter(Boolean);

  const completion = await openai.chat.completions.create({
    model: PLANNER_MODEL,
    messages: [
      { role: 'system', content: systemLines.join('\n') },
      { role: 'user', content: userLines.join('\n') },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'sfx_plan', schema: SFX_JSON_SCHEMA, strict: true },
    },
    temperature: 0.7,
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    return {
      intro:
        'bright modern intro stinger, crisp synth swell with a soft transient on the downbeat, confident and premium',
      midpoint:
        'attention-grabbing transition whoosh with a satisfying bass thump on the tail, modern and editorial, energetic',
      outro: 'punchy outro snap with a short reverb tail, conclusive and crisp',
    };
  }
  return JSON.parse(content) as SfxPlan;
}
