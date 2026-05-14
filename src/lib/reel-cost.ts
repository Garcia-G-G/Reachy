import type { ReelEngine } from './reel-templates';

/** Hard sanity cap — $20 per reel. Enforced server-side in composeReelAction
 *  AND surfaced client-side in the form so over-budget options are disabled
 *  before the user clicks Render. */
export const MAX_REEL_COST_CENTS = 2000;

/** Sora 2 supported clip durations. Anything else is rejected by the API. */
export const SORA_VALID_DURATIONS = [4, 8, 12] as const;
export type SoraDuration = (typeof SORA_VALID_DURATIONS)[number];

/**
 * Cents per generated second of Sora video, keyed by ENGINE (not model)
 * so a 1024p Pro reel is distinguishable from a 720p Pro reel — the
 * model is the same `sora-2-pro` underneath but the rate differs 5/3x.
 * Mirrors src/server/ai/openaiVideo.ts's billing matrix exactly.
 */
export const SORA_ENGINE_CENTS_PER_SEC = {
  'sora-base': 10,
  'sora-pro-720p': 30,
  'sora-pro-1024p': 50,
} as const;

/** Snap a requested duration to the nearest supported Sora step. Ties round up. */
export function snapSoraDuration(seconds: number): SoraDuration {
  let best: SoraDuration = SORA_VALID_DURATIONS[0];
  let bestDelta = Math.abs(seconds - best);
  for (const candidate of SORA_VALID_DURATIONS) {
    const delta = Math.abs(seconds - candidate);
    if (delta < bestDelta || (delta === bestDelta && candidate > best)) {
      best = candidate;
      bestDelta = delta;
    }
  }
  return best;
}

/**
 * Pack a target number of seconds into Sora's valid 4/8/12 segment slots,
 * greedy-largest-first. Mirrors planSoraSegments in server/ai/openaiVideo.ts
 * (client-safe duplicate so the cost preview can compute multi-segment
 * billing without a server roundtrip).
 *
 *   19s → [12, 8]   (sum 20)
 *   25s → [12, 12, 4] (sum 28)
 */
export function planSoraSegments(targetSec: number): SoraDuration[] {
  if (targetSec <= 0) return [];
  const segs: SoraDuration[] = [];
  let remaining = targetSec;
  while (remaining > 12) {
    segs.push(12);
    remaining -= 12;
  }
  if (remaining > 8) segs.push(12);
  else if (remaining > 4) segs.push(8);
  else if (remaining > 0) segs.push(4);
  return segs;
}

export interface ReelCostScene {
  durationSec: number;
  text: string;
  background: 'image' | 'brand';
}

export interface ReelCostBreakdown {
  cents: number;
  /** Component costs in cents — surfaced in the UI so the user knows what
   *  they're paying for (TTS vs video gen vs image gen vs music vs SFX vs compose). */
  parts: {
    tts: number;
    video?: number;
    images?: number;
    /** ElevenLabs Music for the background bed (Sora path only today). */
    music?: number;
    /** ElevenLabs Sound Effects (intro/transition/outro hits). */
    sfx?: number;
    compose: number;
  };
}

/**
 * Pre-render cost estimate. Same shape returned to server-side cap check
 * and client-side preview so the two never disagree:
 *   ffmpeg              → ~14¢/image-scene (Flux Pro inline) + TTS + 1¢ compose
 *   sora-*              → Σ(rate × segDur) over planSoraSegments(imageSec) + TTS + 1¢ compose
 *
 * Sora engines render the image-backed portion of the timeline as a chain
 * of 4/8/12s segments (videos.create + videos.extend). Billing matches:
 * a 19s reel renders as [12, 8] and pays for 20 segment-seconds at the
 * engine's rate. Brand-bg scenes never go to Sora — they're a looped
 * solid-color PNG with 0¢ marginal video cost.
 *
 * Music + SFX are still excluded from the estimate (negligible: ~$0.30 +
 * ~$0.15 typical at ElevenLabs rates; well under the rounding noise on
 * cap enforcement). The actual breakdown persisted in
 * generation.params.costBreakdown DOES include them, populated by the
 * worker after the real render.
 */
export function estimateReelCost(engine: ReelEngine, scenes: ReelCostScene[]): ReelCostBreakdown {
  let tts = 0;
  for (const scene of scenes) {
    if (scene.text?.trim()) tts += Math.max(1, Math.round((scene.text.length / 1000) * 4));
  }
  const compose = 1;

  if (engine === 'ffmpeg') {
    const imageScenes = scenes.filter((s) => s.background !== 'brand').length;
    const images = imageScenes * 14;
    return { cents: tts + images + compose, parts: { tts, images, compose } };
  }

  const rate = SORA_ENGINE_CENTS_PER_SEC[engine];
  // Sora only renders the image-backed scenes — brand-bg is a looped PNG.
  // Multi-segment: a 19s image portion costs 12+8 = 20 segment-seconds.
  const imageSec = scenes
    .filter((s) => s.background !== 'brand')
    .reduce((sum, s) => sum + s.durationSec, 0);
  const segPlan = planSoraSegments(imageSec);
  const video = segPlan.reduce((sum, segDur) => sum + rate * segDur, 0);
  return { cents: tts + video + compose, parts: { tts, video, compose } };
}
