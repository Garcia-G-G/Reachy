# 07e — Emma · Render hotfix + role differentiation

> Attach `planning/prompts/00-CONTEXT.md` AND `planning/07-PROJECT-CHAT-COPILOT.md` AND `planning/07b-EMMA-DESIGN-ANIMATIONS.md`. Apply §0.10. **Surgical render fixes + role visual hierarchy.** Two production bugs visible in chat output + Garcia can't tell at-a-glance who's speaking. Fix all three in one pass.

---

## 🚨 Directive to CCM

Tight surgical pass. No redesign — just plug the gaps.

- **Don't over-engineer the markdown renderer.** Use a proven library (`react-markdown` + `remark-gfm`), wrap with editorial-styled components. No custom AST parsing.
- **Role differentiation stays editorial.** Single column, no bubble chat, no user-on-right-Emma-on-left. Subtle eyebrow label + 1.5px left rule color differential.
- **Anti-hardcode applies.** All colors via `var(--emma-*)`, all spacings via tokens.

---

## Task 1 — R2 image URLs render as inline previews

**Repro (screenshot 1):** Emma's reply contains raw R2 URLs as text:
```
**Card 1 — Gerardo, esto no es un mockup**
https://pub-5fb864b41a4e4282a88d3434f25efecc.r2.dev/d4a6c3dc.../1.png
```
These display as ugly long URLs. They should render as image thumbnails inline (per the 07 spec promise: *"Inline previews — the chat renderer renders images generated in the flow inline"*).

**Fix:**

In `src/components/app/chat-message.tsx` (or wherever assistant content renders), use `react-markdown` with a custom renderer for `<a>` and `<p>` that detects image URLs.

```ts
// Detector: any URL ending in .png/.jpg/.webp/.gif or matching R2 pub domain
const IMAGE_URL_RE = /^https?:\/\/[^\s]+\.(png|jpg|jpeg|webp|gif)(\?[^\s]*)?$/i;
const R2_PUB_RE = /^https?:\/\/pub-[a-z0-9]+\.r2\.dev\//i;

function isImageUrl(href: string): boolean {
  return IMAGE_URL_RE.test(href) || R2_PUB_RE.test(href);
}
```

Custom markdown components:

```tsx
<ReactMarkdown
  remarkPlugins={[remarkGfm]}
  components={{
    a: ({ href, children }) => {
      if (href && isImageUrl(href)) {
        return <InlineAssetPreview url={href} caption={String(children)} />;
      }
      return <a href={href} target="_blank" rel="noreferrer" className="emma-link">{children}</a>;
    },
    p: ({ children }) => {
      // If the paragraph is JUST an image URL on its own line, also catch it
      if (typeof children?.[0] === 'string' && isImageUrl(children[0].trim())) {
        return <InlineAssetPreview url={children[0].trim()} />;
      }
      return <p className="emma-p">{children}</p>;
    },
    ul: ({ children }) => <ul className="emma-list">{children}</ul>,
    ol: ({ children }) => <ol className="emma-list-ordered">{children}</ol>,
    strong: ({ children }) => <strong className="emma-strong">{children}</strong>,
    em: ({ children }) => <em className="emma-em">{children}</em>,
    code: ({ children }) => <code className="emma-code">{children}</code>,
  }}
>
  {message.content}
</ReactMarkdown>
```

`<InlineAssetPreview>` component:
- Renders the image at `max-width: 100%; max-height: 320px; border-radius: 6px; border: 0.5px solid var(--emma-ink-12);`
- Above the image: small mono caption (the `caption` prop, or auto-extracted from filename if absent)
- Below the image: 3 quick-action chips `[mejorar]` `[variante]` `[guardar al library]` — same as the post-tool-call cards from 07b spec
- Click the image → opens full-resolution in new tab OR opens an asset modal/editor

Install if not present: `pnpm add react-markdown remark-gfm`.

---

## Task 2 — Tool-call cards show as empty cream rectangles (broken state)

