import { index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { chatThread } from './chatThreads';

/**
 * Emma chat message — Phase 07.
 *
 * Stores one row per message in an Emma thread. The `content` column
 * holds the Anthropic Messages content format (array of blocks: text,
 * tool_use, tool_result, image, document) so we can re-hydrate the
 * conversation verbatim for streaming on reconnect.
 *
 * `attachments` stores R2 references for files Garcia uploaded
 * (separate from `content` because the parsed result of a doc goes
 * into a tool_result block, not the upload metadata).
 */

export type ChatMessageRole = 'user' | 'assistant' | 'system' | 'tool';

export interface ChatAttachment {
  r2Key: string;
  mime: string;
  originalName: string;
  sizeBytes: number;
}

export const chatMessage = pgTable(
  'chat_message',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    threadId: uuid('thread_id')
      .notNull()
      .references(() => chatThread.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['user', 'assistant', 'system', 'tool'] })
      .$type<ChatMessageRole>()
      .notNull(),
    /** Anthropic Messages content blocks: text | tool_use | tool_result
     *  | image | document. Stored as jsonb so streaming reconnects
     *  can render the exact same shape. */
    content: jsonb('content').notNull(),
    /** For role='tool' rows — matches tool_result back to its tool_use. */
    toolUseId: text('tool_use_id'),
    /** R2-stored files the user uploaded in this turn. */
    attachments: jsonb('attachments').$type<ChatAttachment[]>().default([]).notNull(),
    /** Cost the LLM round-trip + any tool execution attributed to
     *  this message. Summed into the conversation total in the header. */
    costCents: integer('cost_cents').default(0).notNull(),
    /** Which model produced this turn — useful for cost auditing and
     *  for "this message came from claude-sonnet-4-6" provenance. */
    model: text('model'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    threadCreatedIdx: index('chat_message_thread_idx').on(table.threadId, table.createdAt),
  }),
);

export type ChatMessage = typeof chatMessage.$inferSelect;
