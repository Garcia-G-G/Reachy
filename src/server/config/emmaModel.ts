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

/** Default reasoning effort for an Emma turn. "Medium" buys
 *  thoughtful but not deliberative — the right register for
 *  conversational back-and-forth with occasional tool calls. */
export const EMMA_REASONING_DEFAULT: EmmaReasoningEffort = 'medium';

/** Bump to "high" when the model needs deep planning before a
 *  tool call — multi-asset orchestration, "build me a campaign",
 *  "audit my brand". Detected via heuristic keyword match on the
 *  latest user message. Cost ~3× higher per turn; worth it for the
 *  reasoning. */
export const EMMA_REASONING_HEAVY: EmmaReasoningEffort = 'high';

/** Keywords that bump reasoning_effort to HEAVY when present in
 *  the latest user message. Case-insensitive substring match. The
 *  list is BILINGUAL ES/EN so Garcia's projects work in both
 *  languages without code changes. */
export const EMMA_HEAVY_KEYWORDS: readonly string[] = [
  // EN — orchestration cues
  'campaign',
  'audit',
  'rebrand',
  'plan everything',
  'all my',
  'all the',
  'every channel',
  'create me a campaign',
  // ES — orchestration cues
  'campaña',
  'auditoría',
  'auditoria',
  'redo de marca',
  'todos los canales',
  'todos los',
  'todas las',
  'hazme una campaña',
  'arma una campaña',
];

export function isHeavyRequest(userMessageText: string): boolean {
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
