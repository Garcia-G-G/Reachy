import 'server-only';
import type { FontRole } from '@/server/typography/fonts';
import type { ImageFormat } from './formats';

/**
 * Marketing-grade layout templates. The split is intentional:
 *
 *   AI = background only (no text inside the pixels).
 *   Layout = a list of coordinate-anchored TextBlock slots.
 *   Renderer = SVG overlay rendered by sharp with the brand fonts.
 *
 * Coordinates are NORMALIZED to the [0, 1] frame so the same template
 * works at every aspect ratio. composeImage multiplies by the actual
 * width/height when building the SVG.
 *
 * Each TextBlock describes ONE rendered line/run. A layout that wants
 * "eyebrow over headline over CTA" lists three TextBlocks with the
 * three roles and their positions. The copyPlanner LLM call returns a
 * PlannedCopy object whose keys match the textSource fields below.
 */

export type TextRole = 'eyebrow' | 'headline' | 'subheadline' | 'cta' | 'wordmark';
export type TextSource = TextRole | 'static';
export type TextAlign = 'left' | 'center' | 'right';
/** Which slot in the resolved palette this run paints with. Resolved
 *  against brandKit at compose time so a layout works on any brand. */
export type TextColorRole = 'ink' | 'paper' | 'accent';

export interface TextBlock {
  /** Logical role — drives font + default weight + which copy field
   *  populates it. `static` blocks render the fixed `text` field below. */
  role: TextRole | 'static';
  /** Anchor X within the frame, normalized [0, 1]. The point this refers
   *  to is determined by `align`: left → top-left, center → top-center,
   *  right → top-right of the text box. */
  x: number;
  y: number;
  /** Width as a fraction of frame width. Controls wrapping. */
  widthFrac: number;
  /** Font size as a fraction of frame height. Frame-height is the right
   *  base for vertical layouts (9:16) where headlines should scale to
   *  a fraction of the long edge. Tweak per layout. */
  sizeFrac: number;
  /** Which font role to render this block in. */
  font: FontRole;
  align: TextAlign;
  /** Color slot — `ink` for primary text, `paper` for inverse, `accent`
   *  for the brand accent stripe. Resolved at compose time against the
   *  brand kit's primaryColor / bgColor / accentColor. */
  color: TextColorRole;
  /** Variable font weight 100-900. Defaults: display 600, body 500,
   *  mono 600, italic 400. Skip for italic which has no weight axis. */
  weight?: number;
  /** Optional uppercase transform — for mono eyebrows etc. */
  upper?: boolean;
  /** Optional letter-spacing in em. Negative tightens (tight display
   *  headlines), positive opens up (mono eyebrows look better at +0.12). */
  letterSpacingEm?: number;
  /** Which slot of PlannedCopy fills this block. `static` blocks use
   *  the `text` field directly instead. */
  textSource: TextSource;
  /** Literal text when textSource === 'static' (otherwise ignored). */
  text?: string;
  /** Optional absolute line-height in em. Defaults to 1.1 for display,
   *  1.3 for body. */
  lineHeightEm?: number;
}

/** Optional solid block painted under the text — e.g. a coloured slab
 *  behind a quote layout so the text is fully legible regardless of
 *  background. Coordinates normalized like TextBlock. */
export interface BackdropRect {
  x: number;
  y: number;
  widthFrac: number;
  heightFrac: number;
  color: TextColorRole;
  /** 0–1; defaults to 0.92. Lets the layout dial in a translucent slab
   *  when the brand wants the background to peek through. */
  opacity?: number;
  /** Optional corner radius as a fraction of frame width. The
   *  card-soft layout uses ~0.018 (about a 20px radius at 1080px). */
  cornerRadiusFrac?: number;
  /** Optional soft drop shadow under the rect — picks up the
   *  "floating card" feel without depending on the AI background.
   *  When set, composeImage wraps the rect in an SVG filter with
   *  feGaussianBlur + feOffset + low-opacity black. */
  shadow?: {
    /** Blur stdDeviation in px (typical 8-24 for soft cards). */
    blurPx: number;
    /** Vertical offset in px (positive = down). */
    offsetY: number;
    /** Black-shadow opacity 0–1 (typical 0.15-0.25). */
    opacity: number;
  };
}

