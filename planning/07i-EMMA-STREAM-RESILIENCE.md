# 07i — Emma · Stream resilience + lock concierge persona + brief composer

> Attach `planning/prompts/00-CONTEXT.md` AND `planning/07-PROJECT-CHAT-COPILOT.md` AND `planning/07h-EMMA-CONCIERGE-FLOATING.md`. Apply §0.10. **Production-blocking bug + persona drift.** Emma's first turn works (concierge greeting lands), then she crashes the moment Garcia asks her to CREATE something. Root cause confirmed: Emma is still trying to act as the worker (calling generation tools that were removed in 07h), the model returns `server_error`, the handler swallows it silently. Fix: stream resilience + hard-lock the concierge persona + give Emma a new `composeBrief` capability so she can hand Garcia a ready-to-use prompt for the Generate page (not generate herself).

---

## 🚨 Directive to CCM

Surgical 3-task pass.

- **Task 1 is mechanical** — log the actual error, not `[object Object]`. One-line fix.
- **Task 2 is UX** — when the stream errors, surface a retry-able card in the chat. Don't leave Emma silent.
- **Task 3 is diagnostic** — investigate WHY OpenAI returns `server_error` on the second turn but not the first. Likely root cause + fix in the same pass.

Anti-hardcode applies. Error message templates → `src/server/config/emmaErrors.ts`.

---

## Observed evidence (Garcia's screenshot + dev logs)

Visible chat sequence:
1. User: `hola` → Emma greets perfectly, mentions brand colors (`tinta #14110d, papel #f1ebdf, acento #b6481a`), explains where Garcia is (`Estás en Generate → Image para el proyecto Reachy`).
2. User: `mmm creame una` → **Emma silent. No response.**
3. User: `me puedes crear una?` → **Emma silent. No response.**

Garcia's diagnosis (exact words):
- *"cuando le pregunto a emma por que me cree una ella misma se buggea"* — when asked to create, Emma breaks
- *"y no dice algo como 'te guiare a hacerlo'"* — she should be saying "I'll guide you", NOT trying to create
- *"estaria bueno que te construyera prompts de algo escrito humanamente"* — Emma should build the brief/prompt in human voice that Garcia pastes into Generate

This confirms the root cause: Emma is still half-worker, half-concierge after 07h. The OpenAI `server_error` happens because she hallucinates a generation tool call that's no longer registered → schema validation fails on the server side.

## Observed evidence (from Garcia's dev server logs)

After a successful first turn:
```
POST /api/chat/41c9dd13-56ed-4d7a-a2dd-387166bc0eff/stream 200 in 7.2s
{
  type: 'error',
  sequence_number: 3,
  error: {
    type: 'server_error',
    code: 'server_error',
    message: 'An error occurred while processing your request. … req_2a7daf4d71fc4399940ccaf754d4a99f'
  }
}
[reachy:emma] stream error: [object Object]
[reachy:emma] dropping empty error-step (no useful content)
```

Same error 3x in a row → Emma stops responding to "mmm creame una" / "me puedes crear una?" / etc.

`server_error` from OpenAI typically means one of:
- Transient capacity/infrastructure issue (5xx-equivalent inside a 200 stream)
- Token budget exhausted (prompt + context > context window)
- Tool-call schema mismatch the reasoning model rejected
- Reasoning model unable to recover from a partial tool execution state

---

## Task 1 — Fix the logger (1-line)

Locate the handler:
```bash
grep -rn "reachy:emma.*stream error\|dropping empty error-step" src/server/ai/chat/ src/app/api/chat/
```

Replace:
```ts
console.error('[reachy:emma] stream error:', err);
```

with:
```ts
console.error('[reachy:emma] stream error:', {
  message: err instanceof Error ? err.message : String(err),
  cause: err instanceof Error ? err.cause : undefined,
  raw: typeof err === 'object' ? JSON.stringify(err, null, 2).slice(0, 500) : err,
});
```

Now log lines actually tell us what happened (model, openai request id, status, etc).

---

## Task 2 — Surface stream errors to the user

Currently `dropping empty error-step (no useful content)` silently swallows the error and persists nothing. Emma appears to ghost the user.

Fix in the stream handler — when an `error` event arrives mid-stream:

