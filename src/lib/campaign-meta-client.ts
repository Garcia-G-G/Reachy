/**
 * Client-safe mirror of the campaign-planner catalogs the review UI
 * needs to render dropdowns + recompute cost previews.
 *
 * The server-side source of truth lives at:
 *   - src/server/config/channelTemplates.ts  (full ChannelSpec)
 *   - src/server/config/assetCostEstimates.ts (per-kind cents)
 *
 * Keep this file in lockstep when channels / cost rates change. The
 * server-action zod schemas still enforce the canonical lists.
 */

import { REEL_TEMPLATES } from './reel-templates';

export type ChannelKeyClient =
  | 'linkedin-post-long'
  | 'linkedin-post-short'
  | 'x-thread'
  | 'instagram-caption'
  | 'email-pitch-cold'
  | 'email-pitch-warm'
  | 'blog-outline'
  | 'press-release-short';

export interface ChannelMetaClient {
  key: ChannelKeyClient;
  label: string;
  targetWordCount: number;
}

export const CHANNEL_META_CLIENT: Record<ChannelKeyClient, ChannelMetaClient> = {
  'linkedin-post-long': {
    key: 'linkedin-post-long',
    label: 'LinkedIn · long-form',
    targetWordCount: 320,
  },
  'linkedin-post-short': {
    key: 'linkedin-post-short',
    label: 'LinkedIn · short',
    targetWordCount: 90,
  },
  'x-thread': { key: 'x-thread', label: 'X / Twitter · thread', targetWordCount: 220 },
  'instagram-caption': {
    key: 'instagram-caption',
    label: 'Instagram · caption',
    targetWordCount: 60,
  },
  'email-pitch-cold': {
    key: 'email-pitch-cold',
    label: 'Email · cold pitch',
    targetWordCount: 110,
  },
  'email-pitch-warm': {
    key: 'email-pitch-warm',
    label: 'Email · warm follow-up',
    targetWordCount: 90,
  },
  'blog-outline': { key: 'blog-outline', label: 'Blog · outline', targetWordCount: 180 },
  'press-release-short': {
    key: 'press-release-short',
    label: 'Press release · short',
    targetWordCount: 180,
  },
};

export const CHANNEL_KEYS_CLIENT = Object.keys(CHANNEL_META_CLIENT) as ChannelKeyClient[];

/** Reel durations supported across REEL_TEMPLATES, sorted ascending. */
export const REEL_DURATIONS_CLIENT = Array.from(
  new Set(Object.values(REEL_TEMPLATES).map((t) => t.durationSec)),
).sort((a, b) => a - b);

/** Mirror of ASSET_COST_ESTIMATES — see comment at the top of this
 *  file. These cents are the policy-level coarse estimates the review
 *  UI shows; the action recomputes against the server-side copy
 *  before persisting so any drift is server-canonical. */
export const ASSET_COST_ESTIMATES_CLIENT = {
  imageCents: 16,
  copyCents: 1,
  reelCentsPerSecond: 6,
  fallbackCents: 5,
} as const;

export type PlannedAssetClient =
  | { kind: 'image'; format: string; layoutId: string; visualStyle: string; brief: string }
  | { kind: 'copy'; channel: string; brief: string; targetWordCount?: number }
  | { kind: 'reel'; durationSec: number; visualStyle: string; brief: string };

export function estimateAssetCentsClient(a: PlannedAssetClient): number {
  if (a.kind === 'image') return ASSET_COST_ESTIMATES_CLIENT.imageCents;
  if (a.kind === 'copy') return ASSET_COST_ESTIMATES_CLIENT.copyCents;
  if (a.kind === 'reel') {
    return Math.max(1, Math.round(a.durationSec * ASSET_COST_ESTIMATES_CLIENT.reelCentsPerSecond));
  }
  return ASSET_COST_ESTIMATES_CLIENT.fallbackCents;
}

export function estimateSlateCentsClient(assets: PlannedAssetClient[]): number {
  return assets.reduce((acc, a) => acc + estimateAssetCentsClient(a), 0);
}
