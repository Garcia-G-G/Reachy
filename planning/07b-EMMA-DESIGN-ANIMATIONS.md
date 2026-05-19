# 07b — Emma · Soft luxe v4 minimal + motion + S/M/L sizing

> Attach `planning/prompts/00-CONTEXT.md` AND `planning/07-PROJECT-CHAT-COPILOT.md`. Apply §0.10. **Design polish + sizing + motion pass.** Emma is shipped and functional. This step locks in the visual identity (Soft luxe v4 minimal — navy + amber, paper-textured cream, no clutter) and adds three user-toggleable size modes (S / M / L) plus the editorial motion language. Garcia picked this direction after iterating across 5 design options + 3 refinement passes.

---

## 🚨 Directive to CCM — Read this twice

This is the prompt where Emma's visual identity becomes a real, opinionated thing. Do your best work.

- **Minimalism is non-negotiable.** Strip every label, every eyebrow, every "helpful" caption that doesn't earn its place. The list of REMOVALS below is precise — do not re-introduce any of them under any justification ("but the user might want…"). If the user wants discoverability, they hover or open the brand strip.
- **Motion serves clarity, not decoration.** Editorial language: no spring physics, no bounces, no gradients. One easing curve (`cubic-bezier(0.4, 0, 0.2, 1)`). 150-300ms durations.
- **Size variants share DNA.** S/M/L are CSS-token swaps, NOT three different layouts. The same DOM, same components — only CSS variables change. Toggle persists per-user in `localStorage` under key `reachy.emma.size`.
- **`prefers-reduced-motion` respected.** All animations vanish when the user opts out — via the token system, not per-component checks.
- **Anti-hardcode applies.** Every color, duration, easing, size value lives in either `src/styles/emma-tokens.css` (design tokens) or `src/server/config/emma*.ts` (data/copy tokens). NO inline `style={{ color: '#1E2A3A' }}`, NO inline `transition: 200ms`. Components import named tokens.

---

## What's there now (state after Step 07)

Garcia's Step-07 screenshot shows a functional Emma chat at `/app/projects/[slug]/chat`. It works. It does NOT have:
- The locked navy/amber palette (currently uses default Reachy editorial which is warm sienna)
- The big `Emma.` headline statement
- Paper texture
- Minimalism (still has labels, eyebrows, captions)
- Size variants
- Motion language

This step replaces the visual layer end-to-end while keeping the feature surface from Step 07 intact (tool calls, streaming, multimodal, persistence — all preserved).

---

## Design specification — locked

### Color palette (in `src/styles/emma-tokens.css`)

```css
:root {
  --emma-ink: #1E2A3A;             /* navy — primary text + headlines */
  --emma-paper: #F5EFE2;           /* warm cream — background base */
  --emma-paper-2: #FBF5E8;         /* slightly lighter cream — card surfaces */
  --emma-amber: #D4A04B;           /* honey amber — accent / dot / rule / send */
  --emma-slate: #5C6A78;           /* desaturated navy — secondary glyph */
  --emma-warm: #8C6A3A;            /* warm brown — fourth glyph */
  --emma-ink-65: rgba(30, 42, 58, 0.65);  /* secondary text */
  --emma-ink-55: rgba(30, 42, 58, 0.55);  /* tertiary text */
  --emma-ink-25: rgba(30, 42, 58, 0.25);  /* hairline rules */
  --emma-ink-12: rgba(30, 42, 58, 0.12);  /* spine + card borders */
}
```

These are PROJECT-AGNOSTIC Emma tokens. They do NOT override the per-project brand kit colors that get rendered into AI-generated assets — those come from the project's `brandKit`. Emma's CHROME is always Soft luxe navy/amber.

### Paper texture

Three superimposed radial-gradient layers create an organic paper feel. Applied to the canvas background:

```css
.emma-canvas {
  background-color: var(--emma-paper);
  background-image:
    radial-gradient(circle at 13% 27%, rgba(30, 42, 58, 0.018) 1px, transparent 1.6px),
    radial-gradient(circle at 64% 71%, rgba(30, 42, 58, 0.022) 1px, transparent 1.6px),
    radial-gradient(circle at 89% 13%, rgba(212, 160, 75, 0.025) 1px, transparent 1.6px);
  background-size: 9px 9px, 13px 13px, 17px 17px;
}
```

Static. NO breathing animation. The texture itself is the warmth.

### Typography

```css
:root {
  --emma-font-display: 'Fraunces', Georgia, serif;
  --emma-font-body:    'Fraunces', Georgia, serif;
  --emma-font-mono:    'JetBrains Mono', ui-monospace, monospace;
}
```

The Emma headline uses `font-style: italic`, `font-weight: 500`, `letter-spacing: -0.035em`. The amber period after the name uses `font-style: normal` (upright) for contrast.

