import 'server-only';

/**
 * Shared types for the ingestion pipeline. Imported by every parser
 * module and by the aggregator + worker.
 *
 * Each parser exports `parse(buffer: Buffer, filename: string,
 * ctx?: ParseCtx): Promise<ParsedFile>`. `ParseCtx` carries the
 * upload-scoped data the parser needs to write extracted images /
 * keyframes into R2 under the right prefix.
 */

export interface ParsedTextBlock {
  /** Filename + optional locator suffix ("slide 3", "sheet 1 row 4"). */
  source: string;
  /** Optional heading text, when the parser preserves hierarchy. */
  heading?: string;
  /** Optional heading depth (1 = top). */
  headingLevel?: number;
  content: string;
}

export interface ParsedImage {
  source: string;
  /** R2 object key under uploads/{userId}/{ingestionId}/extracted/. */
  r2Key: string;
  mime: string;
  bytes: number;
  width?: number;
  height?: number;
  /** Dominant hex colors (up to 3) extracted via sharp.stats. */
  palette?: string[];
  /** Optional caption-source hint (e.g. "alt", "slide-3-image-2"). */
  hint?: string;
}

export interface ParsedTable {
  source: string;
  rows: string[][];
}

export interface ParsedCodeContext {
  filename: string;
  language: string;
  symbols: string[];
  topComments: string[];
  /** First ~MAX_REPO_LOC_PER_FILE lines, used by Step 2 to seed the
   *  brief. May be empty when the parser is processing only the
   *  README + manifest (repo summary mode). */
  bodyPreview?: string;
}

export interface ParsedFile {
  filename: string;
  /** Sum of all extracted text / image bytes attributed to this file.
   *  Lets the aggregator enforce MAX_BYTES_PER_INGESTION cleanly. */
  bytes: number;
  textBlocks: ParsedTextBlock[];
  images: ParsedImage[];
  tables?: ParsedTable[];
  codeContext?: ParsedCodeContext[];
  /** Set by parsers that hit MAX_TEXT_CHARS_PER_FILE or another cap.
   *  The aggregator surfaces this so the UI can warn. */
  truncated?: boolean;
}

/** Carried alongside parser calls so they can persist extracted images
 *  / keyframes into R2 under the right scoped prefix. */
export interface ParseCtx {
  userId: string;
  ingestionId: string;
  /** R2 prefix for extracted media. The worker computes this once and
   *  passes it down; parsers append a leaf (filename + sequence). */
  extractedPrefix: string;
  /** Recursive-dispatch hook the zip + repo parsers use to route
   *  nested files through the right parser without re-importing the
   *  whole router. Returns null for unsupported types. */
  routeAndParse: (input: {
    filename: string;
    mime: string | null;
    buffer: Buffer;
  }) => Promise<ParsedFile | null>;
}

/** What a parser exports. */
export type ParseFn = (buffer: Buffer, filename: string, ctx: ParseCtx) => Promise<ParsedFile>;
