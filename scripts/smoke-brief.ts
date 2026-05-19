/**
 * Step 2 smoke test — full pipeline through brief extraction.
 *
 * Path:
 *   1. Reads FeedbackMind.docx + sample-repo files locally.
 *   2. Routes through parsers + aggregator (Step 1).
 *   3. Calls extractBrief + extractVisualIdentity directly (skips
 *      autoBrandKit so we don't pollute the DB on every smoke run).
 *
 * Run with: `node --conditions=react-server --import tsx scripts/smoke-brief.ts`
 *
 * Requires OPENAI_API_KEY in .env.local. Cost: ~5-15¢ depending on
 * bundle size + whether the bundle has images (vision pass is the
 * expensive piece).
 */

import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

async function main() {
  const { aggregate } = await import('../src/server/ingest/aggregate');
  const { routeAndParse } = await import('../src/server/ingest/dispatch');
  const { extractBrief } = await import('../src/server/ingest/extractBrief');
  const { extractVisualIdentity } = await import('../src/server/ingest/extractVisualIdentity');

  const SAMPLES_DIR = path.resolve(__dirname, '..', 'planning', 'sample-inputs');

  const ingestionId = `smoke-brief-${Date.now()}`;
  const userId = 'smoke';
  const extractedPrefix = `uploads/${userId}/${ingestionId}/extracted`;

  const ctx = {
    userId,
    ingestionId,
    extractedPrefix,
    routeAndParse: async (input: { filename: string; mime: string | null; buffer: Buffer }) =>
      routeAndParse({ ...input, ctx }),
  };

  // Parse FeedbackMind + sample-repo (mimics a realistic autopilot upload).
  const parsed = [];
  const feedbackBuf = await readFile(path.join(SAMPLES_DIR, 'FeedbackMind_Portfolio_Garcia.docx'));
  const feedback = await routeAndParse({
    filename: 'FeedbackMind_Portfolio_Garcia.docx',
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer: feedbackBuf,
    ctx,
  });
  if (feedback) parsed.push(feedback);

  const repoFiles = await flatRepoFiles(path.join(SAMPLES_DIR, 'sample-repo'));
  for (const entry of repoFiles) {
    const buf = await readFile(entry.fullPath);
    const result = await routeAndParse({
      filename: `sample-repo/${entry.relPath}`,
      mime: inferMime(entry.relPath),
      buffer: buf,
      ctx,
    });
    if (result) parsed.push(result);
  }

  const bundle = aggregate({ ingestionId, parsedFiles: parsed });
  console.log(
    `\nParsed bundle: ${bundle.textBlocks.length} blocks · ${bundle.images.length} images · ${bundle.codeContext.length} code-files`,
  );

  console.log('\n--- Extracting brief (gpt-5.5)... ---');
  const briefResult = await extractBrief({ bundle });
  console.log(`brief.costCents = ${briefResult.costCents}¢`);
  console.log(`brief.modelUsed = ${briefResult.modelUsed}`);
  console.log('\nProductBrief JSON:');
  console.log(JSON.stringify(briefResult.brief, null, 2));

  if (bundle.images.length > 0) {
    console.log('\n--- Vision pass (gpt-4o)... ---');
    const visionResult = await extractVisualIdentity({ images: bundle.images });
    console.log(
      `vision.costCents = ${visionResult.costCents}¢ · model=${visionResult.modelUsed} · images=${visionResult.imagesConsidered}`,
    );
    console.log('VisualIdentity:');
    console.log(JSON.stringify(visionResult.identity, null, 2));
  } else {
    console.log('\n--- No images in bundle, skipping vision pass ---');
  }
}

function inferMime(name: string): string | null {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'md') return 'text/markdown';
  if (ext === 'json') return 'application/json';
  if (ext === 'ts') return 'text/plain';
  return null;
}

async function flatRepoFiles(
  root: string,
  prefix = '',
): Promise<{ fullPath: string; relPath: string }[]> {
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
