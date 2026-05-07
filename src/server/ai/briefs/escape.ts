import 'server-only';

const MAX_BRIEF_CHARS = 25_000;
export const BRIEF_TRUNCATION_MARKER = '\n\n[…brief truncated]';

/**
 * Defang the brief before injecting it into the prompt. Replaces literal
 * `</brief>` substrings (case-insensitive) with `</ brief>` so a hostile
 * brief can't close our delimiter early. Truncates to MAX_BRIEF_CHARS,
 * appending the truncation marker so the model knows the cut happened.
 */
export function escapeBriefText(input: string): {
  text: string;
  truncated: boolean;
} {
  const defanged = input.replace(/<\/\s*brief\s*>/gi, '</ brief>');
  if (defanged.length <= MAX_BRIEF_CHARS) {
    return { text: defanged, truncated: false };
  }
  return {
    text: defanged.slice(0, MAX_BRIEF_CHARS) + BRIEF_TRUNCATION_MARKER,
    truncated: true,
  };
}

export const BRIEF_LIMITS = {
  maxOriginalBytes: 10 * 1024 * 1024,
  maxTextChars: MAX_BRIEF_CHARS,
} as const;

export const BRIEF_MIME_ALLOWLIST = [
  'text/plain',
  'text/markdown',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const;

export type BriefMime = (typeof BRIEF_MIME_ALLOWLIST)[number];
