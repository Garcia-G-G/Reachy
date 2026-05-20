import 'server-only';

/**
 * Emma — LLM model + pricing constants. Phase 07c.
 *
 * The entire Reachy stack runs on OpenAI (gpt-5.5 for planning,
 * gpt-image-2 for images, gpt-4o for vision). Emma aligns with that
 * stack to avoid:
 *   - A second API key + billing surface
 *   - Diverging tool-call semantics across providers
 *   - Inconsistent cost reporting
 *   - Operational risk: two providers can fail independently
 *
 * Cannot be derived: these are deliberate product policy values.
 * Tightening any of them (e.g. switching to gpt-5.5-pro for
 * heavy turns) is a single-file edit.
 */

export type EmmaReasoningEffort = 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';

export const EMMA_MODEL = 'gpt-5.5' as const;

/** Default reasoning effort for an Emma turn. Phase 07h pivoted
 *  her to a concierge — replies are 1-3 short paragraphs, no
 *  multi-step asset generation, no chain-of-thought analysis. 'low'
 *  delivers a tight reply quickly and dramatically reduces the
 *  chance of upstream timeouts / server_error on gpt-5.5. The
 *  worker era used 'medium' (with 'high' bumps); concierge era
 *  doesn't need either. */
export const EMMA_REASONING_DEFAULT: EmmaReasoningEffort = 'low';

/** Reserved for future heavy concierge turns (multi-tool
 *  orchestration like "audit my brand kit + show me where the gaps
 *  are"). Currently unused — EMMA_HEAVY_KEYWORDS is empty so
 *  isHeavyRequest never returns true. Bump back via the catalog
 *  below if a real heavy-concierge use-case lands. */
export const EMMA_REASONING_HEAVY: EmmaReasoningEffort = 'medium';

/** Heavy-request catalog — empty in the concierge era. Worker-era
 *  keywords (campaign, audit, etc.) are obsolete because the worker
 *  tools are archived. Leaving the constant + helper in place so
 *  future revivals are a single-file edit. */
export const EMMA_HEAVY_KEYWORDS: readonly string[] = [];

export function isHeavyRequest(userMessageText: string): boolean {
  if (EMMA_HEAVY_KEYWORDS.length === 0) return false;
  const lower = userMessageText.toLowerCase();
  return EMMA_HEAVY_KEYWORDS.some((k) => lower.includes(k.toLowerCase()));
}

/** OpenAI gpt-5.5 pricing as of May 2026 (USD per 1M tokens).
 *  Updated in lockstep with the rest of the Reachy stack —
 *  extractBrief / planCampaign / copyPlanner all use the same
 *  base rate; cached input is consistent across the platform. */
export const EMMA_PRICING = {
  /** Input tokens — uncached, full rate. */
  inputPerMillion: 5,
  /** Output tokens. */
  outputPerMillion: 30,
  /** Cached input tokens — 10× cheaper than uncached. The Anthropic
   *  Messages cache TTL was 5 min; OpenAI's prompt caching for
   *  reasoning models has equivalent behavior. */
  cachedInputPerMillion: 0.5,
} as const;

/** Cap on streamed output tokens per Emma turn. Sonnet 4.6 used
 *  4096; gpt-5.5 sustains the same envelope. */
export const EMMA_MAX_OUTPUT_TOKENS = 4_096;
