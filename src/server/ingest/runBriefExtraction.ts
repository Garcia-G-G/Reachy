import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { ingestion } from '@/server/db/schema/ingestion';
import type { IngestedBundle } from './aggregate';
import { autoCreateProjectFromBrief } from './autoBrandKit';
import { extractBrief, type ProductBrief } from './extractBrief';
import { extractVisualIdentity, type VisualIdentity } from './extractVisualIdentity';

/**
 * Pure-server orchestrator for Step 2's brief-extraction pipeline.
 * Lives outside the actions/ tree so the BullMQ worker can call it
 * directly (no Next request context, no getSession()).
 *
 * The Server Action wrapper in actions/ingest.ts adds the auth check
 * and shapes the response for client callers. The worker calls THIS
 * function after writing the bundle, so brief extraction runs
 * automatically on every successful ingest.
 */

export interface StoredBrief {
  brief: ProductBrief;
  visualIdentity: VisualIdentity | null;
  projectId: string | null;
  brandKitId: string | null;
  projectSlug: string | null;
  costCents: number;
  briefModel: string;
  visionModel: string | null;
  /** Set when extraction succeeded but the project autofill failed
   *  (e.g., slug collision pathological case, DB transient). The UI
   *  can show a retry button without losing the extracted brief. */
  autofillError?: string;
  generatedAt: string;
}

export interface RunBriefExtractionResult {
  stored: StoredBrief;
  newCostCents: number;
}

export async function runBriefExtractionFor(
  ingestionId: string,
): Promise<RunBriefExtractionResult> {
  const [row] = await db.select().from(ingestion).where(eq(ingestion.id, ingestionId)).limit(1);
  if (!row) throw new Error(`runBriefExtraction: ingestion ${ingestionId} not found`);
  if (row.status !== 'ready' || !row.bundle) {
    throw new Error('runBriefExtraction: ingestion not ready');
  }

  const bundle = row.bundle as unknown as IngestedBundle;

  const briefResult = await extractBrief({ bundle });

  const visionResult = await extractVisualIdentity({ images: bundle.images }).catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[reachy:ingest] gen ${row.id} vision pass failed: ${msg}`);
    return null;
  });
  const visionIdentity = visionResult?.identity ?? null;
  const visionCost = visionResult?.costCents ?? 0;
  const visionModel = visionResult?.modelUsed ?? null;

  let projectId: string | null = null;
  let brandKitId: string | null = null;
  let projectSlug: string | null = null;
  let autofillError: string | undefined;
  try {
    const created = await autoCreateProjectFromBrief({
      brief: briefResult.brief,
      visualIdentity: visionIdentity,
      userId: row.userId,
      ingestionId: row.id,
    });
    projectId = created.projectId;
    brandKitId = created.brandKitId;
    projectSlug = created.projectSlug;
  } catch (err) {
    autofillError = err instanceof Error ? err.message : String(err);
    console.warn(`[reachy:ingest] gen ${row.id} autofill failed: ${autofillError}`);
  }

  const stored: StoredBrief = {
    brief: briefResult.brief,
    visualIdentity: visionIdentity,
    projectId,
    brandKitId,
    projectSlug,
    costCents: briefResult.costCents + visionCost,
    briefModel: briefResult.modelUsed,
    visionModel,
    autofillError,
    generatedAt: new Date().toISOString(),
  };

  const mergedBundle = { ...bundle, brief: stored } as unknown as Record<string, unknown>;
  await db
    .update(ingestion)
    .set({
      bundle: mergedBundle,
      costCents: (row.costCents ?? 0) + stored.costCents,
    })
    .where(eq(ingestion.id, row.id));

  return { stored, newCostCents: stored.costCents };
}
