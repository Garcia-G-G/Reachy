# 07g — Emma · Chat structure overhaul (group tool calls, compact, ChatGPT-like flow)

> Attach `planning/prompts/00-CONTEXT.md` AND `planning/07-PROJECT-CHAT-COPILOT.md` AND `planning/07b-EMMA-DESIGN-ANIMATIONS.md`. Apply §0.10. **Structural UX fix.** Current chat is "super desordenado" — 4 parallel tool calls render as 8 full-width `pensando…` cards stacked vertically (likely doubled), creating walls of empty cream. Plus the overall timeline lacks the visual rhythm of a modern chat. Restructure.

---

## 🚨 Directive to CCM

This is structural, not cosmetic. Don't add decoration — REMOVE bad structure and replace with one that breathes.

- **Group parallel tool calls.** When Emma calls `generateImage` 4 times in one turn, render ONE grouped tool card with a 2×2 mini-grid of placeholders + a single progress line, NOT 4 separate full-width cards. Definitely not 8 (whatever doubled-render bug is happening — find it and kill it).
- **Compact tool cards.** Max height ~80px in pre-result states. Full-width feels like wasted real estate. Use a horizontal layout: small icon left, status text middle, count/progress right.
- **Multi-image results render as a grid.** When 4 images come back, show them in a 2×2 (or 2-row horizontal scroll on narrow widths) — NOT 4 stacked full-width cards.
- **Tighten message spacing.** The `--emma-gap-block` between consecutive messages is too generous when one user turn produces a chain of tool calls + reasoning + text. Halve it for related activity within a single assistant turn.
- **Diagnose the doubled render.** 4 image calls showing as 8 placeholders means the tool-call renderer is firing twice per invocation. Find why (likely both the `toolInvocations` array AND a separate `parts` array are iterated, OR the streaming partial-call + result is rendering both). Fix.

Anti-hardcode applies: all spacings, grid breakpoints, max heights → tokens in `emma-tokens.css`.

---

## Task 1 — Diagnose and kill the doubled tool-call render

**Repro:** Ask Emma "genera 4 imágenes…" → 8 `pensando…` cards appear instead of 4.

```bash
grep -n 'toolInvocations\|parts\|tool_use\|ToolCard\|chat-tool-card' src/components/app/emma-chat.tsx src/components/app/chat-message.tsx src/components/app/chat-tool-card.tsx 2>/dev/null
```

Likely culprits:
- The message renderer iterates `message.toolInvocations` AND `message.parts.filter(p => p.type === 'tool-invocation')` → renders each tool twice
- OR the streaming SSE emits the same tool start event twice (once on `partial-call`, once on `call`)
- OR the assistant message body has a fallback that also renders the tool placeholder when no text is present

Fix: pick ONE source of truth for tool calls. Vercel AI SDK v5 standard is `message.parts` — iterate those, filter for tool-invocation parts, dedupe by `toolCallId`. Drop any legacy `message.toolInvocations` iteration.

```ts
const toolParts = (message.parts ?? []).filter(p => p.type === 'tool-invocation');
const uniqueToolCalls = Array.from(
  new Map(toolParts.map(p => [p.toolInvocation.toolCallId, p])).values()
);
```

Render `uniqueToolCalls`. NOT `toolInvocations`.

---

## Task 2 — Group parallel calls into ONE tool card

When the unique tool calls in a single message are ≥2 of the SAME tool (e.g., 4× `generateImage`), render them as one grouped card with a mini-grid.

`src/components/app/chat-tool-card-group.tsx` (new):

```
┌─────────────────────────────────────────────────────┐
│ ◐  Generando 4 imágenes               2/4  ·  48s   │  ← compact header row
│ ─────────────────────────────────────────────────── │
│ [▢] [▢] [✓] [✓]                                     │  ← mini-grid: skeleton or thumb
└─────────────────────────────────────────────────────┘
```

Card height in pre-result states: ~80px (header 30px + thin divider + 1 row of 56px thumbs). When all done, height grows to ~280px to show full 2×2 grid of 120px thumbs.

Group logic: any tool calls in the same assistant message with the same `toolName` are grouped. Different tool types (mixed `generateImage` + `writeCopy`) stay separate cards.

Single tool call (n=1): render as compact single card, not a grid.

---

## Task 3 — Compact single tool cards

Single tool calls today are too tall. Compress to a 1-line horizontal card:

```
┌──────────────────────────────────────────────┐
│ ◐ Generando imagen · LinkedIn · 32s          │
└──────────────────────────────────────────────┘
```

Heights:
- `thinking` / `dispatched` / `critic`: 40px
- `done`: expands to image height (max-w 320px, aspect-fit)

Same horizontal layout for `writeCopy` while running: `◐ Escribiendo LinkedIn post · 8s`. When done, expand to show the copy block.

CSS additions in `emma-tokens.css`:
```css
:root {
  --emma-tool-card-compact-h: 40px;
  --emma-tool-card-grouped-pre-h: 80px;
  --emma-tool-card-grouped-done-min-h: 280px;
}
```

---

## Task 4 — Multi-image results as grid

When `generateImage` finishes with `n=4` (or grouped 4 separate calls), render the 4 results in a 2×2 grid INSIDE the tool card, NOT stacked vertically.

