import { and, eq } from 'drizzle-orm';
import { getLocale } from 'next-intl/server';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { runEmmaTurn } from '@/server/ai/chat/handler';
import { db } from '@/server/db/client';
import { chatThread } from '@/server/db/schema/chatThreads';
import { project } from '@/server/db/schema/projects';
import { getSession } from '@/server/getSession';

/**
 * Emma chat — stream endpoint. Phase 07.
 *
 * POST /api/chat/[threadId]/stream
 * Body: { text: string, attachments?: { r2Key, mime, originalName, sizeBytes }[] }
 *
 * Auth: session-gated; thread must belong to a project owned by the
 * current user.
 *
 * Returns: SSE stream in the AI SDK UIMessage format (consumed by
 * useChat on the client).
 */

const inputSchema = z.object({
  text: z.string().trim().max(8000).default(''),
  attachments: z
    .array(
      z.object({
        r2Key: z.string().min(1).max(800),
        mime: z.string().min(1).max(160),
        originalName: z.string().min(1).max(512),
        sizeBytes: z.number().int().min(0),
      }),
    )
    .max(10)
    .default([]),
});

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes — Emma image-gen tool can take that long.

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ threadId: string }> },
): Promise<Response> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const { threadId } = await ctx.params;

  const body = await req.json().catch(() => null);
  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'invalid input' },
      { status: 400 },
    );
  }
  if (parsed.data.text.length === 0 && parsed.data.attachments.length === 0) {
    return NextResponse.json({ error: 'empty message' }, { status: 400 });
  }

  // Ownership: walk thread → project → user.
  const [threadRow] = await db
    .select({ projectId: chatThread.projectId })
    .from(chatThread)
    .where(eq(chatThread.id, threadId))
    .limit(1);
  if (!threadRow) {
    return NextResponse.json({ error: 'thread not found' }, { status: 404 });
  }
  const [projRow] = await db
    .select({ id: project.id })
    .from(project)
    .where(and(eq(project.id, threadRow.projectId), eq(project.userId, session.user.id)))
    .limit(1);
  if (!projRow) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  // Resolve the display name safely — `||` not `??` so empty
  // strings fall through to the next fallback. better-auth allows
  // empty `user.name`, which would otherwise produce "Hi ." in the
  // greeting (Phase 07c bug fix).
  const userDisplayName =
    session.user.name?.trim() || session.user.email?.split('@')[0]?.trim() || 'amigo';

  // App locale (from URL prefix / NEXT_LOCALE cookie) is the single
  // source of truth for Emma's UI chrome AND her response language.
  // Phase 07h — previously the system prompt language came from the
  // brand kit; that diverged from the URL locale when they
  // disagreed. Threading the app locale through here keeps the chat
  // and the rest of the website speaking the same language.
  const appLocale = (await getLocale()) === 'en' ? 'en' : 'es';

  try {
    const result = await runEmmaTurn({
      threadId,
      userId: session.user.id,
      userMessage: {
        text: parsed.data.text,
        attachments: parsed.data.attachments,
      },
      userDisplayName,
      uiLocale: appLocale,
    });
    // The AI SDK's stream result exposes toUIMessageStreamResponse which
    // returns a Web Response carrying the SSE event stream that useChat
    // on the client consumes natively.
    return result.toUIMessageStreamResponse();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[reachy:emma] turn failed: ${msg}`);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
