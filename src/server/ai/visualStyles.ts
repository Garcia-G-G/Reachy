/**
 * Catalog of visual styles for image generation and reels.
 *
 * As of the May-2026 image pivot, each style's `promptStatic` is the
 * IMAGE prompt fragment sent to gpt-image-2 (no more "NO text" guards —
 * the AI renders typography now). `promptMotion` is the reel-side
 * variant fed to Sora.
 *
 * 2026-05-15 diversity rewrite: the 6 legacy keys (editorial,
 * paper-cutout, flat-2d, infographic, isometric, abstract) all produced
 * variants of the same moody-photo aesthetic because they shared most
 * of the prompt language. Replaced with 7 dramatically-distinct styles.
 * Legacy keys coerce-on-read via `resolveVisualStyle` so existing
 * brand_kit rows continue to render.
 */

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
  /** Reels-side flag — Sora 2 motion potential. */
  soraFriendly: boolean;
  /** IMAGE-gen prompt fragment. Sent to gpt-image-2 verbatim (after
   *  palette interpolation). Distinctive language per style — the
   *  whole point of the May 2026 rewrite is that two styles produce
   *  visibly different images of the same brief. No "NO text"
   *  constraint — the pivot wants AI typography. */
  promptStatic: string;
  /** REELS-side prompt fragment for Sora video. Same composition
   *  language as promptStatic but with motion direction added. */
  promptMotion: string;
}

// ─────────────────────────────────────────────────────────────────────
// Palette interpolation
// {ink} / {paper} / {accent} placeholders → brand kit hex values.
// promptBuilder substitutes at runtime. Brand kit is the single
// source of truth for color (bug fixed 2026-05-15: prior catalog
// embedded literal hexes that shadowed the brand palette).
// ─────────────────────────────────────────────────────────────────────

