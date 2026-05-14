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

/** All Sora engines run through the one-shot path (one 12s clip). Multi-
 *  scene Sora is dead code; the estimator bills against the single clip. */
export const SORA_ONE_SHOT_SEC = 12;

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
 *   sora-base           → ~10¢/sec × 12s one-shot + TTS + 1¢ compose
 *   sora-pro-720p       → ~30¢/sec × 12s one-shot + TTS + 1¢ compose
 *   sora-pro-1024p      → ~50¢/sec × 12s one-shot + TTS + 1¢ compose
 *
 * The Sora engines all bill against ONE 12s clip — the worker runs the
 * one-shot path for any sora-* engine. The estimator does not include
 * music or SFX yet (negligible: ~$0.30 + ~$0.15 typical at ElevenLabs
 * Music/SFX rates; well under the rounding noise on cap enforcement).
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
  const video = rate * SORA_ONE_SHOT_SEC;
  return { cents: tts + video + compose, parts: { tts, video, compose } };
}
