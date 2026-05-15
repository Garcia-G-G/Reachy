import 'server-only';
import { languageLabel, shouldSkipName } from '@/server/config/codeLanguages';
import { MAX_REPO_LOC_PER_FILE } from '@/server/config/parserLimits';
import { MAX_SYMBOLS_PER_FILE, SYMBOL_PATTERNS } from '@/server/config/symbolPatterns';
import type { ParseCtx, ParsedCodeContext, ParsedFile } from '../types';
import { clipText } from '../util';

/** Extract top-of-file comments — anything before the first non-comment,
 *  non-blank line. Supports //-line, /* … * /, #-line, and """…""". */
function extractTopComments(source: string): string[] {
  const lines = source.split(/\r?\n/);
  const out: string[] = [];
  let inBlock = false;
  let inPyDoc = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      if (out.length === 0) continue;
      break;
    }
    if (inBlock) {
      out.push(trimmed.replace(/^\*\s?/, ''));
      if (trimmed.endsWith('*/')) inBlock = false;
      continue;
    }
    if (inPyDoc) {
      out.push(trimmed);
      if (trimmed.endsWith('"""') && trimmed !== '"""') inPyDoc = false;
      continue;
    }
    if (trimmed.startsWith('//')) {
      out.push(trimmed.replace(/^\/\/\s?/, ''));
      continue;
    }
    if (trimmed.startsWith('#') && !trimmed.startsWith('#!/')) {
      out.push(trimmed.replace(/^#\s?/, ''));
      continue;
    }
    if (trimmed.startsWith('/*')) {
      out.push(trimmed.replace(/^\/\*\s?\*?\s?/, ''));
      if (!trimmed.endsWith('*/')) inBlock = true;
      continue;
    }
    if (trimmed.startsWith('"""') || trimmed.startsWith("'''")) {
      out.push(trimmed.replace(/^["']{3}\s?/, ''));
      if (!trimmed.endsWith('"""') || trimmed.length <= 3) inPyDoc = true;
      continue;
    }
    break;
  }
  // Filter out shebangs we accidentally captured + clip count.
  return out.filter((l) => !l.startsWith('!/usr')).slice(0, 12);
}

function extractSymbols(language: string, source: string): string[] {
  const patterns = SYMBOL_PATTERNS[language];
  if (!patterns) return [];
  const symbols = new Set<string>();
  for (const { pattern } of patterns) {
    // Clone the regex so resetting lastIndex doesn't race in concurrent
    // worker contexts — the SYMBOL_PATTERNS entries are global regexes.
    const re = new RegExp(pattern.source, pattern.flags);
    let match = re.exec(source);
    while (match !== null) {
      if (match[1]) symbols.add(match[1]);
      if (symbols.size >= MAX_SYMBOLS_PER_FILE) break;
      match = re.exec(source);
    }
    if (symbols.size >= MAX_SYMBOLS_PER_FILE) break;
  }
  return [...symbols];
}

export async function parse(buffer: Buffer, filename: string, _ctx: ParseCtx): Promise<ParsedFile> {
  const basename = filename.split('/').pop() ?? filename;
  if (shouldSkipName(basename)) {
    return { filename, bytes: 0, textBlocks: [], images: [] };
  }
  const ext = basename.split('.').pop()?.toLowerCase() ?? '';
  const language = languageLabel(ext);
  if (!language) {
    // Unknown source-code extension — fall through to text parsing so
    // the content is still ingested (just without language metadata).
    const raw = buffer.toString('utf-8');
    const { text, truncated } = clipText(raw);
    return {
      filename,
      bytes: buffer.byteLength,
      textBlocks: text.trim().length > 0 ? [{ source: filename, content: text }] : [],
      images: [],
      truncated,
    };
  }
  const raw = buffer.toString('utf-8');
  const topComments = extractTopComments(raw);
  const symbols = extractSymbols(language, raw);
  const bodyLines = raw.split(/\r?\n/).slice(0, MAX_REPO_LOC_PER_FILE);
  const bodyPreview = bodyLines.join('\n');

  const codeContext: ParsedCodeContext = {
    filename,
    language,
    symbols,
    topComments,
    bodyPreview,
  };

  // Build a text block summarizing the file so downstream steps that
  // operate on textBlocks (planner, brief extractor) see the file too.
  const summary = [
    `[${language}] ${filename}`,
    topComments.length > 0 ? `// ${topComments.join(' ')}` : '',
    symbols.length > 0 ? `Exports: ${symbols.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  return {
    filename,
    bytes: buffer.byteLength,
    textBlocks: summary.length > 0 ? [{ source: filename, content: summary }] : [],
    images: [],
    codeContext: [codeContext],
  };
}