### Spine rule

A single 0.5px vertical hairline `var(--emma-ink-12)` running floor-to-ceiling, positioned 8px inside the left padding. Subtle margin-rule effect, like a Moleskine.

### Size variants

Three modes selected by `.size-s | .size-m | .size-l` class on `.emma-canvas`:

```css
.size-s {
  --canvas-w: 320px;
  --pad-x: 18px;
  --pad-y: 14px;
  --emma-name-size: 36px;
  --emma-body-size: 12px;
  --emma-gap-block: 16px;
}
.size-m {
  --canvas-w: 520px;
  --pad-x: 28px;
  --pad-y: 22px;
  --emma-name-size: 56px;
  --emma-body-size: 13px;
  --emma-gap-block: 22px;
}
.size-l {
  --canvas-w: 640px;
  --pad-x: 36px;
  --pad-y: 30px;
  --emma-name-size: 88px;
  --emma-body-size: 15px;
  --emma-gap-block: 30px;
}
```

Default: `M`. User toggle persists in `localStorage['reachy.emma.size']` — values `'s' | 'm' | 'l'`. Toggle UI: three small buttons `[S] [M] [L]` in the header above the cost ticker, with the active one inverted (navy bg, paper text). Toggling crossfades the size with `transition: 280ms ease-out` on the relevant CSS vars (`width`, `padding`, `font-size`).

`width: var(--canvas-w)` caps the chat surface. The page main container centers the canvas (or anchors left depending on whether the project sidebar is open).

---

## REMOVALS — everything that was clutter

CCM must DELETE all of these from the Step-07 chat UI:

- ❌ Header text "Vol 01 · No 04" or any edition/volume framing
- ❌ Eyebrow labels above blocks: `BRAND`, `ÚLTIMAS PIEZAS`, `POR DÓNDE EMPEZAR`, `EMMA · SALUDO`, etc.
- ❌ Inline labels next to swatches: `ink · paper · amber`
- ❌ Captions under starter cards: `hero · 1200×627`, `teaser · social`, etc.
- ❌ Footer with keyboard shortcuts: `↩ enviar · ⇧↩ línea · ⌘K comandos`
- ❌ Footer with version label: `Emma · v3`, `Emma · v4`
- ❌ The avatar circle / sigil (no `E` initial, no SVG mark)
- ❌ Long subtitle: `tu co-pilot editorial · activa para Reachy` — REPLACE with a short `para {projectName}`

If the user genuinely needs power-user shortcuts, they discover them via `⌘K` (which IS implemented for the command palette — the menu opens, the user learns). They are NOT printed in the footer.

---

## KEPT — the essential elements

