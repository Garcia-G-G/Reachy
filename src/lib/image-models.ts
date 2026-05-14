// Client-safe image-model catalog. No 'server-only' — values flow into the
// generate form. The server-side dispatch in src/server/ai/imageGen.ts
// consumes the same IDs.
//
// ───────────────────────────────────────────────────────────────────────
// Research snapshot — 2026-05-14 (do not delete; rebuild before adding
// new models). Source: planning agent ran against platform.openai.com
// docs + dev.to + costgoat + wavespeed + Apiyi. See imageGen.ts header
// comment for the full provider-side detail.
//
// • DALL-E 2 + DALL-E 3 were both shut down on 2026-05-12. Their model
//   strings now 400 from /v1/images/generations. We intentionally do
//   NOT expose them; the OpenAI dropdown stops at the gpt-image family.
// • gpt-image-2 is the current flagship (released 2026-04-21). It
//   supports a `quality` tier (low/medium/high/auto), the edit endpoint,
//   and up to 16 reference images. Known regression: no transparent
//   background support (gpt-image-1/1.5 still do).
// • gpt-image-1.5 (released 2025-12-16) was the prior flagship and still
//   delivers the best cost/quality ratio in the family for general work.
// • gpt-image-1 stays as the legacy default while existing users migrate.
// • gpt-image-1-mini is a budget tier — ~80% cheaper than gpt-image-1
//   at the medium quality, still good for iterative variant exploration.
// • fal-ai/ideogram/v3 stays best-in-class for text-heavy designs;
//   gpt-image-2 has closed the gap but Ideogram still wins at small
//   font sizes and tight typographic layouts.
// ───────────────────────────────────────────────────────────────────────

export type ImageProviderId = 'openai' | 'fal';

export type OpenAIImageModelId =
  | 'gpt-image-2'
  | 'gpt-image-1.5'
  | 'gpt-image-1'
  | 'gpt-image-1-mini';

export type FalImageModelId =
  | 'fal-ai/flux-2-pro'
  | 'fal-ai/flux-2-flex'
  | 'fal-ai/recraft-v3'
  | 'fal-ai/nano-banana-2'
  | 'fal-ai/ideogram/v3';

export type ImageModelId = OpenAIImageModelId | FalImageModelId;

/** Quality tier accepted by the gpt-image-* family. `auto` lets the model
 *  pick — generally lands between medium and high. fal.ai models don't
 *  use this parameter and ignore it. */
export type QualityTier = 'low' | 'medium' | 'high' | 'auto';
export const QUALITY_TIERS: readonly QualityTier[] = ['low', 'medium', 'high', 'auto'];
// Default is `high` for the marketing-grade pipeline. The cost difference
// vs medium (~4×) is justified by visibly sharper backgrounds — the
// deterministic typography overlay needs a clean substrate to look like
// a polished asset. Users can drop to medium/low explicitly when they're
// iterating cheaply, or pick `auto` to let the model choose.
export const DEFAULT_QUALITY_TIER: QualityTier = 'high';

export interface ImageModelEntry {
  id: ImageModelId;
  provider: ImageProviderId;
  /** Display name shown in the dropdown. */
  label: string;
  /** One-line summary shown under the label. */
  tagline: string;
  /** Cost in cents per image at each quality tier. fal.ai entries fill
   *  every tier with the same flat per-image price since they don't
   *  honor the `quality` parameter — we still need the keys present so
   *  cost preview works without conditional branching in the UI. */
  costCentsByQuality: Record<QualityTier, number>;
  /** True when the model honors the `quality` parameter natively. UI
   *  greys out the tier selector for entries where this is false. */
  supportsQualityTier: boolean;
  /** True when the model reliably renders readable text inside images.
   *  Shown as a small "T" badge in the picker. */
  rendersTextWell: boolean;
  /** True when the model supports the edit endpoint (input image +
   *  edit prompt). Shown as a small pencil badge. */
  supportsEdit: boolean;
  /** True when the model accepts reference image inputs for style
   *  anchoring. Shown as a small "Refs" badge. */
  supportsReferenceImages: boolean;
  /** Notes surfaced as a tooltip on hover. */
  note?: string;
}

