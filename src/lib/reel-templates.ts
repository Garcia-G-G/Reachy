// Client-safe constants for reel templates. No 'server-only' here so the form
// can use these directly. Mirrors src/lib/copy-formats.ts and image-formats.ts.

export type ReelTemplateKey = 'pitch-30s' | 'feature-15s' | 'launch-20s';

export type SceneSlot =
  | 'problem'
  | 'problem_amplified'
  | 'solution'
  | 'benefit'
  | 'cta'
  | 'hook'
  | 'feature'
  | 'announcement'
  | 'detail';

export interface ReelSceneTemplate {
  /** Seconds this scene is on screen. xfade reuses the last 0.4s. */
  durationSec: number;
  /** Where the headline text sits within the scene. */
  textPosition: 'top' | 'bottom' | 'center';
  /** Slot key the LLM scene planner fills with copy + an image prompt. */
  slot: SceneSlot;
  /** Optional accent: cta scenes use brand-colored backdrop instead of an image. */
  background?: 'image' | 'brand';
}

export interface ReelTemplate {
  label: string;
  description: string;
  durationSec: number;
  scenes: readonly ReelSceneTemplate[];
}

export const REEL_TEMPLATES: Record<ReelTemplateKey, ReelTemplate> = {
  'pitch-30s': {
    label: 'Pitch · 30s — Problem / Solution / CTA',
    description:
      'Five scenes: ache the problem, twist the knife, present the solution, show the benefit, end on the call.',
    durationSec: 30,
    scenes: [
      { durationSec: 5, textPosition: 'bottom', slot: 'problem' },
      { durationSec: 5, textPosition: 'bottom', slot: 'problem_amplified' },
      { durationSec: 8, textPosition: 'bottom', slot: 'solution' },
      { durationSec: 8, textPosition: 'bottom', slot: 'benefit' },
      { durationSec: 4, textPosition: 'center', slot: 'cta', background: 'brand' },
    ],
  },
  'feature-15s': {
    label: 'Feature · 15s — Hook / Feature / Benefit / CTA',
    description: 'Four-scene tight loop for a single feature highlight.',
    durationSec: 15,
    scenes: [
      { durationSec: 3, textPosition: 'top', slot: 'hook' },
      { durationSec: 6, textPosition: 'bottom', slot: 'feature' },
      { durationSec: 3, textPosition: 'bottom', slot: 'benefit' },
      { durationSec: 3, textPosition: 'center', slot: 'cta', background: 'brand' },
    ],
  },
  'launch-20s': {
    label: 'Launch · 20s — Announcement / Demo / CTA',
    description: 'Announce a new release: headline, show the change, drive action.',
    durationSec: 20,
    scenes: [
      { durationSec: 4, textPosition: 'top', slot: 'announcement' },
      { durationSec: 6, textPosition: 'bottom', slot: 'detail' },
      { durationSec: 6, textPosition: 'bottom', slot: 'benefit' },
      { durationSec: 4, textPosition: 'center', slot: 'cta', background: 'brand' },
    ],
  },
};

export const REEL_TEMPLATE_KEYS = Object.keys(REEL_TEMPLATES) as ReelTemplateKey[];

/** Output dimensions for IG Reels / TikTok / YouTube Shorts. */
export const REEL_DIMENSIONS = { width: 1080, height: 1920, fps: 30 } as const;

/** xfade transition length. Each scene's effective on-screen time is durationSec - 0.4. */
export const REEL_TRANSITION_SEC = 0.4;

export type ReelEngine = 'ffmpeg' | 'veo';

export const REEL_ENGINES: ReadonlyArray<{ id: ReelEngine; label: string; tagline: string }> = [
  {
    id: 'ffmpeg',
    label: 'FFmpeg composition',
    tagline: 'Stitches your generated images with text overlays. Cheap and fast.',
  },
  {
    id: 'veo',
    label: 'Veo 3.1 Fast',
    tagline: 'Generates the entire reel from one prompt. Slower (~3 min), more impactful.',
  },
];

/** Shape the LLM scene planner returns. One entry per template scene, in order. */
export interface PlannedScene {
  slot: SceneSlot;
  durationSec: number;
  /** Headline text to overlay (kept short — drawtext truncates ungracefully). */
  text: string;
  textPosition: 'top' | 'bottom' | 'center';
  /** Image prompt the user can edit before we generate. Empty for `brand`-bg scenes. */
  imagePrompt: string;
  background: 'image' | 'brand';
}

export interface ReelPlan {
  template: ReelTemplateKey;
  /** Optional one-line tagline for the export label. */
  tagline: string;
  scenes: PlannedScene[];
}
