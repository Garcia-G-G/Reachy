import 'server-only';
import { openai } from '@ai-sdk/openai';
import { type ModelMessage, stepCountIs, streamText } from 'ai';
import { and, desc, eq } from 'drizzle-orm';
import type { BrandKit } from '@/server/actions/brandKits';
import type { Project } from '@/server/actions/projects';
import {
  CHAT_HISTORY_DEPTH,
  CHAT_MAX_TOOL_CALLS_PER_TURN,
  CHAT_RECENT_ASSETS_IN_CONTEXT,
} from '@/server/config/chatLimits';
import { buildEmmaSystemPrompt, type EmmaSessionSnapshot } from '@/server/config/chatSystemPrompts';
import { buildStreamErrorSurface, extractOpenAIRequestId } from '@/server/config/emmaErrors';
import {
  EMMA_MAX_OUTPUT_TOKENS,
  EMMA_MODEL,
  EMMA_PRICING,
  EMMA_REASONING_DEFAULT,
  EMMA_REASONING_HEAVY,
  isHeavyRequest,
} from '@/server/config/emmaModel';
import { db } from '@/server/db/client';
import { brandKit } from '@/server/db/schema/brandKits';
import {
  type ChatAttachment,
  type ChatMessage,
  chatMessage,
} from '@/server/db/schema/chatMessages';
import { chatThread } from '@/server/db/schema/chatThreads';
import { generation } from '@/server/db/schema/generations';
import { project } from '@/server/db/schema/projects';
import type { ProductBrief } from '@/server/ingest/extractBrief';
import { detectOrphanedToolUse, sanitizeForOpenAI } from '@/server/lib/messageSanitizer';
import { estimateTokens } from '@/server/lib/tokenEstimate';
import { signedDownloadUrl } from '@/server/storage/r2';
import type { EmmaToolContext } from './context';
import { buildEmmaTools } from './tools';

/**
 * Emma — the orchestrator. Phase 07 + 07c (GPT pivot).
 *
 * Per turn:
 *   1. Load thread + project + brand kit + brief + recent assets.
 *   2. Build the system prompt from chatSystemPrompts (templated,
 *      anti-hardcode compliant).
 *   3. Map persisted chat_message rows + the new user message into
 *      AI SDK ModelMessage[] (history limit honors CHAT_HISTORY_DEPTH).
 *   4. Call streamText against OpenAI gpt-5.5 (Vercel AI SDK v6
 *      provider) with the bound tools and providerOptions.openai.
 *      reasoningEffort set per emmaModel heuristic. stopWhen =
 *      stepCountIs(CHAT_MAX_TOOL_CALLS_PER_TURN).
 *   5. The stream's onStepFinish fires after each model step — we
 *      persist the assistant message(s) + tool calls + tool results
 *      to chat_message so reconnects can replay.
 *
 * Returns the stream result so the API route can pipe it back to
 * the client.
 */

export interface RunEmmaTurnInput {
  threadId: string;
  userId: string;
  /** The NEW user message — text + attachments. The handler persists
   *  it as a chat_message row BEFORE calling the model (so a stream
   *  failure still leaves the message in the thread). */
  userMessage: {
    text: string;
    attachments: ChatAttachment[];
  };
  /** Display name resolved by the API route from session.user.name
   *  → email-prefix → fallback. Empty strings get caught downstream
   *  in chatSystemPrompts (EMMA_FALLBACK_GREETING_NAME). */
  userDisplayName: string;
  /** The app locale (URL / NEXT_LOCALE cookie). Drives Emma's
   *  response language so the chat speaks the same language as the
   *  rest of the website. Defaults to the brand kit's first
   *  language when not provided. */
  uiLocale?: 'en' | 'es';
  /** Phase 07h — the user's current client-side route (Emma is now
   *  a global floating widget, not a dedicated page). Threaded into
   *  the tool context so getCurrentPageContext can return it and
   *  navigateTo can resolve relative paths. */
  clientContext?: {
    currentRoute?: string;
    focusedGenerationId?: string;
  };
}

/** Strip text parts that look like provider error JSON before they
 *  reach the persistence layer. The shape we've seen leak is
 *  `{"type":"error","sequence_number":N,"error":{...}}` — the SSE
 *  event the OpenAI Responses API emits when a request fails mid-
 *  stream. Without this filter, the raw JSON shows up as Emma's
 *  reply text on reload.
 *
 *  Cheap detector: starts-with check on a trimmed prefix. False
 *  positives are unlikely — Emma doesn't emit JSON-shaped replies
 *  in concierge mode. */
