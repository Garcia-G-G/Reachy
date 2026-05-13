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
   *  • forbid text/letters/numbers in the image — every reel rendered before
   *    this rule landed had gibberish typography ("NNST INGBIL"), because the
   *    overlay system handles all text and the image model can't render type
   *    cleanly anyway
   *  • describe ONE or AT MOST 2-3 visual elements (not a busy collage)
   *  • lock the camera to fully static — Ken Burns adds the motion later
   */
  prompt: string;
}

export const DEFAULT_VISUAL_STYLE: VisualStyleKey = 'editorial';

export const VISUAL_STYLES: Record<VisualStyleKey, VisualStyleEntry> = {
  editorial: {
    label: 'Editorial motion',
    tagline: 'Warm paper background, single accent shape, all type via overlay.',
    prompt: [
      'STYLE: warm cream paper background with subtle paper grain texture.',
      'Subject: ONE simple geometric mark — either a thin horizontal rule, a single oversized punctuation mark in deep ink, or a small burnt-sienna rectangle. ONLY ONE element on the frame.',
      'Palette: warm off-white paper (#f1ebdf) background, deep ink (#14110d) for the mark, burnt sienna (#b6481a) accent only if needed.',
      'Camera: completely static. NO zoom, NO pan.',
      'CRITICAL CONSTRAINTS: NO text, NO letters, NO words, NO numbers, NO typography of any kind in the image. NO real people, NO faces, NO photographs, NO UI screens, NO logos. The frame is intentionally minimal — text is added later by the renderer.',
    ].join(' '),
  },
  'paper-cutout': {
    label: 'Paper cutout',
    tagline: 'Two or three flat colored paper shapes layered on cream.',
    prompt: [
      'STYLE: flat paper cutout collage on warm cream background.',
      'Subject: TWO or THREE simple geometric paper shapes (circles, rectangles, half-moons) in solid brand colors, layered with subtle hard drop shadows. NO illustration detail inside the shapes.',
      'Palette: cream (#fde9d8) background, deep ink (#14110d), forest green (#1f3a2f), burnt sienna (#b6481a) for the shapes.',
      'Camera: completely static.',
      'CRITICAL CONSTRAINTS: NO text, NO letters, NO words, NO numbers, NO typography. NO real people, NO faces, NO photographs, NO realistic illustration. Just clean cutout shapes on paper.',
    ].join(' '),
  },
  'flat-2d': {
    label: 'Flat 2D explainer',
    tagline: 'One simple cartoon icon centered on solid color background.',
    prompt: [
      'STYLE: flat 2D vector illustration, Lottie/Rive aesthetic.',
      'Subject: ONE single simple cartoon icon (a heart, a star, a check mark, a speech bubble, a thumbs-up — pick the one most relevant to the scene) with thick black outlines and solid fill. Centered.',
      'Palette: one saturated brand color as solid background, white or black for the icon outline.',
      'Camera: completely static.',
      'CRITICAL CONSTRAINTS: NO text, NO letters, NO words, NO numbers. NO real people, NO faces. Just one clean iconic shape.',
    ].join(' '),
  },
  infographic: {
    label: 'Animated infographic',
    tagline: 'One simple chart shape on clean background.',
    prompt: [
      'STYLE: minimalist data visualization on clean off-white background.',
      'Subject: ONE simple chart element — either three solid color bars of varying heights, or one upward-trending line with dots at inflection points, or a single donut/ring chart. NO numbers, NO labels.',
      'Palette: off-white (#f7f4ed) background, deep ink (#14110d) for primary marks, one brand accent color for the highlighted data point.',
      'Camera: completely static.',
      'CRITICAL CONSTRAINTS: NO text, NO letters, NO words, NO numbers in the image. NO real people. Pure shape and color.',
    ].join(' '),
  },
  isometric: {
    label: 'Isometric mini',
    tagline: 'One floating 3D card or block, soft pastel.',
    prompt: [
      'STYLE: isometric 3D illustration, soft and clean.',
      'Subject: ONE single floating isometric card (a rectangle in 3D perspective with a subtle drop shadow). Optionally one tiny abstract figure beside it (3-color silhouette, no facial features). NO UI inside the card.',
      'Palette: soft pastel pink, sky blue, or cream background, with deep navy outlines.',
      'Camera: static isometric perspective.',
      'CRITICAL CONSTRAINTS: NO text, NO letters, NO words, NO numbers. NO real people, NO realistic faces. NO readable UI. The card is intentionally blank.',
    ].join(' '),
  },
  abstract: {
    label: 'Abstract shapes',
    tagline: 'One soft color blob on warm background.',
    prompt: [
      'STYLE: premium abstract motion graphics, single-shape composition.',
      'Subject: ONE single large soft color blob with smooth gradient (pink to purple, or warm cream to sienna), centered or off-center. NO secondary shapes.',
      'Palette: rich gradient on warm cream or near-black background.',
      'Camera: completely static.',
      'CRITICAL CONSTRAINTS: NO text, NO letters, NO words, NO numbers. NO real people, NO objects, NO UI. Pure form and color.',
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
