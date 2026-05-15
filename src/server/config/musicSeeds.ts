import 'server-only';

/**
 * Music-plan baseline seeds — the constraints the LLM's
 * planMusicPrompt call is bounded by. Cannot be derived: these are
 * policy choices (BPM ranges per energy level, instrumental default,
 * vocals always off under TTS narration).
 *
 * The static STYLE_TO_MUSIC_PROMPT map this replaces lived in
 * src/server/audio/elevenlabsMusic.ts; that map is gone — every reel
 * now gets a freshly-derived music prompt tailored to its brief.
 */

export type MusicEnergy = 'calm' | 'considered' | 'driving' | 'energetic';

export interface MusicEnergyRange {
  /** Inclusive BPM lower bound. */
  bpmMin: number;
  /** Inclusive BPM upper bound. */
  bpmMax: number;
  /** Plain-English mood the planner should aim at. */
  moodHint: string;
}

export const MUSIC_ENERGY_RANGES: Record<MusicEnergy, MusicEnergyRange> = {
  calm: { bpmMin: 60, bpmMax: 82, moodHint: 'still, considered, premium' },
  considered: { bpmMin: 82, bpmMax: 100, moodHint: 'editorial pulse, confident undertow' },
  driving: { bpmMin: 100, bpmMax: 118, moodHint: 'forward momentum, optimistic' },
  energetic: { bpmMin: 118, bpmMax: 140, moodHint: 'kinetic, playful, snap' },
};

/** Music ALWAYS sits under TTS narration; vocals are always off. */
export const FORCE_INSTRUMENTAL = true;

/** Output format ElevenLabs Music accepts in May 2026 — see the
 *  worker for the upstream `client.music.compose` call shape. */
export const MUSIC_OUTPUT_FORMAT = 'mp3_44100_128';

/** Soft cap on the music prompt the LLM may produce. ElevenLabs Music
 *  doesn't document a hard length limit but anything past ~600 chars
 *  starts confusing the model; we cap so a verbose plan doesn't
 *  silently degrade the output. */
export const MAX_MUSIC_PROMPT_CHARS = 600;
