import 'server-only';
import { DEDUP_HASH_PREFIX_LEN } from '@/server/config/parserLimits';
import type { ParsedFile } from './types';
import { hashContent } from './util';

/**
 * Aggregate a list of ParsedFile (one per upload entry) into a single
 * IngestedBundle. Cross-file deduplication folds identical text-block
 * content into one entry; near-duplicate detection (Jaccard over
 * tokenized words) flags but keeps both copies so Step 2 can see the
 * disagreement.
 */

export interface BundleTextBlock {
  /** Source-tagged origin (filename + locator). */
  source: string;
  heading?: string;
  headingLevel?: number;
  content: string;
  /** Short SHA-256 prefix — used for dedup. */
  hash: string;
  /** Other sources that produced an IDENTICAL block (same hash).
   *  Populated only on the surviving copy after dedup; the duplicates
   *  themselves are removed. */
  duplicateSources?: string[];
  /** Other sources that produced a NEAR-duplicate block (Jaccard
   *  above NEAR_DUP_THRESHOLD). Both blocks survive; this field on
   *  each block points to the other(s). */
  nearDuplicateSources?: string[];
}

export interface BundleHeading {
  source: string;
  level: number;
  text: string;
}

export interface BundleImage {
  source: string;
  r2Key: string;
  mime: string;
  bytes: number;
  width?: number;
  height?: number;
  palette?: string[];
  hint?: string;
}

export interface BundleTable {
  source: string;
  rows: string[][];
}

export interface BundleCodeSummary {
  filename: string;
  language: string;
  symbols: string[];
  topComments: string[];
  bodyPreview?: string;
}

export interface IngestedBundle {
  ingestionId: string;
  textBlocks: BundleTextBlock[];
  headings: BundleHeading[];
  images: BundleImage[];
  tables: BundleTable[];
  codeContext: BundleCodeSummary[];
  totalSizeBytes: number;
  fileTypeMix: Record<string, number>;
  /** Files we received but couldn't parse (no matching route). The
   *  worker still records these so the user can see what got skipped. */
  unparsedFiles?: string[];
  /** Set when any parser hit a per-file truncation cap. */
  truncated?: boolean;
}

/** Jaccard-similarity threshold above which two blocks are flagged as
 *  near-duplicates (but both kept). Tuned so paraphrases register but
 *  generic boilerplate ("Posted on Monday") doesn't trigger across an
 *  entire ingestion. */
const NEAR_DUP_THRESHOLD = 0.85;
/** Minimum content length to qualify for near-dup analysis. Short
 *  strings produce noisy Jaccard scores. */
const NEAR_DUP_MIN_CHARS = 60;

