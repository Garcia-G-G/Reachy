import { relations } from 'drizzle-orm';
import { index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { generation } from './generations';
import { project } from './projects';

export type AssetKind = 'image' | 'video' | 'copy';
export type AssetLanguage = 'es' | 'en';

export const asset = pgTable(
  'asset',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    generationId: uuid('generation_id').references(() => generation.id, {
      onDelete: 'set null',
    }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => project.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['image', 'video', 'copy'] }).notNull(),
    format: text('format'),
    width: integer('width'),
    height: integer('height'),
    durationSec: integer('duration_sec'),
    language: text('language', { enum: ['es', 'en'] }),
    text: text('text'),
    storageKey: text('storage_key'),
    publicUrl: text('public_url'),
    bytes: integer('bytes'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('asset_project_id_idx').on(table.projectId),
    index('asset_generation_id_idx').on(table.generationId),
  ],
);

export const assetRelations = relations(asset, ({ one }) => ({
  project: one(project, { fields: [asset.projectId], references: [project.id] }),
  generation: one(generation, {
    fields: [asset.generationId],
    references: [generation.id],
  }),
}));
