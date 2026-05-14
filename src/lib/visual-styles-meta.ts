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
 * Source of truth: `VISUAL_STYLE_META[<key>].soraFriendly` is the one set
 * derived empirically from the 2026-05-14 render comparison (see
 * `planning/SORA-STYLE-RESULTS.md`). The server file imports + re-uses
 * this so the worker and the UI agree on what `soraFriendly` means.
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

export const DEFAULT_VISUAL_STYLE: VisualStyleKey = 'abstract';

export interface VisualStyleMeta {
  label: string;
  tagline: string;
  /** Empirically derived — see planning/SORA-STYLE-RESULTS.md. */
  soraFriendly: boolean;
}

export const VISUAL_STYLE_META: Record<VisualStyleKey, VisualStyleMeta> = {
  editorial: {
    label: 'Editorial motion',
    tagline: 'Warm paper layout with multiple geometric marks; type added by overlay.',
    soraFriendly: false,
  },
  'paper-cutout': {
    label: 'Paper cutout',
    tagline: 'Layered colored paper shapes with hard drop shadows.',
    soraFriendly: false,
  },
  'flat-2d': {
    label: 'Flat 2D explainer',
    tagline: 'Bold cartoon scene with one focal icon and supporting elements.',
    soraFriendly: true,
  },
  infographic: {
    label: 'Animated infographic',
    tagline: 'Multiple chart elements arranged like a mini editorial dashboard.',
    soraFriendly: false,
  },
  isometric: {
    label: 'Isometric mini',
    tagline: 'Floating 3D blocks and tiny figures in soft pastel.',
    soraFriendly: true,
  },
  abstract: {
    label: 'Abstract shapes',
    tagline: 'Multiple soft color blobs morphing premium-style.',
    soraFriendly: true,
  },
};