/**
 * Per-model cost in cents at each quality tier, at the 1024x1024 size.
 * Portrait / landscape variants cost slightly less for openai-family
 * (per-token billing under the hood), but the difference is small
 * enough that a single per-tier number is what we display in the UI.
 *
 * Numbers below are CENTS, rounded to the nearest cent. The server-side
 * cost ledger writes the exact returned spend per generation, so this
 * table only drives the live pre-generate estimate.
 */
export const IMAGE_MODELS: Record<ImageModelId, ImageModelEntry> = {
  'gpt-image-2': {
    id: 'gpt-image-2',
    provider: 'openai',
    label: 'OpenAI · GPT Image 2',
    tagline: 'Flagship · reasoning · best multilingual text · 16 refs',
    costCentsByQuality: { low: 1, medium: 5, high: 21, auto: 5 },
    supportsQualityTier: true,
    rendersTextWell: true,
    supportsEdit: true,
    supportsReferenceImages: true,
    note: 'Released 2026-04-21. Supports reasoning ("thinking mode"). No transparent backgrounds (regression vs gpt-image-1.5).',
  },
  'gpt-image-1.5': {
    id: 'gpt-image-1.5',
    provider: 'openai',
    label: 'OpenAI · GPT Image 1.5',
    tagline: 'Best cost/quality balance · transparent bg supported',
    costCentsByQuality: { low: 1, medium: 3, high: 13, auto: 3 },
    supportsQualityTier: true,
    rendersTextWell: true,
    supportsEdit: true,
    supportsReferenceImages: true,
    note: 'Released 2025-12-16. Strong general-purpose pick; cheaper than gpt-image-2 with very close quality.',
  },
  'gpt-image-1': {
    id: 'gpt-image-1',
    provider: 'openai',
    label: 'OpenAI · GPT Image 1',
    tagline: 'Legacy default · still solid for posts and hero images',
    costCentsByQuality: { low: 1, medium: 4, high: 17, auto: 4 },
    supportsQualityTier: true,
    rendersTextWell: true,
    supportsEdit: true,
    supportsReferenceImages: true,
    note: 'The model Reachy shipped with. Kept as default while existing users migrate up.',
  },
  'gpt-image-1-mini': {
    id: 'gpt-image-1-mini',
    provider: 'openai',
    label: 'OpenAI · GPT Image 1 mini',
    tagline: 'Budget tier · iterate cheaply on variants',
    costCentsByQuality: { low: 1, medium: 1, high: 4, auto: 1 },
    supportsQualityTier: true,
    rendersTextWell: true,
    supportsEdit: true,
    supportsReferenceImages: true,
    note: 'Same family as gpt-image-1, ~80% cheaper at medium. Slightly lower fidelity; great for batches.',
  },
  'fal-ai/flux-2-pro': {
    id: 'fal-ai/flux-2-pro',
    provider: 'fal',
    label: 'fal.ai · FLUX.2 [pro]',
    tagline: 'Photoreal scenes · sharp lighting · 4¢/image flat',
    costCentsByQuality: { low: 4, medium: 4, high: 4, auto: 4 },
    supportsQualityTier: false,
    rendersTextWell: false,
    supportsEdit: false,
    supportsReferenceImages: false,
  },
  'fal-ai/flux-2-flex': {
    id: 'fal-ai/flux-2-flex',
    provider: 'fal',
    label: 'fal.ai · FLUX.2 [flex]',
    tagline: 'Cheap photoreal · ~3¢/image flat',
    costCentsByQuality: { low: 3, medium: 3, high: 3, auto: 3 },
    supportsQualityTier: false,
    rendersTextWell: false,
    supportsEdit: false,
    supportsReferenceImages: false,
  },
  'fal-ai/recraft-v3': {
    id: 'fal-ai/recraft-v3',
    provider: 'fal',
    label: 'fal.ai · Recraft V3',
    tagline: 'Vector-first illustrations · clean editorial output',
    costCentsByQuality: { low: 4, medium: 4, high: 4, auto: 4 },
    supportsQualityTier: false,
    rendersTextWell: true,
    supportsEdit: false,
    supportsReferenceImages: false,
  },
  'fal-ai/nano-banana-2': {
    id: 'fal-ai/nano-banana-2',
    provider: 'fal',
    label: 'fal.ai · Nano Banana 2',
    tagline: 'Stylized illustration · ~5¢/image flat',
    costCentsByQuality: { low: 5, medium: 5, high: 5, auto: 5 },
    supportsQualityTier: false,
    rendersTextWell: false,
    supportsEdit: false,
    supportsReferenceImages: false,
  },
  'fal-ai/ideogram/v3': {
    id: 'fal-ai/ideogram/v3',
    provider: 'fal',
    label: 'fal.ai · Ideogram V3',
    tagline: 'Best-in-class typography · posters, signage, ad copy',
    costCentsByQuality: { low: 3, medium: 6, high: 9, auto: 6 },
    supportsQualityTier: true,
    rendersTextWell: true,
    supportsEdit: false,
    supportsReferenceImages: false,
    note: 'Three tiers map to fal turbo / balanced / quality. Beats gpt-image-2 on small-font and tight typographic layouts.',
  },
};

