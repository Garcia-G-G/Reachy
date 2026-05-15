import 'server-only';
import {
  ACCEPTED_TYPES,
  lookupByExtension,
  lookupByMime,
  type ParserKey,
} from './acceptedFileTypes';

/**
 * Resolve a file (mime + filename) to the parser module key responsible
 * for it. Cannot be derived from mime alone — uploads commonly arrive
 * with `application/octet-stream` (browsers can't determine the mime
 * for unknown extensions); we fall back to the extension.
 *
 * Order of resolution:
 *   1. Exact extension match (most reliable: `.docx`, `.pptx`, etc.)
 *   2. Exact mime match (for uploads where the browser sniffed correctly)
 *   3. Soft mime prefix match (image/*, video/*) routing to the
 *      catch-all parsers (`image`, `mp4`)
 *   4. Null → file is rejected at the worker boundary with a
 *      "no parser for this type" error in IngestedBundle.fileTypeMix.
 */

export function routeFile(input: {
  filename: string;
  mime: string | null | undefined;
}): ParserKey | null {
  const ext = input.filename.split('.').pop()?.toLowerCase() ?? '';
  const byExt = lookupByExtension(ext);
  if (byExt) return byExt.parser;

  if (input.mime) {
    const byMime = lookupByMime(input.mime);
    if (byMime) return byMime.parser;

    const prefix = input.mime.split('/', 1)[0]?.toLowerCase();
    if (prefix === 'image') return 'image';
    if (prefix === 'video') return 'mp4';
    if (prefix === 'text') return 'text';
  }

  return null;
}

/** Convenience set of every supported extension, for fast inclusion
 *  checks inside the repo / zip recursion. */
export const SUPPORTED_EXTENSIONS: readonly string[] = ACCEPTED_TYPES.map((t) => t.extension);
