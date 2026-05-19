import 'server-only';
import type { BrandKit } from '@/server/actions/brandKits';
import type { Project } from '@/server/actions/projects';
import { getFormat, type ImageFormat } from './formats';
import type {
  BrandColors,
  LayoutId,
  LayoutPromptTemplate,
  PromptCopy,
  SequenceDirectiveInput,
} from './layoutTemplates';
import { sequenceDirectiveFor } from './layoutTemplates';
import { interpolatePalette, resolveVisualStyle, type VisualStyleKey } from './visualStyles';

/**
 * Build the AI prompt for a FINAL marketing image — composition AND
 * typography in one render. As of the May-2026 pivot, gpt-image-2 paints
 * the whole asset; there is no post-hoc SVG overlay.
 *
 * Sections (top → bottom):
 *   1. ART DIRECTOR BRIEF — what kind of artifact we're making.
 *   2. STYLE              — visual style (palette + form language).
 *   3. BRAND PALETTE      — exact hex values, dominant.
 *   4. BRAND VOICE        — short evocation.
 *   5. BRIEF              — user idea (delimited, treated as untrusted).
 *   6. LAYOUT DIRECTIVE   — typography placement + scale + integration.
 *   7. NEGATIVE SPACE     — where the composition stays quieter.
 *   8. QUALITY            — final-asset bar, exact spelling, kerning.
 *
 * Image models weight tail tokens more heavily, so the QUALITY bar
 * comes last and the LAYOUT DIRECTIVE comes after the BRIEF so the
 * typographic instructions don't get drowned by the brief's nouns.
 */

export type EffortLevel = 'fast' | 'balanced' | 'high';

interface BuildArgs {
  idea: string;
  format: ImageFormat;
  project: Pick<Project, 'name' | 'audience' | 'tone'>;
  brandKit: BrandKit | null;
  language: 'en' | 'es';
  visualStyleOverride?: VisualStyleKey | null;
  layout: LayoutPromptTemplate;
  /** Resolved copy values from copyPlanner — the AI renders these
   *  verbatim inside the image. Spelling must travel through cleanly. */
  copy: PromptCopy;
  /** Pre-render contemplation cue; influences the QUALITY directive. */
  effort?: EffortLevel;
  /** Optional axis-rotation hint for multi-strategy exploration. */
  strategyHint?: string;
  /** Optional per-variant boldness modifier — a creative direction that
   *  pushes the AI to make a different compositional bet on this
   *  variant. Picked via `pickBoldnessModifier(varIdx, generationId)`
   *  by the worker so n=4 produces 4 different creative bets per
   *  generation. */
  boldness?: string;
  /** Sequence-mode metadata. When set, the layout's sequenceDirective
   *  is appended after LAYOUT DIRECTIVE to drive frame-to-frame
   *  continuity (visual + typographic). */
  sequence?: { frameIndex: number; totalFrames: number };
}

/** Per-variant boldness modifiers. When the worker generates n variants
 *  in exploration mode, each gets a different modifier so the AI takes
 *  different creative directions instead of N attempts at the same
 *  recipe. The first slot is intentionally empty — variant 1 is the
 *  baseline "respect the layout directive as-written" pass. */
export const BOLDNESS_MODIFIERS: readonly string[] = [
  '',
  'Be bold with typography scale — let one element dominate at roughly 2x normal size while the others stay restrained.',
  'Use strong color blocking — divide the frame into 2-3 distinct color zones, each carrying compositional weight.',
  'Embrace asymmetry — break any implied grid, let elements bleed off edges, refuse to balance the composition.',
  'Add a single unexpected element — a torn paper edge, a halftone overlay, a hand-drawn mark, a stamp.',
  'Push the palette — use the accent color at ~50% of the frame, not as a small detail.',
  'Treat typography as the focal subject — image elements support it, not the other way around.',
] as const;

/** Pick a boldness modifier for a given variant slot, seeded by the
 *  generationId so two regenerations of the same brief land on
 *  different creative bets. Variant 0 always returns the baseline
 *  (empty string) so the first attempt respects the layout as-written. */
export function pickBoldnessModifier(
  variantIndex: number,
  seed: string,
): { index: number; modifier: string } {
  if (variantIndex === 0) {
    return { index: 0, modifier: BOLDNESS_MODIFIERS[0] ?? '' };
  }
  // Hash the seed to a deterministic offset; rotate through the
  // non-baseline modifiers (indices 1..N-1) for the remaining slots so
  // n=4 gets 4 distinct flavors.
  const hash = hashString(seed);
  const choices = BOLDNESS_MODIFIERS.length - 1; // skip baseline
  // Stagger by variantIndex - 1 so n=2,3,4 across a single generation
  // pick distinct slots from the wheel.
  const offset = (hash + variantIndex - 1) % choices;
  const idx = 1 + offset;
  return { index: idx, modifier: BOLDNESS_MODIFIERS[idx] ?? '' };
}

