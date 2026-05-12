// Client-safe constants for reel templates. No 'server-only' here so the form
// can use these directly. Mirrors src/lib/copy-formats.ts and image-formats.ts.

export type ReelTemplateKey =
  | 'pitch-30s'
  | 'feature-15s'
  | 'launch-20s'
  | 'informative-25s'
  | 'visual-12s'
  | 'tutorial-30s'
  | 'testimonial-20s';

// Runtime list of every valid scene-slot name. The TS union below is derived
// from this so adding a slot in one place stays in sync everywhere (zod
// schema in the compose action, planner prompts, future analytics).
export const SCENE_SLOTS = [
  // pitch
  'problem',
  'problem_amplified',
  'solution',
  'benefit',
  'cta',
  // feature
  'hook',
  'feature',
  // launch
  'announcement',
  'detail',
  // informative
  'insight',
  'takeaway',
  // visual
  'mood',
  'logo',
  // tutorial
  'intro',
  'step',
  'result',
  // testimonial
  'setup',
  'quote',
  'brand',
] as const;

export type SceneSlot = (typeof SCENE_SLOTS)[number];

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
  'informative-25s': {
    label: 'Informative · 25s — Hook / Insight / Insight / Takeaway',
    description: 'Calm explainer pace. Teach, not sell. One insight per scene.',
    durationSec: 25,
    scenes: [
      { durationSec: 5, textPosition: 'top', slot: 'hook' },
      { durationSec: 7, textPosition: 'bottom', slot: 'insight' },
      { durationSec: 7, textPosition: 'bottom', slot: 'insight' },
      { durationSec: 6, textPosition: 'center', slot: 'takeaway', background: 'brand' },
    ],
  },
  'visual-12s': {
    label: 'Visual · 16s — Mood reel',
    description:
      'Four cinematic frames with Ken Burns motion. Captions whisper, imagery leads. Best for brand reels.',
    durationSec: 16,
    scenes: [
      { durationSec: 4, textPosition: 'bottom', slot: 'mood' },
      { durationSec: 4, textPosition: 'bottom', slot: 'mood' },
      { durationSec: 4, textPosition: 'bottom', slot: 'mood' },
      { durationSec: 4, textPosition: 'center', slot: 'logo', background: 'brand' },
    ],
  },
  'tutorial-30s': {
    label: 'Tutorial · 30s — Intro / Step / Step / Step / Result',
    description: 'Step-by-step how-to. Numbered captions, clear progression.',
    durationSec: 30,
    scenes: [
      { durationSec: 5, textPosition: 'top', slot: 'intro' },
      { durationSec: 6, textPosition: 'bottom', slot: 'step' },
      { durationSec: 6, textPosition: 'bottom', slot: 'step' },
      { durationSec: 6, textPosition: 'bottom', slot: 'step' },
      { durationSec: 7, textPosition: 'center', slot: 'result' },
    ],
  },
  'testimonial-20s': {
    label: 'Testimonial · 20s — Setup / Quote / Quote / Brand',
    description: 'Quote-driven social proof. Open quotes, close with brand.',
    durationSec: 20,
    scenes: [
      { durationSec: 4, textPosition: 'top', slot: 'setup' },
      { durationSec: 6, textPosition: 'center', slot: 'quote' },
      { durationSec: 6, textPosition: 'center', slot: 'quote' },
      { durationSec: 4, textPosition: 'center', slot: 'brand', background: 'brand' },
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

/**
 * Engine auto-pick per type. Visual is the only Veo candidate — its
 * single-mood-shot framing matches Veo's "one prompt → one 8s clip"
 * behavior. Everything else has multi-scene structure with text overlays
 * that FFmpeg composition renders crisply (Veo snaps duration to 8s max
 * and ignores per-scene overlays, so a multi-beat reel under Veo loses
 * most of its choreography).
 */
export const TYPE_DEFAULT_ENGINE: Record<ReelTemplateKey, ReelEngine> = {
  'pitch-30s': 'ffmpeg',
  'feature-15s': 'ffmpeg',
  'launch-20s': 'ffmpeg',
  'informative-25s': 'ffmpeg',
  // Visual was Veo, but Veo Fast snaps to 8s max — too short for a mood
  // reel. Switched to FFmpeg multi-scene with Ken Burns motion (zoompan)
  // for cinematic feel at the 16s duration Garcia wants. ~5¢ vs $0.80.
  'visual-12s': 'ffmpeg',
  'tutorial-30s': 'ffmpeg',
  'testimonial-20s': 'ffmpeg',
};

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
