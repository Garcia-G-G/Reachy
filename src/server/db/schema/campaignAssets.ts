import { relations } from 'drizzle-orm';
import { integer, jsonb, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { campaign } from './campaigns';
import { generation } from './generations';

/**
 * Autopilot Step 4 — per-asset row inside an approved campaign.
 *
 * One row per PlannedAsset in the campaign's approved plan. Created
 * up-front by the campaign worker (status='pending'), flipped as each
 * underlying pipeline progresses:
 *
 *   image:  status='pending' → dispatch to imageGenQueue (generation_id
 *           filled when the image job lands) → 'done' / 'failed'.
 *   copy:   status='pending' → call channelCopy.generate inline →
 *           store copy_output → 'done' / 'failed'.
 *   reel:   status='pending' → dispatch to videoQueue (generation_id
 *           filled when the reel job lands) → 'done' / 'failed'.
 *
 * The status page (Step 5) polls this table for progress.
 */

export type CampaignAssetKind = 'image' | 'copy' | 'reel';
export type CampaignAssetStatus = 'pending' | 'running' | 'done' | 'failed';

export const campaignAsset = pgTable('campaign_asset', {
  id: uuid('id').primaryKey().defaultRandom(),
  campaignId: uuid('campaign_id')
    .notNull()
    .references(() => campaign.id, { onDelete: 'cascade' }),
  kind: text('kind', { enum: ['image', 'copy', 'reel'] })
    .$type<CampaignAssetKind>()
    .notNull(),
  /** Set when kind === 'copy' — the channel template the planner picked. */
  channel: text('channel'),
  /** Set when kind === 'image' | 'reel' — links to the underlying
   *  generation row produced by the existing image/reel pipelines.
   *  Null while the upstream worker hasn't completed yet. */
  generationId: uuid('generation_id').references(() => generation.id, {
    onDelete: 'set null',
  }),
  /** Set when kind === 'copy' — the LLM's generated text. Lives
   *  inline rather than in `asset` because copy isn't an R2 blob;
   *  the table layout deliberately mirrors generation.params shape. */
  copyOutput: text('copy_output'),
  status: text('status', { enum: ['pending', 'running', 'done', 'failed'] })
    .$type<CampaignAssetStatus>()
    .notNull(),
  costCents: integer('cost_cents').default(0).notNull(),
  errorMessage: text('error_message'),
  /** Snapshot of the PlannedAsset's brief at dispatch time, so the
   *  status page can show "what was requested" alongside the result
   *  without re-reading the campaign plan. */
  briefSnapshot: text('brief_snapshot'),
  /** 0.0-10.0 score from the rubric critic (Step 5). Null when
   *  brandKit.qualityGateEnabled was false at run time so the
   *  gallery can render "no badge" instead of a fake 0. */
  criticScore: numeric('critic_score', { precision: 3, scale: 1 }),
  /** Specific complaints the critic surfaced — used both by the
   *  gallery "Why?" modal and by the retry loop's hint injection. */
  criticIssues: jsonb('critic_issues').$type<string[]>().default([]).notNull(),
  /** How many times this slot has been re-dispatched after a failing
   *  critic verdict. Caps at 2 (campaignWorker enforces). */
  retriesCount: integer('retries_count').default(0).notNull(),
  /** Cost of the critic LLM calls for this asset across attempts.
   *  Separate from cost_cents so the gallery can show "$X.XX generation +
   *  $0.0X quality gate" if we ever want to. */
  criticCostCents: integer('critic_cost_cents').default(0).notNull(),
  /** Secondary status flag — currently only 'quality_warning' when
   *  the asset finished but never crossed the critic threshold after
   *  2 retries. Kept separate from `status` so callers that filter
   *  for 'done' still see warned assets in the gallery. */
  statusDetail: text('status_detail'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  finishedAt: timestamp('finished_at'),
});

export const campaignAssetRelations = relations(campaignAsset, ({ one }) => ({
  campaign: one(campaign, {
    fields: [campaignAsset.campaignId],
    references: [campaign.id],
  }),
  generation: one(generation, {
    fields: [campaignAsset.generationId],
    references: [generation.id],
  }),
}));

export type CampaignAssetRow = typeof campaignAsset.$inferSelect;
export type CampaignAssetInsert = typeof campaignAsset.$inferInsert;