/** Derive a character descriptor for the brand font. gpt-image-2 doesn't
 *  know specific font family names — it knows character. Map well-known
 *  display fonts to their character; fall through to a generic descriptor
 *  for unknowns. */
function deriveBrandFontHint(fontHeading: string | null | undefined): string {
  if (!fontHeading)
    return 'high-contrast editorial serif with hairline strokes and a confident wedge serif';
  const name = fontHeading.toLowerCase().trim();
  if (name.includes('fraunces') || name.includes('playfair') || name.includes('didone')) {
    return 'high-contrast editorial serif with hairline strokes and a confident wedge serif (Fraunces / Didone family character)';
  }
  if (name.includes('instrument serif') || name.includes('garamond')) {
    return 'classical italic serif with elegant ligatures (Instrument Serif / Garamond character)';
  }
  if (name.includes('inter') || name.includes('helvetica') || name.includes('neue')) {
    return 'humanist geometric sans with generous tracking (Inter / Helvetica character)';
  }
  if (name.includes('mono') || name.includes('jetbrains') || name.includes('ibm plex mono')) {
    return 'industrial monospace with even strokes (JetBrains Mono character)';
  }
  if (name.includes('grotesk') || name.includes('founders')) {
    return 'editorial neo-grotesque sans with tight tracking (Founders Grotesk character)';
  }
  // Unknown family — pass through as a hint but emphasize character.
  return `${fontHeading} — render in that family's typographic character`;
}

