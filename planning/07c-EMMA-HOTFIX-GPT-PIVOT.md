# 07c — Emma · Hotfixes + GPT-only pivot

> Attach `planning/prompts/00-CONTEXT.md` AND `planning/07-PROJECT-CHAT-COPILOT.md` AND `planning/07b-EMMA-DESIGN-ANIMATIONS.md`. Apply §0.10. **Hotfix + architectural alignment pass.** Emma is shipped and the design landed perfect. Two visible bugs to squash + one structural decision: Emma runs on OpenAI GPT, not Anthropic Claude. The entire Reachy stack is GPT-based; Emma must align.

---

## 🚨 Directive to CCM

This is a tight surgical pass. Three deliverables. Don't gold-plate.

- **Bug fixes are mechanical.** Don't redesign the input handler — just clear the value on submit. Don't redesign the greeting — just guard the interpolation.
- **The GPT pivot is the heavy item.** Replace every Anthropic call in Emma's chat handler with GPT. Use `gpt-5.5` with `reasoning_effort: 'medium'` for conversation, `'high'` when the model needs deep planning before tool calls. Vercel AI SDK v5 supports both providers identically — the swap is mostly in `src/server/ai/chat/handler.ts` + dependency cleanup.
- **Anti-hardcode applies as always.** Model IDs, reasoning levels, system-prompt sections — all stay in `src/server/config/*`.

---

## Task 1 — Input doesn't clear after send (bug)

**Repro:** Type "hola emma" → press Enter → message appears in conversation → textarea STILL shows "hola emma".

**Fix:** In `src/components/app/emma-chat.tsx` (or wherever the submit handler lives — find it via `grep -n 'handleSubmit\|onSubmit\|append(' src/components/app/emma-*`):

After successful `append()` / `sendMessage()` call, explicitly call:
```ts
setInput('');
```

If the component uses Vercel AI SDK's `useChat` hook, that's the standard pattern — `useChat` exposes `input`, `handleInputChange`, `handleSubmit`. The `handleSubmit` SHOULD clear the input automatically but a custom wrapper may have broken that. Verify by reading the handler chain.

If you're calling a custom `append({ role: 'user', content })`, follow it immediately with `setInput('')` + reset any local draft state (uploaded attachments thumbnails, etc).

Also handle the **`stop` action mid-stream** — clicking `stop` during a streaming response (visible in the screenshot when Emma is generating) should:
1. Abort the stream via the AI SDK's `stop()` method.
2. Keep the partial assistant message visible.
3. Re-enable the input.

---

## Task 2 — Greeting has empty `{firstName}` interpolation (bug)

**Repro:** Greeting reads `"Hi . Your brand reads calmado..."` — the period after `Hi` shows the interpolation slot was empty.

**Root cause:** `buildEmmaSystemPrompt({ userDisplayName })` (in `src/server/config/chatSystemPrompts.ts`) gets `userDisplayName: undefined` from somewhere up the chain.

**Fix in two places:**