function sanitizeStepContent(content: unknown): unknown[] {
  if (!Array.isArray(content)) return [];
  return content.filter((part) => {
    if (!part || typeof part !== 'object') return false;
    const p = part as { type?: string; text?: unknown };
    if (p.type === 'text' && typeof p.text === 'string') {
      const t = p.text.trimStart();
      if (t.startsWith('{"type":"error"') || t.startsWith('{"error":')) {
        return false;
      }
    }
    return true;
  });
}

function estimateCostCents(usage: {
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
}): number {
  const inT = usage.inputTokens ?? 0;
  const outT = usage.outputTokens ?? 0;
  const cachedT = usage.cachedInputTokens ?? 0;
  const usd =
    ((inT - cachedT) * EMMA_PRICING.inputPerMillion +
      cachedT * EMMA_PRICING.cachedInputPerMillion +
      outT * EMMA_PRICING.outputPerMillion) /
    1_000_000;
  return Math.max(1, Math.round(usd * 100));
}

/** Sanitize a single content part before it goes back to the model
 *  as history. Phase 07h hotfix — accumulated thread data carried
 *  three classes of garbage that were causing OpenAI server_error:
 *
 *    1. EMPTY reasoning parts. The SDK already warns
 *       "Non-OpenAI reasoning parts are not supported. Skipping…"
 *       on every turn. Drop them at source instead of letting the
 *       SDK skip + warn.
 *    2. Tool-call / tool-result parts referencing tools that were
 *       archived in the 07h concierge pivot (generateImage,
 *       writeCopy, etc.). Sending those back to the model with no
 *       matching definition in the current registry confuses gpt-5.5
 *       and can fail validation. We drop ALL tool-* parts from
 *       history — the concierge tools are stateless reads and Emma
 *       re-calls them fresh each turn, no benefit to keeping them.
 *    3. Our own friendly error-fallback text ("Algo falló…" /
 *       "Something failed…"). If we let it back in as a previous
 *       assistant message, the model treats it as Emma's voice and
 *       the next reply mirrors that tone.
 */
function sanitizeHistoryPart(p: unknown): unknown | null {
  if (!p || typeof p !== 'object') return null;
  const part = p as { type?: string; text?: string };
  if (!part.type) return null;

  if (part.type === 'reasoning') {
    const r = (part.text ?? '').trim();
    if (r.length === 0) return null;
    return part; // non-empty reasoning we keep as-is
  }

  // Drop every tool-* part. Tools are stateless reads in concierge
  // mode; re-calling per turn is cheap and avoids orphan/legacy issues.
  if (part.type.startsWith('tool-')) return null;

  if (part.type === 'text' && typeof part.text === 'string') {
    const t = part.text.trim();
    if (t.length === 0) return null;
    if (
      t.startsWith('Algo falló por el lado del modelo') ||
      t.startsWith('Something failed on the model side') ||
      t.startsWith('{"type":"error"') ||
      t.startsWith('{"error":')
    ) {
      return null;
    }
    return part;
  }

  return part;
}

/** Convert persisted ChatMessage rows back to AI-SDK ModelMessage[]
 *  for inclusion in the next prompt. Filters each row's content via
 *  sanitizeHistoryPart; rows that have zero useful parts after the
 *  filter are dropped entirely. We also drop role='tool' rows since
 *  the corresponding tool-call entries on the assistant side are
 *  filtered out — orphan tool-results would otherwise fail
 *  validation.
 *
 *  We cast via `as never` because the runtime shape is correct (we
 *  store back what the SDK produced) but TypeScript can't see that
 *  through the jsonb round-trip. */
function persistedToModelMessages(rows: ChatMessage[]): ModelMessage[] {
  const out: ModelMessage[] = [];
  for (const r of rows) {
    if (r.role === 'tool') continue; // orphaned by the tool-call filter
    if (r.role !== 'user' && r.role !== 'assistant') continue; // 'system' rebuilt fresh
    const rawParts = Array.isArray(r.content) ? r.content : [];
    const cleaned = rawParts.map(sanitizeHistoryPart).filter((p): p is object => p !== null);
    if (cleaned.length === 0) continue;
    out.push({ role: r.role, content: cleaned as never });
  }
  return out;
}