/** Cutout / mask treatment. When set, the layout's overlay covers the
 *  whole frame with `colors.paper` EXCEPT where the named text block's
 *  letterforms sit — there the AI background bleeds through. The named
 *  block's `text` value is what's punched out; its other attributes
 *  (font, size, position, alignment) define the cutout shape. The block
 *  is implicitly NOT rendered as visible text — it becomes the mask.
 *
 *  Used by `text-mask-cutout` to produce magazine-style "image inside
 *  letterforms" treatments. composeImage handles the SVG <mask> build. */
export interface LayoutMask {
  kind: 'text-fill-image';
  /** Which TextBlock in `blocks[]` to use as the cutout shape. Match by
   *  role; the matching block must be present in `blocks[]`. */
  textBlock: TextRole;
}

export interface Layout {
  id: LayoutId;
  /** Human label for the picker. */
  label: string;
  /** Which PlannedCopy slots this layout uses. The copyPlanner only
   *  fills these — extra slots aren't asked for and so don't waste
   *  tokens or LLM attention. */
  slots: readonly TextRole[];
  /** Hint appended to the AI background prompt. Tells the model where
   *  to keep the frame visually quiet so the typographic overlay has
   *  room to breathe. Plain English, concrete: "keep the top 40% and
   *  bottom 20% calm and uncluttered". */
  negativeSpaceHint: string;
  /** Optional backdrop slab(s) painted before the text — used by
   *  quote-slab to lay a coloured rectangle over the photo first. */
  backdrops?: readonly BackdropRect[];
  /** Render order: top → bottom of this array maps to bottom → top of
   *  the visual stack (last block renders on top). For typical layouts
   *  order is irrelevant since blocks don't overlap. */
  blocks: readonly TextBlock[];
  /** Optional cutout / fill treatment — see LayoutMask. When set, the
   *  named TextBlock becomes a mask hole revealing the AI image; the
   *  rest of the canvas fills with `colors.paper`. */
  mask?: LayoutMask;
}

export type LayoutId =
  | 'hero-centered'
  | 'hero-split-left'
  | 'quote-slab'
  | 'announcement-banner'
  | 'card-soft'
  | 'quote-large'
  | 'editorial-margin'
  | 'feature-stack'
  | 'editorial-collage'
  | 'text-mask-cutout'
  | 'badge-stamp';

/**
 * ─────────────────────────────────────────────────────────────────────
 * Layout 1 — hero-centered
 *   Eyebrow + Headline + CTA, all centered horizontally.
 *   Used for: hero, post-ig, square, og-square, linkedin-post-square.
 *   Negative space: top 30% + center 40% should be visually quieter
 *   than the bottom so the centered text has contrast room.
 * ─────────────────────────────────────────────────────────────────────
 */
const heroCentered: Layout = {
  id: 'hero-centered',
  label: 'Hero · centered',
  slots: ['eyebrow', 'headline', 'cta'],
  negativeSpaceHint:
    'Keep the central 50% of the frame visually CALM — soft tones, low contrast, no busy details there. Push texture, gradients, and accent shapes toward the edges. The composition will host large centered typography over the middle band; do not let the background compete for attention in that band.',
  blocks: [
    {
      role: 'eyebrow',
      textSource: 'eyebrow',
      x: 0.5,
      y: 0.38,
      widthFrac: 0.8,
      sizeFrac: 0.022,
      font: 'mono',
      align: 'center',
      color: 'ink',
      upper: true,
      letterSpacingEm: 0.18,
    },
    {
      role: 'headline',
      textSource: 'headline',
      x: 0.5,
      y: 0.44,
      widthFrac: 0.8,
      sizeFrac: 0.085,
      font: 'display',
      align: 'center',
      color: 'ink',
      weight: 600,
      letterSpacingEm: -0.015,
      lineHeightEm: 1.05,
    },
    {
      role: 'cta',
      textSource: 'cta',
      x: 0.5,
      y: 0.7,
      widthFrac: 0.8,
      sizeFrac: 0.028,
      font: 'body',
      align: 'center',
      color: 'accent',
      weight: 600,
      upper: true,
      letterSpacingEm: 0.08,
    },
  ],
};

