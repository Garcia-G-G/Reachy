import 'server-only';

/**
 * Extension → language-label map for the code parser.
 *
 * Cannot be derived from file content alone — content-based language
 * detection is heuristic (statistical n-grams, shebang sniffing) and
 * gets the long-tail wrong; an explicit map by extension is correct
 * for the formats Reachy actually cares about (codebases users upload
 * to seed a brand brief).
 *
 * Keep this list narrow. New entries cost nothing but unused entries
 * confuse the parser routing. Add a language only when we have a
 * symbol-extraction regex for it in symbolPatterns.ts.
 */

export interface CodeLanguageEntry {
  /** Lowercased file extension WITHOUT the leading dot. */
  extension: string;
  /** Human-readable label injected into the IngestedBundle.codeContext
   *  so downstream steps can group by language ("3 .ts files, 2 .py
   *  files"). */
  label: string;
}

export const CODE_LANGUAGES: readonly CodeLanguageEntry[] = [
  { extension: 'ts', label: 'TypeScript' },
  { extension: 'tsx', label: 'TypeScript (React)' },
  { extension: 'js', label: 'JavaScript' },
  { extension: 'jsx', label: 'JavaScript (React)' },
  { extension: 'mjs', label: 'JavaScript (ESM)' },
  { extension: 'cjs', label: 'JavaScript (CJS)' },
  { extension: 'py', label: 'Python' },
  { extension: 'rb', label: 'Ruby' },
  { extension: 'go', label: 'Go' },
  { extension: 'rs', label: 'Rust' },
  { extension: 'java', label: 'Java' },
  { extension: 'kt', label: 'Kotlin' },
  { extension: 'swift', label: 'Swift' },
  { extension: 'c', label: 'C' },
  { extension: 'cpp', label: 'C++' },
  { extension: 'cs', label: 'C#' },
  { extension: 'php', label: 'PHP' },
  { extension: 'sh', label: 'Shell' },
  { extension: 'sql', label: 'SQL' },
];

const BY_EXTENSION: Record<string, string> = Object.fromEntries(
  CODE_LANGUAGES.map((e) => [e.extension, e.label]),
);

export function languageLabel(extension: string): string | null {
  return BY_EXTENSION[extension.toLowerCase()] ?? null;
}

/** File-system entry names the code/repo parsers MUST skip. Cannot be
 *  derived because the call site needs a literal allow-list of dir
 *  names that always indicate "do not descend" regardless of size. */
export const SKIP_NAMES: readonly string[] = [
  'node_modules',
  '.git',
  '.next',
  '.turbo',
  '.cache',
  '.vercel',
  'dist',
  'build',
  'out',
  '.DS_Store',
  'coverage',
  '.parcel-cache',
];

/** Filename patterns that indicate generated/lockfile content the code
 *  parser should NOT ingest. Matched as exact name OR with the listed
 *  prefix. Cannot be derived from extension alone. */
export const SKIP_PATTERNS: readonly RegExp[] = [
  /^package-lock\.json$/i,
  /^pnpm-lock\.yaml$/i,
  /^yarn\.lock$/i,
  /^bun\.lockb?$/i,
  /^poetry\.lock$/i,
  /^Cargo\.lock$/i,
  /^Gemfile\.lock$/i,
  /^\.env(\.|$)/i,
];

export function shouldSkipName(name: string): boolean {
  if (SKIP_NAMES.includes(name)) return true;
  return SKIP_PATTERNS.some((re) => re.test(name));
}