export async function runEmmaTurn(input: RunEmmaTurnInput) {
  // ── 1. Load thread + project + brand kit + brief + recent assets ──
  const [threadRow] = await db
    .select()
    .from(chatThread)
    .where(eq(chatThread.id, input.threadId))
    .limit(1);
  if (!threadRow) throw new Error('thread not found');

  const [projRow] = await db
    .select()
    .from(project)
    .where(and(eq(project.id, threadRow.projectId), eq(project.userId, input.userId)))
    .limit(1);
  if (!projRow) throw new Error('project not found or owned by a different user');

  const [kitRow] = await db
    .select()
    .from(brandKit)
    .where(eq(brandKit.projectId, projRow.id))
    .limit(1);
  if (!kitRow) {
    throw new Error('project has no brand kit — open the identity page first');
  }

  // ProductBrief snapshot — pull from the latest ingestion that produced one.
  const productBrief: ProductBrief | null = null;
  // The brief column lives on `ingestion.bundle.brief` and the project
  // links via project.sourceIngestionId. We skip loading here to keep
  // handler latency low; the chat system prompt notes "(no autopilot
  // brief)" gracefully when productBrief is null. Future enhancement:
  // hydrate from project.sourceIngestionId when needed for richer
  // grounding in writeCopy.

  const recentAssetsRows = await db
    .select({
      type: generation.type,
      params: generation.params,
      createdAt: generation.createdAt,
    })
    .from(generation)
    .where(and(eq(generation.projectId, projRow.id), eq(generation.status, 'done')))
    .orderBy(desc(generation.createdAt))
    .limit(CHAT_RECENT_ASSETS_IN_CONTEXT);
  const recentAssets = recentAssetsRows.map((r) => {
    const params = (r.params ?? {}) as { idea?: string };
    return {
      kind: r.type ?? 'image',
      brief: params.idea ?? '',
      createdAt: r.createdAt as Date,
    };
  });

  const project_: Project = projRow as Project;
  const brandKit_: BrandKit = kitRow as unknown as BrandKit;
  // Prefer the explicit UI locale from the API route. Brand kit
  // language is the fallback for callers that don't thread the
  // locale (e.g. older scripts / tests).
  const language: 'en' | 'es' =
    input.uiLocale ?? ((brandKit_.languages?.[0] ?? 'en') as 'en' | 'es');

  // ── 2. Build the system prompt ──
  // Phase 07j — session snapshot so Emma can reference the current
  // page + last generation in her questions instead of asking
  // generic "¿qué necesitás?".
  const lastGenerationForSnapshot: EmmaSessionSnapshot['lastGeneration'] = (() => {
    const r = recentAssetsRows[0];
    if (!r) return null;
    const params = (r.params ?? {}) as { idea?: string };
    return {
      kind: r.type ?? 'image',
      idea: params.idea ?? '',
    };
  })();
  const sessionSnapshot: EmmaSessionSnapshot = {
    userFirstName: input.userDisplayName?.trim().split(/\s+/)[0] || 'amigo',
    currentRoute: input.clientContext?.currentRoute ?? null,
    lastGeneration: lastGenerationForSnapshot,
  };
  const systemPrompt = buildEmmaSystemPrompt({
    project: project_,
    brandKit: brandKit_,
    productBrief,
    recentAssets,
    language,
    userDisplayName: input.userDisplayName,
    sessionSnapshot,
  });

  // ── 3. Load history + persist the new user message ──
  const historyRows = await db
    .select()
    .from(chatMessage)
    .where(eq(chatMessage.threadId, input.threadId))
    .orderBy(desc(chatMessage.createdAt))
    .limit(CHAT_HISTORY_DEPTH);
  const history = historyRows.reverse();

  // Build the new user message content. If image attachments are
  // present we resolve their R2 keys to signed download URLs so
  // OpenAI's vision endpoint can fetch them without our bucket being
  // public. Doc attachments are referenced by R2 key in a text marker
  // — Emma calls ingestUploadedFile with that key to read them.
  const userContent: Array<
    { type: 'text'; text: string } | { type: 'image'; image: string; mediaType: string }
  > = [];
  if (input.userMessage.text && input.userMessage.text.trim().length > 0) {
    userContent.push({ type: 'text', text: input.userMessage.text });
  }
  for (const att of input.userMessage.attachments) {
    if (att.mime.startsWith('image/')) {
      // Sign a 1-hour download URL so the model fetch can pull the
      // bytes from R2 without our bucket needing public access. The
      // AI SDK's ImagePart accepts a URL string verbatim and routes
      // it to OpenAI's vision input format as { type: 'image_url' }.
      const signed = await signedDownloadUrl(att.r2Key, 60 * 60).catch(() => null);
      if (signed) {
        userContent.push({ type: 'image', image: signed, mediaType: att.mime });
      } else {
        // Signing failed — surface as a text marker so Emma still
        // knows the user attached something, even if she can't see it.
        userContent.push({
          type: 'text',
          text: `[attached image we could not sign] r2Key=${att.r2Key} originalName=${att.originalName}`,
        });
      }
    } else {
      // Non-image attachments — Emma calls ingestUploadedFile with the
      // r2Key, mime, originalName. The text marker tells her the
      // upload exists so she knows to make the tool call.
      userContent.push({
        type: 'text',
        text: `[attached file] r2Key=${att.r2Key} originalName=${att.originalName} mime=${att.mime} sizeBytes=${att.sizeBytes}`,
      });
    }
  }
  // Persist the new user message before kicking off the stream.
  const [persistedUser] = await db
    .insert(chatMessage)
    .values({
      threadId: input.threadId,
      role: 'user',
      content: userContent,
      attachments: input.userMessage.attachments,
      model: null,
    })
    .returning();
  if (!persistedUser) throw new Error('failed to persist user message');

  await db
    .update(chatThread)
    .set({ lastMessageAt: new Date() })
    .where(eq(chatThread.id, input.threadId));

  // ── 4. Build tools + per-turn context ──
  const toolCtx: EmmaToolContext = {
    userId: input.userId,
    projectId: project_.id,
    threadId: input.threadId,
    project: project_,
    brandKit: brandKit_,
    productBrief,
    language,
    currentRoute: input.clientContext?.currentRoute,
    focusedGenerationId: input.clientContext?.focusedGenerationId,
  };
  const tools = buildEmmaTools(toolCtx);

  // ── 5. Map history + new user message to AI-SDK messages ──
  const modelMessagesRaw: ModelMessage[] = [
    ...persistedToModelMessages(history).filter((m) => {
      // Drop empty placeholder messages from any 'system'-role rows
      // we never expect, but defensively keep the filter.
      if (Array.isArray(m.content) && m.content.length === 0) return false;
      return true;
    }),
    { role: 'user', content: userContent },
  ];

  // Phase 07j — final guard against orphan tool-call / tool-result
  // pairs leaking to OpenAI. The persisted-history sanitizer already
  // drops every tool-* part, so this should be a no-op 99% of the
  // time — but it's belt-and-braces against future regressions
  // (and detectOrphanedToolUse below tells us when it actually fired).
  const hadOrphan = detectOrphanedToolUse(modelMessagesRaw);
  const modelMessages = sanitizeForOpenAI(modelMessagesRaw);

  // Phase 07i — log dispatched turn shape so we can spot the
  // "history grew past the context window" failure mode the moment
  // it happens, rather than chasing it through a stream error.
  const approxChars = estimateTokens({ systemPrompt, modelMessages }) * 4;
  const estimatedTokens = estimateTokens({ systemPrompt, modelMessages });
  console.log(
    `[reachy:emma] dispatching turn: ${modelMessages.length} messages, ~${approxChars} chars, ~${estimatedTokens} tokens`,
  );

  // Phase 07j — EMMA_DEBUG=1 surfaces the full diagnostic payload
  // so a regression can be traced without redeploying.
  if (process.env.EMMA_DEBUG === '1') {
    console.log('[reachy:emma:debug] outgoing request', {
      chatId: input.threadId,
      messageCount: modelMessages.length,
      estimatedTokens,
      systemPromptChars: systemPrompt.length,
      systemPromptTokens: estimateTokens(systemPrompt),
      toolNames: Object.keys(tools),
      lastMessageRole: modelMessages.at(-1)?.role,
      hadOrphanedToolUse: hadOrphan,
      currentRoute: sessionSnapshot.currentRoute,
      hasLastGeneration: sessionSnapshot.lastGeneration !== null,
    });
  }

  // Heavy-request detection — bump reasoning to 'high' when the
  // user's text contains orchestration cues (campaign, audit, all
  // my channels…). Sourced from EMMA_HEAVY_KEYWORDS so the catalog
  // tightens in one place.
  const reasoningEffort = isHeavyRequest(input.userMessage.text)
    ? EMMA_REASONING_HEAVY
    : EMMA_REASONING_DEFAULT;

  // ── 6. Stream the response ──
  const result = streamText({
    model: openai(EMMA_MODEL),
    system: systemPrompt,
    messages: modelMessages,
    tools,
    maxOutputTokens: EMMA_MAX_OUTPUT_TOKENS,
    stopWhen: stepCountIs(CHAT_MAX_TOOL_CALLS_PER_TURN),
    providerOptions: {
      // OpenAI reasoning models accept reasoning_effort via the
      // Vercel AI SDK's providerOptions.openai surface. 'medium' for
      // typical conversational turns, 'high' for heavy orchestration.
      openai: { reasoningEffort },
    },
    onStepFinish: async (step) => {
      // Persist the assistant message + any tool calls + tool results
      // produced by this step. `step.content` is the AI SDK
      // ContentPart[] — provider-agnostic, the jsonb persistence is
      // the same shape regardless of which model produced it.
      //
      // Phase 07h hotfix — when an upstream provider errors mid-stream
      // (OpenAI server_error etc.), the SDK may have emitted partial
      // content + an error event. Sanitize before persist:
      //  (a) skip when finishReason === 'error' AND the content is
      //      empty / reasoning-only — there's nothing useful to keep.
      //  (b) filter out text parts whose body looks like raw error
      //      JSON (the OpenAI Responses error event shape) so they
      //      never reach the renderer.
      const sanitized = sanitizeStepContent(step.content);
      const hasUsefulPart = sanitized.some((p) => {
        const t = (p as { type?: string }).type;
        return t === 'text' || t === 'tool-call' || t === 'tool-result';
      });
      if (step.finishReason === 'error' && !hasUsefulPart) {
        console.warn(`[reachy:emma] dropping empty error-step (no useful content)`);
        return;
      }
      const cost = estimateCostCents({
        inputTokens: step.usage?.inputTokens,
        outputTokens: step.usage?.outputTokens,
        cachedInputTokens: step.usage?.cachedInputTokens,
      });
      await db.insert(chatMessage).values({
        threadId: input.threadId,
        role: 'assistant',
        content: sanitized,
        attachments: [],
        costCents: cost,
        model: EMMA_MODEL,
      });
      await db
        .update(chatThread)
        .set({ lastMessageAt: new Date() })
        .where(eq(chatThread.id, input.threadId));
    },
  });

  return result;
}

