import 'server-only';
import AdmZip from 'adm-zip';
import { shouldSkipName } from '@/server/config/codeLanguages';
import { MAX_BYTES_PER_FILE, MAX_FILES_PER_INGESTION } from '@/server/config/parserLimits';
import type { ParseCtx, ParsedFile } from '../types';

/** Recursive parser for .zip uploads. Dispatches every contained file
 *  through the caller-provided routeAndParse hook so each nested type
 *  ends up at the right parser. Skips standard junk dirs (node_modules,
 *  .git, etc.) and lockfiles via codeLanguages.shouldSkipName. */
export async function parse(buffer: Buffer, filename: string, ctx: ParseCtx): Promise<ParsedFile> {
  const zip = new AdmZip(buffer);
  const entries = zip.getEntries();

  const combinedText: ParsedFile['textBlocks'] = [];
  const combinedImages: ParsedFile['images'] = [];
  const combinedTables: ParsedFile['tables'] = [];
  const combinedCode: ParsedFile['codeContext'] = [];

  let count = 0;
  let truncated = false;
  let totalBytes = 0;

  for (const entry of entries) {
    if (entry.isDirectory) continue;
    if (count >= MAX_FILES_PER_INGESTION) {
      truncated = true;
      break;
    }
    const entryName = entry.entryName;
    const parts = entryName.split('/');
    if (parts.some((p) => shouldSkipName(p))) continue;
    const data = entry.getData();
    if (!data || data.length === 0) continue;
    if (data.length > MAX_BYTES_PER_FILE) {
      // Skip oversized entries silently; the worker also tracks this at
      // the ingestion level and would have failed earlier on overall
      // size. Logging is the worker's job, not the parser's.
      continue;
    }
    const inferredMime = inferMime(entryName);
    const nested = await ctx.routeAndParse({
      filename: `${filename}!${entryName}`,
      mime: inferredMime,
      buffer: data,
    });
    if (!nested) continue;
    combinedText.push(...nested.textBlocks);
    combinedImages.push(...nested.images);
    if (nested.tables && nested.tables.length > 0) combinedTables.push(...nested.tables);
    if (nested.codeContext && nested.codeContext.length > 0)
      combinedCode.push(...nested.codeContext);
    if (nested.truncated) truncated = true;
    totalBytes += nested.bytes;
    count += 1;
  }

  return {
    filename,
    bytes: totalBytes,
    textBlocks: combinedText,
    images: combinedImages,
    tables: combinedTables.length > 0 ? combinedTables : undefined,
    codeContext: combinedCode.length > 0 ? combinedCode : undefined,
    truncated: truncated || undefined,
  };
}

function inferMime(name: string): string | null {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'mp4') return 'video/mp4';
  if (ext === 'mov') return 'video/quicktime';
  if (ext === 'csv') return 'text/csv';
  if (ext === 'json') return 'application/json';
  if (ext === 'yaml' || ext === 'yml') return 'application/yaml';
  if (ext === 'html' || ext === 'htm') return 'text/html';
  if (ext === 'md' || ext === 'mdx') return 'text/markdown';
  if (ext === 'docx') {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  if (ext === 'pptx') {
    return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  }
  if (ext === 'xlsx') {
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  }
  return null;
}
