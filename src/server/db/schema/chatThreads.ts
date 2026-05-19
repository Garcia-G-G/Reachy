import { index, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { project } from './projects';

/**
 * Emma chat thread — one per project. Phase 07.
 *
 * The 1:1 with project is enforced at the DB level (project_id UNIQUE).
 * `last_message_at` is updated on every persisted message so the project
 * list can show "last touched on …" without scanning chat_message.
 */

export const chatThread = pgTable(
  'chat_thread',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .unique()
      .references(() => project.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
  },
  (table) => ({
    projectIdx: index('chat_thread_project_idx').on(table.projectId),
  }),
);

export type ChatThread = typeof chatThread.$inferSelect;
