import type { ReelEngine } from './reel-templates';

/** Hard sanity cap — $20 per reel. Enforced server-side in composeReelAction
 *  AND surfaced client-side in the form so over-budget options are disabled
 *  before the user clicks Render. */
export const MAX_REEL_COST_CENTS = 2000;

/** Sora 2 supported clip durations. Anything else is rejected by the API. */
export const SORA_VALID_DURATIONS = [4, 8, 12] as const;
export type SoraDuration = (typeof SORA_VALID_DURATIONS)[number];

/** Cents per generated second of Sora video, by tier. 720p only — we never
 *  expose 1024p (overkill for 9:16 reels at 2x the price). */
export const SORA_CENTS_PER_SEC = { 'sora-2': 10, 'sora-2-pro': 30 } as const;

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
   *  they're paying for (TTS vs video gen vs image gen vs compose). */
  parts: {
    tts: number;
    video?: number;
    images?: number;
    compose: number;
  };
}

/**
 * Pre-render cost estimate. Same shape returned to server-side cap check
 * and client-side preview so the two never disagree:
 *   ffmpeg          → ~14¢/image-scene (Flux Pro inline) + TTS + 1¢ compose
 *   sora-base       → 10¢/sec × snapped scene seconds + TTS + 1¢ compose
 *   sora-pro-720p   → 30¢/sec × snapped scene seconds + TTS + 1¢ compose
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

  const rate =
    engine === 'sora-pro-720p' ? SORA_CENTS_PER_SEC['sora-2-pro'] : SORA_CENTS_PER_SEC['sora-2'];
  let video = 0;
  for (const scene of scenes) {
    if (scene.background === 'brand') continue;
    video += rate * snapSoraDuration(scene.durationSec);
  }
  return { cents: tts + video + compose, parts: { tts, video, compose } };
}