/**
 * persistEmmaErrorSurface — Phase 07i.
 *
 * Insert a synthesized assistant row carrying the friendly
 * error-surface payload + the OpenAI request_id we extracted from
 * the raw stream error. Called from the stream route's onError so
 * the user sees a real card (with [reintentar] / [copy detail]
 * chips) instead of Emma ghosting.
 *
 * Fire-and-forget from the route — failures here MUST NOT block
 * the response (the friendly fallback string is the user-visible
 * thing; this row only matters on reload).
 */
export async function persistEmmaErrorSurface(args: {
  threadId: string;
  locale: 'en' | 'es';
  rawError: string;
}): Promise<void> {
  try {
    const requestId = extractOpenAIRequestId(args.rawError);
    const surface = buildStreamErrorSurface(args.locale, requestId);
    await db.insert(chatMessage).values({
      threadId: args.threadId,
      role: 'assistant',
      content: [{ type: 'text', text: surface.bodyText }],
      attachments: [],
      costCents: 0,
      model: EMMA_MODEL,
      isErrorSurface: true,
      openaiRequestId: requestId,
    });
    await db
      .update(chatThread)
      .set({ lastMessageAt: new Date() })
      .where(eq(chatThread.id, args.threadId));
  } catch (persistErr) {
    const msg = persistErr instanceof Error ? persistErr.message : String(persistErr);
    console.error(`[reachy:emma] failed to persist error surface: ${msg}`);
  }
}
