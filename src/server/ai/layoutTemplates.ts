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

/** Build the STRICT block for a directive: the copy values + brand
 *  colors + wordmark spelling that are NON-NEGOTIABLE. The AI must
 *  render these texts verbatim and apply these colors. Composition is
 *  the AI's call — handled by the LOOSE block in each directive. */
function strictBlock(args: {
  copy: PromptCopy;
  brandColors: BrandColors;
  brandWordmark: string;
  slots: readonly TextRole[];
}): string {
  const lines: string[] = [];
  for (const slot of args.slots) {
    const value = args.copy[slot];
    if (value && value.trim().length > 0) {
      lines.push(`- ${slot}: "${escapeForPrompt(value.trim())}"`);
    }
  }
  if (args.slots.includes('wordmark') && args.brandWordmark) {
    // Wordmark always renders the project name even when the planner
    // didn't fill it — the AI must spell it verbatim.
    const already = lines.some((l) => l.startsWith('- wordmark:'));
    if (!already) lines.push(`- wordmark: "${escapeForPrompt(args.brandWordmark)}"`);
  }
  const colorLines = [
    `- ink (typography + dark tones): ${args.brandColors.ink}`,
    `- paper (background / light tones): ${args.brandColors.paper}`,
    `- accent (one small highlight): ${args.brandColors.accent}`,
  ].join('\n');

  // Phase 06 — letter-spell the wordmark once. The OpenAI image-gen
  // prompting cookbook (May 2026) confirms that spelling out tricky
  // brand names letter-by-letter once eliminates ~80% of typos for
  // <12-char wordmarks. We always include this since wordmark =
  // project name and project names often contain unusual capitalization
  // (FeedbackMind, PlanetScale, ProductHunt, etc.).
  const wordmark = args.brandWordmark.trim();
  const letterSpell =
    wordmark.length > 0 && wordmark.length <= 24
      ? [
          '',
          `Wordmark letter-by-letter (render exactly): ${wordmark
            .split('')
            .map((c) => (c === ' ' ? '[space]' : c))
            .join(' - ')}.`,
        ].join('\n')
      : '';

  return [
    'STRICT — render these EXACTLY (non-negotiable):',
    'Text content (spelling, case, and characters must match VERBATIM — no substitutions, no auto-correction, no smart-quotes):',
    lines.length > 0 ? lines.join('\n') : '- (no copy slots for this layout)',
    letterSpell,
    '',
    'Brand palette (hex values, dominant in the image):',
    colorLines,
  ]
    .filter((l) => l !== '')
    .join('\n');
}

const CREATIVE_POSITION =
  'Take a creative position. Make a composition decision the user would not have made themselves. This is a DESIGNED piece, not a template fill.';

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
    'Keep the visual center calm so the typography reads. The corners and edges can carry texture, accent shapes, or focal elements — center stays breathable.',
  promptDirective: ({ copy, brandColors, brandWordmark }) =>
    [
      `HERO · CENTERED — a single bold statement carried by typography. Sensibility: a confident centered hero composition, like a launch poster or an album cover.`,
      '',
      strictBlock({
        copy,
        brandColors,
        brandWordmark,
        slots: ['eyebrow', 'headline', 'cta'],
      }),
      '',
      `LOOSE — composition direction (your call):`,
      `- The headline is the visual hero. Treat it like a designed mark, not a string of words.`,
      `- The eyebrow is small editorial metadata — somewhere it lives as printed context, not a UI label.`,
      `- The CTA is the close — small, deliberate. A pill, a chip, a stamped line — your choice.`,
      `- Decide if there's a focal photographic element / shape / texture, where it lives, and how it makes room for the type. The center should READ, but it doesn't have to be empty.`,
      '',
      CREATIVE_POSITION,
    ].join('\n'),
};

// ─── Layout 2 — hero-split-left ──────────────────────────────────────

