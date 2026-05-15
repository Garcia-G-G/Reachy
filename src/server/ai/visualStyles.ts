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

// Keys + metadata live in the client-safe mirror at src/lib/visual-styles-meta.ts
// — the form needs them without dragging the prompt bodies into client JS.
// This file owns just the prompts.
export {
  DEFAULT_VISUAL_STYLE,
  VISUAL_STYLE_KEYS,
  VISUAL_STYLE_META,
  type VisualStyleKey,
} from '@/lib/visual-styles-meta';

import {
  DEFAULT_VISUAL_STYLE,
  VISUAL_STYLE_KEYS,
  type VisualStyleKey,
} from '@/lib/visual-styles-meta';

export interface VisualStyleEntry {
  /** Short display label for the brand-kit and reel-form selectors. */
  label: string;
  /** One-line summary shown under the label. */
  tagline: string;
  /**
   * True when Sora 2 produces visibly animated output for this style in
   * practice. Empirically determined from a 3-style render comparison on
   * 2026-05-14 (see planning/SORA-STYLE-RESULTS.md): bitrate ratios at
   * Sora 2 Pro 720p showed `abstract` (+57%), `flat-2d` (+49%) and
   * `isometric` (+31%) all generated meaningfully more motion than
   * `editorial` (baseline). The print-aesthetic styles ('editorial',
   * 'paper-cutout') produced near-static output regardless of
   * `promptMotion` because Sora reads "magazine spread" as "static print"
   * from its training data. `infographic` is conservatively marked false
   * until tested.
   *
   * The reel form greys out styles with `soraFriendly === false` when a
   * sora-* engine is selected and surfaces a tooltip; the user can still
   * override.
   */
  soraFriendly: boolean;
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

// DEFAULT_VISUAL_STYLE is re-exported from @/lib/visual-styles-meta above —
// it lives there so the client can use it without bundling these prompts.
// Empirical (2026-05-14): `abstract` was promoted from `editorial` because
// it produced the most Sora motion in the 3-style comparison (+57% bitrate
// vs editorial), is the lowest moderation risk (no people / no objects /
// no text), and aligns stylistically with the safe-prompt fallback Sora
// retry uses on moderation blocks. See planning/SORA-STYLE-RESULTS.md.

// ─────────────────────────────────────────────────────────────────────────
// Palette interpolation — visualStyles use {ink}, {paper}, {accent}
// placeholders. promptBuilder substitutes them with the brand kit's
// actual hex values at runtime. Previously the styles embedded literal
// hexes (#f1ebdf / #14110d / #b6481a) which SILENTLY OVERRODE the
// brand kit's palette in the AI prompt — bug found 2026-05-15. The
// brand kit is now the single source of truth for colour.
// ─────────────────────────────────────────────────────────────────────────

export const VISUAL_STYLES: Record<VisualStyleKey, VisualStyleEntry> = {
  editorial: {
    label: 'Editorial motion',
    tagline: 'Warm paper layout with multiple geometric marks; type added by overlay.',
    soraFriendly: false,
    promptStatic: [
      'STYLE: warm paper-toned background with visible grain and slight aging at the edges, like a high-quality editorial print magazine spread.',
      'Composition: 3-4 geometric marks arranged with editorial layout balance — a thin horizontal rule across the upper third, an oversized ink-colored shape (rectangle, half-circle, or punctuation) as the focal point in the central zone, a small accent-colored block in a quadrant for visual weight, and a thin vertical line at one edge.',
      'Treat the frame as a magazine page mock with intentional negative space. Mid-century print design sensibility (Massimo Vignelli / Dieter Rams).',
      'Palette: {paper} as the background, {ink} for primary marks, {accent} for one highlight only.',
      'Camera: completely static. NO zoom, NO pan, NO parallax.',
      'CRITICAL CONSTRAINTS: NO text, NO letters, NO words, NO numbers, NO typography of any kind in the image. NO real people, NO faces, NO photographs, NO UI screens, NO logos. Type is added by the renderer in a separate layer.',
    ].join(' '),
    promptMotion: [
      'STYLE: warm paper-toned background with visible grain and slight aging at the edges, like a high-quality editorial print magazine spread being assembled in front of you.',
      'Composition: 3-4 geometric marks arranged with editorial layout balance — a thin horizontal rule across the upper third, an oversized ink-colored shape as the focal point, a small accent-colored block for visual weight, and a thin vertical line at one edge.',
      'MOTION: shapes drift in slowly from off-frame in the first 2 seconds with subtle easing, then settle. The horizontal rule extends like a pen stroke. The accent block pulses once gently near the midpoint. Camera holds completely still — only the elements move. Slow, deliberate, premium editorial pace.',
      'Mid-century print design sensibility (Massimo Vignelli / Dieter Rams), but in motion.',
      'Palette: {paper} as the background, {ink} for primary marks, {accent} for one highlight only.',
      'CRITICAL CONSTRAINTS: NO text, NO letters, NO words, NO numbers, NO typography of any kind. NO real people, NO faces, NO photographs, NO UI screens, NO logos.',
    ].join(' '),
  },
  'paper-cutout': {
    label: 'Paper cutout',
    tagline: 'Layered colored paper shapes with hard drop shadows.',
    soraFriendly: false,
    promptStatic: [
      'STYLE: flat paper cutout collage on a warm paper-toned background, with visible paper grain across all layers and hard drop shadows at a 30-degree angle.',
      'Composition: 3-4 layered geometric paper shapes (one circle, one rectangle, one half-moon or quarter-arc, one thin strip) in solid brand colors, overlapping with intentional hierarchy.',
      'Style of Headway / Fable summaries — tactile, hand-cut feel, slight imperfection at the edges.',
      'Palette: {paper} background, {ink} for the dominant shape, {accent} for the highlight shape. Use the brand palette exactly — no extra colours.',
      'Camera: completely static.',
      'CRITICAL CONSTRAINTS: NO text, NO letters, NO words, NO numbers, NO typography. NO real people, NO faces. Just clean cutout shapes.',
    ].join(' '),
    promptMotion: [
      'STYLE: flat paper cutout collage on a warm paper-toned background, with visible paper grain and hard drop shadows that lengthen and shorten as shapes move.',
      'Composition: 3-4 layered geometric paper shapes in solid brand colors.',
      'MOTION: each shape slides into frame from a different edge with a soft easing curve over the first 2 seconds — the largest first, then the rest in cascading rhythm. Once settled, the shapes breathe with a tiny up-and-down float and their drop shadows shift accordingly. Near the midpoint, the smallest shape rotates 15 degrees and snaps back. Camera holds completely still — only the paper moves.',
      'Style of Headway / Fable summaries — tactile, hand-cut, slight imperfection at the edges.',
      'Palette: {paper} background, {ink} for the dominant shape, {accent} for the highlight shape.',
      'CRITICAL CONSTRAINTS: NO text, NO letters, NO words, NO numbers. NO real people. Just clean cutout shapes.',
    ].join(' '),
  },
  'flat-2d': {
    label: 'Flat 2D explainer',
    tagline: 'Bold cartoon scene with one focal icon and supporting elements.',
    soraFriendly: true,
    promptStatic: [
      'STYLE: flat 2D vector illustration scene, Lottie/Rive aesthetic, like a Duolingo or Mailchimp marketing illustration.',
      'Composition: ONE central cartoon icon (a heart, a star, a check mark, a speech bubble — pick the one most relevant) with thick {ink} outlines and a solid {paper} or {accent} fill, surrounded by 2-3 small supporting decorative shapes.',
      'Palette: {accent} as the solid background field, {paper} for the icon fill, {ink} for outlines. Use exactly these brand hex values, no other colours.',
      'Camera: completely static.',
      'CRITICAL CONSTRAINTS: NO text, NO letters, NO words, NO numbers. NO real people, NO faces, NO realistic photographs. Cartoon icons only.',
    ].join(' '),
    promptMotion: [
      'STYLE: bold, energetic flat 2D vector animation, Lottie/Rive feel — Duolingo or Mailchimp marketing animation cranked up.',
      'Composition: ONE central cartoon icon with thick {ink} outlines and a solid {paper} or {accent} fill, plus 4-6 supporting decorative shapes orbiting from off-frame.',
      'MOTION (continuous, full clip): the central icon SLAMS in from 0.3x scale with an overshoot bounce in the first 0.5s, then pulses confidently (scale 0.92x ↔ 1.10x every 1.5s). Supporting shapes constantly enter and exit — confetti bursts, sparkles rotate, small shapes whip across diagonals. A slow camera push-in (5% zoom over the full duration) adds depth. Lively, kinetic, joyful — never static.',
      'Palette: {accent} as the solid background field, {paper} for the icon fill, {ink} for outlines.',
      'CRITICAL CONSTRAINTS: NO text, NO letters, NO words, NO numbers. Cartoon icons only.',
    ].join(' '),
  },
  infographic: {
    label: 'Animated infographic',
    tagline: 'Multiple chart elements arranged like a mini editorial dashboard.',
    soraFriendly: false,
    promptStatic: [
      'STYLE: minimalist data visualization composition on a clean {paper}-toned background, like a New York Times infographic or The Pudding article.',
      'Composition: 2-3 chart elements in editorial hierarchy — a primary bar chart (3-5 solid color bars of varying heights) as the focal point, a small donut chart in a corner, and a thin trend line connecting two abstract markers. NO numbers or labels rendered as text.',
      'Palette: {paper} background, {ink} for primary data marks, {accent} for the ONE highlighted data point. Use only these brand colours.',
      'Camera: completely static.',
      'CRITICAL CONSTRAINTS: NO text, NO letters, NO words, NO numbers in the image. NO axis labels, NO chart titles. Pure shape, color, and abstract data form.',
    ].join(' '),
    promptMotion: [
      'STYLE: minimalist data visualization in motion, on a clean {paper}-toned background.',
      'Composition: 2-3 chart elements — bars, a donut, a trend line.',
      'MOTION: bars grow from the baseline upward with spring physics over the first 2 seconds, the tallest arriving last. The trend line draws itself stroke-by-stroke. The donut fills clockwise. Near the midpoint, the {accent}-highlighted element pulses once gently. Camera static.',
      'Palette: {paper} background, {ink} for primary data, {accent} for the highlighted point.',
      'CRITICAL CONSTRAINTS: NO text, NO letters, NO words, NO numbers. NO axis labels.',
    ].join(' '),
  },
  isometric: {
    label: 'Isometric mini',
    tagline: 'Floating 3D blocks and tiny figures in soft pastel.',
    soraFriendly: true,
    promptStatic: [
      'STYLE: isometric 3D illustration scene, soft and clean, like Notion or Linear marketing illustrations.',
      'Composition: 2-3 floating isometric elements in 3D perspective with subtle drop shadows — a primary card as the focal point, a smaller secondary block at a different elevation, optionally one tiny abstract figure (silhouette, no facial features).',
      'Palette: {paper} background; element surfaces in {ink} and {accent} gradients with crisp outlines. Use the brand hex values exactly.',
      'Camera: static isometric perspective at 30 degrees.',
      'CRITICAL CONSTRAINTS: NO text, NO letters, NO words, NO numbers, NO readable UI. NO real people. The cards are intentionally blank.',
    ].join(' '),
    promptMotion: [
      'STYLE: kinetic isometric 3D illustration in motion, soft and clean.',
      'Composition: 3-4 floating isometric elements at 30-degree perspective with crisp drop shadows.',
      'MOTION (continuous): the primary card floats up and down on a 2s loop, drop shadow stretching in sync. Secondary blocks orbit slowly at staggered elevations. A tiny figure walks confidently between the blocks. Cards wobble 10° around their vertical axis. Soft particles drift upward. Slow controlled orbital camera nudge (3° azimuth shift). Alive, dimensional.',
      'Palette: {paper} background; surfaces in {ink} and {accent} gradients.',
      'CRITICAL CONSTRAINTS: NO text, NO letters, NO words, NO numbers. The cards are intentionally blank.',
    ].join(' '),
  },
  abstract: {
    label: 'Abstract shapes',
    tagline: 'Multiple soft color blobs morphing premium-style.',
    soraFriendly: true,
    promptStatic: [
      'STYLE: premium abstract motion graphics composition, like Apple/Stripe/Vercel marketing visuals.',
      'Composition: 2-3 large soft color blobs with smooth gradients, intentional overlap and negative space.',
      'Palette: rich {ink}↔{accent} gradients on a {paper} or near-black background. Use the brand hex values as the dominant hues — accent for highlights only.',
      'Camera: completely static.',
      'CRITICAL CONSTRAINTS: NO text, NO letters, NO words, NO numbers. NO real people, NO UI, NO icons. Pure form and color.',
    ].join(' '),
    promptMotion: [
      'STYLE: cinematic premium abstract motion graphics — Apple keynote intro, Stripe product reveal, Linear launch trailer.',
      'Composition: 3-4 large soft color blobs with smooth gradients, volumetric light beams, drifting particles, and a soft chromatic glow at the edges.',
      'MOTION (continuous, lush): blobs morph aggressively, breathing between 0.7x and 1.4x scale. Gradient hues drift slowly through the palette every 4-5 seconds. Volumetric light beams sweep from off-screen. Particles drift upward. Two blobs collide at the midpoint and separate. Subtle slow camera push-in (8% zoom). The frame is alive: every pixel moving.',
      'Palette: rich {ink}↔{accent} gradients on a {paper} or near-black background.',
      'CRITICAL CONSTRAINTS: NO text, NO letters, NO words, NO numbers. Pure form, color, and light in continuous motion.',
    ].join(' '),
  },
};

/**
 * Substitute the {ink} / {paper} / {accent} placeholders in a style's
 * prompt body with the given brand hex values. Called by promptBuilder
 * before the style line lands in the AI prompt.
 *
 * Garcia's bug from 2026-05-15: the style entries embedded literal
 * hex values for the editorial palette (#f1ebdf / #14110d / #b6481a)
 * which silently shadowed the brand kit's actual palette inside the
 * AI prompt. This function is the canonical substitution path.
 */
export function interpolatePalette(
  template: string,
  palette: { ink: string; paper: string; accent: string },
): string {
  return template
    .replaceAll('{ink}', palette.ink)
    .replaceAll('{paper}', palette.paper)
    .replaceAll('{accent}', palette.accent);
}

/** Resolve a brand kit's `visualStyle` field (nullable) to a usable entry. */
export function resolveVisualStyle(key: string | null | undefined): VisualStyleEntry {
  if (key && (VISUAL_STYLE_KEYS as readonly string[]).includes(key)) {
    return VISUAL_STYLES[key as VisualStyleKey];
  }
  return VISUAL_STYLES[DEFAULT_VISUAL_STYLE];
}
