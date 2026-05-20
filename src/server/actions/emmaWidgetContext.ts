'use server';

import { eq } from 'drizzle-orm';
import type { BrandKit } from '@/server/actions/brandKits';
import { createOrGetThread, getThreadMessages } from '@/server/actions/chat';
import { db } from '@/server/db/client';
import { brandKit } from '@/server/db/schema/brandKits';
import type { ChatMessage } from '@/server/db/schema/chatMessages';
import { project } from '@/server/db/schema/projects';
import { getSession } from '@/server/getSession';

/**
 * Server action for the EmmaWidget — Phase 07h.
 *
 * The widget is a globally-mounted client component, so it can't
 * read the DB directly. It calls this action with a project slug
 * (parsed from pathname) and gets back everything needed to mount
 * the compact chat: project info, brand kit, thread id, history,
 * display name.
 *
 * When slug is null (user is on a non-project route), returns
 * `{ kind: 'no-project' }` and the widget tells the user to pick
 * a project to chat in.
 *
 * Session-gated; non-owned projects return `{ kind: 'not-found' }`.
 */

export type EmmaWidgetContextResult =
  | { kind: 'no-project' }
  | { kind: 'no-brand-kit'; projectSlug: string }
  | { kind: 'not-found' }
  | { kind: 'unauthenticated' }
  | {
      kind: 'ready';
      projectId: string;
      projectName: string;
      projectSlug: string;
      brandKit: BrandKit;
      threadId: string;
      initialMessages: ChatMessage[];
      userDisplayName: string;
      firstName: string;
    };

export async function getEmmaWidgetContext(
  projectSlug: string | null,
): Promise<EmmaWidgetContextResult> {
  const session = await getSession();
  if (!session) return { kind: 'unauthenticated' };

  if (!projectSlug) return { kind: 'no-project' };

  const [proj] = await db.select().from(project).where(eq(project.slug, projectSlug)).limit(1);
  if (!proj || proj.userId !== session.user.id) {
    return { kind: 'not-found' };
  }

  const [kitRow] = await db.select().from(brandKit).where(eq(brandKit.projectId, proj.id)).limit(1);
  if (!kitRow) {
    return { kind: 'no-brand-kit', projectSlug };
  }

  const threadRes = await createOrGetThread(proj.id);
  if (!threadRes.ok) return { kind: 'not-found' };
  const thread = threadRes.data;

  const msgs = await getThreadMessages(thread.id);
  const initialMessages = msgs.ok ? msgs.data : [];

  const userDisplayName =
    session.user.name?.trim() || session.user.email?.split('@')[0]?.trim() || 'amigo';
  const firstName = userDisplayName.split(' ')[0] || userDisplayName;

  return {
    kind: 'ready',
    projectId: proj.id,
    projectName: proj.name,
    projectSlug: proj.slug,
    brandKit: kitRow as unknown as BrandKit,
    threadId: thread.id,
    initialMessages,
    userDisplayName,
    firstName,
  };
}
