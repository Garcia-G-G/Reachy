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
import { buildEmmaSystemPrompt } from '@/server/config/chatSystemPrompts';
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

/** Convert persisted ChatMessage rows back to AI-SDK ModelMessage[]
 *  for inclusion in the next prompt. Content is already in Anthropic
 *  Messages content-block format (text / tool_use / tool_result /
 *  image), which is what ModelMessage accepts.
 *
 *  We cast via `as never` because the runtime shape is correct (we
 *  store back what the SDK produced) but TypeScript can't see that
 *  through the jsonb round-trip. The SDK's `validateUIMessages`
 *  helper would be too heavy for hot-path turns. */
function persistedToModelMessages(rows: ChatMessage[]): ModelMessage[] {
  const out: ModelMessage[] = [];
  for (const r of rows) {
    if (r.role === 'user') {
      out.push({ role: 'user', content: r.content as never });
    } else if (r.role === 'assistant') {
      out.push({ role: 'assistant', content: r.content as never });
    } else if (r.role === 'tool') {
      out.push({ role: 'tool', content: r.content as never });
    }
    // 'system' rows skipped — the system prompt is rebuilt fresh
    // every turn from chatSystemPrompts.
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
  const systemPrompt = buildEmmaSystemPrompt({
    project: project_,
    brandKit: brandKit_,
    productBrief,
    recentAssets,
    language,
    userDisplayName: input.userDisplayName,
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
  const modelMessages: ModelMessage[] = [
    ...persistedToModelMessages(history).filter((m) => {
      // Drop empty placeholder messages from any 'system'-role rows
      // we never expect, but defensively keep the filter.
      if (Array.isArray(m.content) && m.content.length === 0) return false;
      return true;
    }),
    { role: 'user', content: userContent },
  ];

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
      const cost = estimateCostCents({
        inputTokens: step.usage?.inputTokens,
        outputTokens: step.usage?.outputTokens,
        cachedInputTokens: step.usage?.cachedInputTokens,
      });
      await db.insert(chatMessage).values({
        threadId: input.threadId,
        role: 'assistant',
        content: step.content,
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