export function buildImagePrompt({
  idea,
  format,
  project,
  brandKit,
  language,
  visualStyleOverride,
  layout,
  copy,
  effort = 'balanced',
  strategyHint,
  boldness,
  sequence,
}: BuildArgs): string {
  const fm = getFormat(format);
  const styleKey = visualStyleOverride ?? brandKit?.visualStyle ?? null;
  const style = resolveVisualStyle(styleKey);

  // Delimit untrusted input so a crafted brief ("Ignore the above…")
  // can't hijack the directives.
  const safeIdea = idea.trim().replace(/"""/g, '"\\""');

  const brandColors: BrandColors = {
    ink: brandKit?.primaryColor ?? '#14110D',
    paper: brandKit?.bgColor ?? '#F1EBDF',
    accent: brandKit?.accentColor ?? '#B6481A',
  };
  const styleBody = interpolatePalette(style.promptStatic, brandColors);

  // Wordmark falls back to project name (case-preserving). The AI gets
  // this verbatim so it renders the exact characters.
  const brandWordmark = brandKit?.fontHeading?.match(/wordmark:\s*(.+)/i)?.[1] ?? project.name;
  const brandFontHint = deriveBrandFontHint(brandKit?.fontHeading);

  const sections: string[] = [];

  // 1. Art director brief.
  sections.push(
    `[ART DIRECTOR BRIEF]\nRender a single FINAL marketing image at ${fm.w}×${fm.h} for ${project.name}. Magazine-cover finish — photographic depth, one focal element, deliberate negative space. This image will be posted as-is.`,
  );

  // 2. Style.
  sections.push(`[STYLE]\n${style.label}. ${styleBody}`);

  // 3. Brand palette — explicit hex.
  sections.push(
    `[BRAND PALETTE]\nUse these EXACT hex values as the dominant colors of the image:\n- ink: ${brandColors.ink}\n- paper: ${brandColors.paper}\n- accent: ${brandColors.accent}\n\nink dominates the typography and ~30% of compositional weight; paper is the base / background; accent appears ONLY on one or two small elements (wordmark, CTA pill, a small decorative shape). Do not introduce off-brand hues.`,
  );

  // 4. Brand voice (when provided).
  if (brandKit?.voice?.tone) {
    sections.push(`[BRAND VOICE]\n${brandKit.voice.tone}`);
  }

  // 5. Brief — user idea, delimited.
  const briefHeader = project.audience?.trim()
    ? `Project ${project.name} · audience: ${project.audience.trim()}.`
    : `Project ${project.name}.`;
  sections.push(`[BRIEF]\n${briefHeader} The subject of this image: """${safeIdea}"""`);

  // 5b. Brand keyword evocation (when provided).
  if (brandKit?.keywords && brandKit.keywords.length > 0) {
    sections.push(`[KEYWORDS]\nEvoke: ${brandKit.keywords.slice(0, 8).join(', ')}.`);
  }

  // 5c. Strategy hint (multi-strategy variants).
  if (strategyHint) {
    sections.push(`[STRATEGY]\n${strategyHint}`);
  }

  // 5d. Boldness modifier — per-variant creative direction. Tells the
  // AI to take a specific bet on this variant so n=4 produces 4
  // different compositions instead of 4 attempts at the same recipe.
  if (boldness && boldness.trim().length > 0) {
    sections.push(`[BOLDNESS]\n${boldness.trim()}`);
  }

  // 6. Layout directive — the typographic placement contract.
  const layoutDirective = layout.promptDirective({
    copy,
    brandColors,
    brandWordmark,
    brandFontHint,
  });
  sections.push(`[LAYOUT DIRECTIVE]\n${layoutDirective}`);

  // 6b. Sequence continuity (when in sequence mode).
  if (sequence) {
    const seqInput: SequenceDirectiveInput = {
      copy,
      brandColors,
      brandWordmark,
      brandFontHint,
      frameIndex: sequence.frameIndex,
      totalFrames: sequence.totalFrames,
    };
    sections.push(`[SEQUENCE]\n${sequenceDirectiveFor(layout, seqInput)}`);
  }

  // 7. Negative space.
  sections.push(`[NEGATIVE SPACE]\n${layout.negativeSpaceHint}`);

  // 8. Quality bar — final, tail position so the model weights it.
  const qualityLines = [
    '- Magazine-cover finish. Photographic depth. ONE clear focal element.',
    '- All typography crisp, kerned, legible. EXACT spelling — no misspellings, no partial words, no character bleeding.',
    '- Brand colors are the dominant palette; do not introduce off-brand hues.',
    '- Treat typography as a first-class compositional element, NOT a flat overlay. Type integrates with the lighting and texture of the scene.',
    '- This is the FINAL asset; it will be posted as-is, not a draft.',
  ];
  if (effort === 'high') {
    qualityLines.push(
      '- Compose deliberately: pick focal element, lighting direction, and color distribution intentionally before rendering.',
    );
  }
  if (language === 'es') {
    qualityLines.push(
      '- El texto en la imagen está en español. Conserva acentos (á, é, í, ó, ú, ñ, ¿, ¡) sin errores.',
    );
  }
  sections.push(`[QUALITY]\n${qualityLines.join('\n')}`);

  // 9. DO NOT — explicit anti-pattern list at the tail. Image models
  // weight tail tokens more heavily, so the things the model must NOT
  // do land here as a final reminder. Phase 06 — typography craft.
  // Source: OpenAI cookbook on image-gen prompting (May 2026).
  const doNotLines = [
    '- DO NOT add additional headlines, taglines, or text fragments beyond the slots listed above. Render ONLY the strict-block text.',
    '- DO NOT use stock-photo people, generic SaaS gradients, blob shapes, or radial glow behind the typography.',
    "- DO NOT center-align everything by default — favour deliberate asymmetry and the layout's composition direction.",
    '- DO NOT round corners or add drop-shadow blur — hard print shadows only when shadows are called for.',
    '- DO NOT substitute brand color hex values, lighten/darken them, or introduce a fourth color outside the palette.',
    '- DO NOT mis-spell, abbreviate, or auto-correct any text — every character of every copy slot and the wordmark renders VERBATIM.',
  ];
  sections.push(`[DO NOT]\n${doNotLines.join('\n')}`);

  return sections.join('\n\n');
}

// ─── Multi-strategy axis rotation ────────────────────────────────────

/** Variant axis decision for multi-strategy exploration. */
export interface VariantAxis {
  layoutOverride: LayoutId | null;
  styleOverride: VisualStyleKey | null;
  label: string;
  strategyHint: string | null;
}

// Cross-axis pairings — alternates pulled from a different aesthetic
// family so two variants visibly diverge (photographic ↔ typographic,
// vector ↔ collage, etc.). Updated 2026-05-15 for the diversity rewrite.
const ALT_STYLES_FOR: Record<VisualStyleKey, VisualStyleKey> = {
  'editorial-photo': 'typographic-poster',
  'typographic-poster': 'editorial-photo',
  'collage-zine': 'brutalist-grid',
  'brutalist-grid': 'collage-zine',
  'illustrated-vector': 'memphis-pattern',
  'memphis-pattern': 'illustrated-vector',
  'editorial-collage': 'typographic-poster',
};

const ALT_LAYOUTS_FOR: Record<LayoutId, LayoutId> = {
  'editorial-collage': 'badge-stamp',
  'badge-stamp': 'editorial-collage',
  'text-mask-cutout': 'card-soft',
  'card-soft': 'text-mask-cutout',
  'feature-stack': 'quote-large',
  'quote-large': 'feature-stack',
  'editorial-margin': 'card-soft',
  'hero-centered': 'feature-stack',
  'hero-split-left': 'editorial-margin',
  'quote-slab': 'quote-large',
  'announcement-banner': 'editorial-margin',
};

const LAYOUT_FAMILY_PAIRS: Record<LayoutId, readonly LayoutId[]> = {
  'editorial-collage': ['badge-stamp', 'text-mask-cutout', 'card-soft'],
  'badge-stamp': ['editorial-collage', 'card-soft', 'text-mask-cutout'],
  'text-mask-cutout': ['card-soft', 'badge-stamp', 'editorial-collage'],
  'card-soft': ['text-mask-cutout', 'editorial-collage', 'badge-stamp'],
  'feature-stack': ['quote-large', 'announcement-banner', 'card-soft'],
  'quote-large': ['feature-stack', 'announcement-banner', 'card-soft'],
  'editorial-margin': ['card-soft', 'feature-stack', 'announcement-banner'],
  'hero-centered': ['feature-stack', 'card-soft', 'editorial-margin'],
  'hero-split-left': ['editorial-margin', 'editorial-collage', 'announcement-banner'],
  'quote-slab': ['quote-large', 'feature-stack', 'card-soft'],
  'announcement-banner': ['editorial-margin', 'feature-stack', 'card-soft'],
};

// Three-deep alternation pool per style. Multi-strategy variants pick
// from this pool offset by the generation seed so two regenerations of
// the same brief land on different alternates. Each pool deliberately
// crosses aesthetic families so variants diverge visibly.
const STYLE_FAMILY_PAIRS: Record<VisualStyleKey, readonly VisualStyleKey[]> = {
  'editorial-photo': ['typographic-poster', 'editorial-collage', 'collage-zine'],
  'typographic-poster': ['editorial-photo', 'brutalist-grid', 'memphis-pattern'],
  'collage-zine': ['brutalist-grid', 'memphis-pattern', 'editorial-collage'],
  'brutalist-grid': ['collage-zine', 'typographic-poster', 'illustrated-vector'],
  'illustrated-vector': ['memphis-pattern', 'editorial-collage', 'collage-zine'],
  'memphis-pattern': ['illustrated-vector', 'typographic-poster', 'collage-zine'],
  'editorial-collage': ['editorial-photo', 'typographic-poster', 'collage-zine'],
};

/** Fast deterministic hash (cyrb53-style) of a string → 32-bit unsigned int. */
function hashString(s: string): number {
  let h1 = 0xdeadbeef ^ s.length;
  let h2 = 0x41c6ce57 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0) ^ ((h1 >>> 0) << 1);
}

export function pickVariantAxis(
  variantIndex: number,
  requestedLayoutId: LayoutId,
  requestedStyleKey: VisualStyleKey,
  seed?: string,
): VariantAxis {
  let altLayout = ALT_LAYOUTS_FOR[requestedLayoutId] ?? requestedLayoutId;
  let altStyle = ALT_STYLES_FOR[requestedStyleKey] ?? requestedStyleKey;
  if (seed) {
    const seedHash = hashString(seed);
    const lp = LAYOUT_FAMILY_PAIRS[requestedLayoutId];
    const sp = STYLE_FAMILY_PAIRS[requestedStyleKey];
    if (lp && lp.length > 0) altLayout = lp[seedHash % lp.length] ?? altLayout;
    if (sp && sp.length > 0) altStyle = sp[(seedHash + 1) % sp.length] ?? altStyle;
  }
  switch (variantIndex) {
    case 0:
      return {
        layoutOverride: null,
        styleOverride: null,
        label: 'requested',
        strategyHint: null,
      };
    case 1:
      return {
        layoutOverride: null,
        styleOverride: altStyle,
        label: `${altStyle} style`,
        strategyHint: `Lean into the ${altStyle} visual style — push palette, texture, and form language in that direction.`,
      };
    case 2:
      return {
        layoutOverride: altLayout,
        styleOverride: null,
        label: `${altLayout} layout`,
        strategyHint: `Compose for the ${altLayout} layout — leave its negative-space zones quiet so typography lands there.`,
      };
    case 3:
      return {
        layoutOverride: altLayout,
        styleOverride: altStyle,
        label: `${altLayout} · ${altStyle}`,
        strategyHint: `Combine the ${altLayout} layout with the ${altStyle} visual style for a fully alternative take.`,
      };
    default:
      return {
        layoutOverride: null,
        styleOverride: null,
        label: `variant ${variantIndex + 1}`,
        strategyHint: null,
      };
  }
}
