import 'server-only';

/**
 * Per-asset pass threshold for the autopilot critic (Step 5).
 *
 * Cannot be derived: this is a policy number tuned against the
 * rubrics in criticRubrics.ts. 7.0/10 means "comfortably above
 * adequate" — assets scoring below this auto-retry with a hint
 * injected into the next prompt build (up to 2 retries).
 *
 * Raising the threshold tightens quality but increases retry cost
 * (each retry is a full generation). Lowering it surfaces more
 * dud assets to the user. 7.0 is the empirical sweet spot from
 * the spec.
 */

export const CRITIC_PASS_THRESHOLD = 7.0;

/** Hard cap on retries per asset. Two retries means the asset gets
 *  up to THREE total attempts (initial + 2 retries) before it
 *  carries a 'quality_warning' status_detail. */
export const CRITIC_MAX_RETRIES = 2;

/** Score below which the gallery card paints red (status_detail =
 *  'quality_warning'). Equal to CRITIC_PASS_THRESHOLD by design —
 *  there's no third "amber" tier in the rubric model. The gallery
 *  uses a separate "green vs yellow" split inside the passing band
 *  (>= 8 green, 7-7.9 yellow, < 7 red). */
export const CRITIC_WARNING_BAND = 7.0;
export const CRITIC_GREEN_BAND = 8.0;
