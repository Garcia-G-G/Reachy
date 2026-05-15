import 'server-only';

/**
 * SFX-stinger timing + length constants used by the videoWorker's
 * audio compose step. Each stinger fires once per reel; the LLM call
 * (planSfxStingers) decides WHAT each stinger sounds like, but the
 * timings + durations are policy.
 *
 * Cannot be derived: these are mix-engineering decisions tuned
 * against the existing TTS + music levels in the FFmpeg amix step.
 */

export interface SfxSlotSeed {
  durationSec: number;
  /** Where to fire the stinger. `kind` resolves at compose time:
   *   intro     = startSec 0
   *   midpoint  = startSec totalDurationSec / 2
   *   outro     = startSec totalDurationSec - durationSec - tailMargin */
  kind: 'intro' | 'midpoint' | 'outro';
}

export const SFX_SLOTS: readonly SfxSlotSeed[] = [
  { kind: 'intro', durationSec: 1.2 },
  { kind: 'midpoint', durationSec: 1.0 },
  { kind: 'outro', durationSec: 0.8 },
];

/** Margin (seconds) between the outro stinger's end and the end of
 *  the reel. Keeps the stinger from being clipped at the tail. */
export const OUTRO_TAIL_MARGIN_SEC = 0.3;

/** Stability the ElevenLabs SFX endpoint sees on every request.
 *  0.85 (was 0.6) — keeps the model close to "punchy/bright/snap"
 *  intent without drifting into ambient pad territory. Tightening
 *  here came out of the SFX audit in /planning. */
export const SFX_STABILITY = 0.85;