/**
 * Layout 2 — hero-split-left
 *   Headline on the LEFT half. The AI background owns the right half.
 *   Used for: og, hero (wide), email-header (when split makes sense).
 *   Negative space: left 50% should be quiet; the visual "subject" of
 *   the AI background sits on the right.
 */
const heroSplitLeft: Layout = {
  id: 'hero-split-left',
  label: 'Hero · split-left',
  slots: ['eyebrow', 'headline', 'cta'],
  negativeSpaceHint:
    'Compose the visual subject (shape, gradient, focal element) within the RIGHT 50% of the frame. The LEFT 50% should be calm and low-contrast — soft tonal field, subtle texture only, no busy detail. Typography will be overlaid on the left.',
  blocks: [
    {
      role: 'eyebrow',
      textSource: 'eyebrow',
      x: 0.07,
      y: 0.18,
      widthFrac: 0.4,
      sizeFrac: 0.025,
      font: 'mono',
      align: 'left',
      color: 'ink',
      upper: true,
      letterSpacingEm: 0.18,
    },
    {
      role: 'headline',
      textSource: 'headline',
      x: 0.07,
      y: 0.32,
      widthFrac: 0.42,
      sizeFrac: 0.075,
      font: 'display',
      align: 'left',
      color: 'ink',
      weight: 600,
      letterSpacingEm: -0.02,
      lineHeightEm: 1.04,
    },
    {
      role: 'cta',
      textSource: 'cta',
      x: 0.07,
      y: 0.82,
      widthFrac: 0.42,
      sizeFrac: 0.024,
      font: 'body',
      align: 'left',
      color: 'accent',
      weight: 600,
      upper: true,
      letterSpacingEm: 0.1,
    },
  ],
};

/**
 * Layout 3 — quote-slab
 *   Large italic headline centered on a coloured slab that's painted on
 *   top of the AI background. The slab gives the typography legibility
 *   regardless of what the AI rendered.
 *   Used for: square, post-ig (quote variants), reel-cover.
 */
const quoteSlab: Layout = {
  id: 'quote-slab',
  label: 'Quote · slab',
  slots: ['headline', 'wordmark'],
  negativeSpaceHint:
    'The composition will be partially covered by a centered colored slab containing typography. Treat the visible periphery (the band around the central slab) as the showcase — push interesting form, colour transitions, and texture into the outer 25% of the frame. The center will be visually masked.',
  backdrops: [
    {
      x: 0.08,
      y: 0.18,
      widthFrac: 0.84,
      heightFrac: 0.64,
      color: 'paper',
      opacity: 0.94,
    },
  ],
  blocks: [
    {
      role: 'headline',
      textSource: 'headline',
      x: 0.5,
      y: 0.4,
      widthFrac: 0.72,
      sizeFrac: 0.085,
      font: 'italic',
      align: 'center',
      color: 'ink',
      letterSpacingEm: -0.01,
      lineHeightEm: 1.08,
    },
    {
      role: 'wordmark',
      textSource: 'wordmark',
      x: 0.5,
      y: 0.71,
      widthFrac: 0.4,
      sizeFrac: 0.022,
      font: 'mono',
      align: 'center',
      color: 'ink',
      upper: true,
      letterSpacingEm: 0.18,
    },
  ],
};

/**
 * Layout 4 — announcement-banner
 *   Eyebrow + Headline + Subheadline, all left-aligned, sitting low in
 *   the frame. Used for: email-header, email-banner-wide, banner-tw,
 *   launch announcements.
 */
