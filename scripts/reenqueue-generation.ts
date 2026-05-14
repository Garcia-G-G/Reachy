import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

/**
 * Re-enqueue a failed video generation by ID. Reuses the existing
 * generation row (so stored Sora job IDs survive — the worker resumes
 * polling/downloading them instead of paying for Sora again) and
 * pushes a fresh BullMQ job. Useful after a code fix in the worker
 * when the Sora outputs are already done OpenAI-side.
 *
 * Usage:  node --conditions=react-server --import tsx scripts/reenqueue-generation.ts <generationId>
 */
async function main() {
  const generationId = process.argv[2];
  if (!generationId) {
    console.error('Usage: tsx scripts/reenqueue-generation.ts <generationId>');
    process.exit(1);
  }

  const { eq } = await import('drizzle-orm');
  const { db } = await import('../src/server/db/client');
  const { generation } = await import('../src/server/db/schema/generations');
  const { project } = await import('../src/server/db/schema/projects');
  const { getVideoQueue } = await import('../src/server/jobs/videoQueue');
  type ReelPlan = import('../src/lib/reel-templates').ReelPlan;
  type ReelEngine = import('../src/lib/reel-templates').ReelEngine;
  type VisualStyleKey = import('../src/server/ai/visualStyles').VisualStyleKey;

  const [row] = await db.select().from(generation).where(eq(generation.id, generationId)).limit(1);
  if (!row) {
    console.error(`No generation with id=${generationId}`);
    process.exit(1);
  }
  if (row.type !== 'video') {
    console.error(`Generation ${generationId} is type=${row.type}, expected 'video'`);
    process.exit(1);
  }

  const [proj] = await db.select().from(project).where(eq(project.id, row.projectId)).limit(1);
  if (!proj) {
    console.error(`Project ${row.projectId} not found`);
    process.exit(1);
  }

  const params = (row.params ?? {}) as {
    engine?: ReelEngine;
    plan?: ReelPlan;
    visualStyle?: VisualStyleKey;
  };
  if (!params.engine || !params.plan) {
    console.error(`Generation ${generationId} is missing engine/plan in params`);
    process.exit(1);
  }

  // Reset DB row state so the worker's transition logic isn't confused.
  await db
    .update(generation)
    .set({ status: 'queued', errorMessage: null, finishedAt: null })
    .where(eq(generation.id, generationId));

  const queue = getVideoQueue();
  await queue.add(
    'compose',
    {
      generationId,
      projectId: proj.id,
      projectSlug: proj.slug,
      engine: params.engine,
      plan: params.plan,
      brandColorHex: '#b6481a',
      brandTextHex: '#f1ebdf',
      visualStyle: params.visualStyle,
    },
    // Unique jobId per re-enqueue so BullMQ doesn't dedupe against the old
    // failed job; the engine resumes from generation.params.soraJobs anyway.
    { jobId: `${generationId}-rerun-${Date.now()}` },
  );

  console.log(`Re-enqueued generation ${generationId}`);
  console.log(`  engine: ${params.engine}`);
  console.log(`  visualStyle: ${params.visualStyle}`);
  console.log(`  scenes: ${params.plan.scenes.length}`);
  await queue.close();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