**Repro (screenshot 2):** After Emma's "Spec: 4 posts cuadrados…" message, 8 empty cream rectangular boxes appear stacked vertically. These should be the 4 tool-call cards (one per image being generated) with the 4-state lifecycle (`thinking → call dispatched + shimmer → critic running → done + reveal`) from `07b-EMMA-DESIGN-ANIMATIONS.md` §7.

**Diagnose:**
```bash
grep -n 'tool\|ToolCall\|toolInvocations' src/components/app/emma-chat.tsx src/components/app/chat-message.tsx src/components/app/chat-tool-card.tsx 2>/dev/null
```

Likely causes:
- `chat-tool-card.tsx` exists but is rendering only its wrapper, the 4 states aren't wired
- OR the tool-call state coming from Vercel AI SDK isn't matched to the visual states
- OR `toolInvocations` array is being mapped but each rendered card has empty body

**Fix:**

`chat-tool-card.tsx` must:
1. Read `toolInvocation.state` from the AI SDK (`'call' | 'result' | 'partial-call'`).
2. Map to one of 4 visual states:
   - State 0 `thinking…` — pre-call (model thinking what tool to call)
   - State 1 `dispatched + shimmer` — call started, awaiting result
   - State 2 `critic` — tool returned, asset critic running (from our pipeline polling)
   - State 3 `done + reveal` — final asset shown with `[mejorar] [variante] [guardar]`

Reference the visual treatment in `07b §7` — `◐` rotating glyph for thinking, shimmer sweep for skeleton, amber `✦` pulse for critic, scale-in reveal for done.

Each state has VISIBLE content (NOT empty). If state is unknown, fall back to a minimal `pensando…` text instead of an empty container.

Also: doubled rendering is a known bug pattern when a component is rendered both in the assistant message body AND as a tool-result alongside. Verify the tool card renders ONCE per tool call, not twice.

---

## Task 3 — Markdown bullets/bold render as raw text

**Repro (screenshot 1):** The list "Iteraría el set en una de estas direcciones:" shows:
```
- **Más directo para Gerardo:** meter su nombre en las 4 tarjetas
```
Asterisks and dashes are literal, not rendered. Same root cause as Task 1: the assistant content is being rendered as plain text, not markdown.

**Fix:** Same `<ReactMarkdown>` integration from Task 1 covers this. The custom `strong`, `ul`, `ol`, `code`, `em` components provide editorial styling.

Editorial styling for the markdown elements (in `src/styles/emma-tokens.css` or a new `emma-markdown.css`):

```css
.emma-p {
  margin: 0 0 var(--emma-body-size);
  font-size: var(--emma-body-size);
  line-height: 1.55;
  color: var(--emma-ink);
}

.emma-list, .emma-list-ordered {
  margin: 0 0 var(--emma-body-size);
  padding-left: 18px;
  font-size: var(--emma-body-size);
  line-height: 1.55;
  color: var(--emma-ink);
}

.emma-list li, .emma-list-ordered li {
  margin: 0 0 4px;
}

.emma-strong {
  font-weight: 500;     /* per design system rule: only 400 and 500 */
  color: var(--emma-ink);
}

.emma-em {
  font-style: italic;
  color: var(--emma-amber);   /* match the greeting voice-descriptor style */
}

.emma-code {
  font-family: var(--emma-font-mono);
  font-size: calc(var(--emma-body-size) - 1px);
  background: var(--emma-paper-2);
  padding: 1px 5px;
  border-radius: 3px;
  color: var(--emma-ink);
}

.emma-link {
  color: var(--emma-amber);
  text-decoration: underline;
  text-decoration-thickness: 0.5px;
  text-underline-offset: 2px;
}
```

---

## Task 4 — Visual role differentiation (Emma vs user)

**Garcia's request:** "quiero que se diferencie entre si habla ella o yo".

**Approach:** Stay editorial (single column, no bubbles, no left/right split). Add 2 subtle differentiators:

1. **Eyebrow role label** — small mono uppercase label above each message, 9-10px, letter-spacing 0.14em:
   - Emma's messages: `EMMA` in `var(--emma-amber)`
   - User's messages: their display name (e.g., `GARCIA`) in `var(--emma-ink-65)`
   - Position: directly above the message text, with 4px gap below the label.