function tokenize(content: string): Set<string> {
  return new Set(
    content
      .toLowerCase()
      .replace(/[^a-z0-9áéíóúñü ]+/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 3),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const t of a) if (b.has(t)) intersection += 1;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function aggregate(args: {
  ingestionId: string;
  parsedFiles: ParsedFile[];
  unparsedFiles?: string[];
}): IngestedBundle {
  const { ingestionId, parsedFiles, unparsedFiles } = args;

  // Flatten text blocks with stable hashes.
  type WithHash = BundleTextBlock & { _tokens?: Set<string> };
  const allBlocks: WithHash[] = [];
  for (const parsed of parsedFiles) {
    for (const block of parsed.textBlocks) {
      const trimmed = block.content.trim();
      if (trimmed.length === 0) continue;
      allBlocks.push({
        source: block.source,
        heading: block.heading,
        headingLevel: block.headingLevel,
        content: trimmed,
        hash: hashContent(trimmed),
      });
    }
  }

  // Exact dedup by hash — first occurrence survives and accumulates
  // duplicateSources from the rest.
  const seenHash = new Map<string, WithHash>();
  for (const b of allBlocks) {
    const existing = seenHash.get(b.hash);
    if (!existing) {
      seenHash.set(b.hash, b);
      continue;
    }
    existing.duplicateSources = [...(existing.duplicateSources ?? []), b.source];
  }
  const dedupedBlocks = [...seenHash.values()];

  // Near-dup detection — only across blocks long enough to be informative.
  const longEnough = dedupedBlocks.filter((b) => b.content.length >= NEAR_DUP_MIN_CHARS);
  for (const b of longEnough) {
    b._tokens = tokenize(b.content);
  }
  for (let i = 0; i < longEnough.length; i++) {
    const a = longEnough[i];
    if (!a) continue;
    for (let j = i + 1; j < longEnough.length; j++) {
      const c = longEnough[j];
      if (!c) continue;
      // Skip pairs from the same source — same-source repetitions are
      // a different signal we may want later (table-of-contents echoes,
      // etc.) and would inflate the near-dup count here.
      if (a.source === c.source) continue;
      const aTokens = a._tokens ?? new Set<string>();
      const cTokens = c._tokens ?? new Set<string>();
      const sim = jaccard(aTokens, cTokens);
      if (sim >= NEAR_DUP_THRESHOLD) {
        a.nearDuplicateSources = [...(a.nearDuplicateSources ?? []), c.source];
        c.nearDuplicateSources = [...(c.nearDuplicateSources ?? []), a.source];
      }
    }
  }
  for (const b of longEnough) b._tokens = undefined;

  // Headings (preserved across files in original order).
  const headings: BundleHeading[] = [];
  for (const parsed of parsedFiles) {
    for (const block of parsed.textBlocks) {
      if (block.heading && block.headingLevel != null) {
        headings.push({
          source: block.source,
          level: block.headingLevel,
          text: block.heading,
        });
      }
    }
  }

  // Images, tables, codeContext.
  const images: BundleImage[] = [];
  const tables: BundleTable[] = [];
  const codeContext: BundleCodeSummary[] = [];
  let truncated = false;
  for (const parsed of parsedFiles) {
    if (parsed.truncated) truncated = true;
    for (const img of parsed.images) {
      images.push({
        source: img.source,
        r2Key: img.r2Key,
        mime: img.mime,
        bytes: img.bytes,
        width: img.width,
        height: img.height,
        palette: img.palette,
        hint: img.hint,
      });
    }
    if (parsed.tables) {
      for (const t of parsed.tables) tables.push({ source: t.source, rows: t.rows });
    }
    if (parsed.codeContext) {
      for (const c of parsed.codeContext) {
        codeContext.push({
          filename: c.filename,
          language: c.language,
          symbols: c.symbols,
          topComments: c.topComments,
          bodyPreview: c.bodyPreview,
        });
      }
    }
  }

  // File-type mix — keyed by lowercase extension. `unknown` bucket
  // catches anything the routing table couldn't place.
  const fileTypeMix: Record<string, number> = {};
  for (const parsed of parsedFiles) {
    const ext = parsed.filename.split('.').pop()?.toLowerCase() ?? 'unknown';
    fileTypeMix[ext] = (fileTypeMix[ext] ?? 0) + 1;
  }
  if (unparsedFiles && unparsedFiles.length > 0) {
    fileTypeMix.unknown = (fileTypeMix.unknown ?? 0) + unparsedFiles.length;
  }

  const totalSizeBytes = parsedFiles.reduce((acc, p) => acc + p.bytes, 0);

  // Strip the internal _tokens scratch field before returning.
  const finalBlocks: BundleTextBlock[] = dedupedBlocks.map(({ _tokens: _unused, ...rest }) => {
    void _unused;
    return rest;
  });

  return {
    ingestionId,
    textBlocks: finalBlocks,
    headings,
    images,
    tables,
    codeContext,
    totalSizeBytes,
    fileTypeMix,
    unparsedFiles: unparsedFiles && unparsedFiles.length > 0 ? unparsedFiles : undefined,
    truncated: truncated || undefined,
  };
}

export const AGGREGATE_THRESHOLDS = {
  nearDupThreshold: NEAR_DUP_THRESHOLD,
  nearDupMinChars: NEAR_DUP_MIN_CHARS,
  hashPrefixLen: DEDUP_HASH_PREFIX_LEN,
} as const;
