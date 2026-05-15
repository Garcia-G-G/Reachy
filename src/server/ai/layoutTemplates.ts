import 'server-only';
import type { ImageFormat } from './formats';

/**
 * AI-typography layout templates.
 *
 * As of the May-2026 pivot: layouts are no longer SVG-overlay schemas.
 * gpt-image-2's text-rendering accuracy (~98.5%+ on Latin script per Atlas
 * Cloud's 2026 benchmark; multi-scale layouts confirmed) makes the prior
 * "AI = background, sharp + SVG = text" split obsolete. The AI now paints
 * EVERYTHING — composition, color blocks, and typography in one render.
 *
 * A layout is now a **prompt directive**: the layout's job is to tell
 * the model where to place which copy slot, at what scale, in what
 * font character, using which brand color. The brand wordmark and the
 * planned copy values land verbatim in the prompt so the AI renders
 * them with correct spelling.
 *
 * Coordinates are described in PLAIN ENGLISH ("upper-left corner",
 * "lower 30%", "bleed across the right column") — gpt-image-2 parses
 * spatial directives natively. No more normalized coordinates.
 */

/** The text slots a layout can populate. The copyPlanner fills these. */
export type TextRole = 'eyebrow' | 'headline' | 'subheadline' | 'cta' | 'wordmark';

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

/** Brand color tokens — ink (text + dominant), paper (background-ish),
 *  accent (small highlight). Injected verbatim into the AI prompt so
 *  the model gets exact hex values to anchor on. */
export interface BrandColors {
  ink: string;
  paper: string;
  accent: string;
}

/** Resolved copy values for the layout's slots. Empty strings are
 *  allowed and signal "skip this slot in the directive". */
export interface PromptCopy {
  eyebrow?: string;
  headline?: string;
  subheadline?: string;
  cta?: string;
  wordmark?: string;
}

/** Back-compat alias. composeImage.ts previously owned PlannedCopy;
 *  the type lives here now since copy planning and prompt building
 *  both reference it. composeImage.ts is quarantined. */
export type PlannedCopy = PromptCopy;

export interface PromptDirectiveInput {
  copy: PromptCopy;
  brandColors: BrandColors;
  /** Exact wordmark spelling (case-preserving). Falls back to project
   *  name when brand kit doesn't specify one. */
  brandWordmark: string;
  /** Descriptor of the brand's display font CHARACTER — e.g.
   *  "high-contrast editorial serif with hairline contrast", "humanist
   *  geometric sans, generous tracking". gpt-image-2 doesn't know
   *  family names like "Fraunces" but understands character. */
  brandFontHint: string;
}

export interface SequenceDirectiveInput extends PromptDirectiveInput {
  frameIndex: number;
  totalFrames: number;
}