1. **Persist an assistant message** to `chat_message` with `role: 'assistant'`, `content: { type: 'text', text: errorMessageTemplate(err) }`, `model: emmaModel`, `cost_cents: 0`, plus `attachments: []`. Set a new column `is_error_surface: boolean` so the UI can render it differently.

2. **Render the error inline** in the chat as a compact card (NOT a full assistant message):
```
┌────────────────────────────────────────────────┐
│ ⚠  Emma se trabó por un error transitorio      │
│ OpenAI request_id: req_2a7daf4d…                │
│ [reintentar]  [reportar]                        │
└────────────────────────────────────────────────┘
```

Card styling: 0.5px ink-25 border, `var(--emma-paper-2)` background, warning icon left, small mono request_id, two action chips.

**[reintentar]**: re-sends the last user message (re-fires the stream with the same prompt). The error card stays in history but becomes muted (50% opacity) once a successful retry lands.

**[reportar]**: opens a small dialog where Garcia can paste a note + auto-includes the `request_id` and the last 3 messages. Saves to a new `error_report` table OR just copies to clipboard for v1.

3. **Toast alert** ALSO fires on stream error: `Emma se trabó — revisa el chat para reintentar.` Sonner toast, 5s duration.

Templates in `src/server/config/emmaErrors.ts`:
```ts
export const EMMA_ERROR_TEMPLATES = {
  STREAM_TRANSIENT_ES: (reqId: string) => `Emma se trabó por un error transitorio.\nOpenAI request_id: ${reqId}`,
  STREAM_TRANSIENT_EN: (reqId: string) => `Emma hit a transient stream error.\nOpenAI request_id: ${reqId}`,
  TOAST_RETRY_ES: 'Emma se trabó — revisa el chat para reintentar.',
  TOAST_RETRY_EN: 'Emma hit an error — check the chat to retry.',
} as const;
```

---

## Task 3 — Diagnose the root cause

Two parallel investigations:

### 3a. Token budget check

After every `useChat` turn, log the prompt size before dispatch:

```ts
const totalChars = systemPrompt.length + messages.reduce((a, m) => a + (typeof m.content === 'string' ? m.content.length : 0), 0);
console.log(`[reachy:emma] dispatching turn: ${messages.length} messages, ~${totalChars} chars, ~${Math.round(totalChars / 4)} tokens`);
```

If you see `~150000 tokens` before the error, the prompt is exceeding `gpt-5.5`'s context window (verify exact limit via WebSearch — likely 200k or 400k).

Fix: trim history. Use a rolling window — keep last N messages (config-driven, default 30) + always-included system prompt + brand kit context. Discard older turns gracefully.

```ts
// src/server/config/chatLimits.ts
export const EMMA_HISTORY_WINDOW = 30;
export const EMMA_HISTORY_MAX_TOKENS_APPROX = 80000; // safety ceiling
```

### 3b. Tool-call schema validation

`gpt-5.5` with `reasoning_effort` is stricter about tool schemas than gpt-4o. Check that every tool's JSON schema is strictly-valid and that previous turn's `tool_use` + `tool_result` blocks are properly interleaved.

Common gotcha: if a tool_use in turn N is NOT followed by its tool_result in the same conversation (e.g., because the user sent a new message before the tool finished), the model can reject the next turn.

Inspect the persisted `chat_message` rows for the failing thread:
```ts
const messages = await db.select().from(chatMessage).where(eq(chatMessage.threadId, '41c9dd13-…')).orderBy(chatMessage.createdAt);
```

Look for any `tool_use` block without a matching `tool_result`. If found, that's the root cause.

Fix: when a stream errors mid-tool-execution, ALSO persist a synthetic `tool_result` for any orphaned `tool_use` with `{ status: 'error', message: 'tool interrupted' }`. So the next turn's history is well-formed.

### 3c. HARD-LOCK the concierge persona in the system prompt

Garcia's evidence shows Emma still acts like a worker. The 07h system prompt sections aren't strong enough OR the model is over-fitting to its trained "assistant should call tools" behavior.

In `src/server/config/emmaConcierge.ts` (or wherever the system prompt lives), REPLACE the soft phrasing with explicit prohibitions + a concrete script:

```ts
export const EMMA_CONCIERGE_SECTIONS = {
  ROLE: `You are Emma — a concierge inside Reachy. Your job is to GUIDE Garcia to use the app, NOT to produce assets yourself. The app has dedicated pages for generation (Generate → Image, Generate → Reel, Autopilot, the Campaign editor). Your value is composing the brief and pointing to the right surface.`,

  HARD_RULES: `
