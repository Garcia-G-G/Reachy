# 07 — Emma · Per-project conversational content co-pilot

> Attach `planning/prompts/00-CONTEXT.md`. Apply §0.10. New feature. Replaces "drop file → 18 assets blindly" with "Emma, your per-project AI co-pilot, iterates to excellence one asset at a time." This is what ChatGPT Pro users do; it's why their outputs land. Build it native into Reachy.
>
> **The assistant's name is Emma.** Persona: warm, direct, editorial-voiced, treats Garcia like a co-worker not a customer. Bilingual ES/EN per project's brand kit. Emma is the brand of the chat experience — not "AI assistant", not "Reachy bot". Just Emma. Use the name consistently in UI labels, system prompt, welcome states, error states, and the brand-kit-aware language Emma uses to refer to herself.

---

## 🚨 Directive to CCM — Read this twice

This is a flagship feature, not a side panel. **Do your best work.**

- **Streaming first.** No "wait for response" loading spinners. The user sees tokens as they arrive. This is non-negotiable UX.
- **Tool calls are visible inline.** When the model calls `generateImage`, the chat shows a card "Generating image…" with a spinner, then the image renders IN THE SAME BUBBLE when ready. NOT a redirect to a different page.
- **Memory is real.** The conversation persists in the DB. Closing the tab and reopening 2 days later → same context, brand kit auto-reloaded, last 50 messages restored.
- **Anti-hardcode applies.** System prompts are templates that fill in from brand kit + brief at runtime, NOT literal strings. See audit step.
- **One-shot quality.** When the user asks for an asset, the model produces ONE good asset, not 4 variants. The user iterates conversationally if they want variations.
- **No cost shortcuts.** Use Claude Sonnet 4.6 (per the OpenAI catalog research from Step 06, Anthropic's Sonnet is the right choice for conversational Spanish + tool use) with reasoning. Don't downgrade to Haiku for conversation.

---

## Web-verified facts (May 2026 — don't re-research these)

- Anthropic Messages API: streaming + tool use via `stream: true` + `tools: [...]`. Multi-turn agentic loops are native. Model: `claude-sonnet-4-6` (latest stable in May 2026, supports reasoning + 200k context + tool use + image inputs).
- Vercel AI SDK v5 is the standard for streaming chat in Next.js 15 App Router. `streamText` + `useChat` handle SSE + tool calls cleanly. Auto-adapts to Anthropic.
- Pricing (Claude Sonnet 4.6): ~$3 in / $15 out per 1M tokens. Cached input ~$0.30/M. Conversation cost ~$0.01-0.05 per turn at typical sizes.
- For images IN THE CHAT REPLY (when model wants to show "this is what I'd generate"), DO NOT use vision input — call the existing `generateImage` tool which returns a URL. Vision input is for the user UPLOADING images into the chat.

Sources:
- [Anthropic Messages API — tool use](https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/overview)
- [Vercel AI SDK v5 docs](https://ai-sdk.dev/docs/introduction)

---

## Per-project model

Garcia confirmed: **chat per project**. Each project has exactly one persistent chat thread (lazy-created on first message). Opening `/app/projects/[slug]/chat` enters that project's chat with full context auto-loaded: brand kit, ProductBrief snapshot (from the latest ingestion), audience, tone, voice, last 10 generated assets.

Closing the tab and reopening 2 days later → same conversation, no re-explanation needed.

---

## UX

### Page: `/app/projects/[slug]/chat`

```
┌─────────────────────────────────────────────────────────┐
│  Emma · FeedbackMind                          archive ↗ │ ← header (Emma + project)
│  brand: editorial · ink #111827 · 18 assets in library  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  [Emma] FeedbackMind context loaded — 18 assets in     │ ← system-style caption
│  library, brand voice editorial, last touch 4 days ago. │   (Emma narrates the load)
│                                                         │
│  [Garcia] I want a hero image for the new RAG chat      │
│  feature.                                               │
│                                                         │
│  [Emma]  Good call — for the RAG chat feature I'd       │
│  position it as the "ask your feedback" moment. Format: │
│  LinkedIn 1200×627. Layout: hero-split-left for a       │
│  product-screenshot-feel. Brand voice editorial.        │
│                                                         │
│  Headline draft: "Ask: what are users saying about      │
│  onboarding this week?"                                 │
│                                                         │
│  Generating now…                                        │
│                                                         │
│  ┌─────────────────────────────────┐                    │ ← inline asset card
│  │ [generated image preview]       │                    │   (image as it renders)
│  │                                 │                    │
│  │ score: 8.1 · cost: $0.21        │                    │
│  │ [mejorar] [variante] [guardar]  │                    │ ← quick actions
│  └─────────────────────────────────┘                    │
│                                                         │
├─────────────────────────────────────────────────────────┤
│  [textarea — Pregúntale a Emma sobre FeedbackMind…]     │ ← input (named)
│                                          [enter ↩]      │
└─────────────────────────────────────────────────────────┘
```

The user's display name in the chat comes from `session.user.name ?? session.user.email.split('@')[0]`. Emma's name is always "Emma" — never localized, never templated. It's her name.

### Behaviors

- **Streaming**: assistant tokens stream live. Tool calls render as cards that fill in when the tool completes.
- **Quick actions** under any assistant-generated asset: `[mejorar]` (iterates with the model's own critique), `[variante]` (re-runs with same params), `[guardar al library]` (promotes to a real campaign_asset row).
- **Slash commands** in the input box: `/imagen`, `/copy linkedin`, `/reel 15s`, `/marca` (show brand kit), `/historia` (show recent assets). These compile into structured tool calls.
- **Context chip header** under the title: "brand: editorial · ink #111827 · 18 assets in library" — clickable, expands to a sidebar showing the full brand kit and recent thumbs.
- **Cost ticker** in the header: `$1.23 this conversation`. Live updates.
- **Archive ↗**: navigates to the campaign gallery for that project (the bulk-generate path stays — chat is additive).

### Multimodal input — Emma accepts files, photos, screenshots, anything

Emma is a real multimodal AI, not a text-only bot. The input box supports:

- **📎 Attach files** — drag-and-drop into the input area OR click the paperclip icon. Accepted: `.png`, `.jpg`, `.webp`, `.gif`, `.pdf`, `.docx`, `.pptx`, `.xlsx`, `.csv`, `.md`, `.txt`, `.html`, `.json`, `.yaml`, `.zip`, `.mp4` — same allowlist as the Autopilot ingest path (reuse `src/server/config/acceptedFileTypes.ts`).
- **📋 Paste images** — Cmd/Ctrl-V of a screenshot drops it inline (e.g., paste a competitor's IG post and ask "produce ours in this style but on-brand").
- **🖼 Inline preview** — uploaded files render as thumbnails IN the user's message bubble before Emma replies. Click to expand.
- **Vision-native** — images become `image` content blocks for Claude Messages API (`type: 'image'`, base64 or URL). Emma can describe them, critique them, use them as style reference, extract text via OCR.
- **Document parsing inline** — `.pdf`/`.docx`/`.pptx`/`.xlsx` etc. get parsed via the existing Step 1 parsers (`src/server/ingest/parsers/`). Emma sees the extracted text + table data as additional context blocks in the same turn.
- **Reference-image generation** — when the user uploads an image AND requests a new asset, Emma passes the upload as a `reference_image` to `generateImage` (uses `openai.images.edit` under the hood — up to 16 refs supported per the Step 4 audit).
- **Persistent attachments** — uploaded files are saved to R2 under `uploads/{userId}/chat/{threadId}/{messageId}/...` and referenced in `chat_message.content` (Anthropic Messages content format already supports image + document blocks). Re-loading the conversation 3 days later still shows the original attachments.
- **Size cap** — same as Autopilot: 100 MB per upload, 25 MB per file, 250 files per conversation (config-driven from `parserLimits.ts`).

UX example (multimodal turn):

```
[Garcia] [📎 competitor-ig-post.png attached]
         Make ours in this style but using our brand voice.

[Emma]   I see — clean centered headline, soft cream backdrop, single product mockup
         lower-right, accent on the wordmark. I'll translate that into our editorial
         palette (#111827 ink / #F1EBDF paper / #B6481A accent) and use our
         feature-stack layout for IG 4:5.

         Headline draft: "Stop digging through 47 feedback threads."

         Generating now…

         [generated image] ← uses competitor-ig-post.png as composition reference,
                              applies brand palette + voice
```

Required new tools (added to the tool list below): `ingestUploadedFile` for parsing docs in-conversation, `describeImage` for analyzing user-uploaded screenshots.

---

## Tools the model can call

All tools live in `src/server/ai/chat/tools/`. Each exports a typed tool def for the Anthropic Messages API and a server-side handler.

### 1. `generateImage`
```ts
{ format: ImageFormat, layout: LayoutId, idea: string, style?: VisualStyleKey, n?: 1|2|4, referenceImageKeys?: string[] }
```
Enqueues an image-gen job via the existing pipeline (with the upgraded Step-06 copyPlanner getting full brief context). When `referenceImageKeys` is set, the upstream `openai.images.edit` path is used with the uploaded R2-stored images as composition references. Returns `{ generationId, assetUrls[], cost, criticScore? }`. The chat handler polls until done (max 5min) and streams a "still rendering…" placeholder during the wait.

### 2. `writeCopy`
```ts
{ channel: ChannelKey, brief: string, targetWords?: number }
```
Inline LLM call (gpt-5.5 medium per Step 06). Returns `{ text, cost }`. Renders as a code-block style card in chat.

### 3. `regenerateAsset`
```ts
{ assetId: string, tweakHint: string }
```
For when the user says "make the headline shorter" or "more enterprise tone". Pulls the original brief + copy, applies the hint, re-runs.

### 4. `iterateImageCopy`
```ts
{ generationId: string, slot: 'eyebrow'|'headline'|'subheadline'|'cta', newText: string }
```
Re-renders the SAME image background with new typography text (free — no AI image call, just re-runs composeImage). Fast iteration loop.

### 5. `searchAssets`
```ts
{ query: string, kind?: 'image'|'copy'|'reel', limit?: number }
```
Vector or keyword search over project's generated assets. For "remember that LinkedIn post I made last week?"

### 6. `searchBrandKit`
```ts
{ field?: 'palette'|'tone'|'voice'|'audience'|'logo' }
```
Returns the brand kit details. Used when the model needs to check before suggesting.

### 7. `saveAsCampaignAsset`
```ts
{ generationId: string, channel?: ChannelKey }
```
Promotes a chat-generated asset to a permanent campaign_asset row, taggable to a campaign (or standalone). The library/gallery picks it up.

### 8. `listLayouts` / `listChannels` / `listVisualStyles`
Discoverability for the user — when the model is helping them pick.

### 9. `ingestUploadedFile`
```ts
{ messageId: string, fileR2Key: string, mime: string, originalName: string }
```
Reuses the Step-1 parsers (`src/server/ingest/dispatch.ts` + `parsers/*`). Returns the parsed text blocks, tables, code context, etc. Emma calls this AUTOMATICALLY when the user attaches a doc/sheet/pdf — she always wants to read what was attached. Returns `{ textBlocks, tables, codeContext, summary }`. Cost: ~$0.01-0.05 if vision OCR was needed; otherwise pure CPU.

### 10. `describeImage`
```ts
{ messageId: string, imageR2Key: string, focus?: 'style'|'copy'|'composition'|'palette' }
```
gpt-4o vision call against an uploaded image. Returns `{ description, palette: hex[], styleDescriptor, textInImage?, suggestedUsesInBrand }`. Emma calls this when the user uploads a reference image without explicit instructions — she wants to know what she's looking at before suggesting how to use it. Cost: ~$0.01-0.02 at `detail: low`.

### 11. `extendBrandKit`
```ts
{ field: 'logo'|'palette'|'fontHint'|'voiceSample', value: string }
```
When a user uploads a logo via the chat ("hey Emma, esta es nuestra marca"), Emma can persist it to the project's brand kit (after explicit user confirmation in chat). Same for palette overrides extracted via `describeImage`. Confirmation gate: Emma MUST get a yes/no from the user before mutating the brand kit.

---

## Schema

```sql
CREATE TABLE chat_thread (
  id uuid PRIMARY KEY,
  project_id uuid REFERENCES project(id) ON DELETE CASCADE UNIQUE,  -- 1:1 per project
  created_at timestamptz DEFAULT now(),
  last_message_at timestamptz
);

CREATE TABLE chat_message (
  id uuid PRIMARY KEY,
  thread_id uuid REFERENCES chat_thread(id) ON DELETE CASCADE,
  role text NOT NULL,                  -- 'user' | 'assistant' | 'system' | 'tool'
  content jsonb NOT NULL,              -- Anthropic Messages content format: text blocks, tool_use, tool_result, image, document
  tool_use_id text,                    -- for matching tool_result back to tool_use
  attachments jsonb DEFAULT '[]'::jsonb,  -- [{ r2Key, mime, originalName, sizeBytes }] for files Garcia uploaded
  cost_cents int DEFAULT 0,
  model text,                          -- which model produced this turn
  created_at timestamptz DEFAULT now()
);

CREATE INDEX chat_message_thread_idx ON chat_message(thread_id, created_at);
```

Migration: `0011_chat_threads.sql`.

---

## Backend

### API route: `src/app/api/chat/[threadId]/stream/route.ts`

POST endpoint. Receives the new user message. Loads thread history (last 50 messages or rolling token budget — config-driven from `src/server/config/chatLimits.ts`). Loads project + brand kit + ProductBrief + recent assets (last 10). Builds the system prompt from `src/server/config/chatSystemPrompts.ts` templates (NOT inline strings — anti-hardcode). Calls Anthropic Messages API with `stream: true` + tool defs.

Returns Server-Sent Events stream. Each event: text token, tool_use start, tool_use result, message_stop.

Use Vercel AI SDK v5's `streamText` for the streaming machinery.

### Server action: `src/server/actions/chat.ts`

- `createOrGetThread(projectId)` — returns the project's thread, lazy-creates.
- `getThreadMessages(threadId, { limit })` — paginated history for the UI.
- `deleteThreadHistory(threadId)` — for "reset conversation" UX.

### System prompt template (in `src/server/config/chatSystemPrompts.ts`)

The system prompt is BUILT at runtime from named constants + interpolated project data:

```ts
export const EMMA_SYSTEM_SECTIONS = {
  ROLE: 'You are Emma — the AI content co-pilot inside Reachy. You help indie hackers ship marketing for their SaaS apps. One conversation per project, deep context, iterate to excellence one asset at a time. Refer to yourself as Emma. Never call yourself "an AI", "an assistant", or "Reachy bot".',
  PERSONA: 'Warm, direct, editorial-voiced. Treat the user like a co-worker, not a customer. No flattery, no fluff, no apologies for things you have not done wrong. Push back when the user proposes something off-brand.',
  WORKFLOW: 'For each request: (1) confirm what you understand in one sentence, (2) propose ONE concrete spec (format + layout + headline draft), (3) call the right tool to generate, (4) after the asset renders, offer 2-3 specific iteration directions in a bulleted list.',
  ITERATION_BIAS: 'Bias toward iteration over breadth. Better to produce one excellent asset than three mediocre ones. If the user says "good enough" — accept and move on. If they do not, push for a sharper version with a specific hypothesis about what to change.',
  MULTIMODAL: 'When the user attaches a file, ALWAYS look at it before responding. For images: call describeImage if the user did not explain what it is. For docs/sheets/pdfs: call ingestUploadedFile and read the parsed content. Use uploaded images as composition references in generateImage via referenceImageKeys when the user asks for "something like this".',
  BRAND_FIDELITY: 'You have the project brand kit loaded permanently. Use it. Never invent a different palette, voice, or audience. If the user requests something off-brand, surface the conflict first and offer two paths: respect the brand kit OR mutate the brand kit (with confirmation).',
  LANGUAGE: 'Match the project brand kit language by default. If the brand is ES, respond in Spanish. If EN, English. If user switches mid-conversation, follow them but flag it once.',
  // ... more sections, all named constants with comments
};

export function buildEmmaSystemPrompt(input: {
  project: Project;
  brandKit: BrandKit;
  productBrief: ProductBrief | null;
  recentAssets: Array<{ kind: string; brief: string; createdAt: Date }>;
  language: 'en' | 'es';
  userDisplayName: string;        // for natural greetings: "Hola Garcia"
}): string;
```

The function interpolates the named sections + runtime context. Each runtime block (brand voice, recent assets) is its own template helper.

---

## Anti-hardcode rule (still active — Phase 06 carries over)

```
rg -n '"[^"]{30,}"' src/server/ai/chat src/app/api/chat
```

Long strings allowed ONLY in `src/server/config/chatSystemPrompts.ts` + `chatLimits.ts` as named, commented constants.

---

## Files

Create:
- `src/app/app/projects/[slug]/chat/page.tsx`
- `src/components/app/emma-chat.tsx` (the main client component, uses Vercel AI SDK)
- `src/components/app/chat-message.tsx`
- `src/components/app/chat-tool-card.tsx` (renders tool-use inline preview)
- `src/components/app/chat-quick-actions.tsx`
- `src/components/app/chat-attachment-dropzone.tsx` (drag-drop + paste + paperclip → uploads to R2 BEFORE the send)
- `src/components/app/chat-attachment-thumb.tsx` (inline preview in the user's message bubble)
- `src/app/api/chat/[threadId]/stream/route.ts`
- `src/app/api/chat/[threadId]/upload/route.ts` (handles file uploads, streams to R2, returns the r2Key for the next send)
- `src/server/ai/chat/handler.ts` (orchestrator)
- `src/server/ai/chat/tools/{generateImage,writeCopy,regenerateAsset,iterateImageCopy,searchAssets,searchBrandKit,saveAsCampaignAsset,listLayouts,listChannels,listVisualStyles,ingestUploadedFile,describeImage,extendBrandKit}.ts` (13 tool files)
- `src/server/actions/chat.ts`
- `src/server/db/schema/chatThreads.ts`
- `src/server/db/schema/chatMessages.ts`
- `src/server/db/migrations/0011_chat_threads.sql`
- `src/server/config/chatSystemPrompts.ts` (Emma persona sections, all named constants)
- `src/server/config/chatLimits.ts` (history depth, max tool calls per turn, max tokens per response, max attachments per turn)

Edit:
- `src/components/app/sidebar.tsx` (or wherever project nav lives) — add "Chat" link inside each project
- `src/server/db/schema/index.ts` (export new schemas)
- `package.json` — add `ai` (Vercel AI SDK v5) + `@ai-sdk/anthropic` if not present

---

## Verify

```
pnpm typecheck && pnpm lint && pnpm build
```

Then in `pnpm dev`:
1. Navigate to `/app/projects/feedbackmind-3/chat` → Emma greets, brand kit auto-loaded in header chip. Header shows "Emma · FeedbackMind".
2. Type "Quiero una imagen LinkedIn 1200×627 sobre la feature de RAG chat" → Emma confirms intent in 1 line, proposes layout + headline, calls `generateImage` tool, image renders inline within ~60s. Emma refers to herself by name.
3. Click `[mejorar]` under the image → Emma critiques her own output + offers 3 specific revisions as bullets. User picks one → new asset.
4. **Attach a competitor screenshot** via drag-drop → thumbnail appears in user bubble → Emma calls `describeImage` automatically → responds with style analysis → proposes a brand-aligned variant → calls `generateImage` with the screenshot as `referenceImageKeys`.
5. **Upload the FeedbackMind portfolio docx** via paperclip → Emma calls `ingestUploadedFile` → reads it → updates her context understanding → does NOT re-create the project (it already exists) but acknowledges what she learned.
6. Close tab. Reopen `/chat` 5 min later → conversation history intact, attachments still visible as thumbnails, Emma resumes seamlessly.
7. Type `/copy linkedin` → slash command compiles, opens a structured prompt for channel-specific copy.
8. Click `[guardar al library]` on a chat-generated asset → row promoted to campaign_asset, visible in gallery.
9. Paste a screenshot (Cmd-V) of a Linear marketing post → it appears inline in the input draft → press send → Emma references its composition specifically in her reply.
10. Cost ticker in header increments per turn (`$0.04 → $0.18 → $0.42`).
11. Grep: `rg -n '"[^"]{30,}"' src/server/ai/chat src/app/api/chat` → 0 matches outside `src/server/config/`.

---

## Done

Reply with:
- Screenshot of `/chat` after a 3-turn conversation that produced 1 image + 1 copy.
- Verify streaming works (no "all-at-once" reveal of long responses).
- 1 example of `[mejorar]` flow: original output → critic-generated revision direction → user picks → new output.
- Cost breakdown: chat LLM calls (Anthropic) vs tool execution costs (image gen, copy gen).
- Schema migration applied cleanly.
- Anti-hardcode grep (0 matches outside config/).
- 1 short paragraph honestly describing the UX feel — does it feel native, or like a bolted-on widget?

Sources:
- [Anthropic Messages API — tool use](https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/overview)
- [Vercel AI SDK v5 — streaming](https://ai-sdk.dev/docs/foundations/streaming)
- [Vercel AI SDK — tool calling](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling)
