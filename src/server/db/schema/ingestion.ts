import { relations } from 'drizzle-orm';
import { integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { user } from './auth';

/**
 * Autopilot ingestion table — Step 1 of the autopilot rebuild.
 *
 * One row per upload attempt. Workflow:
 *   1. Action `enqueueIngestion` writes a row with status='parsing' and
 *      enqueues an ingestion job.
 *   2. `ingestionWorker` routes every file in fileRefs through the
 *      appropriate parser module, aggregates the results into an
 *      IngestedBundle, and writes it into `bundle` while flipping
 *      status to 'ready' (or 'failed' on any parser error).
 *   3. Step 2 of autopilot (brief extraction) reads `bundle` and writes
 *      a brief into a downstream table. This row is the audit trail.
 *
 * `bundle` is a JSONB so the IngestedBundle schema can evolve without a
 * column migration. The shape is documented in
 * src/server/ingest/aggregate.ts (the type IngestedBundle is the source
 * of truth).
 */

export type IngestionStatus = 'parsing' | 'ready' | 'failed';

export const ingestion = pgTable('ingestion', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  status: text('status', { enum: ['parsing', 'ready', 'failed'] })
    .$type<IngestionStatus>()
    .notNull(),
  bundle: jsonb('bundle'),
  errorMessage: text('error_message'),
  /** Cumulative LLM cost in cents — parser pipeline is free CPU,
   *  the cost comes from Step 2's brief-extraction + vision-pass
   *  calls. Populated by runBriefExtraction; null until then. */
  costCents: integer('cost_cents').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  finishedAt: timestamp('finished_at'),
});

export const ingestionRelations = relations(ingestion, ({ one }) => ({
  user: one(user, { fields: [ingestion.userId], references: [user.id] }),
}));

export type IngestionRow = typeof ingestion.$inferSelect;
export type IngestionInsert = typeof ingestion.$inferInsert;
