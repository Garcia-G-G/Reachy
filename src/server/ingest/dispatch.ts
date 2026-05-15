import 'server-only';
import type { ParserKey } from '@/server/config/acceptedFileTypes';
import { routeFile } from '@/server/config/parserRouting';
import * as codeParser from './parsers/code';
import * as csvParser from './parsers/csv';
import * as docxParser from './parsers/docx';
import * as htmlParser from './parsers/html';
import * as imageParser from './parsers/image';
import * as jsonParser from './parsers/json';
import * as markdownParser from './parsers/markdown';
import * as mp4Parser from './parsers/mp4';
import * as pdfParser from './parsers/pdf';
import * as pptxParser from './parsers/pptx';
import * as repoParser from './parsers/repo';
import * as textParser from './parsers/text';
import * as xlsxParser from './parsers/xlsx';
import * as yamlParser from './parsers/yaml';
import * as zipParser from './parsers/zip';
import type { ParseCtx, ParsedFile, ParseFn } from './types';

/** Parser-key → parser-module table. Lives apart from acceptedFileTypes
 *  so the config layer stays free of runtime imports. */
const PARSERS: Record<ParserKey, { parse: ParseFn }> = {
  docx: docxParser,
  pdf: pdfParser,
  markdown: markdownParser,
  html: htmlParser,
  text: textParser,
  pptx: pptxParser,
  xlsx: xlsxParser,
  csv: csvParser,
  json: jsonParser,
  yaml: yamlParser,
  code: codeParser,
  image: imageParser,
  mp4: mp4Parser,
  zip: zipParser,
};

/** Used by parser ctx (`routeAndParse`) for recursive dispatch — the
 *  `repo` parser is intentionally separate, invoked by the worker
 *  layer with a synthesized buffer. We surface it here only for
 *  completeness so a future caller can ask for it by key. */
export function parserFor(key: ParserKey): ParseFn | null {
  if (key === ('repo' as ParserKey)) return repoParser.parse;
  return PARSERS[key]?.parse ?? null;
}

/** The shared route+parse hook every parser receives via ParseCtx.
 *  Returns null for files the routing table can't place — those are
 *  surfaced in the aggregator's `fileTypeMix` under `unknown` so the
 *  user sees what got skipped. */
export async function routeAndParse(args: {
  filename: string;
  mime: string | null;
  buffer: Buffer;
  ctx: ParseCtx;
}): Promise<ParsedFile | null> {
  const key = routeFile({ filename: args.filename, mime: args.mime });
  if (!key) return null;
  const parser = parserFor(key);
  if (!parser) return null;
  return parser(args.buffer, args.filename, args.ctx);
}
