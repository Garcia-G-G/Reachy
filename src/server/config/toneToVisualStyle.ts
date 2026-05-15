import 'server-only';
import type { VisualStyleKey } from '@/lib/visual-styles-meta';
import type { ProductBriefTone } from './toneToVoice';

/**
 * Map a brief.tone to the best-fitting key in the May-2026 visual-
 * styles catalog (src/server/ai/visualStyles.ts).
 *
 * Cannot be derived: this is an editorial judgment call (which
 * aesthetic family pairs with which voice register). Pinning the
 * mapping here keeps brand-kit autofill deterministic across the
 * 7 catalog entries.
 *
 * Mapping rationale:
 *   editorial   → editorial-collage  (magazine spread — best fits
 *                                     the considered/crafted voice)
 *   playful     → memphis-pattern    (bright, asymmetric, 80s pop)
 *   technical   → brutalist-grid     (exposed structure, monospace —
 *                                     speaks "builder")
 *   enterprise  → typographic-poster (Swiss style — institutional gravity)
 *   indie       → editorial-photo    (moody photo + integrated type —
 *                                     reads as a real person's product)
 */

export const TONE_TO_VISUAL_STYLE: Record<ProductBriefTone, VisualStyleKey> = {
  editorial: 'editorial-collage',
  playful: 'memphis-pattern',
  technical: 'brutalist-grid',
  enterprise: 'typographic-poster',
  indie: 'editorial-photo',
};

export function visualStyleForTone(tone: ProductBriefTone): VisualStyleKey {
  return TONE_TO_VISUAL_STYLE[tone];
}
