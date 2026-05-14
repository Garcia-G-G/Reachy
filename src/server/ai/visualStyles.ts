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
    tagline: 'Warm paper layout with multiple geometric marks; type added by overlay.',
    prompt: [
      'STYLE: warm cream paper background with visible grain and slight aging at the edges, like a high-quality editorial print magazine spread.',
      'Composition: 3-4 geometric marks arranged with editorial layout balance — a thin horizontal rule across the upper third, an oversized ink-colored shape (rectangle, half-circle, or punctuation) as the focal point in the central zone, a small burnt-sienna accent block in a quadrant for visual weight, and a thin vertical line at one edge.',
      'Treat the frame as a magazine page mock with intentional negative space. Mid-century print design sensibility (Massimo Vignelli / Dieter Rams).',
      'Palette: warm off-white paper (#f1ebdf) background, deep ink (#14110d) for primary marks, burnt sienna (#b6481a) for one accent only.',
      'Camera: completely static. NO zoom, NO pan, NO parallax.',
      'CRITICAL CONSTRAINTS: NO text, NO letters, NO words, NO numbers, NO typography of any kind in the image. NO real people, NO faces, NO photographs, NO UI screens, NO logos. Type is added by the renderer in a separate layer.',
    ].join(' '),
  },
  'paper-cutout': {
    label: 'Paper cutout',
    tagline: 'Layered colored paper shapes with hard drop shadows.',
    prompt: [
      'STYLE: flat paper cutout collage on warm cream background, with visible paper grain across all layers and hard drop shadows at a 30-degree angle.',
      'Composition: 3-4 layered geometric paper shapes (one circle, one rectangle, one half-moon or quarter-arc, one thin strip) in solid brand colors, overlapping with intentional hierarchy. The largest shape anchors the composition; smaller shapes provide rhythm.',
      'Style of Headway / Fable summaries — tactile, hand-cut feel, slight imperfection at the edges.',
      'Palette: cream (#fde9d8) background, deep ink (#14110d), forest green (#1f3a2f), burnt sienna (#b6481a) — distribute the colors across the shapes, no shape uses more than one color.',
      'Camera: completely static.',
      'CRITICAL CONSTRAINTS: NO text, NO letters, NO words, NO numbers, NO typography. NO real people, NO faces, NO photographs, NO realistic illustration, NO icons. Just clean cutout shapes.',
    ].join(' '),
  },
  'flat-2d': {
    label: 'Flat 2D explainer',
    tagline: 'Bold cartoon scene with one focal icon and supporting elements.',
    prompt: [
      'STYLE: flat 2D vector illustration scene, Lottie/Rive aesthetic, like a Duolingo or Mailchimp marketing illustration.',
      'Composition: ONE central cartoon icon (a heart, a star, a check mark, a speech bubble, a thumbs-up — pick the one most relevant) with thick black outlines and solid fill, surrounded by 2-3 small supporting decorative shapes (dots, sparkles, or small geometric ornaments) to add liveliness without clutter.',
      'Palette: one saturated brand color as solid background, white or off-white for the icon fill, black for outlines, one accent color for supporting elements.',
      'Camera: completely static.',
      'CRITICAL CONSTRAINTS: NO text, NO letters, NO words, NO numbers. NO real people, NO faces, NO realistic photographs. Cartoon icons only.',
    ].join(' '),
  },
  infographic: {
    label: 'Animated infographic',
    tagline: 'Multiple chart elements arranged like a mini editorial dashboard.',
    prompt: [
      'STYLE: minimalist data visualization composition on clean off-white background, like a New York Times infographic or The Pudding article.',
      'Composition: 2-3 chart elements arranged in editorial hierarchy — for example a primary bar chart (3-5 solid color bars of varying heights) as the focal point, a small donut chart in a corner, and a thin trend line connecting two abstract markers. NO numbers or labels rendered as text — just the abstract chart shapes.',
      'Palette: off-white (#f7f4ed) background, deep ink (#14110d) for primary data, one brand accent color for the highlighted data point, neutral mid-grey for secondary marks.',
      'Camera: completely static.',
      'CRITICAL CONSTRAINTS: NO text, NO letters, NO words, NO numbers in the image. NO axis labels, NO chart titles. NO real people. Pure shape, color, and abstract data form.',
    ].join(' '),
  },
  isometric: {
    label: 'Isometric mini',
    tagline: 'Floating 3D blocks and tiny figures in soft pastel.',
    prompt: [
      'STYLE: isometric 3D illustration scene, soft and clean, like Notion or Linear marketing illustrations.',
      'Composition: 2-3 floating isometric elements in 3D perspective with subtle drop shadows — a primary card or block as the focal point, a smaller secondary block at a different elevation, and optionally one tiny abstract figure (3-color silhouette, no facial features) interacting with the elements.',
      'Palette: soft pastel pink, sky blue, or cream background; element surfaces in soft pastel gradients with deep navy outlines.',
      'Camera: static isometric perspective at 30 degrees.',
      'CRITICAL CONSTRAINTS: NO text, NO letters, NO words, NO numbers, NO readable UI. NO real people, NO realistic faces. The cards are intentionally blank.',
    ].join(' '),
  },
  abstract: {
    label: 'Abstract shapes',
    tagline: 'Multiple soft color blobs morphing premium-style.',
    prompt: [
      'STYLE: premium abstract motion graphics composition, like Apple/Stripe/Vercel marketing visuals.',
      'Composition: 2-3 large soft color blobs with smooth gradients, arranged with intentional overlap and negative space. The primary blob is the focal point; secondary blobs add depth.',
      'Palette: rich gradients — pink-to-purple, sky-to-mint, or warm cream-to-sienna — on a near-black or warm cream background.',
      'Camera: completely static.',
      'CRITICAL CONSTRAINTS: NO text, NO letters, NO words, NO numbers. NO real people, NO objects, NO UI, NO icons. Pure form and color.',
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