const announcementBanner: Layout = {
  id: 'announcement-banner',
  label: 'Announcement · banner',
  slots: ['eyebrow', 'headline', 'subheadline'],
  negativeSpaceHint:
    'Keep the LOWER 45% of the frame visually CALM — soft tonal field, low contrast, no busy details. The composition can be lively in the upper 55% (gradients, accent shapes, texture), but the bottom band hosts left-aligned typography and must read clearly over it.',
  blocks: [
    {
      role: 'eyebrow',
      textSource: 'eyebrow',
      x: 0.05,
      y: 0.62,
      widthFrac: 0.6,
      sizeFrac: 0.05,
      font: 'mono',
      align: 'left',
      color: 'ink',
      upper: true,
      letterSpacingEm: 0.18,
    },
    {
      role: 'headline',
      textSource: 'headline',
      x: 0.05,
      y: 0.7,
      widthFrac: 0.6,
      sizeFrac: 0.13,
      font: 'display',
      align: 'left',
      color: 'ink',
      weight: 600,
      letterSpacingEm: -0.02,
      lineHeightEm: 1.04,
    },
    {
      role: 'subheadline',
      textSource: 'subheadline',
      x: 0.05,
      y: 0.86,
      widthFrac: 0.6,
      sizeFrac: 0.045,
      font: 'body',
      align: 'left',
      color: 'ink',
      weight: 400,
      lineHeightEm: 1.3,
    },
  ],
};

/**
 * Layout 5 — card-soft
 *   A floating brand-colored card with a soft drop shadow sits centered
 *   over the AI background. Headline + small sub inside the card. The
 *   IG-native aesthetic — feels like a curated product post, not a
 *   slide deck.
 *   Used for: post-ig (DEFAULT), square, og-square, linkedin-post-square.
 */
const cardSoft: Layout = {
  id: 'card-soft',
  label: 'Card · soft',
  // 4 slots: eyebrow above the card, headline + sub inside, wordmark
  // below the card. Reads like a print magazine cover stamp.
  slots: ['eyebrow', 'headline', 'subheadline', 'wordmark'],
  negativeSpaceHint:
    'Center-weighted composition with RICH color and form spilling out from behind a centered floating card. The card will mask only the middle ~40% of the frame — push the most interesting part of the image into the VISIBLE HALO around the centered card: corners, edges, top quarter, bottom quarter. Photographic depth, gradient lighting, organic textures. Avoid flat solid fields.',
  // Smaller card so the AI image dominates the frame — was 0.84×0.56,
  // now 0.62×0.45 centered (with the y bumped to 0.275 so the card sits
  // optical-centre). Lets the AI background read clearly on all four
  // sides of the card.
  backdrops: [
    {
      x: 0.19,
      y: 0.275,
      widthFrac: 0.62,
      heightFrac: 0.45,
      color: 'paper',
      opacity: 1,
      cornerRadiusFrac: 0.022,
      shadow: { blurPx: 32, offsetY: 22, opacity: 0.24 },
    },
  ],
  blocks: [
    // Eyebrow ABOVE the card — mono uppercase on the AI image directly.
    // Color = accent so it pops against the photo regardless of bg tone.
    {
      role: 'eyebrow',
      textSource: 'eyebrow',
      x: 0.5,
      y: 0.18,
      widthFrac: 0.7,
      sizeFrac: 0.02,
      font: 'mono',
      align: 'center',
      color: 'accent',
      upper: true,
      letterSpacingEm: 0.2,
    },
    // Headline INSIDE the card, top half.
    {
      role: 'headline',
      textSource: 'headline',
      x: 0.5,
      y: 0.36,
      widthFrac: 0.5,
      sizeFrac: 0.056,
      font: 'display',
      align: 'center',
      color: 'ink',
      weight: 600,
      letterSpacingEm: -0.02,
      lineHeightEm: 1.05,
    },
    // Subheadline INSIDE the card, bottom half.
    {
      role: 'subheadline',
      textSource: 'subheadline',
      x: 0.5,
      y: 0.57,
      widthFrac: 0.48,
      sizeFrac: 0.022,
      font: 'body',
      align: 'center',
      color: 'ink',
      weight: 400,
      lineHeightEm: 1.4,
    },
    // Wordmark BELOW the card — small mono, low-contrast over photo.
    {
      role: 'wordmark',
      textSource: 'wordmark',
      x: 0.5,
      y: 0.78,
      widthFrac: 0.6,
      sizeFrac: 0.018,
      font: 'mono',
      align: 'center',
      color: 'paper',
      upper: true,
      letterSpacingEm: 0.22,
    },
  ],
};