RULES YOU MUST NOT BREAK:
1. You DO NOT generate images, copy, or reels yourself. You have NO tool for that. If Garcia asks "créame una imagen" or similar, you DO NOT attempt to fulfill the request directly. Instead you:
   (a) compose a complete, human-feeling brief he can use
   (b) tell him which page to paste it into (e.g., "te llevo a Generate → Image")
   (c) optionally call navigateTo({ path }) AFTER his confirmation
2. You DO NOT invent tools. The ONLY tools you have are: navigateTo, highlightElement, getCurrentPageContext, summarizeProject, findInLibrary, explainFeature, recommendNextStep, searchDocs, describeImage, ingestUploadedFile, composeBrief, extendBrandKit.
3. You write briefs in CONCRETE, HUMAN language — like a senior copywriter would write for himself. Specific reader, specific moment, specific outcome. Not corporate templates.`,

  CRITICAL_RESPONSE_PATTERN_CREATE: `
When Garcia asks you to CREATE / MAKE / GENERATE / "creame" / "hazme" / "diseña":
1. Confirm what you understand (1 line).
2. Call composeBrief with the right channel + context.
3. Show him the brief inline in your response, formatted clearly.
4. Tell him EXACTLY where to paste it ("Va en Generate → Image, campo Idea") and offer to navigate him there with confirmation.

Example:
  Garcia: "creame una imagen para LinkedIn sobre la feature de RAG chat"
  Emma:   "Listo. Te armo el brief y te llevo a Generate → Image.
          [composeBrief tool fires]
          Aquí va, copialo en el campo IDEA:
          ───────────────────────────────────
          {the composed brief, human-voiced}
          ───────────────────────────────────
          ¿Te llevo a Generate → Image ahora?"
  Garcia: "sí"
  Emma:   [navigateTo({ path: '/app/projects/reachy/generate/image' })]`,

  WHEN_SHE_LEAKS: `If you find yourself wanting to call a generation tool that doesn't exist, STOP. You don't have it. Compose a brief instead.`,
};
```

### 3d. Add the composeBrief tool

NEW tool: `composeBrief`. Emma's most-used capability for "create me X" requests.

```ts
// src/server/ai/chat/tools/composeBrief.ts
export const composeBrief = tool({
  description: 'Compose a complete, human-voiced brief that Garcia can paste into Reachy\'s Generate page. Used when Garcia asks for content but Emma must NOT generate it herself.',
  parameters: z.object({
    channel: z.enum(['image-ig', 'image-linkedin', 'image-og', 'image-email-header', 'copy-linkedin-long', 'copy-linkedin-short', 'copy-x-thread', 'copy-ig-caption', 'copy-email-cold', 'copy-email-warm', 'copy-blog-outline', 'copy-press-release', 'reel-15s', 'reel-30s']),
    productContext: z.string().describe('What the brief is about — feature, moment, audience moment'),
    voiceHint: z.string().optional().describe('Specific voice direction beyond the brand default'),
  }),
  execute: async ({ channel, productContext, voiceHint }) => {
    // Server-side LLM call (gpt-5.5 reasoning='medium') that composes a brief
    // following the same exemplar-based pattern from Step 06 image-copy planner.
    // Returns a multi-line string in the project's language (ES/EN).
    const brief = await composeBriefServerSide({ channel, productContext, voiceHint, projectId });
    return { brief, channel, pasteLocation: pasteLocationFor(channel) };
  },
});
```

Where `pasteLocationFor` returns navigation hints from `src/server/config/pasteLocations.ts`:
```ts
export const PASTE_LOCATIONS = {
  'image-ig': { path: '/app/projects/{slug}/generate/image', field: 'Idea', formatPreset: 'post-ig' },
  'image-linkedin': { path: '/app/projects/{slug}/generate/image', field: 'Idea', formatPreset: 'linkedin-post-landscape' },
  // ...one entry per channel
};
```

Emma uses `pasteLocation` to phrase her navigation suggestion concretely: *"Va en Generate → Image, en el campo Idea. ¿Te llevo?"*

### 3e. Verify model + provider options

Re-check the call site:

```bash
grep -n "openai('gpt-" src/server/ai/chat/handler.ts
```

