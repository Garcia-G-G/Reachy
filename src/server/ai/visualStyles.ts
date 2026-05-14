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
   * For FFmpeg image generation (Flux Pro inline). Static composition —
   * the Ken Burns zoompan in compose.ts adds subtle motion later. Must:
   *  • forbid real people (model defaults to photorealism otherwise)
   *  • forbid text/letters/numbers in the image — every reel rendered
   *    before this rule landed had gibberish typography ("NNST INGBIL"),
   *    because the overlay system handles all text and the image model
   *    can't render type cleanly anyway
   *  • describe 3-4 visual elements with hierarchy (not a busy collage,
   *    but not empty either)
   *  • lock the camera fully static
   */
  promptStatic: string;
  /**
   * For Sora 2 video generation. Same composition language as promptStatic
   * but the camera-static line is replaced with explicit motion direction
   * so Sora generates animated frames over the clip's duration. Without
   * this, Sora obediently produces a frozen frame.
   */
  promptMotion: string;
}

export const DEFAULT_VISUAL_STYLE: VisualStyleKey = 'editorial';

export const VISUAL_STYLES: Record<VisualStyleKey, VisualStyleEntry> = {
  editorial: {
    label: 'Editorial motion',
    tagline: 'Warm paper layout with multiple geometric marks; type added by overlay.',
    promptStatic: [
      'STYLE: warm cream paper background with visible grain and slight aging at the edges, like a high-quality editorial print magazine spread.',
      'Composition: 3-4 geometric marks arranged with editorial layout balance — a thin horizontal rule across the upper third, an oversized ink-colored shape (rectangle, half-circle, or punctuation) as the focal point in the central zone, a small burnt-sienna accent block in a quadrant for visual weight, and a thin vertical line at one edge.',
      'Treat the frame as a magazine page mock with intentional negative space. Mid-century print design sensibility (Massimo Vignelli / Dieter Rams).',
      'Palette: warm off-white paper (#f1ebdf) background, deep ink (#14110d) for primary marks, burnt sienna (#b6481a) for one accent only.',
      'Camera: completely static. NO zoom, NO pan, NO parallax.',
      'CRITICAL CONSTRAINTS: NO text, NO letters, NO words, NO numbers, NO typography of any kind in the image. NO real people, NO faces, NO photographs, NO UI screens, NO logos. Type is added by the renderer in a separate layer.',
    ].join(' '),
    promptMotion: [
      'STYLE: warm cream paper background with visible grain and slight aging at the edges, like a high-quality editorial print magazine spread being assembled in front of you.',
      'Composition: 3-4 geometric marks arranged with editorial layout balance — a thin horizontal rule across the upper third, an oversized ink-colored shape (rectangle, half-circle, or punctuation) as the focal point in the central zone, a small burnt-sienna accent block in a quadrant for visual weight, and a thin vertical line at one edge.',
      'MOTION over the clip duration: shapes drift in slowly from off-frame in the first 2 seconds with subtle easing, then settle into their final positions. The horizontal rule extends from left to right over 1 second like a pen stroke. The accent block pulses once gently near the midpoint. Camera holds completely still — only the elements move. Slow, deliberate, premium editorial pace. NO fast cuts, NO whip pans, NO camera shake.',
      'Mid-century print design sensibility (Massimo Vignelli / Dieter Rams), but in motion.',
      'Palette: warm off-white paper (#f1ebdf) background, deep ink (#14110d) for primary marks, burnt sienna (#b6481a) for one accent only.',
      'CRITICAL CONSTRAINTS: NO text, NO letters, NO words, NO numbers, NO typography of any kind in the image. NO real people, NO faces, NO photographs, NO UI screens, NO logos. Type is added by the renderer in a separate layer.',
    ].join(' '),
  },
  'paper-cutout': {
    label: 'Paper cutout',
    tagline: 'Layered colored paper shapes with hard drop shadows.',
    promptStatic: [
      'STYLE: flat paper cutout collage on warm cream background, with visible paper grain across all layers and hard drop shadows at a 30-degree angle.',
      'Composition: 3-4 layered geometric paper shapes (one circle, one rectangle, one half-moon or quarter-arc, one thin strip) in solid brand colors, overlapping with intentional hierarchy. The largest shape anchors the composition; smaller shapes provide rhythm.',
      'Style of Headway / Fable summaries — tactile, hand-cut feel, slight imperfection at the edges.',
      'Palette: cream (#fde9d8) background, deep ink (#14110d), forest green (#1f3a2f), burnt sienna (#b6481a) — distribute the colors across the shapes, no shape uses more than one color.',
      'Camera: completely static.',
      'CRITICAL CONSTRAINTS: NO text, NO letters, NO words, NO numbers, NO typography. NO real people, NO faces, NO photographs, NO realistic illustration, NO icons. Just clean cutout shapes.',
    ].join(' '),
    promptMotion: [
      'STYLE: flat paper cutout collage on warm cream background, with visible paper grain and hard drop shadows at a 30-degree angle that lengthen and shorten as shapes move.',
      'Composition: 3-4 layered geometric paper shapes (one circle, one rectangle, one half-moon or quarter-arc, one thin strip) in solid brand colors.',
      'MOTION over the clip duration: each shape slides into frame from a different edge with a soft easing curve over the first 2 seconds — the largest first, then the rest in cascading rhythm. Once settled, the shapes breathe with a tiny up-and-down float (3-4 pixels) and their drop shadows shift accordingly. Near the midpoint, the smallest shape rotates 15 degrees and snaps back. Camera holds completely still — only the paper moves. Tactile, hand-placed feel.',
      'Style of Headway / Fable summaries — tactile, hand-cut, slight imperfection at the edges.',
      'Palette: cream (#fde9d8) background, deep ink (#14110d), forest green (#1f3a2f), burnt sienna (#b6481a) — distribute across the shapes, no shape uses more than one color.',
      'CRITICAL CONSTRAINTS: NO text, NO letters, NO words, NO numbers, NO typography. NO real people, NO faces, NO photographs, NO realistic illustration, NO icons. Just clean cutout shapes.',
    ].join(' '),
  },
  'flat-2d': {
    label: 'Flat 2D explainer',
    tagline: 'Bold cartoon scene with one focal icon and supporting elements.',
    promptStatic: [
      'STYLE: flat 2D vector illustration scene, Lottie/Rive aesthetic, like a Duolingo or Mailchimp marketing illustration.',
      'Composition: ONE central cartoon icon (a heart, a star, a check mark, a speech bubble, a thumbs-up — pick the one most relevant) with thick black outlines and solid fill, surrounded by 2-3 small supporting decorative shapes (dots, sparkles, or small geometric ornaments) to add liveliness without clutter.',
      'Palette: one saturated brand color as solid background, white or off-white for the icon fill, black for outlines, one accent color for supporting elements.',
      'Camera: completely static.',
      'CRITICAL CONSTRAINTS: NO text, NO letters, NO words, NO numbers. NO real people, NO faces, NO realistic photographs. Cartoon icons only.',
    ].join(' '),
    promptMotion: [
      'STYLE: flat 2D vector animation scene, Lottie/Rive aesthetic, like a Duolingo or Mailchimp marketing animation.',
      'Composition: ONE central cartoon icon (a heart, a star, a check mark, a speech bubble, a thumbs-up — pick the one most relevant to the narration) with thick black outlines and solid fill, surrounded by 2-3 small supporting decorative shapes (dots, sparkles, or geometric ornaments).',
      'MOTION over the clip duration: the central icon springs in from a scaled-down state (0.6x to 1.0x) with a bouncy easing curve in the first second, then continues to gently breathe (scale 1.0x ↔ 1.04x) for the rest of the clip. The supporting shapes wink/sparkle in sequence around the icon, each appearing and disappearing with a subtle fade and 360-degree rotation. Camera holds completely still.',
      'Palette: one saturated brand color as solid background, white or off-white for the icon fill, black for outlines, one accent color for supporting elements.',
      'CRITICAL CONSTRAINTS: NO text, NO letters, NO words, NO numbers. NO real people, NO faces, NO realistic photographs. Cartoon icons only.',
    ].join(' '),
  },
  infographic: {
    label: 'Animated infographic',
    tagline: 'Multiple chart elements arranged like a mini editorial dashboard.',
    promptStatic: [
      'STYLE: minimalist data visualization composition on clean off-white background, like a New York Times infographic or The Pudding article.',
      'Composition: 2-3 chart elements arranged in editorial hierarchy — for example a primary bar chart (3-5 solid color bars of varying heights) as the focal point, a small donut chart in a corner, and a thin trend line connecting two abstract markers. NO numbers or labels rendered as text — just the abstract chart shapes.',
      'Palette: off-white (#f7f4ed) background, deep ink (#14110d) for primary data, one brand accent color for the highlighted data point, neutral mid-grey for secondary marks.',
      'Camera: completely static.',
      'CRITICAL CONSTRAINTS: NO text, NO letters, NO words, NO numbers in the image. NO axis labels, NO chart titles. NO real people. Pure shape, color, and abstract data form.',
    ].join(' '),
    promptMotion: [
      'STYLE: minimalist data visualization in motion, on clean off-white background — a New York Times or Pudding infographic coming to life.',
      'Composition: 2-3 chart elements arranged in editorial hierarchy — a primary bar chart (3-5 solid color bars) as the focal point, a small donut chart in a corner, and a thin trend line connecting two abstract markers.',
      'MOTION over the clip duration: bars grow from the baseline upward to their final heights with spring physics over the first 2 seconds, the tallest bar arriving last. The trend line draws itself stroke-by-stroke from left to right with a 1-second flourish. The donut chart fills in clockwise like a stopwatch over 1.5 seconds. Near the midpoint, the highlighted accent-color element pulses once gently. Camera holds completely still — the data is the protagonist.',
      'Palette: off-white (#f7f4ed) background, deep ink (#14110d) for primary data, one brand accent color for the highlighted data point, neutral mid-grey for secondary marks.',
      'CRITICAL CONSTRAINTS: NO text, NO letters, NO words, NO numbers in the image. NO axis labels, NO chart titles. NO real people. Pure shape, color, and abstract data form in motion.',
    ].join(' '),
  },
  isometric: {
    label: 'Isometric mini',
    tagline: 'Floating 3D blocks and tiny figures in soft pastel.',
    promptStatic: [
      'STYLE: isometric 3D illustration scene, soft and clean, like Notion or Linear marketing illustrations.',
      'Composition: 2-3 floating isometric elements in 3D perspective with subtle drop shadows — a primary card or block as the focal point, a smaller secondary block at a different elevation, and optionally one tiny abstract figure (3-color silhouette, no facial features) interacting with the elements.',
      'Palette: soft pastel pink, sky blue, or cream background; element surfaces in soft pastel gradients with deep navy outlines.',
      'Camera: static isometric perspective at 30 degrees.',
      'CRITICAL CONSTRAINTS: NO text, NO letters, NO words, NO numbers, NO readable UI. NO real people, NO realistic faces. The cards are intentionally blank.',
    ].join(' '),
    promptMotion: [
      'STYLE: isometric 3D illustration in motion, soft and clean, like Notion or Linear marketing animations.',
      'Composition: 2-3 floating isometric elements at 30-degree perspective with subtle drop shadows — a primary card or block as the focal point, a smaller secondary block at a different elevation, and optionally one tiny abstract figure (3-color silhouette, no facial features).',
      'MOTION over the clip duration: the primary card slowly floats up and down (8-pixel range) on a 3-second loop while its shadow stretches and compresses with the motion. The secondary block drifts in from one side over the first 2 seconds and joins the floating loop, slightly out of phase. If a figure is present, it walks two steps in place, arms swinging. Camera holds completely still — only the elements drift.',
      'Palette: soft pastel pink, sky blue, or cream background; element surfaces in soft pastel gradients with deep navy outlines.',
      'CRITICAL CONSTRAINTS: NO text, NO letters, NO words, NO numbers, NO readable UI. NO real people, NO realistic faces. The cards are intentionally blank.',
    ].join(' '),
  },
  abstract: {
    label: 'Abstract shapes',
    tagline: 'Multiple soft color blobs morphing premium-style.',
    promptStatic: [
      'STYLE: premium abstract motion graphics composition, like Apple/Stripe/Vercel marketing visuals.',
      'Composition: 2-3 large soft color blobs with smooth gradients, arranged with intentional overlap and negative space. The primary blob is the focal point; secondary blobs add depth.',
      'Palette: rich gradients — pink-to-purple, sky-to-mint, or warm cream-to-sienna — on a near-black or warm cream background.',
      'Camera: completely static.',
      'CRITICAL CONSTRAINTS: NO text, NO letters, NO words, NO numbers. NO real people, NO objects, NO UI, NO icons. Pure form and color.',
    ].join(' '),
    promptMotion: [
      'STYLE: premium abstract motion graphics in continuous slow motion, like an Apple keynote intro or a Stripe product reveal.',
      'Composition: 2-3 large soft color blobs with smooth gradients, arranged with intentional overlap and negative space.',
      'MOTION over the clip duration: the blobs morph organically and breathe — each blob slowly inhales and exhales (scales 0.92x ↔ 1.08x) on its own rhythm, and their edges deform like soft fluid. Gradient hues drift across each blob, slowly cycling through neighboring colors in the palette. Near the midpoint, two blobs briefly merge at their overlapping edges and separate again. Camera holds completely still — the motion is purely internal to the forms. Premium, hypnotic, ambient.',
      'Palette: rich gradients — pink-to-purple, sky-to-mint, or warm cream-to-sienna — on a near-black or warm cream background.',
      'CRITICAL CONSTRAINTS: NO text, NO letters, NO words, NO numbers. NO real people, NO objects, NO UI, NO icons. Pure form and color in motion.',
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