export interface LayoutPromptTemplate {
  id: LayoutId;
  /** Human label for the picker. */
  label: string;
  /** Which PlannedCopy slots this layout uses. The copyPlanner only
   *  fills these — extra slots aren't asked for and so don't waste
   *  tokens or LLM attention. */
  slots: readonly TextRole[];
  /** Free-text directive injected into the LAYOUT DIRECTIVE section of
   *  the prompt. Describes composition + typography placement + scale +
   *  color, written for an art-director audience. The model uses this
   *  alongside the [BRIEF] to compose the image. */
  promptDirective: (input: PromptDirectiveInput) => string;
  /** Where the model should keep the frame composition quieter so the
   *  typography reads. Plain English. */
  negativeSpaceHint: string;
  /** Optional sequence-mode directive — produces continuity language
   *  for frame K of N, covering BOTH visual continuity (palette, focal
   *  subject) AND text progression (eyebrow numbering, headline beat).
   *  When omitted, the generic sequence directive applies. */
  sequenceDirective?: (input: SequenceDirectiveInput) => string;
  /** Optional reference-image hint — when the layout benefits from a
   *  particular kind of reference (e.g. logo overlay, photographic
   *  style), encoded here for the prompt builder. */
  referenceHint?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────

/** Render a "Slot X: '<value>'..." line if the copy slot has content.
 *  Empty slots are skipped so the directive doesn't bloat with
 *  "Render '' as eyebrow" noise. */
function slotLine(label: string, value: string | undefined, body: string): string {
  if (!value || value.trim().length === 0) return '';
  return `- ${label} "${escapeForPrompt(value.trim())}" — ${body}`;
}

/** Strip characters that would confuse the prompt parser (quotes inside
 *  quotes). Replace double-quote with the typographic equivalent. */
function escapeForPrompt(s: string): string {
  return s.replace(/"/g, '“').replace(/\n+/g, ' ');
}

/** Generic sequence directive used when a layout doesn't override.
 *  Built on the narrow-preserve + explicit-action pattern: list a
 *  tight set of carry-over attributes, then tell the model WHAT to
 *  change with a magnitude. Now ALSO covers text continuity since the
 *  AI renders the copy too — the planner already varied the copy per
 *  frame; this directive just tells the model to keep typography
 *  rhythm consistent. */
function genericSequenceDirective(input: SequenceDirectiveInput): string {
  const { frameIndex, totalFrames } = input;
  const beat = frameIndex / Math.max(totalFrames - 1, 1);
  const action = (() => {
    if (frameIndex === 0) return 'Establish the scene. This is the opening frame.';
    if (frameIndex === totalFrames - 1) {
      return 'CLOSE the sequence. Shift focal element ~20% toward frame center, scale UP ~10%, deepen the dominant shadow by ~15%.';
    }
    const pctLeft = Math.round((1 - beat) * 30) + 5;
    return `EVOLVE the prior frame. Shift focal element ~${pctLeft}% LEFT of its prior position, reduce scale ~10%, rotate ambient lighting ~15° clockwise.`;
  })();
  return [
    `Frame ${frameIndex + 1} of ${totalFrames} — direct continuation.`,
    'PRESERVE EXACTLY: color palette (same hex values, same relative areas), focal subject identity (same object, same material), art style and rendering technique, camera focal length, OVERALL TYPOGRAPHIC RHYTHM (same fonts, same scale per slot, same color usage).',
    `CHANGE (this frame): ${action}`,
    'TEXT EVOLUTION: render the planned copy for THIS frame verbatim. Spelling exact. Numbering if present must increment cleanly between frames.',
  ].join('\n');
}

// ─── Layout 1 — hero-centered ────────────────────────────────────────

const heroCentered: LayoutPromptTemplate = {
  id: 'hero-centered',
  label: 'Hero · centered',
  slots: ['eyebrow', 'headline', 'cta'],
  negativeSpaceHint:
    'Keep the central 50% of the frame visually CALM — soft tones, low contrast, no busy details. Push texture, gradients, and accent shapes toward the edges so the centered typography breathes.',
  promptDirective: ({ copy, brandColors, brandFontHint }) => `
HERO · CENTERED LAYOUT
Composition: focal subject sits in the lower third or fades into the upper edges; the visual center stays open for centered typography. Use the brand palette (paper as base, ink for text, accent for one small element).

Render this typography stack centered horizontally on a single vertical axis at frame center:
${slotLine('Eyebrow (small mono UPPERCASE, generous tracking ~0.18em, color ' + brandColors.ink + ', ~2% of frame height)', copy.eyebrow, 'positioned about 38% from the top')}
${slotLine('Headline (oversized ' + brandFontHint + ', weight 600, color ' + brandColors.ink + ', tight leading, max 6 words, ~8.5% of frame height)', copy.headline, 'centered at ~50% from top, wraps to at most 3 lines')}
${slotLine('CTA (small mono UPPERCASE, color ' + brandColors.paper + ' on an ' + brandColors.ink + ' pill button ~3% tall, generous horizontal padding)', copy.cta, 'centered ~70% from top')}

Spelling MUST be exact. Kerning crisp. Type integrated into the composition (subtle paper texture, lighting picks up the letters), not flat overlay.
`.trim(),
};

// ─── Layout 2 — hero-split-left ──────────────────────────────────────

const heroSplitLeft: LayoutPromptTemplate = {
  id: 'hero-split-left',
  label: 'Hero · split left',
  slots: ['eyebrow', 'headline', 'subheadline', 'cta'],
  negativeSpaceHint:
    'Left 45% of the frame is editorial copy space — keep it CALM. Right 55% holds the focal subject / visual texture. The vertical seam between the two zones must read clean, not muddy.',
  promptDirective: ({ copy, brandColors, brandFontHint }) => `
HERO · SPLIT LEFT LAYOUT
Composition: 45/55 vertical split. LEFT 45% is editorial copy space, color ${brandColors.paper}. RIGHT 55% is the focal subject and visual scene. The seam between them is clean (no gradient mush).

Typography on the LEFT panel, stacked vertically, left-aligned with a comfortable margin from the left edge (~6%):
${slotLine('Eyebrow (small mono UPPERCASE, tracking ~0.2em, color ' + brandColors.accent + ', ~2% tall)', copy.eyebrow, 'near the top, ~10% from top')}
${slotLine('Headline (oversized ' + brandFontHint + ', weight 700, tight leading, color ' + brandColors.ink + ', ~9% tall, wraps to 3-4 lines)', copy.headline, 'just below eyebrow, occupies most of the left panel\'s vertical space')}
${slotLine('Subheadline (sans-serif, regular weight, color ' + brandColors.ink + ' at 75% opacity, ~2.2% tall, max 3 lines)', copy.subheadline, 'below headline')}
${slotLine('CTA (small mono UPPERCASE, color ' + brandColors.paper + ' on ' + brandColors.ink + ' pill button)', copy.cta, 'bottom of the left panel, ~85% from top')}

All text renders crisply with correct spelling and tight kerning.
`.trim(),
};

// ─── Layout 3 — quote-slab ───────────────────────────────────────────

const quoteSlab: LayoutPromptTemplate = {
  id: 'quote-slab',
  label: 'Quote · slab',
  slots: ['headline', 'subheadline', 'wordmark'],
  negativeSpaceHint:
    'The CENTER of the frame holds a solid-color paper slab; the photo lives in the borders / edges. The slab is the visual anchor — keep its interior PURE solid color, no texture.',
  promptDirective: ({ copy, brandColors, brandFontHint, brandWordmark }) => `
QUOTE SLAB LAYOUT
Composition: a solid rectangular slab fills the center 70% of the frame in color ${brandColors.paper}. The background bleeds around it (~15% margin on all sides) with the focal scene/texture.

On the slab, typography centered both horizontally and vertically:
${slotLine('Pull-quote (' + brandFontHint + ', italic, weight 500, color ' + brandColors.ink + ', ~7% tall, wraps to 3-5 lines, enclosed in typographic quote marks)', copy.headline, 'main body of the slab')}
${slotLine('Attribution (small sans-serif, color ' + brandColors.ink + ' at 60% opacity, ~1.8% tall, prefixed with an em-dash "—")', copy.subheadline, 'centered below the quote, ~10% gap above it')}
- Wordmark "${escapeForPrompt(brandWordmark)}" — small mono UPPERCASE, color ${brandColors.accent}, ~1.5% tall, bottom-center of the slab with ~5% margin from slab bottom.

The slab has a faint 1px border of ${brandColors.ink} at 20% opacity. All text spelled correctly.
`.trim(),
};

// ─── Layout 4 — announcement-banner ──────────────────────────────────

const announcementBanner: LayoutPromptTemplate = {
  id: 'announcement-banner',
  label: 'Announcement · banner',
  slots: ['eyebrow', 'headline', 'cta'],
  negativeSpaceHint:
    'Horizontal banner composition — the visual breaks into three vertical bands (LEFT decorative texture, CENTER typography zone, RIGHT decorative texture). Center stays calm.',
  promptDirective: ({ copy, brandColors, brandFontHint }) => `
ANNOUNCEMENT BANNER LAYOUT
Composition: horizontal three-band split. Left and right thirds carry small decorative elements (icons, geometric shapes, accent strokes) in ${brandColors.accent}. Center third hosts the announcement copy on ${brandColors.paper}.

Typography centered in the middle band:
${slotLine('Eyebrow (small mono UPPERCASE, color ' + brandColors.accent + ', tracking ~0.22em, ~1.8% tall)', copy.eyebrow, 'just above headline')}
${slotLine('Headline (' + brandFontHint + ', weight 600, color ' + brandColors.ink + ', ~6% tall, max 2 lines, sentence case)', copy.headline, 'visual center of the frame')}
${slotLine('CTA (small mono UPPERCASE, color ' + brandColors.paper + ' on ' + brandColors.ink + ' pill button, ~2.5% tall)', copy.cta, 'centered below headline with ~3% gap')}

Decorative side elements should hint at the brief's subject but never compete with the centered text. Spelling exact.
`.trim(),
};

// ─── Layout 5 — card-soft ────────────────────────────────────────────

const cardSoft: LayoutPromptTemplate = {
  id: 'card-soft',
  label: 'Card · soft',
  slots: ['eyebrow', 'headline', 'subheadline', 'cta', 'wordmark'],
  negativeSpaceHint:
    'A card-like rectangle fills the inner 75% of the frame (margins of ~12% on all sides). Within the card, the upper 30% is reserved for a visual element; the lower 70% is the copy stack.',
  promptDirective: ({ copy, brandColors, brandFontHint, brandWordmark }) => `
SOFT CARD LAYOUT
Composition: a card-like rectangle occupies the inner 75% of the frame, color ${brandColors.paper}, with a SOFT shadow underneath (~10px blur, 8% opacity, offset down-right). Outside the card the frame is a complementary muted tone of ${brandColors.paper}.

Inside the card:
- TOP 30%: a single small visual element (icon, illustration, geometric shape) in ${brandColors.accent}, centered horizontally.
- BOTTOM 70%: typography stacked, left-aligned with ~8% padding from card-left:
${slotLine('Eyebrow (mono UPPERCASE, color ' + brandColors.accent + ', tracking ~0.18em, ~1.5% tall)', copy.eyebrow, 'first line of the stack')}
${slotLine('Headline (' + brandFontHint + ', weight 600, color ' + brandColors.ink + ', ~5.5% tall, max 3 lines)', copy.headline, 'just below eyebrow')}
${slotLine('Subheadline (sans-serif, regular, color ' + brandColors.ink + ' at 70% opacity, ~2% tall, max 2 lines)', copy.subheadline, 'below headline')}
${slotLine('CTA (mono UPPERCASE, color ' + brandColors.paper + ' on ' + brandColors.ink + ' pill button, ~2.2% tall)', copy.cta, 'bottom-left of the card')}
- Wordmark "${escapeForPrompt(brandWordmark)}" — tiny mono UPPERCASE, color ${brandColors.ink} at 50% opacity, bottom-right corner of the card.

Spelling exact, kerning crisp.
`.trim(),
};

// ─── Layout 6 — quote-large ──────────────────────────────────────────

const quoteLarge: LayoutPromptTemplate = {
  id: 'quote-large',
  label: 'Quote · large',
  slots: ['headline', 'subheadline'],
  negativeSpaceHint:
    'Entire frame is type-led — no card, no slab. The visual is a subtle photographic or textural background that the giant quote sits ON TOP OF. Background must read at ~70% the visual weight of the text.',
  promptDirective: ({ copy, brandColors, brandFontHint }) => `
LARGE QUOTE LAYOUT (NO CARD)
Composition: full-frame photographic or textural background tinted ${brandColors.paper}. The text dominates — background reads at ~70% weight of the typography.

Typography:
${slotLine('Massive pull-quote (' + brandFontHint + ', italic, weight 500, color ' + brandColors.ink + ', ~12% tall, leading ~1.05x, wraps to 3-5 lines, enclosed in typographic quote marks)', copy.headline, 'centered horizontally, occupies vertical center 60% of the frame')}
${slotLine('Attribution (sans-serif, regular, color ' + brandColors.ink + ' at 65% opacity, ~2% tall, prefixed with em-dash "—")', copy.subheadline, 'centered below the quote, ~8% gap')}

The quote should feel hand-set by a designer — character-aware kerning, no widows, no orphans. Spelling perfect.
`.trim(),
};

// ─── Layout 7 — editorial-margin ─────────────────────────────────────

const editorialMargin: LayoutPromptTemplate = {
  id: 'editorial-margin',
  label: 'Editorial · margin',
  slots: ['eyebrow', 'headline', 'subheadline', 'wordmark'],
  negativeSpaceHint:
    'Left 25% column is a narrow editorial margin (metadata strip). Right 75% is the main editorial column. The narrow column hosts mono UPPERCASE marginalia; the wide column hosts the editorial body.',
  promptDirective: ({ copy, brandColors, brandFontHint, brandWordmark }) => `
EDITORIAL MARGIN LAYOUT
Composition: a vertical 1-px rule of ${brandColors.ink} at 30% opacity divides the frame into a LEFT 25% margin column and a RIGHT 75% main column. Background is ${brandColors.paper}, with a small photographic / textural element in the upper-right corner of the main column.

LEFT margin column (typography aligned to the left edge of the column, vertically stacked from top):
${slotLine('Eyebrow (small mono UPPERCASE, color ' + brandColors.ink + ', tracking ~0.2em, ~1.5% tall)', copy.eyebrow, 'near top of margin column')}
- Wordmark "${escapeForPrompt(brandWordmark)}" — tiny mono UPPERCASE, color ${brandColors.accent}, ~1.3% tall, near bottom of margin column.

RIGHT main column (left-aligned, ~5% margin from the dividing rule):
${slotLine('Headline (' + brandFontHint + ', weight 600, color ' + brandColors.ink + ', ~7% tall, max 4 lines, tight leading)', copy.headline, 'upper third of main column')}
${slotLine('Subheadline (sans-serif, regular, color ' + brandColors.ink + ' at 75% opacity, ~2.2% tall, max 4 lines)', copy.subheadline, 'middle third of main column, ~6% gap below headline')}

Magazine-grade typography. Spelling exact.
`.trim(),
};

// ─── Layout 8 — feature-stack ────────────────────────────────────────

const featureStack: LayoutPromptTemplate = {
  id: 'feature-stack',
  label: 'Feature · stack',
  slots: ['eyebrow', 'headline', 'subheadline', 'cta'],
  negativeSpaceHint:
    'Top 25% of the frame holds a visual element (illustration, photo, geometric shape). Middle 50% is the typography stack. Bottom 25% is breathing room with a small CTA.',
  promptDirective: ({ copy, brandColors, brandFontHint }) => `
FEATURE STACK LAYOUT
Composition: vertical three-band — TOP 25% visual element on ${brandColors.paper} background, MIDDLE 50% typography zone, BOTTOM 25% breathing room with a single CTA.

Typography centered horizontally:
${slotLine('Eyebrow (mono UPPERCASE, color ' + brandColors.accent + ', tracking ~0.2em, ~1.8% tall)', copy.eyebrow, 'top of the middle band, ~30% from frame top')}
${slotLine('Headline (' + brandFontHint + ', weight 700, color ' + brandColors.ink + ', ~7% tall, max 3 lines, tight leading)', copy.headline, 'below eyebrow, dominant in the middle band')}
${slotLine('Subheadline (sans-serif, regular, color ' + brandColors.ink + ' at 70% opacity, ~2% tall, max 3 lines)', copy.subheadline, 'below headline, ~4% gap')}
${slotLine('CTA (mono UPPERCASE, color ' + brandColors.paper + ' on ' + brandColors.ink + ' pill button)', copy.cta, 'centered in the bottom band')}

Spelling exact, kerning crisp.
`.trim(),
};

// ─── Layout 9 — editorial-collage ────────────────────────────────────

const editorialCollage: LayoutPromptTemplate = {
  id: 'editorial-collage',
  label: 'Editorial · collage',
  slots: ['eyebrow', 'headline', 'subheadline', 'wordmark'],
  negativeSpaceHint:
    'Asymmetric editorial composition — no center card, no balanced grid. Focal subject occupies the RIGHT 55%. LEFT 45% is breathing room with intentional negative space.',
  promptDirective: ({ copy, brandColors, brandFontHint, brandWordmark }) => `
EDITORIAL COLLAGE LAYOUT
Composition: asymmetric, magazine-cover energy. Focal subject occupies the right 55% of the frame with photographic depth. Left 45% is intentional negative space on ${brandColors.paper}.

Typography (positioned with editorial confidence — NOT centered, NOT gridded):
${slotLine('Eyebrow (small mono UPPERCASE, color ' + brandColors.ink + ', tracking ~0.22em, ~1.8% tall)', copy.eyebrow, 'UPPER-LEFT corner, approximately 6% from the left edge and 8% from the top — treat as printed editorial metadata')}
${slotLine('Headline (oversized italic ' + brandFontHint + ', weight 600, color ' + brandColors.ink + ', ~10% tall, dramatic leading, wraps to 3-4 lines)', copy.headline, 'LOWER-LEFT area, starting around 50% from top — should naturally bleed onto the right-side focal composition without losing legibility')}
${slotLine('Subheadline (sans-serif, regular, color ' + brandColors.ink + ' at 80% opacity, ~2% tall, max 2 lines)', copy.subheadline, 'just below the headline')}
- Wordmark "${escapeForPrompt(brandWordmark)}" — tiny mono UPPERCASE, color ${brandColors.accent}, ~1.5% tall, BOTTOM-RIGHT corner with ~3% margin.

Typography is a first-class compositional element, not an overlay. Spelling exact.
`.trim(),
};

// ─── Layout 10 — text-mask-cutout ────────────────────────────────────

const textMaskCutout: LayoutPromptTemplate = {
  id: 'text-mask-cutout',
  label: 'Text · mask cutout',
  slots: ['headline', 'subheadline', 'wordmark'],
  negativeSpaceHint:
    'Background fills the entire frame with ${brandColors.paper}. A single dominant word forms a massive cut-out revealing the focal subject through the letterforms.',
  promptDirective: ({ copy, brandColors, brandFontHint, brandWordmark }) => `
TEXT MASK CUTOUT LAYOUT
Composition: background is solid ${brandColors.paper}. Foreground: ONE dominant word from the headline is rendered as MASSIVE cut-out letterforms (filling ~75% of frame width, vertically centered) revealing a photographic / textural scene INSIDE the letterforms themselves — the letters are windows into the focal subject.

Typography:
${slotLine('Cut-out word (' + brandFontHint + ', weight 800, ~30% of frame height, letters act as image-masks, the OUTLINE of the letters is ' + brandColors.ink + ' at 20% opacity)', copy.headline, 'centered horizontally, dominating the visual')}
${slotLine('Subheadline (small sans-serif, color ' + brandColors.ink + ', ~2% tall, max 2 lines)', copy.subheadline, 'below the cut-out word, centered, ~5% gap')}
- Wordmark "${escapeForPrompt(brandWordmark)}" — tiny mono UPPERCASE, color ${brandColors.accent}, top-right corner with ~3% margin.

If the headline has multiple words, pick ONE strong word for the cut-out and place the others on a smaller secondary line below. Spelling exact.
`.trim(),
};

// ─── Layout 11 — badge-stamp ─────────────────────────────────────────

const badgeStamp: LayoutPromptTemplate = {
  id: 'badge-stamp',
  label: 'Badge · stamp',
  slots: ['eyebrow', 'headline', 'subheadline'],
  negativeSpaceHint:
    'Asymmetric layout — left half is typography, right half is a circular accent stamp containing the eyebrow as inked text. Background is paper-toned.',
  promptDirective: ({ copy, brandColors, brandFontHint }) => `
BADGE STAMP LAYOUT
Composition: background is ${brandColors.paper}. Right half of the frame contains a circular accent stamp/disc in ${brandColors.accent} (~24% of frame width, vertically centered, soft printed-stamp character — ink-on-paper feel, slight imperfection at the edges). Left half hosts the main typography.

Typography:
${slotLine('Headline (italic ' + brandFontHint + ', weight 600, color ' + brandColors.ink + ', ~7.5% tall, tight leading, max 4 words)', copy.headline, 'UPPER-LEFT of the frame, ~5% from left, ~8% from top')}
${slotLine('Subheadline (small italic ' + brandFontHint + ', color ' + brandColors.ink + ', ~2.2% tall, max 2 lines)', copy.subheadline, 'BELOW THE STAMP, ~62% from left, ~74% from top')}

INSIDE the accent stamp/disc on the right:
${slotLine('Eyebrow (mono UPPERCASE, color ' + brandColors.paper + ' so it reads against the accent disc, tracking ~0.18em, ~2% tall)', copy.eyebrow, 'centered inside the disc, slight curve or printed-stamp feel — ink-on-paper character')}

Spelling exact. Stamp has the soft, slightly imperfect character of a hand-pressed ink stamp.
`.trim(),
};

// ─── Registry ────────────────────────────────────────────────────────

export const LAYOUTS: Record<LayoutId, LayoutPromptTemplate> = {
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

/** Per-format default layout. The picker UI offers all layouts, but
 *  when a generation comes in without an explicit layoutId we pick
 *  the format's natural fit (squares get hero-centered, 9:16 reels
 *  get feature-stack, etc.). */
export const DEFAULT_LAYOUT_FOR_FORMAT: Record<ImageFormat, LayoutId> = {
  hero: 'editorial-margin',
  og: 'editorial-margin',
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

export function getLayout(input: { layoutId?: LayoutId; format?: ImageFormat }): LayoutPromptTemplate {
  if (input.layoutId) return LAYOUTS[input.layoutId];
  if (input.format) return LAYOUTS[DEFAULT_LAYOUT_FOR_FORMAT[input.format]];
  return LAYOUTS['hero-centered'];
}

/** Sequence-directive resolver bound to a specific layout — the form
 *  the worker uses per-frame in sequence mode. Layouts may override
 *  via their own sequenceDirective; otherwise the generic
 *  narrow-preserve + explicit-action language applies. */
export function sequenceDirectiveFor(
  layout: LayoutPromptTemplate,
  input: SequenceDirectiveInput,
): string {
  if (layout.sequenceDirective) return layout.sequenceDirective(input);
  return genericSequenceDirective(input);
}
