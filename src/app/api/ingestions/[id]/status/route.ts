import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/server/db/client';
import { ingestion } from '@/server/db/schema/ingestion';
import { getSession } from '@/server/getSession';

/**
 * Status polling endpoint for the autopilot parsing page. Returns the
 * row's current status + lightweight progress info. The full
 * IngestedBundle is exposed only once status='ready' to keep the JSON
 * payload small while the user is still on the spinner.
 */

interface BundleShape {
  textBlocks?: unknown[];
  images?: unknown[];
  tables?: unknown[];
  codeContext?: unknown[];
  unparsedFiles?: string[];
  fileTypeMix?: Record<string, number>;
  totalSizeBytes?: number;
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  const { id } = await ctx.params;
  const [row] = await db.select().from(ingestion).where(eq(ingestion.id, id)).limit(1);
  if (!row) return NextResponse.json({ error: 'not-found' }, { status: 404 });
  if (row.userId !== session.user.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  // Summarize the bundle for the polling card; full bundle is read by
  // Step 2 (brief extraction) from the DB directly.
  const bundle = (row.bundle ?? null) as BundleShape | null;
  const summary = bundle
    ? {
        textBlockCount: Array.isArray(bundle.textBlocks) ? bundle.textBlocks.length : 0,
        imageCount: Array.isArray(bundle.images) ? bundle.images.length : 0,
        tableCount: Array.isArray(bundle.tables) ? bundle.tables.length : 0,
        codeFileCount: Array.isArray(bundle.codeContext) ? bundle.codeContext.length : 0,
        unparsedCount: Array.isArray(bundle.unparsedFiles) ? bundle.unparsedFiles.length : 0,
        fileTypeMix: bundle.fileTypeMix ?? {},
        totalSizeBytes: bundle.totalSizeBytes ?? 0,
      }
    : null;

  return NextResponse.json(
    {
      id: row.id,
      status: row.status,
      errorMessage: row.errorMessage,
      createdAt: row.createdAt,
      finishedAt: row.finishedAt,
      summary,
    },
    { headers: { 'Cache-Control': 'no-store, must-revalidate' } },
  );
}
