import { config as loadEnv } from 'dotenv';
import { eq } from 'drizzle-orm';

loadEnv({ path: '.env.local' });

async function main() {
  const { db } = await import('@/server/db/client');
  const { project } = await import('@/server/db/schema/projects');
  const { brandKit } = await import('@/server/db/schema/brandKits');
  const { planReel } = await import('@/server/ai/reelPlanner');
  const { composeReel } = await import('@/server/video/compose');
  const { ensureFfmpeg } = await import('@/server/video/ensureFfmpeg');

  const slug = process.env.SMOKE_PROJECT_SLUG ?? 'saas-tracker';
  const idea =
    process.env.SMOKE_IDEA ??
    'How SaaS Tracker turns a noisy dashboard into a calm Monday morning.';

  const ff = await ensureFfmpeg();
  console.log(`ffmpeg: ${ff.version}`);

  const [proj] = await db.select().from(project).where(eq(project.slug, slug)).limit(1);
  if (!proj) {
    console.error(`No project '${slug}'.`);
    process.exit(1);
  }
  const [kit] = await db.select().from(brandKit).where(eq(brandKit.projectId, proj.id)).limit(1);

  console.log('planning reel...');
  const planRes = await planReel({
    template: 'pitch-30s',
    idea,
    language: 'en',
    project: {
      name: proj.name,
      audience: proj.audience,
      tone: proj.tone,
      description: proj.description,
      websiteUrl: proj.websiteUrl,
    },
    brandKit: kit ?? null,
  });
  console.log(`plan ok in ${planRes.usage.totalTokens}tok / ${planRes.costCents}¢`);
  console.log(`tagline: "${planRes.plan.tagline}"`);
  for (const [i, s] of planRes.plan.scenes.entries()) {
    console.log(
      `  scene ${i + 1} (${s.durationSec}s, ${s.background}, ${s.textPosition}): "${s.text}"`,
    );
  }

  // Use brand bg for every scene so we don't need real image files for this
  // smoke. The compositor picks the lavfi color path.
  const sceneInputs = planRes.plan.scenes.map((scene) => ({
    text: scene.text,
    scene: { ...scene, background: 'brand' as const, imagePrompt: '' },
  }));

  const out = `/tmp/reachy-smoke-reel-${Date.now()}.mp4`;
  console.log(`composing → ${out}`);
  const t0 = Date.now();
  await composeReel({
    scenes: sceneInputs,
    outputPath: out,
    brandColorHex: kit?.primaryColor ?? '#14110D',
    brandTextHex: kit?.bgColor ?? '#F1EBDF',
    onProgress: (p) => process.stdout.write(`\rprogress ${(p * 100).toFixed(0)}%`),
  });
  process.stdout.write('\n');
  const took = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`compose done in ${took}s`);

  const { stat } = await import('node:fs/promises');
  const s = await stat(out);
  console.log(`output: ${out} (${(s.size / 1024).toFixed(0)} KB)`);
  process.exit(0);
}

main().catch((err) => {
  console.error('fatal:', err);
  process.exit(1);
});
