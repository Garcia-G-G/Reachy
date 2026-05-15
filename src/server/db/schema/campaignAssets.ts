import { relations } from 'drizzle-orm';
import { integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
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
