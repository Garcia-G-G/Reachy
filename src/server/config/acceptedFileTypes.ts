import 'server-only';
import { CODE_LANGUAGES } from './codeLanguages';

/**
 * Allowlist of upload-accepted file types, joined to their parser module.
 *
 * Cannot be derived: the set of supported types is a product decision,
 * not a fact the runtime can compute. The upload <input> element reads
 * this to set the `accept` attribute; the action and worker also read
 * this to reject non-allow-listed files at upload time.
 *
 * `parser` MUST match a key in src/server/config/parserRouting.ts.
 */

export type ParserKey =
  | 'docx'
  | 'pdf'
  | 'markdown'
  | 'html'
  | 'text'
  | 'pptx'
  | 'xlsx'
  | 'csv'
  | 'json'
  | 'yaml'
  | 'code'
  | 'image'
  | 'mp4'
  | 'zip';

export interface AcceptedType {
  extension: string;
  mime: string;
  parser: ParserKey;
}

const DOC_TYPES: readonly AcceptedType[] = [
  {
    extension: 'docx',
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    parser: 'docx',
  },
  { extension: 'pdf', mime: 'application/pdf', parser: 'pdf' },
  { extension: 'md', mime: 'text/markdown', parser: 'markdown' },
  { extension: 'mdx', mime: 'text/markdown', parser: 'markdown' },
  { extension: 'html', mime: 'text/html', parser: 'html' },
  { extension: 'htm', mime: 'text/html', parser: 'html' },
  { extension: 'txt', mime: 'text/plain', parser: 'text' },
];

const OFFICE_TYPES: readonly AcceptedType[] = [
  {
    extension: 'pptx',
    mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    parser: 'pptx',
  },
  {
    extension: 'xlsx',
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    parser: 'xlsx',
  },
  { extension: 'csv', mime: 'text/csv', parser: 'csv' },
];

const DATA_TYPES: readonly AcceptedType[] = [
  { extension: 'json', mime: 'application/json', parser: 'json' },
  { extension: 'yaml', mime: 'application/yaml', parser: 'yaml' },
  { extension: 'yml', mime: 'application/yaml', parser: 'yaml' },
];

const MEDIA_TYPES: readonly AcceptedType[] = [
  { extension: 'png', mime: 'image/png', parser: 'image' },
  { extension: 'jpg', mime: 'image/jpeg', parser: 'image' },
  { extension: 'jpeg', mime: 'image/jpeg', parser: 'image' },
  { extension: 'webp', mime: 'image/webp', parser: 'image' },
  { extension: 'gif', mime: 'image/gif', parser: 'image' },
  { extension: 'mp4', mime: 'video/mp4', parser: 'mp4' },
  { extension: 'mov', mime: 'video/quicktime', parser: 'mp4' },
];

const ARCHIVE_TYPES: readonly AcceptedType[] = [
  { extension: 'zip', mime: 'application/zip', parser: 'zip' },
];

const CODE_TYPES: readonly AcceptedType[] = CODE_LANGUAGES.map((lang) => ({
  extension: lang.extension,
  mime: 'text/plain',
  parser: 'code' as const,
}));

export const ACCEPTED_TYPES: readonly AcceptedType[] = [
  ...DOC_TYPES,
  ...OFFICE_TYPES,
  ...DATA_TYPES,
  ...MEDIA_TYPES,
  ...ARCHIVE_TYPES,
  ...CODE_TYPES,
];

/** Returns the `accept` attribute value for an <input type="file">. */
export function acceptAttribute(): string {
  const exts = ACCEPTED_TYPES.map((t) => `.${t.extension}`);
  const mimes = Array.from(new Set(ACCEPTED_TYPES.map((t) => t.mime))).filter(
    (m) => m && m !== 'text/plain',
  );
  return [...exts, ...mimes].join(',');
}

/** Lookup by extension (case-insensitive, no leading dot). */
export function lookupByExtension(extension: string): AcceptedType | null {
  const ext = extension.toLowerCase().replace(/^\./, '');
  return ACCEPTED_TYPES.find((t) => t.extension === ext) ?? null;
}

/** Lookup by mime (case-insensitive). */
export function lookupByMime(mime: string): AcceptedType | null {
  const m = mime.toLowerCase();
  return ACCEPTED_TYPES.find((t) => t.mime === m) ?? null;
}
