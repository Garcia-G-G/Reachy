import { and, eq } from 'drizzle-orm';
import { type NextRequest, NextResponse } from 'next/server';
import { getLocale } from 'next-intl/server';
import { z } from 'zod';
import { persistEmmaErrorSurface, runEmmaTurn } from '@/server/ai/chat/handler';
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
  /** Phase 07h — the client embeds its current route + any focused
   *  asset id so concierge tools can return them without a DB hit. */
  clientContext: z
    .object({
      currentRoute: z.string().max(400).optional(),
      focusedGenerationId: z.string().uuid().optional(),
    })
    .optional(),
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
      clientContext: parsed.data.clientContext,
    });
    // The AI SDK's stream result exposes toUIMessageStreamResponse which
    // returns a Web Response carrying the SSE event stream that useChat
    // on the client consumes natively.
    //
    // onError replaces the SDK's default 'An error occurred.' with a
    // locale-aware friendly message. Without this override, an upstream
    // OpenAI server_error (transient overload, request-id payload, etc.)
    // can land as raw JSON inside the chat bubble — Garcia saw this
    // mid-07h testing. We also log the raw error server-side so the
    // dev terminal still has the request-id for debugging.
    return result.toUIMessageStreamResponse({
      onError: (err) => {
        // Phase 07i — OpenAI's Responses-API stream errors arrive as
        // plain objects shaped `{ type: 'error', sequence_number, error:
        // { type, code, message, param } }`. Those don't have a `.message`
        // at the top level, so the prior `err.message` fallback produced
        // "[object Object]" in the dev terminal. Unwrap the inner error
        // explicitly so the log shows the real OpenAI message + the
        // request_id that lives inside it.
        let message: string;
        let cause: unknown;
        let raw: string;
        if (err instanceof Error) {
          message = err.message;
          cause = err.cause;
        } else if (
          err !== null &&
          typeof err === 'object' &&
          'error' in err &&
          (err as { error?: unknown }).error !== null &&
          typeof (err as { error?: unknown }).error === 'object' &&
          typeof ((err as { error: { message?: unknown } }).error.message) === 'string'
        ) {
          message = (err as { error: { message: string } }).error.message;
          cause = (err as { error: { code?: unknown } }).error.code;
        } else {
          message = typeof err === 'string' ? err : 'unknown stream error';
          cause = undefined;
        }
        try {
          raw =
            typeof err === 'object' && err !== null
              ? JSON.stringify(err, null, 2).slice(0, 800)
              : String(err);
        } catch {
          raw = String(err);
        }
        console.error('[reachy:emma] stream error:', { message, cause, raw });

        // Persist an error-surface row so the chat shows a retry-able
        // card on reload — no more silent ghosting. Fire-and-forget;
        // must not block the response. We pass `message + raw` together
        // because the request_id can live in either depending on how
        // OpenAI emits the event.
        void persistEmmaErrorSurface({
          threadId,
          locale: appLocale,
          rawError: `${message}\n${raw}`,
        });

        return appLocale === 'es'
          ? 'Algo falló por el lado del modelo. Intenta de nuevo — si sigue fallando, dime y lo revisamos.'
          : 'Something failed on the model side. Try again — flag me if it keeps failing.';
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[reachy:emma] turn failed: ${msg}`);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
