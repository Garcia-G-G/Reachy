'use server';

import { eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  MAX_BYTES_PER_FILE,
  MAX_BYTES_PER_INGESTION,
  MAX_FILES_PER_INGESTION,
} from '@/server/config/parserLimits';
import { db } from '@/server/db/client';
import { ingestion } from '@/server/db/schema/ingestion';
import { getSession } from '@/server/getSession';
import { getIngestionQueue } from '@/server/jobs/ingestionQueue';
import { putR2 } from '@/server/storage/r2';

/** What the upload page submits — file bytes are sent base64-encoded
 *  inside the JSON payload alongside their metadata. We keep this
 *  inline (single round-trip) because the parser pipeline doesn't
 *  benefit from pre-signed URLs for a multi-file upload — the action
 *  fans out to R2 anyway. */
const uploadEntry = z.object({
  originalName: z.string().trim().min(1).max(512),
  mime: z.string().trim().max(256).nullable(),
  bytes: z.number().int().min(0).max(MAX_BYTES_PER_FILE),
  base64: z
    .string()
    .min(0)
    .max(Math.ceil((MAX_BYTES_PER_FILE * 4) / 3) + 32),
});

const ingestInput = z
  .object({
    files: z.array(uploadEntry).max(MAX_FILES_PER_INGESTION),
    pastedText: z.string().trim().max(MAX_BYTES_PER_FILE).optional(),
  })
  .refine((d) => d.files.length > 0 || (d.pastedText && d.pastedText.length > 0), {
    message: 'no input provided',
  });

export type IngestInput = z.input<typeof ingestInput>;

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

export async function enqueueIngestion(
  input: IngestInput,
): Promise<ActionResult<{ ingestionId: string }>> {
  const session = await getSession();
  if (!session) return { ok: false, error: 'unauthenticated' };

  const parsed = ingestInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid input' };
  }

  const totalBytes = parsed.data.files.reduce((acc, f) => acc + f.bytes, 0);
  if (totalBytes > MAX_BYTES_PER_INGESTION) {
    return { ok: false, error: `ingestion total exceeds ${MAX_BYTES_PER_INGESTION} bytes` };
  }

  const userId = session.user.id;

  // Insert the row first so we have an ingestionId for the R2 prefix.
  const [row] = await db.insert(ingestion).values({ userId, status: 'parsing' }).returning();
  if (!row) return { ok: false, error: 'failed to create ingestion row' };

  // If the user only pasted text, package it as a single .txt file
  // in R2 so the parser pipeline handles it uniformly.
  type FileRef = { r2Key: string; mime: string | null; originalName: string; bytes: number };
  const fileRefs: FileRef[] = [];

  try {
    for (const [i, f] of parsed.data.files.entries()) {
      const buf = Buffer.from(f.base64, 'base64');
      if (buf.byteLength === 0) continue;
      const r2Key = `uploads/${userId}/${row.id}/source/${String(i).padStart(4, '0')}-${safeBasename(f.originalName)}`;
      await putR2(r2Key, buf, f.mime ?? 'application/octet-stream');
      fileRefs.push({
        r2Key,
        mime: f.mime,
        originalName: f.originalName,
        bytes: buf.byteLength,
      });
    }
    if (parsed.data.pastedText && parsed.data.pastedText.length > 0) {
      const buf = Buffer.from(parsed.data.pastedText, 'utf-8');
      const r2Key = `uploads/${userId}/${row.id}/source/pasted.txt`;
      await putR2(r2Key, buf, 'text/plain');
      fileRefs.push({
        r2Key,
        mime: 'text/plain',
        originalName: 'pasted.txt',
        bytes: buf.byteLength,
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db
      .update(ingestion)
      .set({ status: 'failed', errorMessage: `upload failed: ${msg}`, finishedAt: new Date() })
      .where(eq(ingestion.id, row.id));
    return { ok: false, error: `upload failed: ${msg}` };
  }

  if (fileRefs.length === 0) {
    await db
      .update(ingestion)
      .set({ status: 'failed', errorMessage: 'no usable inputs', finishedAt: new Date() })
      .where(eq(ingestion.id, row.id));
    return { ok: false, error: 'no usable inputs' };
  }

  const queue = getIngestionQueue();
  await queue.add(
    'ingest',
    { ingestionId: row.id, userId, fileRefs },
    { jobId: row.id, removeOnComplete: 50, removeOnFail: 50 },
  );

  return { ok: true, data: { ingestionId: row.id } };
}

/** Sanitize a basename for use as part of an R2 key — strip path
 *  separators + reserved characters. Cannot derive: the regex carries
 *  intent (what we treat as safe) rather than a runtime fact. */
function safeBasename(name: string): string {
  const base = name.split('/').pop() ?? name;
  return base.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 180);
}
