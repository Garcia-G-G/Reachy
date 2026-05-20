/**
 * Quick-action fallback hints — Phase 07f.
 *
 * The chat's "mejorar" chip prefers per-asset critic issues (stored
 * on the campaign_asset row when the asset was previously graded)
 * as the tweak hint. For chat-generated assets that have never been
 * promoted to a campaign_asset, no critic issues exist — we fall
 * back to a generic but useful direction so the regeneration isn't
 * a blind reshuffle.
 *
 * Cannot be derived: these are deliberate product policy phrasings.
 * Tightening them tightens the regeneration quality across every
 * chat asset.
 *
 * NO server-only marker — the chat client component reads these to
 * decide what hint to display before sending.
 */

export const FALLBACK_TWEAK_HINT_EN =
  'Sharpen the headline, tighten composition, emphasize the brand accent without changing layout or palette.';

export const FALLBACK_TWEAK_HINT_ES =
  'Afila el titular, ajusta la composición, refuerza el acento de marca sin cambiar el layout ni la paleta.';

export function fallbackTweakHint(language: 'en' | 'es'): string {
  return language === 'es' ? FALLBACK_TWEAK_HINT_ES : FALLBACK_TWEAK_HINT_EN;
}