const heroSplitLeft: LayoutPromptTemplate = {
  id: 'hero-split-left',
  label: 'Hero · split left',
  slots: ['eyebrow', 'headline', 'subheadline', 'cta'],
  negativeSpaceHint:
    'The frame divides into two compositional zones — a quieter typography-led half and a busier visual-led half. The seam between them carries weight.',
  promptDirective: ({ copy, brandColors, brandWordmark }) =>
    [
      `HERO · SPLIT — a two-zone composition: one side carries the typography, the other carries the focal visual.`,
      '',
      strictBlock({
        copy,
        brandColors,
        brandWordmark,
        slots: ['eyebrow', 'headline', 'subheadline', 'cta'],
      }),
      '',
      `LOOSE — composition direction (your call):`,
      `- Decide which side is type and which is visual. Default is left-type / right-visual, but break it if the brief calls for it.`,
      `- Make the seam DELIBERATE — a hard color edge, a torn paper line, a soft gradient meeting a flat block, whatever serves the brief.`,
      `- The CTA should feel like the close — final word on the typographic side.`,
      `- The subheadline lives near the headline but at a clearly different visual weight.`,
      '',
      CREATIVE_POSITION,
    ].join('\n'),
};

// ─── Layout 3 — quote-slab ───────────────────────────────────────────

const quoteSlab: LayoutPromptTemplate = {
  id: 'quote-slab',
  label: 'Quote · slab',
  slots: ['headline', 'subheadline', 'wordmark'],
  negativeSpaceHint:
    'A flat solid color slab anchors the frame. The space around it can carry texture, photography, or further composition — the slab itself stays clean inside.',
  promptDirective: ({ copy, brandColors, brandWordmark }) =>
    [
      `QUOTE SLAB — a pull-quote presented like a printed broadside. The headline is set in display weight; the slab gives it gravity.`,
      '',
      strictBlock({
        copy,
        brandColors,
        brandWordmark,
        slots: ['headline', 'subheadline', 'wordmark'],
      }),
      '',
      `LOOSE — composition direction (your call):`,
      `- Decide the slab's shape, position, and proportion within the frame. It can be tilted, off-center, full-bleed, or framed by a photographic surround.`,
      `- Wrap the headline in proper typographic quote marks ("…") if the brief reads as a quote.`,
      `- Treat the subhead as the attribution line — prefixed with an em-dash if that reads right.`,
      `- The wordmark stamps the piece — pick a small, considered place for it on or near the slab.`,
      '',
      CREATIVE_POSITION,
    ].join('\n'),
};

// ─── Layout 4 — announcement-banner ──────────────────────────────────

const announcementBanner: LayoutPromptTemplate = {
  id: 'announcement-banner',
  label: 'Announcement · banner',
  slots: ['eyebrow', 'headline', 'cta'],
  negativeSpaceHint:
    'Horizontal banner — the eye reads left to right; the typography lands in a clear zone the eye can settle on.',
  promptDirective: ({ copy, brandColors, brandWordmark }) =>
    [
      `ANNOUNCEMENT BANNER — a wide-format announcement, like a marquee, a header, a campaign banner.`,
      '',
      strictBlock({
        copy,
        brandColors,
        brandWordmark,
        slots: ['eyebrow', 'headline', 'cta'],
      }),
      '',
      `LOOSE — composition direction (your call):`,
      `- The headline carries the announcement. The eyebrow gives it tone (category, mood). The CTA closes it.`,
      `- Decide on decorative weight — geometric shapes, accent strokes, or photographic elements bookending the typography. Restraint reads premium; profusion reads festive.`,
      `- A banner CAN be quiet (mostly type, small accent) OR loud (heavy color, bold geometry). Pick the register that fits the brief.`,
      '',
      CREATIVE_POSITION,
    ].join('\n'),
};

// ─── Layout 5 — card-soft ────────────────────────────────────────────

