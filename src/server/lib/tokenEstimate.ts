import 'server-only';

/**
 * Token estimator — Phase 07j.
 *
 * Rough character-based estimate (1 token ≈ 4 chars) — fast, no
 * tokenizer dependency, accurate enough to spot "we're past 6k
 * tokens, the system prompt is bloated" failure modes from the
 * debug log without pulling tiktoken into the server bundle.
 *
 * If we ever need true accuracy (cost reporting in the UI for
 * example), swap to tiktoken — the signature is identical.
 */

const CHARS_PER_TOKEN = 4;

export function estimateCharsToTokens(chars: number): number {
  return Math.ceil(chars / CHARS_PER_TOKEN);
}

/** Estimate tokens for an arbitrary value by JSON-serializing it
 *  and using the chars-per-token heuristic. Strings short-circuit
 *  to skip the JSON.stringify overhead. */
export function estimateTokens(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'string') return estimateCharsToTokens(value.length);
  try {
    return estimateCharsToTokens(JSON.stringify(value).length);
  } catch {
    return 0;
  }
}
