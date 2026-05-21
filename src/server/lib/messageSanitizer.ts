import 'server-only';
import type { ModelMessage } from 'ai';

/**
 * Message sanitizer — Phase 07j.
 *
 * Belt-and-braces guard against the dominant OpenAI server_error
 * trigger: an assistant message that carries a `tool-call` part
 * with no matching `tool-result` later in the array. OpenAI's
 * Responses API rejects that shape with a generic server_error;
 * the AI SDK surfaces it as the `{ type: 'error', error: { … } }`
 * stream event we hit in 07i.
 *
 * The handler's per-row sanitizer already drops every tool-* part
 * from PERSISTED history (concierge tools are stateless reads,
 * re-call is cheap). This module is the FINAL guard right before
 * `streamText` — anything still carrying an orphan tool-call at
 * that point is healed in-memory so the model never sees malformed
 * input. We do NOT re-persist; the next turn re-reads from the DB
 * which already drops tool-* parts.
 *
 * `detectOrphanedToolUse` is the diagnostic counterpart, exposed
 * so the EMMA_DEBUG=1 dev log can tell us whether a turn would
 * have shipped malformed input (useful for catching regressions
 * in the read-side sanitizer).
 */

type Part = { type?: string; toolCallId?: string };

function getParts(m: ModelMessage): Part[] {
  const c = (m as { content?: unknown }).content;
  return Array.isArray(c) ? (c as Part[]) : [];
}

/** Return true when ANY message carries a tool-call whose toolCallId
 *  does not appear as a tool-result later in the array (in any role
 *  — the SDK puts tool-results in a separate `tool` role message). */
export function detectOrphanedToolUse(messages: readonly ModelMessage[]): boolean {
  const resultIds = new Set<string>();
  for (const m of messages) {
    for (const p of getParts(m)) {
      if (p.type === 'tool-result' && typeof p.toolCallId === 'string') {
        resultIds.add(p.toolCallId);
      }
    }
  }
  for (const m of messages) {
    for (const p of getParts(m)) {
      if (p.type === 'tool-call' && typeof p.toolCallId === 'string') {
        if (!resultIds.has(p.toolCallId)) return true;
      }
    }
  }
  return false;
}

/** Drop any tool-call part whose toolCallId has no matching
 *  tool-result, AND drop any tool-result whose toolCallId has no
 *  matching tool-call. The DB-side sanitizer already strips every
 *  tool-* part from persisted history, so this is only doing work
 *  in pathological cases (live-built ModelMessage[] from a partial
 *  turn). Defensive — if it's a no-op 99% of the time, good. */
export function sanitizeForOpenAI(messages: readonly ModelMessage[]): ModelMessage[] {
  const callIds = new Set<string>();
  const resultIds = new Set<string>();
  for (const m of messages) {
    for (const p of getParts(m)) {
      if (p.type === 'tool-call' && typeof p.toolCallId === 'string') {
        callIds.add(p.toolCallId);
      }
      if (p.type === 'tool-result' && typeof p.toolCallId === 'string') {
        resultIds.add(p.toolCallId);
      }
    }
  }

  const out: ModelMessage[] = [];
  for (const m of messages) {
    const parts = getParts(m);
    if (parts.length === 0) {
      out.push(m);
      continue;
    }
    const kept = parts.filter((p) => {
      if (p.type === 'tool-call' && typeof p.toolCallId === 'string') {
        return resultIds.has(p.toolCallId);
      }
      if (p.type === 'tool-result' && typeof p.toolCallId === 'string') {
        return callIds.has(p.toolCallId);
      }
      return true;
    });
    if (kept.length === 0) continue;
    out.push({ ...(m as object), content: kept } as ModelMessage);
  }
  return out;
}