2. **Left-rule color** — the 1.5px left vertical rule already exists for Emma's greeting (amber). Apply it to ALL messages, with color per role:
   - Emma's messages: `var(--emma-amber)` rule (current)
   - User's messages: `var(--emma-ink-65)` rule (subtler, navy 65%)
   - Both rules: 1.5px wide, 12px padding-left between rule and text.

```tsx
<article className={`emma-msg emma-msg-${role}`}>
  <header className="emma-msg-role">{roleLabel}</header>
  <div className="emma-msg-body">{renderedContent}</div>
</article>
```

```css
.emma-msg {
  padding-left: 12px;
  border-left: 1.5px solid;
  margin-bottom: var(--emma-gap-block);
}

.emma-msg-assistant { border-left-color: var(--emma-amber); }
.emma-msg-user      { border-left-color: var(--emma-ink-65); }

.emma-msg-role {
  font-family: var(--emma-font-mono);
  font-size: 9px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  margin: 0 0 4px;
}

.emma-msg-assistant .emma-msg-role { color: var(--emma-amber); }
.emma-msg-user      .emma-msg-role { color: var(--emma-ink-65); }
```

User's display name source (same fallback chain as the greeting fix from 07c):
```ts
const userRoleLabel =
  session.user.name?.trim().split(' ')[0].toUpperCase() ||
  session.user.email?.split('@')[0].toUpperCase() ||
  'TÚ';
```

**Do NOT add:**
- Avatar circles (clutter)
- Right-alignment for user (breaks editorial single-column)
- Background tint per role (visual noise)

The label + rule color are enough — instantly readable, fits editorial language.

---

## Files

Edit:
- `src/components/app/chat-message.tsx` — wire `ReactMarkdown` + role wrapper + role label
- `src/components/app/chat-tool-card.tsx` — fix the 4-state lifecycle rendering
- `src/styles/emma-tokens.css` — add `.emma-msg-*`, markdown styling tokens

Create:
- `src/components/app/inline-asset-preview.tsx` — image card with caption + 3 quick-action chips
- `src/styles/emma-markdown.css` (optional — or fold into emma-tokens.css)

Install:
- `react-markdown` + `remark-gfm` (via `pnpm add`)

---

## Verify

```bash
pnpm typecheck && pnpm lint && pnpm build
```

Then in `pnpm dev` at `/app/projects/reachy/chat`:

1. **R2 URLs render as previews**: Emma replies with image URLs → they appear as actual image cards with `[mejorar] [variante] [guardar]` chips, NOT raw markdown.
2. **Tool cards lifecycle**: ask for 4 images → 4 tool-call cards appear, each cycling through visible states (thinking → shimmer → critic → done). No empty cream boxes.
3. **Markdown renders**: bullets/bold/italic/code show formatted, not literal.
4. **Role differentiation**: Emma's messages have amber `EMMA` eyebrow + amber left rule. Your messages have navy `GARCIA` eyebrow + navy 65% left rule. Visually unmistakable.
5. **`Tú` fallback**: log out / use a user with no name/email-prefix → role label shows `TÚ`.
6. **Reduced motion**: still works — no regressions from prior steps.
7. **Anti-hardcode**: `rg -n '#[0-9a-fA-F]{6}\|transition:.*ms' src/components/app/chat-message.tsx src/components/app/chat-tool-card.tsx src/components/app/inline-asset-preview.tsx` → 0 matches outside the token files.

---

## Done

Reply with:
- 1 screenshot of a chat turn that includes an image URL — confirm it renders as a preview card with chips, not raw markdown.
- 1 screenshot of a tool-call card mid-stream — confirm the lifecycle is visible (not empty).
- 1 screenshot showing role labels `EMMA` and `GARCIA` clearly distinguishing turns.
- Anti-hardcode grep count.
- Honest note: did the role differentiation stay subtle enough to feel editorial, or does it feel like a SaaS-chat bubble pattern leaking through?
