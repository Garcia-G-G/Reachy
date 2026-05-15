/**
 * Step 3 smoke test — full pipeline through campaign planning.
 *
 * Path:
 *   1. Reads FeedbackMind.docx + sample-repo, parses via Step 1.
 *   2. Calls extractBrief (Step 2) for the ProductBrief.
 *   3. Calls planCampaign (Step 3) with that brief.
 *
 * Bypasses autoBrandKit / DB writes so the smoke doesn't pollute
 * the database. Run with:
 *   node --conditions=react-server --import tsx scripts/smoke-campaign.ts
 *
 * Cost: ~10-15¢ (parser is free, brief ~7¢, planner ~3-5¢).
 */

import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

async function main() {
  const { aggregate } = await import('../src/server/ingest/aggregate');
  const { routeAndParse } = await import('../src/server/ingest/dispatch');
  const { extractBrief } = await import('../src/server/ingest/extractBrief');
  const { planCampaign, estimateSlateCostCents } = await import(
    '../src/server/ingest/planCampaign'
  );

  const SAMPLES_DIR = path.resolve(__dirname, '..', 'planning', 'sample-inputs');
  const ingestionId = `smoke-campaign-${Date.now()}`;
  const userId = 'smoke';

  const ctx = {
    userId,
    ingestionId,
    extractedPrefix: `uploads/${userId}/${ingestionId}/extracted`,
    routeAndParse: async (input: { filename: string; mime: string | null; buffer: Buffer }) =>
      routeAndParse({ ...input, ctx }),
  };

  const parsed: Awaited<ReturnType<typeof routeAndParse>>[] = [];
  const feedbackBuf = await readFile(path.join(SAMPLES_DIR, 'FeedbackMind_Portfolio_Garcia.docx'));
  parsed.push(
    await routeAndParse({
      filename: 'FeedbackMind_Portfolio_Garcia.docx',
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer: feedbackBuf,
      ctx,
    }),
  );

  const repoFiles = await flatRepoFiles(path.join(SAMPLES_DIR, 'sample-repo'));
  for (const entry of repoFiles) {
    const buf = await readFile(entry.fullPath);
    parsed.push(
      await routeAndParse({
        filename: `sample-repo/${entry.relPath}`,
        mime: inferMime(entry.relPath),
        buffer: buf,
        ctx,
      }),
    );
  }

  const realParsed = parsed.filter((p) => p !== null) as NonNullable<typeof parsed[number]>[];
  const bundle = aggregate({ ingestionId, parsedFiles: realParsed });
  console.log(`Bundle: ${bundle.textBlocks.length} blocks · ${bundle.images.length} images`);

  console.log('\n--- Step 2: extractBrief (gpt-5.5)... ---');
  const briefResult = await extractBrief({ bundle });
  console.log(`brief cost: ${briefResult.costCents}¢ · model: ${briefResult.modelUsed}`);

  console.log('\n--- Step 3: planCampaign (gpt-5.5)... ---');
  const planResult = await planCampaign({ brief: briefResult.brief });
  console.log(`planner cost: ${planResult.costCents}¢ · model: ${planResult.modelUsed}`);
  console.log(`plan: ${planResult.plan.assets.length} assets`);
  console.log(`rationale: ${planResult.plan.rationale}`);
  console.log(`estimated cost: ${planResult.plan.estimatedCostCents}¢ ($${(planResult.plan.estimatedCostCents / 100).toFixed(2)})`);
  console.log(`estimated duration: ${planResult.plan.estimatedDurationMinutes} min`);

  console.log('\n--- ASSETS ---');
  for (const [i, a] of planResult.plan.assets.entries()) {
    if (a.kind === 'image') {
      console.log(`${i + 1}. [image] ${a.format} · ${a.layoutId} · ${a.visualStyle}`);
    } else if (a.kind === 'copy') {
      console.log(`${i + 1}. [copy ] ${a.channel}${a.targetWordCount ? ` · ${a.targetWordCount}w` : ''}`);
    } else {
      console.log(`${i + 1}. [reel ] ${a.durationSec}s · ${a.visualStyle}`);
    }
    console.log(`     brief: ${a.brief}`);
  }

  // Simulate skipping 3 assets to verify cost recompute.
  const without3 = planResult.plan.assets.slice(3);
  const reducedCost = estimateSlateCostCents(without3);
  console.log(
    `\nIf the first 3 assets are skipped: ${without3.length} active · ~$${(reducedCost / 100).toFixed(2)} (was $${(planResult.plan.estimatedCostCents / 100).toFixed(2)})`,
  );
}

function inferMime(name: string): string | null {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'md') return 'text/markdown';
  if (ext === 'json') return 'application/json';
  if (ext === 'ts') return 'text/plain';
  return null;
}

async function flatRepoFiles(root: string, prefix = ''): Promise<{ fullPath: string; relPath: string }[]> {
  const out: { fullPath: string; relPath: string }[] = [];
  const entries = await readdir(root, { withFileTypes: true });
  for (const e of entries) {
    if (e.isDirectory()) {
      out.push(...(await flatRepoFiles(path.join(root, e.name), `${prefix}${e.name}/`)));
    } else if (e.isFile()) {
      out.push({ fullPath: path.join(root, e.name), relPath: `${prefix}${e.name}` });
    }
  }
  return out;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