Confirm:
- `model: openai('gpt-5.5')` is correct (not `'gpt-5.5-preview'` or some deprecated id)
- `providerOptions.openai.reasoningEffort` is set to a valid value (`'low' | 'medium' | 'high'`)
- `tools` array passes `gpt-5.5`'s schema validator (strict JSON, no `oneOf` if not allowed, etc.)

WebSearch for `openai gpt-5.5 reasoning model server_error tool_use May 2026` — there may be a known issue or workaround documented.

---

## Schema

```sql
ALTER TABLE chat_message ADD COLUMN is_error_surface boolean DEFAULT false;
ALTER TABLE chat_message ADD COLUMN openai_request_id text;
```

Migration: `0012_chat_error_surface.sql`.

---

## Files

Edit:
- `src/server/ai/chat/handler.ts` — fix logger, persist error message, capture request_id, register composeBrief tool, REMOVE any leftover registration of generation tools (`generateImage`, `writeCopy`, etc — should be gone from 07h but verify with `grep -n "generateImage\|writeCopy\|regenerateAsset" src/server/ai/chat/handler.ts`)
- `src/server/config/emmaConcierge.ts` (or `chatSystemPrompts.ts`) — replace persona sections with the HARD_RULES + CRITICAL_RESPONSE_PATTERN_CREATE from Task 3c
- `src/components/app/chat-message.tsx` — render `is_error_surface` messages as the warning card + render briefs from composeBrief tool with copy-to-clipboard chip
- `src/components/app/emma-chat.tsx` — wire toast on error, retry handler

Create:
- `src/components/app/chat-error-card.tsx`
- `src/components/app/chat-brief-card.tsx` — renders the composeBrief tool result as a copy-paste-ready block with `[copiar al portapapeles]` and `[ir a Generate]` chips
- `src/server/config/emmaErrors.ts`
- `src/server/config/pasteLocations.ts` — channel → page/field mapping
- `src/server/ai/chat/tools/composeBrief.ts`
- `src/server/ai/composeBriefServerSide.ts` — the LLM call that produces the brief (gpt-5.5 reasoning='medium', uses exemplars from `src/server/config/exemplars/` from Step 06)
- `src/server/db/migrations/0012_chat_error_surface.sql`

---

## Verify

```bash
pnpm typecheck && pnpm lint && pnpm build
```

Then in `pnpm dev` at the chat:

1. **Log quality**: trigger any tool call → check dev terminal → `[reachy:emma] dispatching turn: X messages, ~N chars` AND any error logs include `message`, `cause`, and a `raw` preview, NOT `[object Object]`.
2. **Force an error**: temporarily inject `throw new Error('test')` in the handler → reload chat, send a message → see error card in chat with `[reintentar] [reportar]` chips + Sonner toast.
3. **Retry works**: click `[reintentar]` → same prompt re-fires → success → original error card muted to 50%.
4. **Reproduce the real bug**: send a few messages until OpenAI errors. The card should now appear (NOT silent ghost).
5. **Long conversation**: send 40+ messages → confirm history-window trimming kicks in (log line shows token count staying under cap).
6. **Verify orphaned tool_use cleanup**: kill the dev server mid-tool-call → restart → next message should NOT immediately error (synthetic tool_result was persisted on disconnect).
7. **Concierge persona holds**: send "creame una imagen para LinkedIn sobre RAG chat" → Emma DOES NOT try to generate. She:
   - confirms understanding in 1 line
   - calls `composeBrief` tool
   - shows a multi-line, human-voiced brief inline with `[copiar]` + `[ir a Generate]` chips
   - asks "¿te llevo?"
   - on confirm → calls `navigateTo`
8. **Brief quality**: the composed brief is NOT a one-liner. It includes target reader, emotional hook, key features to reference, suggested headline direction. Human-feel, not corporate template.
9. **No tool hallucination**: verify in dev log NO entries with `tool_name: 'generateImage'` (or any removed worker tool). If they appear, the system prompt isn't strong enough yet — strengthen until they stop.

---

## Done

Reply with:
- Dev terminal screenshot showing the new structured error log (not `[object Object]`).
- Screenshot of the in-chat error card with retry button.
- Screenshot proving toast fires.
- The actual diagnosed root cause for the `server_error` (token budget? orphaned tool_use? model id? schema bug? rate limit?). Report what you found.
- 1 short paragraph: after the fix, is Emma stable across 20+ turns or does she still die?