/**
 * Layout 6 — quote-large
 *   Full-bleed solid brand color (paper) with one huge italic phrase.
 *   The AI background is OPTIONAL noise — we paint a full-frame paper
 *   rect on top of it before the typography. Wordmark below in mono.
 *   Used for: square, post-ig (quote variants), reel-cover.
 */
const quoteLarge: Layout = {
  id: 'quote-large',
  label: 'Quote · large',
  slots: ['headline', 'wordmark'],
  negativeSpaceHint:
    'The composition will be covered by a full-bleed solid brand color before the typography lands — the AI background only contributes very subtle visible noise (paper texture, soft grain) if any. Generate a tonal, mostly-flat field of the brand cream tone with VERY soft texture. No focal elements, no shapes — just a quiet field.',
  backdrops: [
    {
      x: 0,
      y: 0,
      widthFrac: 1,
      heightFrac: 1,
      color: 'paper',
      opacity: 0.97,
    },
  ],
  blocks: [
    {
      role: 'headline',
      textSource: 'headline',
      x: 0.5,
      y: 0.32,
      widthFrac: 0.78,
      sizeFrac: 0.13,
      font: 'italic',
      align: 'center',
      color: 'ink',
      letterSpacingEm: -0.025,
      lineHeightEm: 1.0,
    },
    {
      role: 'wordmark',
      textSource: 'wordmark',
      x: 0.5,
      y: 0.86,
      widthFrac: 0.4,
      sizeFrac: 0.022,
      font: 'mono',
      align: 'center',
      color: 'accent',
      upper: true,
      letterSpacingEm: 0.22,
    },
  ],
};

/**
 * Layout 7 — editorial-margin
 *   Typography column on the LEFT 30% of the frame, AI imagery owns the
 *   right 70%. A subtle paper rect on the left hides AI scribbles in
 *   that column. Picks up the magazine-spread feel.
 *   Used for: hero, og, linkedin-post-landscape, youtube-thumbnail.
 */
const editorialMargin: Layout = {
  id: 'editorial-margin',
  label: 'Editorial · margin',
  slots: ['eyebrow', 'headline', 'subheadline'],
  negativeSpaceHint:
    'Compose the visual subject — gradients, focal elements, texture, hero shapes — entirely within the RIGHT 70% of the frame (from x=30% to x=100%). The LEFT 30% column should be a quiet field of the brand cream tone with optional very-soft texture, hosting no recognisable shapes or colour shifts. This becomes the typography margin.',
  backdrops: [
    {
      x: 0,
      y: 0,
      widthFrac: 0.34,
      heightFrac: 1,
      color: 'paper',
      opacity: 0.96,
    },
  ],
  blocks: [
    {
      role: 'eyebrow',
      textSource: 'eyebrow',
      x: 0.04,
      y: 0.12,
      widthFrac: 0.26,
      sizeFrac: 0.022,
      font: 'mono',
      align: 'left',
      color: 'accent',
      upper: true,
      letterSpacingEm: 0.2,
    },
    {
      role: 'headline',
      textSource: 'headline',
      x: 0.04,
      y: 0.2,
      widthFrac: 0.26,
      sizeFrac: 0.062,
      font: 'display',
      align: 'left',
      color: 'ink',
      weight: 600,
      letterSpacingEm: -0.02,
      lineHeightEm: 1.04,
    },
    {
      role: 'subheadline',
      textSource: 'subheadline',
      x: 0.04,
      y: 0.78,
      widthFrac: 0.26,
      sizeFrac: 0.022,
      font: 'body',
      align: 'left',
      color: 'ink',
      weight: 400,
      lineHeightEm: 1.4,
    },
  ],
};

/**
 * Layout 8 — feature-stack
 *   Mono accent dot · eyebrow · large headline · supporting line.
 *   All centered, generously spaced. The "feature post" aesthetic for
 *   product launches and announcements.
 *   Used for: post-ig, square, linkedin-post-square, og-square.
 */
