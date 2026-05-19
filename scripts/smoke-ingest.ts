/**
 * Direct parser smoke test — bypasses R2 + BullMQ + the upload UI so
 * we can verify the parser modules + aggregator produce the right
 * IngestedBundle shape on the synthetic sample fixtures.
 *
 * Run with: `pnpm exec tsx scripts/smoke-ingest.ts`
 *
 * Important: this DOES NOT exercise R2 image upload (parsers that
 * call persistExtractedImage will short-circuit unless R2 is
 * configured; with R2 env set the smoke writes real objects under
 * uploads/smoke/<id>/extracted). The PURPOSE here is to assert the
 * bundle JSON shape, not the storage path.
 */

import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

async function main() {
  // Dynamic imports so dotenv loads before src/env.ts runs.
  const { aggregate } = await import('../src/server/ingest/aggregate');
  const { routeAndParse } = await import('../src/server/ingest/dispatch');

  const SAMPLES_DIR = path.resolve(__dirname, '..', 'planning', 'sample-inputs');
  const FILES = ['FeedbackMind_Portfolio_Garcia.docx', 'sample.pptx', 'sample.xlsx'] as const;

  const ingestionId = `smoke-${Date.now()}`;
  const userId = 'smoke';
  const extractedPrefix = `uploads/${userId}/${ingestionId}/extracted`;

  const ctx = {
    userId,
    ingestionId,
    extractedPrefix,
    routeAndParse: async (input: { filename: string; mime: string | null; buffer: Buffer }) => {
      return routeAndParse({
        filename: input.filename,
        mime: input.mime,
        buffer: input.buffer,
        ctx,
      });
    },
  };

  const parsed = [];
  for (const name of FILES) {
    const buf = await readFile(path.join(SAMPLES_DIR, name));
    const mime = inferMime(name);
    const result = await routeAndParse({ filename: name, mime, buffer: buf, ctx });
    if (!result) {
      console.error(`no parser route for ${name}`);
      continue;
    }
    parsed.push(result);
    console.log(
      `${name} → ${result.textBlocks.length} blocks · ${result.images.length} images · ${result.tables?.length ?? 0} tables`,
    );
  }

  // Repo sample — recurse the folder manually since the action flattens
  // the FileList into individual files. Skip skipped names.
  const repoDir = path.join(SAMPLES_DIR, 'sample-repo');
  const repoEntries = await flatRepoFiles(repoDir);
  for (const entry of repoEntries) {
    const buf = await readFile(entry.fullPath);
    const result = await routeAndParse({
      filename: `sample-repo/${entry.relPath}`,
      mime: inferMime(entry.relPath),
      buffer: buf,
      ctx,
    });
    if (!result) continue;
    parsed.push(result);
    console.log(
      `sample-repo/${entry.relPath} → ${result.textBlocks.length} blocks · ${result.codeContext?.length ?? 0} code-files`,
    );
  }

  const bundle = aggregate({ ingestionId, parsedFiles: parsed });

  // Truncate textBlocks' content to 80 chars so the JSON is readable
  // when printed; keep the shape intact.
  const printable = {
    ...bundle,
    textBlocks: bundle.textBlocks.slice(0, 12).map((b) => ({
      ...b,
      content: b.content.length > 80 ? `${b.content.slice(0, 80)}…` : b.content,
    })),
    textBlocksTotal: bundle.textBlocks.length,
    images: bundle.images.map((i) => ({
      source: i.source,
      r2Key: i.r2Key,
      bytes: i.bytes,
      width: i.width,
      height: i.height,
      palette: i.palette,
    })),
    codeContext: bundle.codeContext.map((c) => ({
      filename: c.filename,
      language: c.language,
      symbols: c.symbols,
      topComments: c.topComments.slice(0, 3),
    })),
  };
  console.log('\nBUNDLE SHAPE:');
  console.log(JSON.stringify(printable, null, 2));
}

function inferMime(name: string): string | null {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'docx')
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (ext === 'pptx')
    return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  if (ext === 'xlsx') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
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
