/**
 * Client-safe subset of src/server/config/acceptedFileTypes — exposes
 * the `accept` attribute value the upload form needs, without dragging
 * the full server-side config (which carries a `server-only` guard) into
 * the client bundle.
 *
 * The list of accepted extensions is duplicated by intent — a future
 * refactor could derive both files from a shared neutral source, but
 * for now the policy is: server file is the source of truth (parser
 * routing depends on it), and this client file is a hand-mirrored
 * subset capped at the `accept` attribute the <input> needs.
 */

const EXTENSIONS = [
  'docx',
  'pdf',
  'md',
  'mdx',
  'html',
  'htm',
  'txt',
  'pptx',
  'xlsx',
  'csv',
  'json',
  'yaml',
  'yml',
  'png',
  'jpg',
  'jpeg',
  'webp',
  'gif',
  'mp4',
  'mov',
  'zip',
  'ts',
  'tsx',
  'js',
  'jsx',
  'mjs',
  'cjs',
  'py',
  'rb',
  'go',
  'rs',
  'java',
  'kt',
  'swift',
  'c',
  'cpp',
  'cs',
  'php',
  'sh',
  'sql',
] as const;

const MIMES = [
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/pdf',
  'text/markdown',
  'text/html',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'application/json',
  'application/yaml',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/quicktime',
  'application/zip',
];

export function acceptAttributeClient(): string {
  return [...EXTENSIONS.map((e) => `.${e}`), ...MIMES].join(',');
}