export const IMAGE_MODEL_IDS = Object.keys(IMAGE_MODELS) as ImageModelId[];

/** Models grouped by provider — drives the form's `<optgroup>` rendering
 *  and the provider-availability gate (server passes whether OPENAI_API_KEY
 *  / FAL_KEY are set so unavailable providers grey out). Order within
 *  each group follows IMAGE_MODELS declaration order. */
export const IMAGE_MODELS_BY_PROVIDER: ReadonlyArray<{
  provider: ImageProviderId;
  label: string;
  models: readonly ImageModelEntry[];
}> = [
  {
    provider: 'openai',
    label: 'OpenAI',
    models: IMAGE_MODEL_IDS.filter((id) => IMAGE_MODELS[id].provider === 'openai').map(
      (id) => IMAGE_MODELS[id],
    ),
  },
  {
    provider: 'fal',
    label: 'fal.ai',
    models: IMAGE_MODEL_IDS.filter((id) => IMAGE_MODELS[id].provider === 'fal').map(
      (id) => IMAGE_MODELS[id],
    ),
  },
];

/** Default the selector to the historical Reachy default. Existing users
 *  upgrade explicitly. New users can be migrated to gpt-image-1.5 later
 *  once we've benchmarked side-by-side on Reachy's editorial style. */
export const DEFAULT_IMAGE_MODEL: ImageModelId = 'gpt-image-1';

/** Resolve an arbitrary model string to an entry, or return null when
 *  the id isn't in the catalog. Used by the worker before dispatch so
 *  legacy generation rows with retired model IDs (dall-e-*) fail with
 *  a clean error instead of a 400 from upstream. */
export function getImageModel(id: string): ImageModelEntry | null {
  return (IMAGE_MODELS as Record<string, ImageModelEntry>)[id] ?? null;
}

/** Pre-render cost estimate (cents) for a given configuration. Used by
 *  the generate-form's live cost preview and the server-side cap check
 *  (same shape both places → they never disagree). */
export function estimateImageCost(modelId: ImageModelId, quality: QualityTier, n: number): number {
  const entry = IMAGE_MODELS[modelId];
  // fal.ai entries return a flat number regardless of quality; openai
  // entries return the tier-specific number. The cost table is rounded
  // to the cent, so a 1-cent floor is implicit.
  const per = entry.costCentsByQuality[quality] ?? entry.costCentsByQuality.medium;
  return Math.max(1, Math.round(per * n));
}
