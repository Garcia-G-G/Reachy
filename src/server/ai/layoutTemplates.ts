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
}

export type LayoutId = 'hero-centered' | 'hero-split-left' | 'quote-slab' | 'announcement-banner';

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

export const LAYOUTS: Record<LayoutId, Layout> = {
  'hero-centered': heroCentered,
  'hero-split-left': heroSplitLeft,
  'quote-slab': quoteSlab,
  'announcement-banner': announcementBanner,
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
  hero: 'hero-split-left',
  og: 'hero-split-left',
  square: 'hero-centered',
  'og-square': 'hero-centered',
  'post-ig': 'hero-centered',
  'reel-cover': 'quote-slab',
  'tiktok-cover': 'quote-slab',
  'linkedin-post-square': 'hero-centered',
  'linkedin-post-landscape': 'hero-split-left',
  pinterest: 'quote-slab',
  'banner-tw': 'announcement-banner',
  'youtube-thumbnail': 'hero-split-left',
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
