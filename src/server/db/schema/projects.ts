import { relations } from 'drizzle-orm';
import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { asset } from './assets';
import { user } from './auth';
import { brandKit } from './brandKits';
import { generation } from './generations';

export const project = pgTable(
  'project',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    description: text('description'),
    websiteUrl: text('website_url'),
    audience: text('audience'),
    tone: text('tone'),
    archivedAt: timestamp('archived_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index('project_user_id_idx').on(table.userId),
    uniqueIndex('project_user_slug_uniq').on(table.userId, table.slug),
  ],
);

export const projectRelations = relations(project, ({ one, many }) => ({
  owner: one(user, { fields: [project.userId], references: [user.id] }),
  brandKit: one(brandKit, { fields: [project.id], references: [brandKit.projectId] }),
  generations: many(generation),
  assets: many(asset),
}));