export const VISUAL_STYLES: Record<VisualStyleKey, VisualStyleEntry> = {
  'editorial-photo': {
    label: 'Editorial photo',
    tagline: 'Moody product photography with integrated typography.',
    soraFriendly: false,
    promptStatic: [
      'STYLE: editorial product photography. Shallow depth of field, soft directional natural light (window-side or golden-hour), real-world materials and surfaces (paper, wood, ceramic, fabric, metal patina). Cinematic shadows.',
      'Mood: quiet confidence — a still life by a New Yorker photo editor, not a stock catalogue. ONE focal subject occupies ~60% of the frame; the rest is breathing room with intentional negative space.',
      'Palette: {paper} dominates the lighting / surfaces; {ink} appears in deep shadows and the focal subject; {accent} shows up in a single small detail (a sticker, a stem, an edge of an object).',
      'Inspiration: Kinfolk magazine, Cereal magazine, Apartamento — premium print editorial.',
    ].join(' '),
    promptMotion: [
      'STYLE: cinematic editorial product photography in motion. Shallow depth of field, soft natural light shifting subtly over the clip.',
      'MOTION: slow, deliberate. A 3-5% camera push-in over the full duration; tiny shadow drift as light angle moves; a single subtle element shift near the midpoint (a leaf settles, a particle drifts).',
      'Palette: {paper} dominates the lighting / surfaces; {ink} for shadows and focal subject; {accent} for one small detail.',
      'Inspiration: Kinfolk / Cereal / Apartamento — premium print editorial in slow motion.',
    ].join(' '),
  },

  'typographic-poster': {
    label: 'Typographic poster',
    tagline: 'Typography IS the composition — Swiss style, big sans, color blocks.',
    soraFriendly: false,
    promptStatic: [
      'STYLE: typographic poster — typography IS the composition. NO photography. Dramatic scale shifts: one word HUGE, others tiny. Hard-edged solid color blocks dividing the frame into 2-3 zones. Asymmetric grid.',
      'Inspiration: Swiss Style (Wim Crouwel, Massimo Vignelli, Josef Müller-Brockmann). Late-modernist conference posters. Bauhaus poster archive.',
      'Type treatment: condensed geometric sans-serif (Akzidenz-Grotesk / Helvetica / Founders Grotesk character) for the dominant word; mono UPPERCASE for metadata. Set tight, no soft edges, no decorative serifs.',
      'Palette: {paper} as one color block, {ink} as another, {accent} as a third — solid flats, no gradients, no texture. Sharp edges where colors meet.',
    ].join(' '),
    promptMotion: [
      'STYLE: typographic poster in motion. Color blocks slide in from edges with hard easing; type lands with a snap.',
      'MOTION: color zones wipe in first (0-1s), then type slams into place with a 0.2s overshoot, then holds. Optional subtle vibration on the dominant word every few seconds.',
      'Palette: {paper}, {ink}, {accent} as solid color blocks.',
      'Inspiration: Wim Crouwel posters animated; Bauhaus motion graphics.',
    ].join(' '),
  },

  'collage-zine': {
    label: 'Collage zine',
    tagline: 'Torn paper, halftone dots, photo cutouts — 90s riso print feel.',
    soraFriendly: false,
    promptStatic: [
      'STYLE: cut-and-paste collage zine. Overlapping torn-paper edges with visible white tear lines, halftone dot patterns ghosted over color fields, photo cutouts (rough scissor edges, not crisp masks) sitting on flat color backgrounds, photocopy/Xerox texture grain.',
      'Inspiration: 90s riso prints, Sister Corita Kent, early Raygun magazine, perzine layouts, Tom Tomorrow strips, the actual physical assembly of a zine page.',
      'Type treatment: mixed — typewriter mono for some lines, marker handwriting for others, big condensed display for headlines. Slightly misaligned. Some letters can be hand-cut and pasted.',
      'Palette: {paper} as the base zine paper (visible grain), {ink} for the dominant cutouts, {accent} as the riso-print overprint color that ghosts over edges and creates registration imperfections.',
    ].join(' '),
    promptMotion: [
      'STYLE: collage zine page being assembled — paper shapes drift in, halftone patterns ghost over color fields, photocopy texture flickers subtly.',
      'MOTION: torn paper layers stack one by one with offset timing; halftone ghosts pulse on a 2s loop; the registration of the accent color drifts a few pixels each second.',
      'Palette: {paper} (riso paper), {ink} (cutout dominant), {accent} (riso overprint).',
      'Inspiration: 90s zine assembly stop-motion.',
    ].join(' '),
  },

  'brutalist-grid': {
    label: 'Brutalist grid',
    tagline: 'Raw geometric forms, exposed grid, mono type, single accent.',
    soraFriendly: false,
    promptStatic: [
      'STYLE: brutalist web/print design. Exposed grid lines visible across the frame (thin 1px {ink} hairlines). Hard-edged geometric forms, no rounded corners, no shadows, no decoration. Industrial monospace typography (JetBrains Mono / IBM Plex Mono character) UPPERCASE.',
      'Inspiration: Bloomberg Businessweek 2010s redesign, Drudge Report aesthetic at premium quality, Are.na boards, modern brutalist sites (Pangram Pangram, Off-White lookbooks).',
      'Composition: visible compositional grid, hard text wrap, dense information feel, intentional ugliness made beautiful through restraint. Negative space carries weight.',
      'Palette: STRICT black-and-white-and-one-accent. {paper} as off-white base, {ink} as near-black, {accent} as the ONE pop of color (sparingly — on one element only). NO gradients, NO mid-tones, NO secondary colors.',
    ].join(' '),
    promptMotion: [
      'STYLE: brutalist grid in motion. Grid lines draw in line-by-line; type appears letter-by-letter (terminal feel).',
      'MOTION: grid hairlines draw across the frame in the first 1-2s; text content appears with monospace typewriter timing; subtle 1px shake on the accent element every few seconds.',
      'Palette: {paper} (off-white base), {ink} (near-black), {accent} (single pop).',
      'Inspiration: terminal interfaces; brutalist sites being assembled live.',
    ].join(' '),
  },

  'illustrated-vector': {
    label: 'Illustrated vector',
    tagline: 'Clean character vectors, flat color, no photographic elements.',
    soraFriendly: true,
    promptStatic: [
      'STYLE: clean vector illustration scene. ONE strong character shape (a figure, an animal, a personified object — pick the one that fits the brief) with confident geometric construction, thick {ink} outlines, flat solid color fills, no gradients, no photographic textures.',
      'Inspiration: Duolingo brand illustrations, Mailchimp Freddie, Notion empty states, Spotify Wrapped character work, Lottie animation libraries (LottieFiles).',
      'Composition: the character is the focal subject, occupying ~50% of the frame; supporting decorative shapes (geometric, abstract — sparkles, circles, triangles) orbit at the edges. Negative space lets the character breathe.',
      'Palette: {paper} as the solid background field (NO photo, NO gradient), {ink} for character outlines and details, {accent} for character clothing or one fill area. Use exactly these three hex values.',
    ].join(' '),
    promptMotion: [
      'STYLE: kinetic vector illustration — Duolingo / Mailchimp marketing animation feel.',
      'MOTION: character slams in from off-frame with overshoot bounce (0-0.5s), then pulses (scale 0.95 ↔ 1.05 every 1.5s). Supporting shapes orbit, sparkle, drift confidently throughout. Slow 5% camera push-in over full duration. Lively, joyful, never static.',
      'Palette: {paper} (background field), {ink} (outlines), {accent} (fill highlights).',
      'Inspiration: Lottie animations cranked up.',
    ].join(' '),
  },

  'memphis-pattern': {
    label: 'Memphis pattern',
    tagline: 'Playful 80s shapes, squiggles, dots, bright contrasting colors.',
    soraFriendly: true,
    promptStatic: [
      'STYLE: 80s Memphis Group design. Playful asymmetric composition with overlapping geometric shapes — squiggle lines, dot patterns, triangles, half-circles, zigzags, checker patches. Hard-edged, hand-drawn-looking but precise. Confetti-energy without being childish.',
      "Inspiration: Ettore Sottsass and the Memphis Milano collective, Saved By The Bell title cards, Nathalie Du Pasquier patterns, contemporary brands using Memphis revivals (Glossier early branding, Tony's Chocolonely).",
      "Composition: shapes scattered across the frame in an organized chaos — clear focal area in the center for the brief's subject, decorative shapes orbiting at the edges and bleeding off the frame. Asymmetric, off-balance, unbalanced-on-purpose.",
      'Palette: bright contrasting. {paper} as the base, {ink} as one of the shape colors, {accent} as the dominant pop — used liberally (not just as detail) since Memphis is bright. Add 1-2 supporting brand-adjacent hues if it serves the composition.',
    ].join(' '),
    promptMotion: [
      'STYLE: Memphis pattern in motion — shapes bounce, squiggles wiggle, dots pulse.',
      'MOTION: each Memphis element animates on its own loop (rotate, bounce, pulse) at staggered timing. The accent color shapes pop with attitude (slight scale-up overshoot). Maximum playfulness without being chaotic.',
      'Palette: bright contrasting — {paper} base, {ink} shape, {accent} dominant pop.',
      'Inspiration: 80s MTV bumpers; Saved By The Bell intro animation.',
    ].join(' '),
  },

  'editorial-collage': {
    label: 'Editorial collage',
    tagline: 'Magazine spread: photo + typographic overlays + color blocks.',
    soraFriendly: false,
    promptStatic: [
      'STYLE: high-end editorial magazine spread. Combines photographic elements WITH strong typographic overlays AND flat color blocks — not pure photography, not pure typography, but a designed composition where all three coexist with intent.',
      'Inspiration: The New York Times Magazine spreads, Apartamento, The Gentlewoman, T Magazine, modern fashion editorials (SSENSE, Vestoj), book-cover design (Penguin Modern Classics).',
      'Composition: a photographic element occupies ~55% of the frame (often the right or upper portion), with a flat color block ({paper} or {accent}) anchoring the remainder. Typography lives on the color block AND bleeds onto the photo where it adds tension. Asymmetric, intentional, art-directed.',
      'Palette: {paper} as one major zone, {ink} for type and dark photographic areas, {accent} as a color block OR a small editorial detail (a stripe, a corner badge, a stamp).',
    ].join(' '),
    promptMotion: [
      'STYLE: editorial magazine spread in slow motion. Photo elements barely move; color blocks slide in; typography lands with editorial gravity.',
      'MOTION: color block wipes in first; photo element fades in next; typography settles with print-press feel. Maintain stillness — this is editorial, not advertising.',
      'Palette: {paper} (color zone), {ink} (type + dark photo areas), {accent} (color block or detail).',
      'Inspiration: NYT Magazine spreads.',
    ].join(' '),
  },
};

