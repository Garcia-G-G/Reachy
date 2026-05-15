import 'server-only';
import type { BrandKit } from '@/server/actions/brandKits';

/**
 * Reel-pipeline directive constants the videoWorker injects into Sora
 * prompts. Lives in config so the prompt language stays a single
 * source of truth and never drifts across the worker's 4 call sites
 * (initial segment, continuation, safe-fallback, image-gen guard).
 *
 * The "humans" toggle is owned by brand_kit.allows_humans (added in
 * Step 2). When true, Sora is allowed to render stylized human
 * animations; we still forbid impersonation of named public figures.
 * When false, the constraint is strict.
 *
 * Why config, not derived: the wording matters — Sora is sensitive
 * to specific phrasings ("real people" vs "human animation"). A
 * single tuned constant per direction is the right abstraction.
 */

export const HUMAN_PERMIT_TEXT =
  'Humans, faces, hands, and stylized human animations are OK when they fit the brief. Avoid impersonating named, recognizable public figures.';

export const HUMAN_FORBID_TEXT =
  'No real people. No human faces. Abstract, graphic, and typographic elements only.';

/** Softer variant used by the abstract safe-fallback prompt — the
 *  fallback already excludes specific objects; we just want a clean
 *  no-people phrasing without restating "no faces" twice. */
export const HUMAN_FORBID_SOFT_TEXT = 'no specific people, no recognizable items, no readable text';

export const HUMAN_PERMIT_SOFT_TEXT =
  'stylized human elements allowed where they serve the brief; no readable text';

/** Image-gen negative-space hint variant — used inside reel-pipeline
 *  inline image prompts where Sora isn't generating but the FFmpeg
 *  scene image is. Same toggle, milder wording (the image is meant
 *  to be a calm backdrop, so we explicitly call for facial restraint
 *  even when humans are allowed). */
export const IMAGE_NEG_SPACE_NO_HUMANS_TEXT = 'no faces, no key product detail in the calm zones';
export const IMAGE_NEG_SPACE_WITH_HUMANS_TEXT =
  'keep faces and key product detail OUT of the calm zones — they go in the focal third';

export function humanConstraint(brandKit: BrandKit | null | undefined): string {
  return humanConstraintForFlag(brandKit?.allowsHumans);
}

export function humanConstraintForFlag(allowsHumans: boolean | null | undefined): string {
  // Schema default for allows_humans is `true`; treat null/undefined
  // (legacy rows or job payloads from old workers) as allowing humans
  // so we never get stricter than the user expects.
  if (allowsHumans === false) return HUMAN_FORBID_TEXT;
  return HUMAN_PERMIT_TEXT;
}

export function humanConstraintSoft(brandKit: BrandKit | null | undefined): string {
  return humanConstraintSoftForFlag(brandKit?.allowsHumans);
}

export function humanConstraintSoftForFlag(allowsHumans: boolean | null | undefined): string {
  if (allowsHumans === false) return HUMAN_FORBID_SOFT_TEXT;
  return HUMAN_PERMIT_SOFT_TEXT;
}

export function imageNegSpaceConstraint(brandKit: BrandKit | null | undefined): string {
  return imageNegSpaceConstraintForFlag(brandKit?.allowsHumans);
}

export function imageNegSpaceConstraintForFlag(allowsHumans: boolean | null | undefined): string {
  if (allowsHumans === false) return IMAGE_NEG_SPACE_NO_HUMANS_TEXT;
  return IMAGE_NEG_SPACE_WITH_HUMANS_TEXT;
}