```
┌───────────────────────────────────┐
│ ✓ 4 imágenes · $0.84              │
│ ─────────────────────────────── │
│ ┌──────┐ ┌──────┐                 │
│ │ img1 │ │ img2 │                 │  ← 2×2 grid
│ └──────┘ └──────┘                 │
│ ┌──────┐ ┌──────┐                 │
│ │ img3 │ │ img4 │                 │
│ └──────┘ └──────┘                 │
│ [mejorar] [variantes] [guardar]   │  ← actions apply to selected/all
└───────────────────────────────────┘
```

Each grid thumb is clickable → expands to full-size in a modal/lightbox. Hover: shows the headline + score badge overlay.

Tight gap (8px), aspect-preserve, max-width per thumb ~140px.

Quick-action chips below the grid:
- Click `mejorar` with no thumb selected → operates on the latest/best
- Click `mejorar` with a thumb selected → operates on that one specifically
- `variantes` → spawns N more (config-driven default, e.g., 2 more variants)
- `guardar` → saves the selected (or all if none selected) to library

---

## Task 5 — Tighten message spacing within a turn

Currently every chat element has `var(--emma-gap-block)` below it (22px at M size). When a single assistant turn produces `text + reasoning + tool-card + text`, those 4 elements add up to ~88px of vertical air just inside one turn.

Add a "within-turn" spacing token:

```css
:root {
  --emma-gap-within-turn: 10px;   /* between text → tool card → reasoning → text inside ONE assistant message */
  --emma-gap-between-turns: var(--emma-gap-block);  /* the existing larger gap, only between user-turn ↔ assistant-turn */
}
```

Within an assistant message body, sibling blocks (text paragraphs, tool cards, reasoning collapsibles) use `--emma-gap-within-turn`. Between consecutive messages, use the bigger `--emma-gap-between-turns`.

---

## Task 6 — Standard chat timeline rhythm

To make the chat feel like ChatGPT/Claude without breaking editorial style:

1. **Subtle role differentiation backgrounds (additive to 07e's left-rule + eyebrow):**
   - User messages: very faint `var(--emma-paper-2)` background tint with 8px padding around content. Like Claude.app's user bubble but flatter.
   - Emma messages: no background tint, just the amber left rule + EMMA eyebrow.
   - This gives the visual rhythm of "alternating turns" that makes chat scannable.

2. **Compact reasoning collapsible:**
   The `▶ reasoning` element should be a 1-line collapsed header with `▶ Razonamiento · 12s` (mono small caps, ink-65), NOT a full block taking vertical space. Click to expand. Default collapsed.

3. **Faster within-turn streaming:**
   When Emma streams `text → tool-call → text → tool-call → text`, each new block appears with a tighter animation (120ms fade instead of 200ms) so the flow feels continuous, not staccato.

4. **Group consecutive tool cards from same turn under one collapsible header (optional polish):**
   If a single assistant turn has 3+ tool cards, wrap them all in a collapsible `▶ 4 herramientas usadas · ver detalle`. Default expanded (so user sees the work). Click to collapse for read-back scanning.

---

## Files

Edit:
- `src/components/app/chat-message.tsx` — fix doubled iteration (Task 1), wire new tool-group component, apply within-turn spacing
- `src/components/app/chat-tool-card.tsx` — compact single-card layout
- `src/styles/emma-tokens.css` — new spacing + height tokens, role-tint background

Create:
- `src/components/app/chat-tool-card-group.tsx` — grouped multi-tool-call card with mini-grid
- `src/components/app/chat-image-grid.tsx` — 2×2 result grid with click-to-expand
- `src/components/app/chat-image-lightbox.tsx` — modal full-size view

---

## Verify

```bash
pnpm typecheck && pnpm lint && pnpm build
```

Then in Chrome at `/app/projects/reachy/chat`:

1. **Ask Emma for 4 images** → ONE grouped tool card appears (not 4, not 8). Header shows `Generando 4 imágenes · 2/4 · 32s` with mini-grid below.
2. **As images finish**, mini-grid thumbs fill in one-by-one. When all 4 done, card expands to show 2×2 of 140px thumbs + chips.
3. **Click a thumb** → opens full-size lightbox modal. Esc to close.
4. **Ask for 1 image** → single compact 40px-tall card (`◐ Generando imagen · LinkedIn · 32s`), grows to image on done.
5. **Multi-turn**: send several messages → consecutive turn gaps feel right (bigger gap between turns, tight gap within a turn).
6. **User message tint**: your messages have faint paper-2 bg, Emma's have none — visually scannable like ChatGPT.
7. **Reasoning collapsed by default**: `▶ Razonamiento · 8s` 1-line, click to expand.
8. **No doubled render**: ask for 4 → 4 grid cells (not 8). Confirm with `document.querySelectorAll('[data-tool-cell]').length` in console = 4.
9. **Hydration clean** — Chrome console 0 errors.
10. Anti-hardcode grep: `rg -n '#[0-9a-fA-F]{6}\|transition:.*ms' src/components/app/chat-tool-card-group.tsx src/components/app/chat-image-grid.tsx` → 0 matches outside the token files.

---

## Done

Reply with:
- Screenshot of "genera 4 imágenes" mid-stream — confirm ONE grouped card with 4 cells.
- Screenshot post-completion — 2×2 grid with chips.
- Screenshot of a multi-turn conversation — visual rhythm scannable.
- DOM count proving doubled-render is fixed (`document.querySelectorAll('[data-tool-cell]').length` should match the actual call count).
- Honest paragraph: does the chat now feel like a real product or is there still residual mess?
