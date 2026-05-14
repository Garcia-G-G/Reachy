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

/**
 * Order matters — REEL_TEMPLATE_KEYS preserves it and the form renders the
 * cards in this order. Teaching-first shapes (informative, tutorial) come
 * before sales-first shapes (pitch, launch). See planning/REEL-FIX-B-C.md.
 */
export const REEL_TEMPLATES: Record<ReelTemplateKey, ReelTemplate> = {
  'informative-25s': {
    label: 'Explainer · 25s — Hook / Insight / Insight / Takeaway',
    description:
      'Calm teaching pace. One insight per scene, a quiet takeaway at the end. The default when in doubt.',
    durationSec: 25,
    scenes: [
      { durationSec: 5, textPosition: 'top', slot: 'hook' },
      { durationSec: 7, textPosition: 'bottom', slot: 'insight' },
      { durationSec: 7, textPosition: 'bottom', slot: 'insight' },
      { durationSec: 6, textPosition: 'center', slot: 'takeaway', background: 'brand' },
    ],
  },
  'tutorial-30s': {
    label: 'How-to · 30s — Intro / Step / Step / Step / Result',
    description:
      'Walk a reader through five beats. Numbered captions, single thread of progression, the result at the end.',
    durationSec: 30,
    scenes: [
      { durationSec: 5, textPosition: 'top', slot: 'intro' },
      { durationSec: 6, textPosition: 'bottom', slot: 'step' },
      { durationSec: 6, textPosition: 'bottom', slot: 'step' },
      { durationSec: 6, textPosition: 'bottom', slot: 'step' },
      { durationSec: 7, textPosition: 'center', slot: 'result' },
    ],
  },
  'feature-15s': {
    label: 'Feature note · 15s — Hook / Feature / Benefit / CTA',
    description: 'A close-up on one feature. Hook, show, prove, invite. Brief and scannable.',
    durationSec: 15,
    scenes: [
      { durationSec: 3, textPosition: 'top', slot: 'hook' },
      { durationSec: 6, textPosition: 'bottom', slot: 'feature' },
      { durationSec: 3, textPosition: 'bottom', slot: 'benefit' },
      { durationSec: 3, textPosition: 'center', slot: 'cta', background: 'brand' },
    ],
  },
  'pitch-30s': {
    label: 'Argument · 30s — Friction / Change / Outcome / Intent',
    description:
      'Five beats: name the friction, sit with it, offer the change, show what shifts, end with intent. The most direct shape — use sparingly.',
    durationSec: 30,
    scenes: [
      { durationSec: 5, textPosition: 'bottom', slot: 'problem' },
      { durationSec: 5, textPosition: 'bottom', slot: 'problem_amplified' },
      { durationSec: 8, textPosition: 'bottom', slot: 'solution' },
      { durationSec: 8, textPosition: 'bottom', slot: 'benefit' },
      { durationSec: 4, textPosition: 'center', slot: 'cta', background: 'brand' },
    ],
  },
  'launch-20s': {
    label: 'Release note · 20s — Announcement / Detail / Why',
    description:
      'A quiet announcement of a new release. What changed, why it matters, where to look.',
    durationSec: 20,
    scenes: [
      { durationSec: 4, textPosition: 'top', slot: 'announcement' },
      { durationSec: 6, textPosition: 'bottom', slot: 'detail' },
      { durationSec: 6, textPosition: 'bottom', slot: 'benefit' },
      { durationSec: 4, textPosition: 'center', slot: 'cta', background: 'brand' },
    ],
  },
  'visual-12s': {
    label: 'Mood · 16s — Four frames',
    description:
      'Four ambient frames with slow motion. Imagery leads, captions whisper. Best for brand pieces, not for a single message.',
    durationSec: 16,
    scenes: [
      { durationSec: 4, textPosition: 'bottom', slot: 'mood' },
      { durationSec: 4, textPosition: 'bottom', slot: 'mood' },
      { durationSec: 4, textPosition: 'bottom', slot: 'mood' },
      { durationSec: 4, textPosition: 'center', slot: 'logo', background: 'brand' },
    ],
  },
  'testimonial-20s': {
    label: 'Quote · 20s — Setup / Quote / Quote / Brand',
    description:
      "A short story told through a customer's words. Setup, two quotes, your wordmark. Lets the reader speak.",
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

export type ReelEngine = 'ffmpeg' | 'sora-base' | 'sora-pro-720p' | 'sora-pro-1024p';

export const REEL_ENGINES: ReadonlyArray<{
  id: ReelEngine;
  label: string;
  tagline: string;
  /**
   * Marginal cost per generated second of video (cents). FFmpeg bills
   * image-gen + TTS separately so its per-second cost is 0 here; the
   * estimator adds the image+TTS components downstream.
   */
  secondsCost: number;
}> = [
  {
    id: 'ffmpeg',
    label: 'FFmpeg composition',
    tagline: 'AI images stitched with text overlays + TTS. Cheap and fast.',
    secondsCost: 0,
  },
  {
    id: 'sora-base',
    label: 'Sora 2 (base)',
    tagline: '720p OpenAI native AI video. Animated. ~$0.10/s.',
    secondsCost: 10,
  },
  {
    id: 'sora-pro-720p',
    label: 'Sora 2 Pro 720p',
    tagline: 'Premium quality, full motion. ~$0.30/s.',
    secondsCost: 30,
  },
  {
    id: 'sora-pro-1024p',
    label: 'Sora 2 Pro 1024p',
    tagline: 'Highest fidelity, 1024×1792 source upscaled. ~$0.50/s. Default for flagship reels.',
    secondsCost: 50,
  },
];

/**
 * Engine auto-pick per type. Teaching-first templates (informative-25s,
 * pitch-30s) default to Sora 2 Pro 720p because those are the shapes we
 * use for flagship demos. Short feature/launch/visual/testimonial stay
 * on FFmpeg for cost reasons (a 16s mood reel at Sora Pro is $4.80, vs
 * ~6¢ on FFmpeg with Flux stills + TTS). Sora 2 base remains available
 * as the user-selected cheaper option in the UI.
 */
export const TYPE_DEFAULT_ENGINE: Record<ReelTemplateKey, ReelEngine> = {
  // Flagship explainer/pitch shapes default to the premium Sora tier.
  // Garcia's call (2026-05-14, max-quality push): quality > cost for the
  // marketing demo, hard ceiling $20 per reel — Sora Pro 1024p × 12s = $6.
  'informative-25s': 'sora-pro-1024p',
  'pitch-30s': 'sora-pro-1024p',
  // Shorter/auxiliary shapes stay on FFmpeg for cost ($4-6 of Sora 1024p
  // is wasted on 16s mood reels and feature notes).
  'tutorial-30s': 'ffmpeg',
  'feature-15s': 'ffmpeg',
  'launch-20s': 'ffmpeg',
  'visual-12s': 'ffmpeg',
  'testimonial-20s': 'ffmpeg',
};

/** Shape the LLM scene planner returns. One entry per template scene, in order. */
export interface PlannedScene {
  slot: SceneSlot;
  durationSec: number;
  /** Short headline to overlay (≤ 6 words ideally — drawtext truncates ungracefully).
   *  Drives the on-screen kicker; the narrator reads `narration` instead so the
   *  audio can run the full scene without sounding clipped after 2 seconds. */
  text: string;
  /**
   * Full narration line the TTS reads (typically 15–25 words, written as
   * natural sentence prose). When empty the worker falls back to `text`,
   * which preserves the legacy single-line behavior. The planner generates
   * both fields for AI mode; script mode lets the user write both per scene.
   */
  narration?: string;
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
  /**
   * Caption language. Set at plan time; the video worker uses it to pick
   * the TTS narration voice (Spanish → nova, English → alloy).
   * Defaults to 'en' on plans created before this field existed.
   */
  language?: 'en' | 'es';
}
