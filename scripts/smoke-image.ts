import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local' });

// Imports are dynamic so dotenv has loaded before @/env runs its zod schema
// validation at module-init time. Mirrors smoke-copy.ts and smoke-reel.ts.
async function main() {
  const { eq } = await import('drizzle-orm');
  const { db } = await import('@/server/db/client');
  const { asset } = await import('@/server/db/schema/assets');
  const { generation } = await import('@/server/db/schema/generations');
  const { project } = await import('@/server/db/schema/projects');
  const { getImageQueue } = await import('@/server/jobs/queue');

  const [proj] = await db.select().from(project).where(eq(project.slug, 'saas-tracker')).limit(1);
  if (!proj) {
    console.error('No project saas-tracker — create one first.');
    process.exit(1);
  }
  console.log('project:', proj.id, proj.name);

  const prompt =
    'Editorial hero shot for an indie SaaS analytics dashboard. Warm paper background, dark ink details, single sienna accent. Magazine layout, no text overlays, no watermarks.';

  const [gen] = await db
    .insert(generation)
    .values({
      projectId: proj.id,
      type: 'image',
      format: 'square',
      status: 'queued',
      provider: 'openai',
      model: 'gpt-image-1',
      prompt,
      params: { idea: 'editorial hero', n: 1, language: 'en' },
    })
    .returning();
  if (!gen) throw new Error('insert failed');
  console.log('generation queued:', gen.id);

  await getImageQueue().add(
    'generate',
    {
      generationId: gen.id,
      projectId: proj.id,
      prompt,
      format: 'square',
      provider: 'openai',
      model: 'gpt-image-1',
      n: 1,
    },
    { jobId: gen.id },
  );
  console.log('job added — polling for done...');

  const start = Date.now();
  while (Date.now() - start < 90_000) {
    await new Promise((r) => setTimeout(r, 2_000));
    const [row] = await db.select().from(generation).where(eq(generation.id, gen.id)).limit(1);
    if (!row) continue;
    console.log(`[t+${Math.round((Date.now() - start) / 1000)}s] status=${row.status}`);
    if (row.status === 'done' || row.status === 'failed') {
      console.log('finishedAt:', row.finishedAt);
      console.log('costCents:', row.costCents);
      console.log('error:', row.errorMessage);
      const assets = await db.select().from(asset).where(eq(asset.generationId, gen.id));
      console.log('assets:', assets.length);
      for (const a of assets) console.log(' -', a.publicUrl, `(${a.bytes} bytes)`);
      break;
    }
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('fatal:', err);
  process.exit(1);
});
