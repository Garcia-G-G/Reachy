import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { type NextRequest, NextResponse } from 'next/server';
import { lookupByExtension, lookupByMime } from '@/server/config/acceptedFileTypes';
import {
  CHAT_MAX_ATTACHMENTS_PER_TURN,
  CHAT_MAX_BYTES_PER_FILE,
  CHAT_MAX_BYTES_PER_TURN,
} from '@/server/config/chatLimits';
import { db } from '@/server/db/client';
import { chatThread } from '@/server/db/schema/chatThreads';
import { project } from '@/server/db/schema/projects';
import { getSession } from '@/server/getSession';
import { putR2 } from '@/server/storage/r2';

/**
 * Emma chat — upload endpoint. Phase 07.
 *
 * POST /api/chat/[threadId]/upload  (multipart/form-data)
 *
 * Validates each file against the autopilot accepted-file-types list
 * AND the chat-specific size caps (mirrored from parserLimits). Streams
 * to R2 under uploads/{userId}/chat/{threadId}/{messageId}/ then
 * returns the r2Key + mime + originalName + sizeBytes so the client
 * can include the references in its next /stream POST.
 *
 * Returns: { attachments: ChatAttachment[] }
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function safeBasename(name: string): string {
  const base = name.split('/').pop() ?? name;
  return base.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 180);
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ threadId: string }> },
): Promise<Response> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const { threadId } = await ctx.params;

  // Ownership check.
  const [threadRow] = await db
    .select({ projectId: chatThread.projectId })
    .from(chatThread)
    .where(eq(chatThread.id, threadId))
    .limit(1);
  if (!threadRow) return NextResponse.json({ error: 'thread not found' }, { status: 404 });
  const [projRow] = await db
    .select({ id: project.id })
    .from(project)
    .where(and(eq(project.id, threadRow.projectId), eq(project.userId, session.user.id)))
    .limit(1);
  if (!projRow) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  // Parse multipart.
  let form: FormData;
  try {
    form = await req.formData();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `invalid multipart: ${msg}` }, { status: 400 });
  }

  const files = form.getAll('files').filter((v): v is File => v instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: 'no files in upload' }, { status: 400 });
  }
  if (files.length > CHAT_MAX_ATTACHMENTS_PER_TURN) {
    return NextResponse.json(
      { error: `too many files (max ${CHAT_MAX_ATTACHMENTS_PER_TURN})` },
      { status: 400 },
    );
  }
  const totalBytes = files.reduce((acc, f) => acc + f.size, 0);
  if (totalBytes > CHAT_MAX_BYTES_PER_TURN) {
    return NextResponse.json(
      { error: `upload total ${totalBytes} exceeds ${CHAT_MAX_BYTES_PER_TURN}` },
      { status: 400 },
    );
  }

  // Group these uploads under a single per-turn id so the prefix
  // mirrors how the autopilot ingest organizes its sources.
  const turnId = randomUUID();
  const userId = session.user.id;

  const attachments: Array<{
    r2Key: string;
    mime: string;
    originalName: string;
    sizeBytes: number;
  }> = [];

  for (const file of files) {
    if (file.size === 0) continue;
    if (file.size > CHAT_MAX_BYTES_PER_FILE) {
      return NextResponse.json(
        { error: `${file.name}: ${file.size} bytes exceeds ${CHAT_MAX_BYTES_PER_FILE}` },
        { status: 400 },
      );
    }
    // Accept either by mime or by extension — autopilot's allowlist
    // tolerates the same dual path.
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    const accepted = lookupByMime(file.type) ?? lookupByExtension(ext);
    if (!accepted) {
      return NextResponse.json(
        { error: `${file.name}: unsupported file type (mime=${file.type})` },
        { status: 400 },
      );
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const r2Key = `uploads/${userId}/chat/${threadId}/${turnId}/${safeBasename(file.name)}`;
    await putR2(r2Key, buf, file.type || 'application/octet-stream');
    attachments.push({
      r2Key,
      mime: file.type || 'application/octet-stream',
      originalName: file.name,
      sizeBytes: file.size,
    });
  }

  return NextResponse.json({ attachments });
}
