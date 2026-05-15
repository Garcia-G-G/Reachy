import 'server-only';

/**
 * Coarse per-asset cost estimates in cents, used by Step 3's review
 * UI to compute the "Total cost: $X.XX" preview that updates as
 * Garcia edits / skips assets.
 *
 * These are POLICY estimates, not derived facts. The actual cost
 * lands when Step 4 runs each asset through the image / copy / reel
 * worker; numbers can drift (image quality tiers, reel engine,
 * critic mode). The UI shows the estimate as "~$4.20" so the cost
 * always reads as an approximation.
 *
 * Sources for the numbers:
 *   - Image: gpt-image-2 priced at $0.21 high-quality; we use
 *     $0.16 medium as the default since the planner doesn't choose
 *     quality (the worker does), and medium is the most common pick.
 *   - Copy: gpt-5.5 at ~$0.005 per channel asset (input + output
 *     tokens for one structured-output call).
 *   - Reel: depends on engine. We surface a single coarse number
 *     here per duration; reel-cost.ts has the exact per-engine
 *     breakdown the bulk worker uses. The default 12s reel is
 *     ffmpeg + Veo-style inline images ≈ $0.50.
 */

export interface AssetCostEstimates {
  imageCents: number;
  copyCents: number;
  reelCentsPerSecond: number;
  /** Floor used for any asset type with no explicit estimate
   *  (additional future asset kinds). */
  fallbackCents: number;
}

export const ASSET_COST_ESTIMATES: AssetCostEstimates = {
  imageCents: 16,
  copyCents: 1,
  reelCentsPerSecond: 6,
  fallbackCents: 5,
};

export function estimateReelCents(durationSec: number): number {
  return Math.max(1, Math.round(durationSec * ASSET_COST_ESTIMATES.reelCentsPerSecond));
}
