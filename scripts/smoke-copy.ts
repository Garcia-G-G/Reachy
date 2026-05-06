import { config as loadEnv } from 'dotenv';
import { eq } from 'drizzle-orm';

loadEnv({ path: '.env.local' });

// Imports are dynamic to ensure dotenv has loaded before env validation runs.
async function main() {
  const { db } = await import('@/server/db/client');
  const { project } = await import('@/server/db/schema/projects');
  const { brandKit } = await import('@/server/db/schema/brandKits');
  const { asset } = await import('@/server/db/schema/assets');
  const { generation } = await import('@/server/db/schema/generations');
  const { generateCopy } = await import('@/server/ai/copyGen');

  const slug = process.env.SMOKE_PROJECT_SLUG ?? 'saas-tracker';
  const format = (process.env.SMOKE_FORMAT ?? 'tweet') as
    | 'tweet'
    | 'thread'
    | 'linkedin'
    | 'ig-caption'
    | 'email-subject'
    | 'email-body'
    | 'headline'
    | 'features'
    | 'how-it-works';
  const idea =
    process.env.SMOKE_IDEA ??
    'Announce that v2 ships in May, with focus on a 3x speed gain over the previous release.';

  const [proj] = await db.select().from(project).where(eq(project.slug, slug)).limit(1);
  if (!proj) {
    console.error(`No project with slug '${slug}'. Set SMOKE_PROJECT_SLUG=<slug> or create one.`);
    process.exit(1);
  }
  console.log('project:', proj.id, proj.name);

  const [kit] = await db.select().from(brandKit).where(eq(brandKit.projectId, proj.id)).limit(1);

  console.log(`format=${format} idea="${idea}"`);
  console.log('calling OpenAI...');
  const t0 = Date.now();

  let result: Awaited<ReturnType<typeof generateCopy>>;
  try {
    result = await generateCopy({
      format,
      idea,
      project: {
        name: proj.name,
        audience: proj.audience,
        tone: proj.tone,
        description: proj.description,
        websiteUrl: proj.websiteUrl,
      },
      brandKit: kit ?? null,
      promptLanguage: 'en',
      temperature: 0.7,
    });
  } catch (err) {
    console.error('FAILED:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  const took = Math.round((Date.now() - t0) / 100) / 10;
  console.log(`done in ${took}s — model=${result.model} cost=${result.costCents}¢`);
  console.log(
    `tokens: prompt=${result.usage.promptTokens} completion=${result.usage.completionTokens}`,
  );
  console.log('--- ES ---');
  console.log(
    typeof result.payload.es === 'string'
      ? result.payload.es
      : JSON.stringify(result.payload.es, null, 2),
  );
  console.log('--- EN ---');
  console.log(
    typeof result.payload.en === 'string'
      ? result.payload.en
      : JSON.stringify(result.payload.en, null, 2),
  );

  // Insert generation + assets to mirror the action's persistence.
  const [gen] = await db
    .insert(generation)
    .values({
      projectId: proj.id,
      type: 'copy',
      format,
      status: 'done',
      provider: 'openai',
      model: result.model,
      prompt: result.userPrompt,
      params: {
        idea,
        promptLanguage: 'en',
        systemPrompt: result.systemPrompt,
        usage: result.usage,
      },
      costCents: result.costCents,
      finishedAt: new Date(),
    })
    .returning();
  if (!gen) throw new Error('failed to insert generation');

  await db.insert(asset).values([
    {
      generationId: gen.id,
      projectId: proj.id,
      kind: 'copy',
      format,
      language: 'es',
      text:
        typeof result.payload.es === 'string'
          ? result.payload.es
          : JSON.stringify(result.payload.es),
    },
    {
      generationId: gen.id,
      projectId: proj.id,
      kind: 'copy',
      format,
      language: 'en',
      text:
        typeof result.payload.en === 'string'
          ? result.payload.en
          : JSON.stringify(result.payload.en),
    },
  ]);

  console.log(`persisted: generation=${gen.id} (2 assets)`);
  process.exit(0);
}

main().catch((err) => {
  console.error('fatal:', err);
  process.exit(1);
});
