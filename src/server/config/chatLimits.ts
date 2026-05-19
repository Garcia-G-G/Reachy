import 'server-only';
import { MAX_BYTES_PER_FILE, MAX_BYTES_PER_INGESTION } from './parserLimits';

/**
 * Emma chat — runtime limits. Phase 07.
 *
 * Cannot be derived: these caps express product policy (how much
 * history Emma loads, how many tool calls per turn, how big an
 * attachment can be). Centralized so a future loosening is a
 * single-file change. Anti-hardcode rule keeps them out of handler
 * code.
 *
 * The attachment limits intentionally MIRROR the autopilot ingest
 * limits (parserLimits.ts) — we reuse the same parsers, so the same
 * size envelope applies. A 25 MB file that ingest can parse is a
 * 25 MB file Emma can parse.
 */

/** Number of past messages loaded into the model context on each turn.
 *  At ~250 tokens/message average and ~3,000-token system prompt,
 *  50 messages stays well under Sonnet 4.6's 200k context window even
 *  with full tool_result payloads. */
export const CHAT_HISTORY_DEPTH = 50;

/** Hard cap on tool calls per single assistant turn. Emma occasionally
 *  wants to chain — describeImage → generateImage → saveAsCampaignAsset
 *  — so we allow a generous loop, but bound it so a runaway agent
 *  can't burn through the wallet. */
export const CHAT_MAX_TOOL_CALLS_PER_TURN = 8;

/** Soft cap on tokens Emma can produce in one streamed response. The
 *  AI SDK enforces this via `maxOutputTokens`. Sonnet 4.6 sustains
 *  thinking + tool use well within this. */
export const CHAT_MAX_OUTPUT_TOKENS = 4_096;

/** Attachment policy — mirrored from parserLimits. Centralizing as a
 *  re-export so chat callers don't need to know about parser internals. */
export const CHAT_MAX_BYTES_PER_FILE = MAX_BYTES_PER_FILE;
export const CHAT_MAX_BYTES_PER_TURN = MAX_BYTES_PER_INGESTION;

/** Max attachments per single send. The user can drop a folder of
 *  files; we cap so the upload endpoint doesn't accept arbitrary
 *  amounts in one request. */
export const CHAT_MAX_ATTACHMENTS_PER_TURN = 10;

/** Max total attachments stored for a single conversation. Beyond
 *  this we ask the user to start a new thread (UI gating only — the
 *  schema imposes no limit). */
export const CHAT_MAX_ATTACHMENTS_PER_THREAD = 250;

/** Number of recent assets surfaced into Emma's system prompt as
 *  "what we made together so far". Helps her reference past work
 *  without needing to call searchAssets every time. */
export const CHAT_RECENT_ASSETS_IN_CONTEXT = 10;

/** Image attachment: Anthropic Messages API accepts base64 image
 *  blocks up to ~5 MB each. We re-encode larger uploads via sharp
 *  before passing into the model context. */
export const CHAT_IMAGE_BLOCK_MAX_BYTES = 5 * 1024 * 1024;
