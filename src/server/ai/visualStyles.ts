/**
 * Catalog of visual styles for reels and image generation.
 *
 * Picked per project on the brand kit (`brandKit.visualStyle`) and optionally
 * overridden per reel in the generator UI. The string in `prompt` is appended
 * to every Veo / image prompt — it is the difference between a Veo output
 * with a real human at a desk and an animated explainer with motion graphics.
 *
 * Why this lives in its own module rather than in reelPlanner.ts:
 *  • image generation in src/server/ai/imageGen.ts will reuse it in Phase 04
 *  • the editorial direction is a brand decision, not a planner decision
 */

export const VISUAL_STYLE_KEYS = [
  'editorial',
  'paper-cutout',
  'flat-2d',
  'infographic',
  'isometric',
  'abstract',
] as const;

export type VisualStyleKey = (typeof VISUAL_STYLE_KEYS)[number];

export interface VisualStyleEntry {
  /** Short display label for the brand-kit and reel-form selectors. */
  label: string;
  /** One-line summary shown under the label. */
  tagline: string;
  /**
   * Prompt fragment appended to every Veo / image prompt. Must:
   *  • forbid real people (Veo defaults to photorealism otherwise)
   *  • describe the subject in concrete visual language (icons, shapes, type)
   *  • lock the camera to static or slow push (no handheld, no swoop)
   *  • leave the top 20% and bottom 25% clean for the caption box
   */
  prompt: string;
}

export const DEFAULT_VISUAL_STYLE: VisualStyleKey = 'editorial';

export const VISUAL_STYLES: Record<VisualStyleKey, VisualStyleEntry> = {
  editorial: {
    label: 'Editorial motion',
    tagline: 'Big serif type, thin rules, paper-and-ink. Matches the Reachy landing 1:1.',
    prompt: [
      'STYLE: animated editorial print magazine in motion. NO real people. NO stock photography. NO photorealism.',
      'Subject: large serif display typography (Fraunces-style) animating in line by line, italic accents, thin horizontal rules drawing themselves, oversized display numbers counting up.',
      'Palette: warm off-white paper (#f1ebdf), deep ink (#14110d), burnt sienna accent (#b6481a) used sparingly.',
      'Camera: static frame or very slow push-in. NO handheld, NO swooping, NO dolly.',
      'Composition: keep the top 20% and bottom 25% of the frame clean for the caption box.',
      'No watermark, no logos, no readable UI screens.',
    ].join(' '),
  },
  'paper-cutout': {
    label: 'Paper cutout',
    tagline: 'Layered cut-paper shapes with hard shadows. Headway / Fable feel.',
    prompt: [
      'STYLE: paper cutout collage in motion. NO real people. NO photorealism.',
      'Subject: hard-edge geometric paper shapes layered with subtle drop shadows, slow rotation and overlap. Warm cream and pastel paper textures, hand-cut feel.',
      'Palette: cream (#fde9d8), deep ink (#14110d), forest green (#1f3a2f), burnt sienna (#b6481a).',
      'Camera: static frame, occasional slow zoom on a single shape. NO handheld.',
      'Composition: keep the top 20% and bottom 25% clean for the caption box.',
      'No watermark, no logos, no readable text within the artwork.',
    ].join(' '),
  },
  'flat-2d': {
    label: 'Flat 2D explainer',
    tagline: 'Bold geometric characters, thick outlines. Duolingo / Mailchimp.',
    prompt: [
      'STYLE: flat 2D animated illustration. NO real people. NO photorealism.',
      'Subject: bold geometric cartoon characters with thick black outlines, saturated solid fill colors (no gradients), Lottie/Rive aesthetic, friendly and approachable. Subjects are illustrated icons or cartoon mascots, never photorealistic humans.',
      'Palette: high-contrast brand color on solid background, with one secondary accent.',
      'Camera: static frame, characters move with springy easing.',
      'Composition: keep the top 20% and bottom 25% clean for the caption box.',
      'No watermark, no logos, no readable UI screens.',
    ].join(' '),
  },
  infographic: {
    label: 'Animated infographic',
    tagline: 'Numbers counting up, bars growing, lines drawing. Data leads.',
    prompt: [
      'STYLE: animated data visualization. NO real people. NO product shots. NO photorealism.',
      'Subject: large display numbers counting up with spring physics, bars growing from a baseline, line charts drawing themselves stroke by stroke, minimalist icons appearing one by one. The data is the protagonist.',
      'Palette: clean off-white background, one strong brand color for primary marks, neutral grey for secondary.',
      'Camera: static frame, no parallax.',
      'Composition: keep the top 20% and bottom 25% clean for the caption box.',
      'No watermark, no logos, no readable text within the chart labels.',
    ].join(' '),
  },
  isometric: {
    label: 'Isometric mini',
    tagline: 'Floating 3D blocks, tiny figures, pastel gradients. Notion / Linear.',
    prompt: [
      'STYLE: isometric 3D illustration. NO real people. NO photorealism.',
      'Subject: floating isometric cards, dashboards, small simplified figures (3-color silhouettes, never realistic faces) interacting with the cards. Soft pastel gradients on each surface.',
      'Palette: pastel pink, sky blue, cream, deep navy outlines.',
      'Camera: static isometric perspective, very slow drift.',
      'Composition: keep the top 20% and bottom 25% clean for the caption box.',
      'No watermark, no logos, no readable UI screens within the mock dashboards.',
    ].join(' '),
  },
  abstract: {
    label: 'Abstract shapes',
    tagline: 'Soft color blobs morphing. Premium and ambient. Apple / Stripe.',
    prompt: [
      'STYLE: premium abstract motion graphics. NO real people. NO objects. NO UI. NO photorealism.',
      'Subject: large soft color blobs morphing slowly, smooth gradient transitions between them, the only typography is a single line of large display text appearing centered.',
      'Palette: rich gradients (pink → purple → blue) on near-black background, or warm cream with a single accent color.',
      'Camera: static frame, blobs move on their own.',
      'Composition: keep the top 20% and bottom 25% clean for the caption box.',
      'No watermark, no logos.',
    ].join(' '),
  },
};

/** Resolve a brand kit's `visualStyle` field (nullable) to a usable entry. */
export function resolveVisualStyle(key: string | null | undefined): VisualStyleEntry {
  if (key && (VISUAL_STYLE_KEYS as readonly string[]).includes(key)) {
    return VISUAL_STYLES[key as VisualStyleKey];
  }
  return VISUAL_STYLES[DEFAULT_VISUAL_STYLE];
}