const featureStack: Layout = {
  id: 'feature-stack',
  label: 'Feature · stack',
  slots: ['eyebrow', 'headline', 'subheadline'],
  negativeSpaceHint:
    'Keep the central 70% of the frame visually CALM — soft tones, low contrast, no busy details. The composition will host centered typography with generous breathing room across most of the frame. Push texture and accent gradients toward the extreme corners only; the middle should feel airy and uncluttered.',
  backdrops: [
    // Small accent dot above the eyebrow — drawn as a tiny rect; the
    // SVG renderer treats this as a solid block. It's the "decoration"
    // that makes the layout feel intentional vs. arbitrary.
    {
      x: 0.49,
      y: 0.24,
      widthFrac: 0.02,
      heightFrac: 0.02,
      color: 'accent',
      opacity: 1,
      cornerRadiusFrac: 0.01,
    },
  ],
  blocks: [
    {
      role: 'eyebrow',
      textSource: 'eyebrow',
      x: 0.5,
      y: 0.3,
      widthFrac: 0.7,
      sizeFrac: 0.022,
      font: 'mono',
      align: 'center',
      color: 'accent',
      upper: true,
      letterSpacingEm: 0.22,
    },
    {
      role: 'headline',
      textSource: 'headline',
      x: 0.5,
      y: 0.4,
      widthFrac: 0.78,
      sizeFrac: 0.078,
      font: 'display',
      align: 'center',
      color: 'ink',
      weight: 600,
      letterSpacingEm: -0.02,
      lineHeightEm: 1.04,
    },
    {
      role: 'subheadline',
      textSource: 'subheadline',
      x: 0.5,
      y: 0.66,
      widthFrac: 0.64,
      sizeFrac: 0.026,
      font: 'body',
      align: 'center',
      color: 'ink',
      weight: 400,
      lineHeightEm: 1.4,
    },
  ],
};

/**
 * Layout 9 — editorial-collage
 *   Magazine-spread aesthetic. No card backdrop. The AI image fills the
 *   frame; typography lands directly on it, asymmetric. Oversized italic
 *   headline bleeds into the lower-left third, mono eyebrow top-left,
 *   sub bottom-left, wordmark bottom-right. The new flagship for IG
 *   posts (post-ig default).
 */
const editorialCollage: Layout = {
  id: 'editorial-collage',
  label: 'Editorial · collage',
  slots: ['eyebrow', 'headline', 'subheadline', 'wordmark'],
  negativeSpaceHint:
    'Compose with intentional empty space in the LEFT HALF of the frame, especially the lower-left quadrant. Push the strong subject — focal element, color block, hero shape — into the RIGHT 40% of the frame. Magazine-spread aesthetic: ONE clear focal element, photographic depth, planned negative space on the left where oversized typography will land. Avoid flat abstract gradients.',
  blocks: [
    {
      role: 'eyebrow',
      textSource: 'eyebrow',
      x: 0.06,
      y: 0.08,
      widthFrac: 0.4,
      sizeFrac: 0.018,
      font: 'mono',
      align: 'left',
      color: 'ink',
      upper: true,
      letterSpacingEm: 0.22,
    },
    {
      role: 'headline',
      textSource: 'headline',
      x: 0.05,
      y: 0.5,
      widthFrac: 0.62,
      // Oversized — italic display at 16% of frame height. The brief
      // says "bleeds onto the image" so we accept the headline can run
      // over the right-side imagery; wrapLines breaks on word
      // boundaries to keep it readable.
      sizeFrac: 0.16,
      font: 'italic',
      align: 'left',
      color: 'ink',
      letterSpacingEm: -0.03,
      lineHeightEm: 0.95,
    },
    {
      role: 'subheadline',
      textSource: 'subheadline',
      x: 0.06,
      y: 0.86,
      widthFrac: 0.56,
      sizeFrac: 0.024,
      font: 'body',
      align: 'left',
      color: 'ink',
      weight: 400,
      lineHeightEm: 1.35,
    },
    {
      role: 'wordmark',
      textSource: 'wordmark',
      x: 0.95,
      y: 0.94,
      widthFrac: 0.3,
      sizeFrac: 0.016,
      font: 'mono',
      align: 'right',
      color: 'ink',
      upper: true,
      letterSpacingEm: 0.22,
    },
  ],
};