1. **At the call site** (the route or handler that builds Emma's system prompt): derive the user's display name safely.
   ```ts
   const userDisplayName =
     session.user.name?.trim() ||
     session.user.email?.split('@')[0] ||
     'amigo'; // last-resort fallback (config-driven, see below)
   ```

2. **In `chatSystemPrompts.ts`**: the greeting template should NEVER produce a malformed sentence even with empty input. Move the greeting fallback to a typed constant:
   ```ts
   export const EMMA_FALLBACK_GREETING_NAME = 'amigo';  // for the rare case where userDisplayName is genuinely empty
   ```
   And in the prompt template:
   ```ts
   `Hola ${input.userDisplayName || EMMA_FALLBACK_GREETING_NAME}.`
   ```

Also: the current greeting is in English (`"Hi"`) when the project language is Spanish. Fix the greeting to honor the brand kit language:
- ES: `"Hola ${name}."`
- EN: `"Hi ${name}."`

These greeting templates live in `chatSystemPrompts.ts` as `EMMA_GREETING_TEMPLATES = { es: '...', en: '...' }`.

---

## Task 3 — Pivot Emma's LLM from Anthropic to GPT (architectural)

### Why

The entire Reachy stack runs on OpenAI:
- `extractBrief.ts` → gpt-5.5
- `planCampaign.ts` → gpt-5.5
- `copyPlanner.ts` → gpt-5.5 (post Step 06)
- `channelCopy.ts` → gpt-5.5 (post Step 06)
- `critic.ts` → gpt-5.5 (post Step 06)
- `imageGen.ts` → gpt-image-2
- `inferPaletteFromText.ts` → gpt-5.5
- `audio/elevenlabs.ts` → ElevenLabs TTS (with `gpt-4o-mini-tts` fallback)

Adding Anthropic Claude Sonnet 4.6 ONLY for Emma's chat introduces:
- A second API key + billing surface
- Different tool-call semantics (Anthropic's tool block format vs OpenAI's `tools[]`)
- Different streaming SSE formats (Vercel AI SDK abstracts this, but provider-specific quirks leak)
- Inconsistent cost reporting (per-token rates differ)
- Operational risk: 2 providers can fail independently

**Decision: Emma runs on GPT.** Specifically:
- Default: `gpt-5.5` with `reasoning_effort: 'medium'`
- Heavy turns (multi-tool orchestration, "create me a campaign"): bump to `reasoning_effort: 'high'`

### What to change

Locate the chat handler:
```bash
rg -n '@ai-sdk/anthropic\|anthropic\|claude' src/server/ai/chat src/app/api/chat
```

Replace:

1. **Model adapter** — swap `@ai-sdk/anthropic` for `@ai-sdk/openai` (already a dependency from the rest of the codebase). Verify `package.json` doesn't need cleanup; if `@ai-sdk/anthropic` is no longer used anywhere, remove it via `pnpm remove`.

2. **`handler.ts`** — change the `streamText({ model: anthropic('claude-sonnet-4-6'), ... })` to `streamText({ model: openai('gpt-5.5'), providerOptions: { openai: { reasoningEffort: 'medium' } }, ... })`. Confirm the exact `providerOptions` shape via Vercel AI SDK docs for OpenAI reasoning models (web-search the latest May 2026 docs before coding).

3. **Tool definitions** — Vercel AI SDK's `tool()` helper is provider-agnostic, so the tool defs themselves don't change. Verify the tool-result format still serializes correctly to OpenAI's expected shape (it should — that's the SDK's job).

4. **Multimodal input** — OpenAI vision input format differs slightly from Anthropic's. For images attached by the user, switch from Anthropic's `{ type: 'image', source: { type: 'base64', ... } }` to OpenAI's `{ type: 'image_url', image_url: { url: 'data:image/png;base64,...' } }`. The Vercel SDK normalizes this with its `experimental_attachments` pattern OR the explicit content-block format — pick the one already established in the rest of the codebase if there's precedent (the autopilot vision pass in `extractVisualIdentity.ts` uses raw OpenAI SDK directly — mirror that style).

5. **Cost reporting** — update the per-turn cost calculation to OpenAI rates:
   - `gpt-5.5` input: $5 / 1M tokens
   - `gpt-5.5` output: $30 / 1M tokens
   - `gpt-5.5` cached input: $0.50 / 1M tokens
   The cost ticker in the chat UI should keep working unchanged — it reads `cost_cents` from each persisted message.

6. **Config** — Move the model ID + reasoning effort to a typed constant:
   ```ts
   // src/server/config/emmaModel.ts
   export const EMMA_MODEL = 'gpt-5.5' as const;
   export const EMMA_REASONING_DEFAULT = 'medium' as const;
   export const EMMA_REASONING_HEAVY = 'high' as const;
   // Use 'heavy' when the user message contains tool-orchestration keywords
   // (config-driven list, e.g. "campaign", "todos", "hazme", "all my…")
   ```

7. **Update Step-07 prompt's "Web-verified facts" section** — remove the Anthropic note. The new statement: "Emma runs on `gpt-5.5` with `reasoning_effort='medium'` by default. Vercel AI SDK v5 handles streaming + tool use natively for OpenAI."

### What does NOT change

- The Vercel AI SDK v5 layer (`streamText`, `useChat`, tools API) is the same.
- All tool definitions stay (`generateImage`, `writeCopy`, `regenerateAsset`, etc.).
- Persistence schema (`chat_thread` + `chat_message`) is the same — content blocks already use a generic JSONB shape.
- Streaming UX, motion language, design tokens — unchanged.
- Cost ticker logic — unchanged (just sums `cost_cents` from message rows).

---

## Files

Edit:
- `src/components/app/emma-chat.tsx` (fix input-clear bug + `stop` button behavior)
- `src/server/config/chatSystemPrompts.ts` (greeting fallback + ES/EN templates)
- `src/server/ai/chat/handler.ts` (swap Anthropic → OpenAI, providerOptions)
- `src/server/ai/chat/tools/*.ts` (verify content-block formats normalize for OpenAI)
- `src/server/actions/chat.ts` (call site for `buildEmmaSystemPrompt` — pass userDisplayName)
- `package.json` (remove `@ai-sdk/anthropic` if unused elsewhere)

Create:
- `src/server/config/emmaModel.ts` (model + reasoning effort constants)

---

## Research before implementation

WebSearch:
1. `vercel ai sdk v5 openai reasoning effort providerOptions May 2026` — confirm exact param shape.
2. `vercel ai sdk v5 useChat handleSubmit clear input` — confirm the standard pattern so the bug fix is idiomatic.
3. `openai vision image_url data url chat completions May 2026` — confirm content-block format for multimodal input.

---

## Verify

```bash
pnpm typecheck && pnpm lint && pnpm build
```

Then in `pnpm dev` at `/app/projects/reachy/chat`:

1. **Input clear**: type "hola emma" → press Enter → textarea clears immediately. Conversation shows the sent message.
2. **Stop action**: while Emma is streaming → click `stop` → stream aborts, partial response remains visible, input re-enabled.
3. **Greeting interpolation**: hard-reload `/chat` → greeting reads `"Hola Garcia."` (using your display name from session) NOT `"Hi ."`. Test as a user with no `name` field — should fall back to email-prefix or `'amigo'`.
4. **Language**: project with language=ES → greeting in Spanish. Project with language=EN → greeting in English.
5. **Provider swap**: `rg -n '@ai-sdk/anthropic\|anthropic\|claude' src/server/ai/chat src/app/api/chat` → 0 matches. `package.json` no longer includes `@ai-sdk/anthropic` (unless used elsewhere).
6. **GPT live**: send a message → check the network tab → confirm request goes to `https://api.openai.com/v1/...` (NOT Anthropic). `chat_message.model` row stores `'gpt-5.5'`.
7. **Tool call works**: type `crea un post de LinkedIn` → Emma calls `generateImage` tool → image streams in as before. No regression in the 4-state tool card lifecycle.
8. **Multimodal upload**: drag a PNG into chat → Emma calls `describeImage` → responds with style analysis. No content-format errors in worker log.
9. **Cost reporting**: cost ticker increments per turn at GPT rates (not Anthropic rates). The numbers will be different — that's expected.
10. Anti-hardcode grep: `rg -n '"gpt-5\|reasoning_effort.*high\|reasoning_effort.*medium"' src/server/ai/chat` → 0 inline matches (all in `emmaModel.ts`).

---

## Done

Reply with:
- Confirmation the input clears on submit (1-line video description or quick GIF).
- Greeting screenshot in both ES and EN modes.
- `rg` output proving 0 Anthropic references in `src/server/ai/chat`.
- 1 example chat turn showing the network tab hitting OpenAI.
- Cost ticker example after 3 turns at GPT rates.
- Honest paragraph: did the GPT swap change the conversational feel? Emma should still sound like Emma (the persona is in the system prompt, not the provider) — but token-stream pace and tool-call ordering may differ subtly. Flag anything regressive.