const cardSoft: LayoutPromptTemplate = {
  id: 'card-soft',
  label: 'Card · soft',
  slots: ['eyebrow', 'headline', 'subheadline', 'cta', 'wordmark'],
  negativeSpaceHint:
    'A self-contained card sits in the frame with breathing room around it. The card is the canvas; outside is the mat.',
  promptDirective: ({ copy, brandColors, brandWordmark }) =>
    [
      `SOFT CARD — a contained, self-presentational composition: think a single product card, a small announcement tile, an app cover.`,
      '',
      strictBlock({
        copy,
        brandColors,
        brandWordmark,
        slots: ['eyebrow', 'headline', 'subheadline', 'cta', 'wordmark'],
      }),
      '',
      `LOOSE — composition direction (your call):`,
      `- Decide the card's shape, proportion, and any shadow/depth treatment. Hard print shadow, soft drop, no shadow — your call.`,
      `- The card USUALLY carries one visual element (icon, illustration, photo, geometric shape) up top and the typography stack below — but you can invert, stack, or bleed if it reads better.`,
      `- The wordmark is a quiet signature — bottom corner, embossed effect, ink-on-card feel.`,
      '',
      CREATIVE_POSITION,
    ].join('\n'),
};

// ─── Layout 6 — quote-large ──────────────────────────────────────────

const quoteLarge: LayoutPromptTemplate = {
  id: 'quote-large',
  label: 'Quote · large',
  slots: ['headline', 'subheadline'],
  negativeSpaceHint: 'The text dominates the frame. The background supports — it does not compete.',
  promptDirective: ({ copy, brandColors, brandWordmark }) =>
    [
      `LARGE QUOTE — a typography-led poster where the quote IS the composition. No card, no slab, no chrome.`,
      '',
      strictBlock({
        copy,
        brandColors,
        brandWordmark,
        slots: ['headline', 'subheadline'],
      }),
      '',
      `LOOSE — composition direction (your call):`,
      `- Set the quote LARGE. Wrap typographic quotes around it. Treat the line breaks as deliberate — a designer's pull-quote, not a paragraph.`,
      `- The background can be a tinted photographic scene, a subtle texture, a gradient, or a flat color — but it reads at lower weight than the type.`,
      `- The subhead is the attribution line — quiet, deliberate. Em-dash prefix if it reads as a credit.`,
      '',
      CREATIVE_POSITION,
    ].join('\n'),
};

// ─── Layout 7 — editorial-margin ─────────────────────────────────────

const editorialMargin: LayoutPromptTemplate = {
  id: 'editorial-margin',
  label: 'Editorial · margin',
  slots: ['eyebrow', 'headline', 'subheadline', 'wordmark'],
  negativeSpaceHint:
    'A narrow margin column carries small marginalia; the wide column carries the editorial body. The rule between them gives the page structure.',
  promptDirective: ({ copy, brandColors, brandWordmark }) =>
    [
      `EDITORIAL MARGIN — a magazine-page sensibility with a marginalia column. Think New Yorker / Apartamento page geometry.`,
      '',
      strictBlock({
        copy,
        brandColors,
        brandWordmark,
        slots: ['eyebrow', 'headline', 'subheadline', 'wordmark'],
      }),
      '',
      `LOOSE — composition direction (your call):`,
      `- Decide the narrow column's side (left is conventional; right works too if the brief calls for it).`,
      `- The eyebrow + wordmark live in the margin as marginalia (small mono UPPERCASE, restrained).`,
      `- The headline + subheadline live in the main column — editorial weight, generous leading.`,
      `- A small photographic / textural element can anchor the main column; not required.`,
      '',
      CREATIVE_POSITION,
    ].join('\n'),
};

// ─── Layout 8 — feature-stack ────────────────────────────────────────

const featureStack: LayoutPromptTemplate = {
  id: 'feature-stack',
  label: 'Feature · stack',
  slots: ['eyebrow', 'headline', 'subheadline', 'cta'],
  negativeSpaceHint: 'A vertical composition that reads top-to-bottom. Each zone has its own job.',
  promptDirective: ({ copy, brandColors, brandWordmark }) =>
    [
      `FEATURE STACK — a vertical feature, like a story cover, a release announcement, a tall product hero.`,
      '',
      strictBlock({
        copy,
        brandColors,
        brandWordmark,
        slots: ['eyebrow', 'headline', 'subheadline', 'cta'],
      }),
      '',
      `LOOSE — composition direction (your call):`,
      `- Pick a vertical rhythm: visual element / typography / CTA, or invert it, or interleave. Decide what dominates each zone.`,
      `- The visual element can be photographic, geometric, illustrated, or abstract — chosen for the brief.`,
      `- The CTA is the bottom-of-frame close — small, deliberate.`,
      '',
      CREATIVE_POSITION,
    ].join('\n'),
};

