import { relations } from 'drizzle-orm';
import { integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { ingestion } from './ingestion';
import { project } from './projects';

/**
 * Autopilot Step 3 — campaign row.
 *
 * One row per "review + approve + bulk run" cycle. A single project
 * can have many campaigns (each re-ingest or manual re-plan creates
 * a new one); the `awaiting_approval` row is the resume target the
 * review page loads when Garcia comes back later.
 *
 * Workflow:
 *   1. ingestionWorker (Step 2 → Step 3) calls
 *      createCampaignFromBriefFor() after the brief extraction
 *      lands. That writes a row in 'awaiting_approval'.
 *   2. Review page loads { brief, plan } from this row; edits go to
 *      updateCampaignPlan.
 *   3. Approve → status 'running' + (Step 4) enqueue bulk worker.
 *   4. Bulk worker writes back cost_cents_actual + 'done' / 'failed'.
 *
 * `brief` is a snapshot of ProductBrief at plan time (immutable
 * after creation — the source of truth for what was planned).
 * `plan` mutates as Garcia edits.
 */

export type CampaignStatus = 'planning' | 'awaiting_approval' | 'running' | 'done' | 'failed';

export const campaign = pgTable('campaign', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => project.id, { onDelete: 'cascade' }),
  /** Provenance: which autopilot ingestion led to this campaign.
   *  Nullable so a future "manual campaign from scratch" flow can
   *  reuse the same table without inventing a fake ingestion row. */
  ingestionId: uuid('ingestion_id').references(() => ingestion.id, {
    onDelete: 'set null',
  }),
  status: text('status', {
    enum: ['planning', 'awaiting_approval', 'running', 'done', 'failed'],
  })
    .$type<CampaignStatus>()
    .notNull(),
  brief: jsonb('brief'),
  plan: jsonb('plan'),
  costCentsEstimated: integer('cost_cents_estimated').default(0).notNull(),
  costCentsActual: integer('cost_cents_actual').default(0).notNull(),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  approvedAt: timestamp('approved_at'),
  finishedAt: timestamp('finished_at'),
});

export const campaignRelations = relations(campaign, ({ one }) => ({
  project: one(project, { fields: [campaign.projectId], references: [project.id] }),
  ingestion: one(ingestion, { fields: [campaign.ingestionId], references: [ingestion.id] }),
}));

export type CampaignRow = typeof campaign.$inferSelect;
export type CampaignInsert = typeof campaign.$inferInsert;
