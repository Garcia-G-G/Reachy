'use server';

import { and, desc, eq } from 'drizzle-orm';
import { CHAT_HISTORY_DEPTH } from '@/server/config/chatLimits';
import { db } from '@/server/db/client';
import { type ChatMessage, chatMessage } from '@/server/db/schema/chatMessages';
import { type ChatThread, chatThread } from '@/server/db/schema/chatThreads';
import { project } from '@/server/db/schema/projects';
import { getSession } from '@/server/getSession';

/**
 * Emma chat — server actions. Phase 07.
 *
 * Thread CRUD + history pagination. Every action checks session
 * ownership of the underlying project before touching chat rows.
 *
 * Streaming + message persistence live on the API route — these
 * actions are called from server components (page load) and from
 * the client's "reset conversation" affordance.
 */

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

async function projectIsOwnedByUser(projectId: string, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: project.id })
    .from(project)
    .where(and(eq(project.id, projectId), eq(project.userId, userId)))
    .limit(1);
  return Boolean(row);
}

/**
 * Lazy-create or fetch the thread for a project. Called from the
 * chat page's server component on every load. Idempotent.
 */
export async function createOrGetThread(projectId: string): Promise<Result<ChatThread>> {
  const session = await getSession();
  if (!session) return { ok: false, error: 'unauthenticated' };
  if (!(await projectIsOwnedByUser(projectId, session.user.id))) {
    return { ok: false, error: 'not-found' };
  }

  const [existing] = await db
    .select()
    .from(chatThread)
    .where(eq(chatThread.projectId, projectId))
    .limit(1);
  if (existing) return { ok: true, data: existing };

  const [created] = await db.insert(chatThread).values({ projectId }).returning();
  if (!created) return { ok: false, error: 'thread insert returned no row' };
  return { ok: true, data: created };
}

/**
 * Load the most-recent N messages of a thread (default = the chat
 * history depth used for model context). Messages come back in
 * chronological order (oldest → newest) so the UI can render them
 * in scroll order without a flip.
 */
export async function getThreadMessages(
  threadId: string,
  opts: { limit?: number } = {},
): Promise<Result<ChatMessage[]>> {
  const session = await getSession();
  if (!session) return { ok: false, error: 'unauthenticated' };

  // Ownership: walk thread → project → user.
  const [threadRow] = await db
    .select({ projectId: chatThread.projectId })
    .from(chatThread)
    .where(eq(chatThread.id, threadId))
    .limit(1);
  if (!threadRow) return { ok: false, error: 'not-found' };
  if (!(await projectIsOwnedByUser(threadRow.projectId, session.user.id))) {
    return { ok: false, error: 'forbidden' };
  }

  const limit = opts.limit ?? CHAT_HISTORY_DEPTH;
  // Pull newest N then reverse so the UI gets oldest-first.
  const rows = await db
    .select()
    .from(chatMessage)
    .where(eq(chatMessage.threadId, threadId))
    .orderBy(desc(chatMessage.createdAt))
    .limit(limit);
  return { ok: true, data: rows.reverse() };
}

/**
 * Wipe all messages in a thread (the "reset conversation" UX).
 * Thread row itself stays — same project, same id, fresh history.
 */
export async function deleteThreadHistory(threadId: string): Promise<Result<{ deleted: number }>> {
  const session = await getSession();
  if (!session) return { ok: false, error: 'unauthenticated' };

  const [threadRow] = await db
    .select({ projectId: chatThread.projectId })
    .from(chatThread)
    .where(eq(chatThread.id, threadId))
    .limit(1);
  if (!threadRow) return { ok: false, error: 'not-found' };
  if (!(await projectIsOwnedByUser(threadRow.projectId, session.user.id))) {
    return { ok: false, error: 'forbidden' };
  }

  const deleted = await db
    .delete(chatMessage)
    .where(eq(chatMessage.threadId, threadId))
    .returning({ id: chatMessage.id });

  await db.update(chatThread).set({ lastMessageAt: null }).where(eq(chatThread.id, threadId));

  return { ok: true, data: { deleted: deleted.length } };
}

/**
 * Sum the cost of every message in a thread — surfaced in the chat
 * header's "$X.XX this conversation" ticker. Cheap aggregate query.
 */
export async function getThreadCostCents(threadId: string): Promise<Result<number>> {
  const session = await getSession();
  if (!session) return { ok: false, error: 'unauthenticated' };

  const [threadRow] = await db
    .select({ projectId: chatThread.projectId })
    .from(chatThread)
    .where(eq(chatThread.id, threadId))
    .limit(1);
  if (!threadRow) return { ok: false, error: 'not-found' };
  if (!(await projectIsOwnedByUser(threadRow.projectId, session.user.id))) {
    return { ok: false, error: 'forbidden' };
  }

  const rows = await db
    .select({ costCents: chatMessage.costCents })
    .from(chatMessage)
    .where(eq(chatMessage.threadId, threadId));
  const total = rows.reduce((acc, r) => acc + (r.costCents ?? 0), 0);
  return { ok: true, data: total };
}
