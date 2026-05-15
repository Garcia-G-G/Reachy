import 'server-only';

/**
 * Per-kind concurrency caps inside the campaign-fan-out worker.
 *
 * Cannot be derived: these are POLICY numbers tuned against the
 * upstream rate limits and storage / compute headroom Reachy has on
 * its worker pod.
 *
 *   - image:  3 in flight. OpenAI gpt-image-2 tier-1 is ~5 RPM; we
 *             stay below that so a campaign with 8 images doesn't
 *             trip the limiter and stall the whole fan-out.
 *   - reel:   1 in flight. Sora calls are serial in our pipeline
 *             anyway (the videoWorker is concurrency=1 from §03);
 *             running multiple reels would just queue them inside
 *             BullMQ. We surface the cap here so future-Garcia can
 *             raise it once Sora's quota expands.
 *   - copy:   3 in flight. Channel-copy is a single gpt-4o-mini
 *             call ~1¢, so running 3 in parallel feels like instant
 *             generation to the user without stressing the model.
 */

export interface CampaignConcurrency {
  image: number;
  copy: number;
  reel: number;
}

export const CAMPAIGN_CONCURRENCY: CampaignConcurrency = {
  image: 3,
  copy: 3,
  reel: 1,
};