// ─── Layout 9 — editorial-collage ────────────────────────────────────

const editorialCollage: LayoutPromptTemplate = {
  id: 'editorial-collage',
  label: 'Editorial · collage',
  slots: ['eyebrow', 'headline', 'subheadline', 'wordmark'],
  negativeSpaceHint:
    'Asymmetric magazine-spread composition. No center card, no balanced grid. Negative space and focal element trade weight across the frame.',
  promptDirective: ({ copy, brandColors, brandWordmark }) =>
    [
      `EDITORIAL COLLAGE — a magazine spread with full editorial confidence. Photo + typography + color blocks coexist; nothing is centered, nothing is gridded.`,
      '',
      strictBlock({
        copy,
        brandColors,
        brandWordmark,
        slots: ['eyebrow', 'headline', 'subheadline', 'wordmark'],
      }),
      '',
      `LOOSE — composition direction (your call):`,
      `- Where does the focal photographic element live? Where do the typographic blocks land? Where does the negative space breathe? Make these CHOICES — don't default to a balanced layout.`,
      `- The headline can bleed onto a photographic element, sit in a color block, or anchor a negative-space zone. Pick what serves the brief.`,
      `- The eyebrow is editorial metadata — printed-on-the-image feel, somewhere small and considered.`,
      `- The wordmark is a quiet signature in a deliberate corner or edge.`,
      '',
      CREATIVE_POSITION,
    ].join('\n'),
};

// ─── Layout 10 — text-mask-cutout ────────────────────────────────────

const textMaskCutout: LayoutPromptTemplate = {
  id: 'text-mask-cutout',
  label: 'Text · mask cutout',
  slots: ['headline', 'subheadline', 'wordmark'],
  negativeSpaceHint:
    'One dominant typographic mark forms a window into a photographic or textural scene visible THROUGH the letterforms. The rest of the frame is flat.',
  promptDirective: ({ copy, brandColors, brandWordmark }) =>
    [
      `TEXT MASK CUTOUT — typography AS image-mask. The dominant word's letterforms become cut-outs revealing a scene inside them.`,
      '',
      strictBlock({
        copy,
        brandColors,
        brandWordmark,
        slots: ['headline', 'subheadline', 'wordmark'],
      }),
      '',
      `LOOSE — composition direction (your call):`,
      `- If the headline is multi-word, pick the strongest single word as the cutout and treat the rest as smaller secondary text.`,
      `- Choose what's visible THROUGH the letterforms (photographic scene, texture, color gradient) — make it earn its presence.`,
      `- The subhead is a small supporting line; the wordmark is a quiet signature.`,
      '',
      CREATIVE_POSITION,
    ].join('\n'),
};

// ─── Layout 11 — badge-stamp ─────────────────────────────────────────

const badgeStamp: LayoutPromptTemplate = {
  id: 'badge-stamp',
  label: 'Badge · stamp',
  slots: ['eyebrow', 'headline', 'subheadline'],
  negativeSpaceHint:
    'A printed-stamp element anchors part of the frame and acts as a focal motif. The typography flows around it with editorial confidence.',
  promptDirective: ({ copy, brandColors, brandWordmark }) =>
    [
      `BADGE STAMP — a printed-stamp element (a disc, a polygonal seal, a circular badge) acts as the focal motif. Treat the stamp like an inked impression, not a flat shape.`,
      '',
      strictBlock({
        copy,
        brandColors,
        brandWordmark,
        slots: ['eyebrow', 'headline', 'subheadline'],
      }),
      '',
      `LOOSE — composition direction (your call):`,
      `- Decide the stamp's shape, position, and character. Soft printed feel, slight imperfection at edges, ink-on-paper texture.`,
      `- The eyebrow lives INSIDE the stamp (a small label, like a postmark or seal).`,
      `- The headline + subheadline live OUTSIDE the stamp — somewhere the layout reads with intent.`,
      '',
      CREATIVE_POSITION,
    ].join('\n'),
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

export function getLayout(input: {
  layoutId?: LayoutId;
  format?: ImageFormat;
}): LayoutPromptTemplate {
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