- Cost ticker: top-right, `$0.00` + 5px amber dot. Mono 9px. Animates count-up on tool completion (see Motion).
- `Emma.` headline: Fraunces italic, amber period in upright weight. Size driven by `--emma-name-size`.
- Sub-line: `para {projectName}` mono 10px, `var(--emma-ink-55)`, `letter-spacing: 0.1em`. ONE LINE.
- 3 brand swatches: 10px circles, in row, no labels. Click → opens expandable brand strip (Step 07b's expandable panel still applies — see Motion).
- Moodboard thumbs: 4 × 32px squares, 50% opacity, gradient placeholders if no real assets yet. Plus `+N →` counter pointing to archive. Click any → opens that asset's editor.
- Greeting: amber 1.5px left rule, body text. Italic amber for brand-voice descriptors. `Hola {firstName}.` style — casual, time-of-day-aware optional but NOT mandatory.
- 4 starter cards: glyph (22px letter in colored block) + title only. No captions. Hover lifts 2px. Click submits as user message.
- Input: underline only (0.5px navy bottom border), paperclip on left, italic placeholder middle, `enviar ↩` send-button on right in amber with sub-underline. No box, no pill.
- Spine rule (0.5px navy/12% vertical hairline at 8px inside left padding).

---

## Motion language — editorial restraint

Reuse the design tokens from `src/styles/motion.css` (create if not present):

```css
:root {
  --motion-duration-instant: 80ms;
  --motion-duration-quick: 120ms;
  --motion-duration-base: 200ms;
  --motion-duration-slow: 300ms;
  --motion-duration-deliberate: 500ms;

  --motion-easing-out: cubic-bezier(0.4, 0, 0.2, 1);
  --motion-easing-in-out: cubic-bezier(0.4, 0, 0.6, 1);

  --motion-stagger-tight: 40ms;
  --motion-stagger-base: 60ms;
  --motion-stagger-loose: 100ms;
}

@media (prefers-reduced-motion: reduce) {
  :root {
    --motion-duration-instant: 0ms;
    --motion-duration-quick: 0ms;
    --motion-duration-base: 0ms;
    --motion-duration-slow: 0ms;
    --motion-duration-deliberate: 0ms;
    --motion-stagger-tight: 0ms;
    --motion-stagger-base: 0ms;
    --motion-stagger-loose: 0ms;
  }
}
```

### Specific animations

1. **Initial page load**: the `Emma.` headline letter-spacing animates from `-0.025em` → `-0.035em` over `var(--motion-duration-slow)` `var(--motion-easing-out)`. The amber period after the name fades in 100ms LATER with a tiny scale `0.85 → 1.0` over 200ms. Plays ONCE on mount. The rest of the chrome cross-fades in over 250ms.

2. **Size toggle (S↔M↔L)**: CSS vars on `.emma-canvas` transition 280ms `var(--motion-easing-out)`. Width, padding, font-size all animate. Buttons themselves: active state crossfade 120ms.

3. **Starter cards entrance** (empty state mount): stagger 60ms each, slide-up 6px + fade, 180ms `var(--motion-easing-out)`. On send-as-message, all 4 cards animate OUT: fade + slide-up 4px, 150ms.

4. **Streaming token cursor**: a 2px-wide × 14px-tall navy bar appended after the latest streamed token, pulsing `opacity: 1 ↔ 0.3` every 800ms ease-in-out. Disappears the moment the stream completes.

5. **Pre-first-token shimmer**: BEFORE the first streamed token (network latency 200-800ms), show `· · ·` in the assistant bubble, navy 65% opacity. Each dot pulse-fades 800ms with a 200ms offset between them.

6. **Message entrance**: every new message bubble enters with `opacity 0 → 1` + `translateY 6px → 0`, 200ms `var(--motion-easing-out)`. Same for user and assistant — single-column editorial, no left/right drift.

7. **Tool call card lifecycle** (4 states inside an assistant bubble — see Step 07b for the full state machine):
   - State 0 `thinking…`: `◐` glyph rotates 360° over 1.4s linear, infinite while pre-call.
   - State 1 `call dispatched + skeleton`: shimmer sweep `linear-gradient(90deg, transparent, var(--emma-ink-12), transparent)` translating left → right every 1500ms.
   - State 2 `critic running`: amber `✦` glyph fades in/out 1.2s ease-in-out.
   - State 3 `done + reveal`: image fades in `opacity 0 → 1` + `scale 0.97 → 1` over 300ms `var(--motion-easing-out)`. Quick-action chips below stagger-enter 60ms each.
   - Card height animates `transition: height 250ms var(--motion-easing-out)` between states.

8. **Cost ticker count-up**: on every tool completion that adds cost, the number animates from old → new value via `requestAnimationFrame` over 500ms with ease-out (e.g. `$0.00 → $0.04 → $0.18`). Spanish locale: comma as decimal. A 300ms subtle opacity flash (100% → 60% → 100%) on the value signals the update. Amber dot pulses scale `1 → 1.4 → 1` over 400ms at the moment of update.

9. **Brand swatches click → expandable panel**: panel slides DOWN with `height 0 → contentHeight` over 250ms + content fades in 200ms. Inside: 24×24px color swatches with hex labels below, voice rules bullet list, audience chips, last 6 generated assets as small thumbnails. Click again → collapses.

10. **Mood thumbs hover**: opacity `0.5 → 0.85` over 150ms. Cursor pointer. Click navigates to that asset's editor.

11. **Starter card hover**: lift `translateY: -2px` over 150ms `var(--motion-easing-out)`. The amber arrow `→` shifts right `translateX: 0 → 3px` over 150ms.

12. **Starter card press / send**: scale `0.97` over 80ms, then submits the card's prompt as a user message. Card animates OUT (slide-up 4px + fade).

13. **Input focus**: bottom border thickens `0.5px → 1.5px` over `var(--motion-duration-quick)`. Send button color: amber stays full opacity; text content presence is what enables send.

14. **Send animation**: on send, the `enviar ↩` text gets a 220ms micro-overshoot scale `1 → 1.04 → 1`. Input text clears with a 150ms slide-up fade.

15. **Attachment dropzone**: drag-over the chat region → dashed 2px `var(--emma-ink-12)` border + `var(--emma-paper-2)` overlay at 60%. Drop → border snaps off, thumbnail appears in the input draft with `scale 0.9 → 1` + fade over 180ms.

16. **Paste image** (Cmd-V): same thumbnail entrance + 600ms one-time pulse around the thumbnail border (`box-shadow: 0 0 0 0 var(--emma-amber) → 0 0 0 4px transparent`).

17. **Spine rule on initial mount**: draws top-to-bottom over 600ms (using a `scaleY: 0 → 1` with `transform-origin: top`). One-time, sets the editorial frame.

18. **Tab indicator (existing nav RESUMEN · EMMA · GENERAR · ARCHIVO · IDENTIDAD · HISTÓRICO)**: 2px underline slides between tabs with `transition: left 250ms ease, width 250ms ease`. Tab content cross-fade 120ms (View Transitions API where supported).

---

## Files

Create:
- `src/styles/emma-tokens.css` (color + type + spine + size-mode tokens — imported from `globals.css`)
- `src/styles/motion.css` (motion tokens — if not already present from prior steps)
- `src/components/app/emma-size-toggle.tsx` (S/M/L button row with localStorage persistence)
- `src/server/config/emmaStarters.ts` (typed starter prompts catalog — was already in 07 spec, finalize it)
- `src/server/config/emmaTokens.ts` (the size-mode default + localStorage key constant)

Edit:
- `src/components/app/emma-chat.tsx` (apply v4 minimal markup, wire size toggle, delete REMOVED elements)
- `src/components/app/chat-message.tsx` (message entrance, streaming cursor)
- `src/components/app/chat-tool-card.tsx` (4-state lifecycle — see Motion §7)
- `src/components/app/chat-quick-actions.tsx` (stagger entrance, hover/press)
- `src/components/app/chat-attachment-dropzone.tsx` (visual states from Motion §15-16)
- `src/components/app/chat-attachment-thumb.tsx` (entrance + remove transitions)
- `src/components/app/emma-empty-state.tsx` (starter cards grid, entrance + dismiss)
- `src/components/app/emma-cost-ticker.tsx` (count-up + amber dot pulse)
- `src/components/app/emma-brand-strip.tsx` (collapsed swatches → expandable panel)
- `src/components/app/emma-tab-indicator.tsx` (sliding underline)
- `src/app/globals.css` (import emma-tokens.css + motion.css)

---

## Anti-hardcode audit

Before declaring done:

```bash
rg -n '#[0-9A-Fa-f]{6}' src/components/app/emma* src/components/app/chat-*
rg -n 'transition:.*[0-9]+ms' src/components/app/emma* src/components/app/chat-*
rg -n 'cubic-bezier' src/components/app/emma* src/components/app/chat-*
```

All three should return 0 matches outside `src/styles/emma-tokens.css` and `src/styles/motion.css`. Every color, duration, easing references a token.

```bash
rg -n 'prefers-reduced-motion' src/styles
```

Should return ≥1 (the motion-tokens media query).

---

## Verify

```
pnpm typecheck && pnpm lint && pnpm build
```

Then in `pnpm dev` at `/app/projects/feedbackmind-3/chat`:

1. **Visual lock**: navy `#1E2A3A` + amber `#D4A04B` + cream `#F5EFE2` + paper texture. The `Emma.` headline is the visual anchor with the amber period.
2. **Size toggle**: click `S` `M` `L` in header → canvas resizes smoothly 280ms. Reload page → previously selected size persists from `localStorage`.
3. **Minimalism check**: NO labels above blocks, NO captions under starters, NO footer shortcuts, NO avatar circle, NO subtitle longer than `para {projectName}`. If ANY of those re-appeared, delete them again.
4. **Initial mount animations**: `Emma.` letter-spacing settles in 300ms, amber period fades in 100ms later. Spine rule draws top-to-bottom over 600ms. Starter cards stagger-enter.
5. **Streaming**: pre-first-token shows 3 pulsing dots. Then tokens stream live with a navy 2px-wide cursor pulsing.
6. **Tool call**: ask for an image → 4-state card lifecycle plays through (`thinking` rotation → `skeleton` shimmer → `critic` pulse → reveal + chips stagger).
7. **Cost ticker**: count-up animation on completion. Amber dot pulses.
8. **Brand strip**: click the 3 swatches → panel slides down with expanded brand info.
9. **Mood thumbs**: hover lifts opacity 0.5 → 0.85. Click navigates.
10. **Input underline**: focus thickens 0.5px → 1.5px. Send `enviar ↩` micro-overshoots on click.
11. **Drag-drop**: drag PNG into chat → dashed border + cream overlay. Drop → thumbnail enters in draft.
12. **Reduced-motion**: OS-level reduce motion → all transitions become instant (0ms). Nothing breaks.
13. Anti-hardcode greps (above) return 0 matches outside the two token files.

---

## Done

Reply with:
- 3 screenshots: same chat state at `S`, `M`, and `L` sizes (after a fresh page load + toggle).
- Anti-hardcode grep counts (must all be 0 outside `src/styles/emma-tokens.css` + `src/styles/motion.css`).
- Confirmation that `localStorage['reachy.emma.size']` persists across reloads.
- Confirmation that REMOVED elements (eyebrow labels, footer shortcuts, avatar, long subtitle) are all gone.
- 1 short paragraph honestly describing how it feels — does it land as $99/mo product or still v0.1?