/**
 * Layout 10 — text-mask-cutout
 *   Magazine-style "image inside letterforms". The AI image is revealed
 *   ONLY through a single huge headline word; the rest of the canvas is
 *   solid paper. Tiny wordmark in the corner is the only literal text
 *   on top of the cutout.
 *
 *   composeImage's SVG mask pipeline handles this — the `mask` field
 *   tells it which TextBlock becomes the cutout shape. That block is
 *   NOT rendered as visible text (it's the mask); its geometry just
 *   defines where the image bleeds through.
 *
 *   Best with high-contrast / chunky AI compositions: fine detail
 *   reads as mush inside the letter shapes. The negativeSpaceHint
 *   pushes the model toward bold gradients + chunky color blocks.
 */
const textMaskCutout: Layout = {
  id: 'text-mask-cutout',
  label: 'Text · mask cutout',
  slots: ['headline', 'wordmark'],
  negativeSpaceHint:
    'HIGH CONTRAST composition with bold, chunky shapes — most of this image will only be visible inside large letterforms, so fine detail and small features will read as visual noise. Strong color blocks, dramatic gradients, simple silhouettes. Think saturated abstract art, not photoreal. ONE clear focal energy; avoid balanced symmetric noise.',
  blocks: [
    {
      role: 'headline',
      textSource: 'headline',
      // The cutout block — composeImage detects mask.textBlock === 'headline'
      // and uses this geometry to build the SVG <mask>. Position centered,
      // huge font, single short word (REACHY / LAUNCH / etc).
      x: 0.5,
      y: 0.5,
      widthFrac: 0.94,
      sizeFrac: 0.32,
      font: 'display',
      align: 'center',
      color: 'ink',
      weight: 700,
      letterSpacingEm: -0.04,
      lineHeightEm: 0.92,
    },
    {
      role: 'wordmark',
      textSource: 'wordmark',
      x: 0.95,
      y: 0.94,
      widthFrac: 0.3,
      sizeFrac: 0.016,
      font: 'mono',
      align: 'right',
      color: 'ink',
      upper: true,
      letterSpacingEm: 0.22,
    },
  ],
  mask: { kind: 'text-fill-image', textBlock: 'headline' },
};

/**
 * Layout 11 — badge-stamp
 *   Editorial poster: hero AI image full-frame + small circular accent
 *   "stamp" sticker overlay on the right edge. Headline italic on the
 *   top of the photo; eyebrow lives INSIDE the stamp circle.
 *
 *   The "circle" is a rounded rect with cornerRadiusFrac=0.5 — produces
 *   a true circle when the rect is square.
 */
