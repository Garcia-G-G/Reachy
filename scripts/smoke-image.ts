import { config as loadEnv } from 'dotenv';
import { eq } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { project } from '@/server/db/schema/projects';
import { generation } from '@/server/db/schema/generations';
import { asset } from '@/server/db/schema/assets';
import { getImageQueue } from '@/server/jobs/queue';

loadEnv({ path: '.env.local' });

async function main() {
  const [proj] = await db
    .select()
    .from(project)
    .where(eq(project.slug, 'saas-tracker'))
    .limit(1);
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

  await getImageQueue().add('generate', {
    generationId: gen.id,
    projectId: proj.id,
    prompt,
    format: 'square',
    provider: 'openai',
    model: 'gpt-image-1',
    n: 1,
  });
  console.log('job added — polling for done...');

  const start = Date.now();
  while (Date.now() - start < 90_000) {
    await new Promise((r) => setTimeout(r, 2_000));
    const [row] = await db
      .select()
      .from(generation)
      .where(eq(generation.id, gen.id))
      .limit(1);
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
