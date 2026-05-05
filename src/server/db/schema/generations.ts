import { relations } from 'drizzle-orm';
import { index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { asset } from './assets';
import { project } from './projects';

export type GenerationType = 'image' | 'copy' | 'video';
export type GenerationStatus = 'queued' | 'running' | 'done' | 'failed';

export const generation = pgTable(
  'generation',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => project.id, { onDelete: 'cascade' }),
    type: text('type', { enum: ['image', 'copy', 'video'] }).notNull(),
    format: text('format').notNull(),
    status: text('status', { enum: ['queued', 'running', 'done', 'failed'] })
      .notNull()
      .default('queued'),
    provider: text('provider'),
    model: text('model'),
    prompt: text('prompt'),
    params: jsonb('params'),
    costCents: integer('cost_cents'),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    finishedAt: timestamp('finished_at'),
  },
  (table) => [
    index('generation_project_id_idx').on(table.projectId),
    index('generation_status_idx').on(table.status),
  ],
);

export const generationRelations = relations(generation, ({ one, many }) => ({
  project: one(project, { fields: [generation.projectId], references: [project.id] }),
  assets: many(asset),
}));
