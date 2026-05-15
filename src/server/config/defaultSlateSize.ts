import 'server-only';

/**
 * Default size hint the campaign planner uses to size its slate.
 *
 * Cannot be derived: this is a product-policy default — how many
 * assets feel "enough for a launch slate" vs "exhausting". Anything
 * shipped to Step 4 (bulk worker) compounds cost linearly, so the
 * cap matters and lives here as policy.
 *
 * The mix targets reflect a balanced launch slate. The planner picks
 * its actual mix from these as suggestions; it can deviate when the
 * brief calls for it (e.g., copy-heavy product → more copy assets).
 */

export interface DefaultSlateSize {
  target: number;
  min: number;
  max: number;
  /** Suggested mix — the planner can deviate when the brief justifies it. */
  mix: {
    images: number;
    copy: number;
    reels: number;
  };
}

export const DEFAULT_SLATE_SIZE: DefaultSlateSize = {
  target: 18,
  min: 12,
  max: 24,
  mix: { images: 7, copy: 9, reels: 2 },
};
