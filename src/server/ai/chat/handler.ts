import 'server-only';
import { anthropic } from '@ai-sdk/anthropic';
import { type ModelMessage, stepCountIs, streamText } from 'ai';
import { and, desc, eq } from 'drizzle-orm';
import type { BrandKit } from '@/server/actions/brandKits';
import type { Project } from '@/server/actions/projects';
import {
  CHAT_HISTORY_DEPTH,
  CHAT_MAX_OUTPUT_TOKENS,
  CHAT_MAX_TOOL_CALLS_PER_TURN,
  CHAT_RECENT_ASSETS_IN_CONTEXT,
} from '@/server/config/chatLimits';
import { buildEmmaSystemPrompt } from '@/server/config/chatSystemPrompts';
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
import type { EmmaToolContext } from './context';
import { buildEmmaTools } from './tools';

/**
 * Emma — the orchestrator. Phase 07.
 *
 * Per turn:
 *   1. Load thread + project + brand kit + brief + recent assets.
 *   2. Build the system prompt from chatSystemPrompts (templated,
 *      anti-hardcode compliant).
 *   3. Map persisted chat_message rows + the new user message into
 *      AI SDK ModelMessage[] (history limit honors CHAT_HISTORY_DEPTH).
 *   4. Call streamText with the bound tools, Anthropic Sonnet 4.6,
 *      stopWhen = stepCountIs(maxTurns).
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
}

const MODEL_ID = 'claude-sonnet-4-6';
const ANTHROPIC_PRICING = {
  inputPerMillion: 3, // USD
  outputPerMillion: 15, // USD
  cachedInputPerMillion: 0.3,
};

function estimateCostCents(usage: {
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
}): number {
  const inT = usage.inputTokens ?? 0;
  const outT = usage.outputTokens ?? 0;
  const cachedT = usage.cachedInputTokens ?? 0;
  const usd =
    ((inT - cachedT) * ANTHROPIC_PRICING.inputPerMillion +
      cachedT * ANTHROPIC_PRICING.cachedInputPerMillion +
      outT * ANTHROPIC_PRICING.outputPerMillion) /
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
  const language = (brandKit_.languages?.[0] ?? 'en') as 'en' | 'es';

  // ── 2. Build the system prompt ──
  const userDisplayName = 'there'; // The API route can override via input later.
  const systemPrompt = buildEmmaSystemPrompt({
    project: project_,
    brandKit: brandKit_,
    productBrief,
    recentAssets,
    language,
    userDisplayName,
  });

  // ── 3. Load history + persist the new user message ──
  const historyRows = await db
    .select()
    .from(chatMessage)
    .where(eq(chatMessage.threadId, input.threadId))
    .orderBy(desc(chatMessage.createdAt))
    .limit(CHAT_HISTORY_DEPTH);
  const history = historyRows.reverse();

  // Build the new user message content. If attachments are present we
  // include them inline as image blocks; doc attachments are
  // referenced by R2 key and Emma is expected to call
  // ingestUploadedFile to read them.
  const userContent: Array<
    | { type: 'text'; text: string }
    | {
        type: 'image';
        image: string;
        mediaType: string;
      }
  > = [];
  if (input.userMessage.text && input.userMessage.text.trim().length > 0) {
    userContent.push({ type: 'text', text: input.userMessage.text });
  }
  for (const att of input.userMessage.attachments) {
    if (att.mime.startsWith('image/')) {
      // Anthropic accepts URLs for images. We store R2 public URLs in
      // the storage layer's putR2 result; if the upload route returned
      // a key only, the client builds the public URL before sending.
      // For now, pass the R2 key as a marker and resolve at runtime.
      userContent.push({
        type: 'image',
        image: att.r2Key,
        mediaType: att.mime,
      });
    }
    // Non-image attachments are not added to the content blocks — Emma
    // calls ingestUploadedFile with the r2Key, mime, originalName. We
    // append a text marker so she knows the upload is available.
    if (!att.mime.startsWith('image/')) {
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

  // ── 6. Stream the response ──
  const result = streamText({
    model: anthropic(MODEL_ID),
    system: systemPrompt,
    messages: modelMessages,
    tools,
    maxOutputTokens: CHAT_MAX_OUTPUT_TOKENS,
    stopWhen: stepCountIs(CHAT_MAX_TOOL_CALLS_PER_TURN),
    onStepFinish: async (step) => {
      // Persist the assistant message + any tool calls + tool results
      // produced by this step. `step.content` is the AI SDK
      // ContentPart[] which closely mirrors Anthropic's content blocks.
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
        model: MODEL_ID,
      });
      await db
        .update(chatThread)
        .set({ lastMessageAt: new Date() })
        .where(eq(chatThread.id, input.threadId));
    },
  });

  return result;
}
