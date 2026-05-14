import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

const DEMO_LINES = [
  'Marketing real para apps reales.',
  'Subes tu marca; Reachy hace el resto.',
  'Este video lo armó la app misma.',
  '¿Cazaste el truco, Gerardo? Esto es Reachy.',
] as const;

/**
 * One-shot Sora style sample renderer. Builds a synthetic informative-25s
 * plan with the demo Gerardo script + the visualStyle of your choice, then
 * enqueues directly into the video worker — bypassing the brand kit so we
 * can test multiple styles without re-editing Identity between renders.
 *
 * Usage:  tsx scripts/render-style-sample.ts <visualStyle> [projectSlug]
 *   e.g.  tsx scripts/render-style-sample.ts flat-2d reachy
 *
 * Cost per run: ~$3.65 (Sora 2 Pro 720p × 12s + ElevenLabs/OpenAI TTS + compose).
 * Each run creates a new generation row; the worker rejects duplicates by jobId.
 */
async function main() {
  const styleArg = process.argv[2];
  const slug = process.argv[3] ?? 'reachy';
  const validStyles = [
    'editorial',
    'paper-cutout',
    'flat-2d',
    'infographic',
    'isometric',
    'abstract',
  ] as const;
  if (!styleArg || !(validStyles as readonly string[]).includes(styleArg)) {
    console.error(
      `Usage: tsx scripts/render-style-sample.ts <${validStyles.join('|')}> [projectSlug]`,
    );
    process.exit(1);
  }
  const visualStyle = styleArg as (typeof validStyles)[number];

  const { and, eq, isNull } = await import('drizzle-orm');
  const { db } = await import('../src/server/db/client');
  const { brandKit } = await import('../src/server/db/schema/brandKits');
  const { generation } = await import('../src/server/db/schema/generations');
  const { project } = await import('../src/server/db/schema/projects');
  const { getVideoQueue } = await import('../src/server/jobs/videoQueue');
  const { REEL_TEMPLATES } = await import('../src/lib/reel-templates');
  type ReelPlan = import('../src/lib/reel-templates').ReelPlan;
  type PlannedScene = import('../src/lib/reel-templates').PlannedScene;

  const [proj] = await db
    .select()
    .from(project)
    .where(and(eq(project.slug, slug), isNull(project.archivedAt)))
    .limit(1);
  if (!proj) {
    console.error(`No project with slug=${slug}`);
    process.exit(1);
  }

  const [kit] = await db.select().from(brandKit).where(eq(brandKit.projectId, proj.id)).limit(1);
  const brandColorHex = kit?.primaryColor ?? '#14110D';
  const brandTextHex = kit?.bgColor ?? '#F1EBDF';

  // informative-25s scene shape, hardcoded so we don't depend on the planner.
  // imagePrompt is intentionally empty — runSoraOneShot builds the master
  // Sora prompt from style.promptMotion + the scene texts, not from per-scene
  // imagePrompts. The FFmpeg overlay path uses scene.text directly.
  const tpl = REEL_TEMPLATES['informative-25s'];
  if (tpl.scenes.length !== DEMO_LINES.length) {
    console.error(
      `Demo line count (${DEMO_LINES.length}) doesn't match informative-25s scene count (${tpl.scenes.length})`,
    );
    process.exit(1);
  }
  const scenes: PlannedScene[] = tpl.scenes.map((s, i) => ({
    slot: s.slot,
    durationSec: s.durationSec,
    text: DEMO_LINES[i] ?? '',
    textPosition: s.textPosition,
    imagePrompt: '',
    background: s.background ?? 'image',
  }));
  const plan: ReelPlan = {
    template: 'informative-25s',
    tagline: `Sora style sample · ${visualStyle}`,
    scenes,
    language: 'es',
  };

  const engine = 'sora-pro-720p' as const;
  const [gen] = await db
    .insert(generation)
    .values({
      projectId: proj.id,
      type: 'video',
      format: 'informative-25s',
      status: 'queued',
      provider: 'openai',
      model: 'sora-2-pro',
      prompt: plan.tagline,
      params: { engine, plan },
    })
    .returning();
  if (!gen) {
    console.error('insert generation failed');
    process.exit(1);
  }

  const queue = getVideoQueue();
  await queue.add(
    'compose',
    {
      generationId: gen.id,
      projectId: proj.id,
      projectSlug: proj.slug,
      engine,
      plan,
      brandColorHex,
      brandTextHex,
      visualStyle,
    },
    { jobId: gen.id },
  );

  console.log(`Enqueued generation ${gen.id}`);
  console.log(`  project: ${proj.slug} (${proj.id})`);
  console.log(`  engine: ${engine}`);
  console.log(`  visualStyle: ${visualStyle}`);
  console.log(`  expected cost: ~$3.65 (Sora $3.60 + TTS + compose)`);
  console.log(`  wall-clock ETA: ~10–13 min for Sora Pro 720p`);
  await queue.close();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