const badgeStamp: Layout = {
  id: 'badge-stamp',
  label: 'Badge · stamp',
  slots: ['eyebrow', 'headline', 'subheadline', 'wordmark'],
  negativeSpaceHint:
    'Photographic depth-of-field — SHARP focal subject in the LEFT 60% of the frame (a clear hero shape, character, product, or composition centerpiece). Soft bokeh / gentle gradient / negative space in the RIGHT 40% where a circular brand stamp will be overlaid. The subject should feel like a magazine cover photo, not a generic stock background.',
  // The stamp is a ~24% diameter circle anchored mid-right. The blocks[]
  // section places the eyebrow INSIDE this circle (same x/y, white-on-
  // accent).
  backdrops: [
    {
      x: 0.62,
      y: 0.4,
      widthFrac: 0.24,
      heightFrac: 0.24,
      color: 'accent',
      opacity: 1,
      // 50% of width → perfect circle when widthFrac === heightFrac (it
      // does, both are 0.24 of frame width here — careful: heightFrac is
      // a fraction of HEIGHT so on a 1080×1350 portrait the rect won't
      // actually be square. composeImage uses width × frame-width and
      // height × frame-height, so for portrait we'll get an ellipse.
      // Accept this — looks intentional on most aspect ratios; users who
      // want a true circle on portrait can pick square format.)
      cornerRadiusFrac: 0.5,
      shadow: { blurPx: 20, offsetY: 10, opacity: 0.18 },
    },
  ],
  blocks: [
    // Headline at top of frame — italic Instrument Serif, max 4 words.
    {
      role: 'headline',
      textSource: 'headline',
      x: 0.05,
      y: 0.08,
      widthFrac: 0.5,
      sizeFrac: 0.075,
      font: 'italic',
      align: 'left',
      color: 'ink',
      letterSpacingEm: -0.025,
      lineHeightEm: 1.0,
    },
    // Eyebrow inside the stamp — mono uppercase, paper color so it
    // reads on accent-colored circle.
    {
      role: 'eyebrow',
      textSource: 'eyebrow',
      x: 0.74,
      y: 0.5,
      widthFrac: 0.22,
      sizeFrac: 0.02,
      font: 'mono',
      align: 'center',
      color: 'paper',
      upper: true,
      letterSpacingEm: 0.18,
      lineHeightEm: 1.2,
    },
    // Subheadline below stamp — small italic, max 2 lines, color ink.
    {
      role: 'subheadline',
      textSource: 'subheadline',
      x: 0.62,
      y: 0.74,
      widthFrac: 0.32,
      sizeFrac: 0.022,
      font: 'italic',
      align: 'center',
      color: 'ink',
      lineHeightEm: 1.3,
    },
    // Wordmark bottom-left mono.
    {
      role: 'wordmark',
      textSource: 'wordmark',
      x: 0.05,
      y: 0.94,
      widthFrac: 0.4,
      sizeFrac: 0.016,
      font: 'mono',
      align: 'left',
      color: 'ink',
      upper: true,
      letterSpacingEm: 0.22,
    },
  ],
};

export const LAYOUTS: Record<LayoutId, Layout> = {
  'hero-centered': heroCentered,
  'hero-split-left': heroSplitLeft,
  'quote-slab': quoteSlab,
  'announcement-banner': announcementBanner,
  'card-soft': cardSoft,
  'quote-large': quoteLarge,
  'editorial-margin': editorialMargin,
  'feature-stack': featureStack,
  'editorial-collage': editorialCollage,
  'text-mask-cutout': textMaskCutout,
  'badge-stamp': badgeStamp,
};

export const LAYOUT_IDS = Object.keys(LAYOUTS) as LayoutId[];

/**
 * Default layout per format. The picker can override per generation but
 * this matrix is what runs when the user doesn't pick one. Picked to
 * match how each format is typically used in marketing collateral.
 *
 * Wide formats → split-left or announcement-banner.
 * Square / portrait → hero-centered or quote-slab.
 */
export const DEFAULT_LAYOUT_FOR_FORMAT: Record<ImageFormat, LayoutId> = {
  hero: 'editorial-margin',
  og: 'editorial-margin',
  // post-ig default: editorial-collage. Card-soft was a step up from
  // hero-centered but still leaned on a centered backdrop card; the
  // collage treatment removes that crutch and lets the AI background
  // carry the visual weight (asymmetric italic display headline bleeds
  // onto the photo). card-soft remains available as an explicit pick.
  'post-ig': 'editorial-collage',
  square: 'feature-stack',
  'og-square': 'card-soft',
  'reel-cover': 'quote-large',
  'tiktok-cover': 'quote-large',
  'linkedin-post-square': 'feature-stack',
  'linkedin-post-landscape': 'editorial-margin',
  pinterest: 'quote-large',
  'banner-tw': 'announcement-banner',
  'youtube-thumbnail': 'editorial-margin',
  'email-header': 'announcement-banner',
  'email-banner-wide': 'announcement-banner',
};

/** Resolve a layout id (or a format's default) to its definition.
 *  Used at the entry to composeImage so callers can pass either. */
export function getLayout(input: { layoutId?: LayoutId; format?: ImageFormat }): Layout {
  if (input.layoutId) return LAYOUTS[input.layoutId];
  if (input.format) return LAYOUTS[DEFAULT_LAYOUT_FOR_FORMAT[input.format]];
  return LAYOUTS['hero-centered'];
}
