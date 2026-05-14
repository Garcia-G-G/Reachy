import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

async function main() {
  const generationId = process.argv[2];
  if (!generationId) {
    console.error('Usage: tsx scripts/retry-compose.ts <generationId>');
    process.exit(1);
  }

  // Dynamic imports so dotenv populates process.env before src/env.ts runs.
  const { eq } = await import('drizzle-orm');
  const { db } = await import('../src/server/db/client');
  const { brandKit } = await import('../src/server/db/schema/brandKits');
  const { generation } = await import('../src/server/db/schema/generations');
  const { project } = await import('../src/server/db/schema/projects');
  const { getVideoQueue } = await import('../src/server/jobs/videoQueue');
  type ReelEngine = import('../src/lib/reel-templates').ReelEngine;
  type ReelPlan = import('../src/lib/reel-templates').ReelPlan;

  const [gen] = await db.select().from(generation).where(eq(generation.id, generationId)).limit(1);
  if (!gen) {
    console.error(`No generation ${generationId}`);
    process.exit(1);
  }

  const [proj] = await db.select().from(project).where(eq(project.id, gen.projectId)).limit(1);
  if (!proj) {
    console.error(`No project ${gen.projectId}`);
    process.exit(1);
  }

  const [kit] = await db.select().from(brandKit).where(eq(brandKit.projectId, proj.id)).limit(1);
  const brandColorHex = kit?.primaryColor ?? '#14110D';
  const brandTextHex = kit?.bgColor ?? '#F1EBDF';

  const params = (gen.params ?? {}) as { engine?: ReelEngine; plan?: ReelPlan };
  if (!params.engine || !params.plan) {
    console.error(`generation ${generationId} has no engine/plan in params`);
    process.exit(1);
  }

  console.log(`Resetting generation ${generationId} (engine=${params.engine}) and re-enqueueing…`);
  await db
    .update(generation)
    .set({ status: 'queued', errorMessage: null, finishedAt: null })
    .where(eq(generation.id, generationId));

  const queue = getVideoQueue();
  const existing = await queue.getJob(generationId);
  if (existing) {
    console.log(`Removing existing BullMQ job (state=${await existing.getState()})`);
    await existing.remove();
  }

  await queue.add(
    'compose',
    {
      generationId: gen.id,
      projectId: proj.id,
      projectSlug: proj.slug,
      engine: params.engine,
      plan: params.plan,
      brandColorHex,
      brandTextHex,
      visualStyle: kit?.visualStyle ?? 'editorial',
    },
    { jobId: gen.id },
  );

  console.log(`Re-enqueued. Worker will resume via stored Sora job IDs — no new Sora cost.`);
  await queue.close();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