/** Legacy → new key mapping. Pre-2026-05-15 brand kits had keys like
 *  `abstract` / `paper-cutout`; rather than force a migration, we
 *  coerce on read inside resolveVisualStyle. Each old key maps to the
 *  closest new aesthetic so existing brand kits render coherent output
 *  without user action. */
const LEGACY_STYLE_ALIASES: Record<string, VisualStyleKey> = {
  editorial: 'editorial-photo',
  'paper-cutout': 'collage-zine',
  'flat-2d': 'illustrated-vector',
  infographic: 'typographic-poster',
  isometric: 'illustrated-vector',
  abstract: 'editorial-collage',
};

/**
 * Substitute the {ink} / {paper} / {accent} placeholders in a style's
 * prompt body with the given brand hex values. Called by promptBuilder
 * before the style line lands in the AI prompt.
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

/** Resolve a brand kit's `visualStyle` field (nullable, possibly legacy)
 *  to a usable entry. Legacy keys are coerced to their post-2026-05-15
 *  equivalents so existing rows render without DB migration. */
export function resolveVisualStyle(key: string | null | undefined): VisualStyleEntry {
  if (!key) return VISUAL_STYLES[DEFAULT_VISUAL_STYLE];
  if ((VISUAL_STYLE_KEYS as readonly string[]).includes(key)) {
    return VISUAL_STYLES[key as VisualStyleKey];
  }
  const aliased = LEGACY_STYLE_ALIASES[key];
  if (aliased) return VISUAL_STYLES[aliased];
  return VISUAL_STYLES[DEFAULT_VISUAL_STYLE];
}

/** Public helper: canonical key for a (possibly legacy) input. Used by
 *  the form picker to highlight the right entry when a brand kit still
 *  carries a legacy key. */
export function canonicalizeVisualStyleKey(key: string | null | undefined): VisualStyleKey {
  if (!key) return DEFAULT_VISUAL_STYLE;
  if ((VISUAL_STYLE_KEYS as readonly string[]).includes(key)) {
    return key as VisualStyleKey;
  }
  return LEGACY_STYLE_ALIASES[key] ?? DEFAULT_VISUAL_STYLE;
}
