'use server';

import { randomUUID } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/server/db/client';
import { project } from '@/server/db/schema/projects';
import { getSession } from '@/server/getSession';
import { deleteR2, isR2Configured, putR2 } from '@/server/storage/r2';
import { BRIEF_LIMITS, BRIEF_MIME_ALLOWLIST, type BriefMime } from './escape';
import { parseBrief } from './parseBrief';

const setInputSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('paste'),
    projectId: z.string().uuid(),
    text: z
      .string()
      .trim()
      .min(1)
      .max(BRIEF_LIMITS.maxTextChars * 2),
  }),
  z.object({
    kind: z.literal('upload'),
    projectId: z.string().uuid(),
    filename: z.string().trim().min(1).max(200),
    mime: z.enum(BRIEF_MIME_ALLOWLIST),
    base64: z.string().min(1),
  }),
]);

export type SetProjectBriefInput = z.infer<typeof setInputSchema>;

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export interface SetBriefOk {
  briefBytes: number | null;
  briefFilename: string | null;
  briefMime: string | null;
  briefUpdatedAt: string;
  briefTextLength: number;
  truncated: boolean;
}

const EXT_BY_MIME: Record<BriefMime, string> = {
  'text/plain': 'txt',
  'text/markdown': 'md',
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
};

export async function setProjectBrief(input: SetProjectBriefInput): Promise<Result<SetBriefOk>> {
  const session = await getSession();
  if (!session) return { ok: false, error: 'unauthenticated' };

  const parsed = setInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid input' };
  }

  const [proj] = await db
    .select()
    .from(project)
    .where(
      and(
        eq(project.id, parsed.data.projectId),
        eq(project.userId, session.user.id),
        isNull(project.archivedAt),
      ),
    )
    .limit(1);
  if (!proj) return { ok: false, error: 'not-found' };

  let parseResult: Awaited<ReturnType<typeof parseBrief>>;
  let storedFilename: string | null = null;
  let storedMime: string | null = null;
  let storedBytes: number | null = null;
  let newR2Key: string | null = null;

  if (parsed.data.kind === 'paste') {
    parseResult = await parseBrief({
      pastedText: parsed.data.text,
      mime: 'text/plain',
    });
  } else {
    const buf = Buffer.from(parsed.data.base64, 'base64');
    if (buf.length === 0) return { ok: false, error: 'empty-upload' };
    if (buf.length > BRIEF_LIMITS.maxOriginalBytes) {
      return { ok: false, error: 'too-large' };
    }
    parseResult = await parseBrief({
      bytes: new Uint8Array(buf),
      mime: parsed.data.mime,
    });
    if (!parseResult.ok) {
      return { ok: false, error: parseResult.error };
    }

    if (!isR2Configured()) {
      return { ok: false, error: 'r2-not-configured' };
    }
    const ext = EXT_BY_MIME[parsed.data.mime];
    newR2Key = `briefs/${session.user.id}/${proj.id}/${randomUUID()}.${ext}`;
    await putR2(newR2Key, buf, parsed.data.mime);
    storedFilename = parsed.data.filename;
    storedMime = parsed.data.mime;
    storedBytes = buf.length;
  }

  if (!parseResult.ok) {
    return { ok: false, error: parseResult.error };
  }

  // Truncation happens at prompt-build time via escapeBriefText, but we
  // surface the flag now so the UI can show a warning.
  const truncated = parseResult.text.length > BRIEF_LIMITS.maxTextChars;

  const previousR2Key = proj.briefR2Key;
  const now = new Date();

  try {
    await db
      .update(project)
      .set({
        briefText: parseResult.text,
        briefFilename: storedFilename,
        briefMime: storedMime,
        briefBytes: storedBytes,
        briefR2Key: newR2Key,
        briefUpdatedAt: now,
      })
      .where(eq(project.id, proj.id));
  } catch (err) {
    // DB write failed; if we already uploaded a new R2 object, it's now an
    // orphan. Best-effort cleanup before propagating the error.
    if (newR2Key) await deleteR2(newR2Key);
    throw err;
  }

  if (previousR2Key && previousR2Key !== newR2Key) {
    await deleteR2(previousR2Key);
  }

  revalidatePath(`/app/projects/${proj.slug}/identity`, 'layout');
  revalidatePath(`/app/projects/${proj.slug}/generate/copy`, 'layout');

  return {
    ok: true,
    data: {
      briefBytes: storedBytes,
      briefFilename: storedFilename,
      briefMime: storedMime,
      briefUpdatedAt: now.toISOString(),
      briefTextLength: parseResult.text.length,
      truncated,
    },
  };
}

export async function clearProjectBrief(projectId: string): Promise<Result<{ ok: true }>> {
  const session = await getSession();
  if (!session) return { ok: false, error: 'unauthenticated' };
  const id = z.string().uuid().safeParse(projectId);
  if (!id.success) return { ok: false, error: 'invalid input' };

  const [proj] = await db
    .select()
    .from(project)
    .where(
      and(eq(project.id, id.data), eq(project.userId, session.user.id), isNull(project.archivedAt)),
    )
    .limit(1);
  if (!proj) return { ok: false, error: 'not-found' };

  const previousR2Key = proj.briefR2Key;
  await db
    .update(project)
    .set({
      briefText: null,
      briefFilename: null,
      briefMime: null,
      briefBytes: null,
      briefR2Key: null,
      briefUpdatedAt: null,
    })
    .where(eq(project.id, proj.id));

  if (previousR2Key) await deleteR2(previousR2Key);

  revalidatePath(`/app/projects/${proj.slug}/identity`, 'layout');
  revalidatePath(`/app/projects/${proj.slug}/generate/copy`, 'layout');

  return { ok: true, data: { ok: true } };
}

export interface BriefSummary {
  hasText: boolean;
  filename: string | null;
  mime: string | null;
  bytes: number | null;
  updatedAt: string | null;
  textLength: number;
  preview: string;
}

export async function getProjectBriefSummary(projectId: string): Promise<BriefSummary | null> {
  const session = await getSession();
  if (!session) return null;
  const id = z.string().uuid().safeParse(projectId);
  if (!id.success) return null;
  const [proj] = await db
    .select({
      briefText: project.briefText,
      briefFilename: project.briefFilename,
      briefMime: project.briefMime,
      briefBytes: project.briefBytes,
      briefUpdatedAt: project.briefUpdatedAt,
    })
    .from(project)
    .where(and(eq(project.id, id.data), eq(project.userId, session.user.id)))
    .limit(1);
  if (!proj) return null;

  const text = proj.briefText ?? '';
  return {
    hasText: text.length > 0,
    filename: proj.briefFilename,
    mime: proj.briefMime,
    bytes: proj.briefBytes,
    updatedAt: proj.briefUpdatedAt ? proj.briefUpdatedAt.toISOString() : null,
    textLength: text.length,
    preview: text.slice(0, 600),
  };
}
