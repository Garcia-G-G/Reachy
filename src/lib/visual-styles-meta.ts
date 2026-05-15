/**
 * Client-safe metadata mirror of the visual-style catalog.
 *
 * The full catalog (with the long `promptStatic` / `promptMotion` strings
 * sent to Sora and the image models) lives at
 * `src/server/ai/visualStyles.ts` and is server-only — those prompts are
 * pure waste in the client JS bundle. This file mirrors just the bits the
 * form / brand-kit UI needs: the key + label + tagline + a `soraFriendly`
 * boolean that flags which styles produce visibly animated Sora output.
 *
 * 2026-05-15 rewrite: replaced the 6 legacy keys (editorial, paper-cutout,
 * flat-2d, infographic, isometric, abstract) with 7 distinctive image-
 * gen styles. The legacy keys still coerce on read via
 * `resolveVisualStyle` so existing brand_kit rows keep working.
 */

export const VISUAL_STYLE_KEYS = [
  'editorial-photo',
  'typographic-poster',
  'collage-zine',
  'brutalist-grid',
  'illustrated-vector',
  'memphis-pattern',
  'editorial-collage',
] as const;

export type VisualStyleKey = (typeof VISUAL_STYLE_KEYS)[number];

/** Most balanced + broadly useful default for marketing images: a magazine
 *  spread combining photo with strong type without being either-or. */
export const DEFAULT_VISUAL_STYLE: VisualStyleKey = 'editorial-collage';

export interface VisualStyleMeta {
  label: string;
  tagline: string;
  /** True when Sora 2 produces visibly animated output for this style in
   *  practice. Print-leaning styles read as static and stay flat in
   *  motion regardless of prompt. */
  soraFriendly: boolean;
}

export const VISUAL_STYLE_META: Record<VisualStyleKey, VisualStyleMeta> = {
  'editorial-photo': {
    label: 'Editorial photo',
    tagline: 'Moody product photography with integrated typography.',
    soraFriendly: false,
  },
  'typographic-poster': {
    label: 'Typographic poster',
    tagline: 'Typography IS the composition — Swiss style, big sans, color blocks.',
    soraFriendly: false,
  },
  'collage-zine': {
    label: 'Collage zine',
    tagline: 'Torn paper, halftone dots, photo cutouts — 90s riso print feel.',
    soraFriendly: false,
  },
  'brutalist-grid': {
    label: 'Brutalist grid',
    tagline: 'Raw geometric forms, exposed grid, mono type, single accent.',
    soraFriendly: false,
  },
  'illustrated-vector': {
    label: 'Illustrated vector',
    tagline: 'Clean character vectors, flat color, no photographic elements.',
    soraFriendly: true,
  },
  'memphis-pattern': {
    label: 'Memphis pattern',
    tagline: 'Playful 80s shapes, squiggles, dots, bright contrasting colors.',
    soraFriendly: true,
  },
  'editorial-collage': {
    label: 'Editorial collage',
    tagline: 'Magazine spread: photo + typographic overlays + color blocks.',
    soraFriendly: false,
  },
};
