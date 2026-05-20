# 07h — Emma · Pivot to concierge + global floating widget

> Attach `planning/prompts/00-CONTEXT.md` AND `planning/07-PROJECT-CHAT-COPILOT.md` AND `planning/07b-EMMA-DESIGN-ANIMATIONS.md`. Apply §0.10. **Major role pivot + UI restructure.** Emma stops being the worker (generating images, copy, reels via tool calls) and becomes the **concierge** (guides Garcia through Reachy's UI, explains features, recommends next steps, can navigate on his behalf). She moves out of the dedicated `/chat` page and into a floating, draggable, resizable widget available on every route.

---

## 🚨 Directive to CCM

This deprecates significant parts of Step 07. Read carefully before deleting code.

- **Emma's role is GUIDANCE, not labor.** The app generates assets through the existing UI surfaces (the generate page, the autopilot bulk worker, the campaign editor). Emma's job is to point Garcia to the right surface, explain how to use it, and suggest the next move based on current context. She MAY ask "want me to start that for you?" with explicit confirmation — but she's never the default doer.
- **Floating widget, not a page.** Mount globally in `src/app/layout.tsx` (or the app shell). Bottom-right bubble by default, expands to a draggable + resizable panel on click. Available on every authenticated route.
- **Keep the foundation, swap the surface.** The per-project chat thread persistence, streaming infrastructure, multimodal input, editorial visual language — all stay. Tool set changes. Page location changes.
- **Anti-hardcode applies.** Bubble position defaults, panel sizes, animation timings → all tokens in `src/styles/emma-tokens.css`. Tool definitions in `src/server/ai/chat/tools/`. Navigation map / feature explanations in `src/server/config/emmaConcierge.ts`.

---

## What stays (from Step 07)

- Per-project `chat_thread` + `chat_message` schema. The widget loads the right thread when Garcia is on a project's page.
- Vercel AI SDK v5 streaming + tool use machinery.
- Multimodal input — Garcia can paste a screenshot + ask "what's this?" and Emma describes/explains.
- Editorial Soft luxe v4 visual language (navy + amber + paper-texture cream).
- Role differentiation (EMMA / GARCIA labels + left-rule colors).
- Auto-scroll + new-messages pill (07d).
- Markdown rendering (07e).

## What changes

### A. Emma's role: concierge, not worker

OLD tools (REMOVE or repurpose):
- `generateImage` → REMOVED. Emma tells Garcia "go to Generate → Image" and can highlight that nav item.
- `writeCopy` → REMOVED. Emma points to the chat-driven copy in the campaign editor.
- `regenerateAsset`, `iterateImageCopy` → REMOVED.
- `enqueueImageVariation` → REMOVED.
- `saveAsCampaignAsset` → REMOVED.
- `extendBrandKit` → KEEP but reframe: Emma SUGGESTS brand kit updates after looking at user input, doesn't mutate without confirmation flow in the brand kit settings page.

NEW tools (concierge set):
- `navigateTo({ path })` — takes Garcia to a page in the app. Confirmation pattern: Emma says "te llevo a X — ¿okay?" → confirms → uses `useRouter().push(path)`.
- `highlightElement({ selector, durationMs })` — pulses a UI element with an amber outline for N ms. So Emma can say "click here" and visually point.
- `getCurrentPageContext()` — returns `{ route, projectId?, generationId?, viewMode }` so Emma knows where Garcia is and tailors guidance.
- `summarizeProject({ projectId })` — reads project + brand kit + recent assets + last campaign → returns a digest for Emma to reference.
- `findInLibrary({ query, projectId? })` — full-text + vector search over generated assets. "show me the LinkedIn post from last week."
- `explainFeature({ featureKey })` — knowledge-base lookup. Features map lives in `src/server/config/emmaFeatures.ts` — typed `{ key: string; titleES: string; titleEN: string; descriptionES: string; descriptionEN: string; navPath?: string; ctaLabelES: string; ctaLabelEN: string; }[]`. Covers: campaigns, autopilot, image gen, reel gen, brand kit, library, identity, history.
- `recommendNextStep({ projectId? })` — based on current state, suggests one concrete action. e.g., "Tu último campaign tiene 2 assets con quality_warning. ¿Los revisamos?" or "No has generado nada en este proyecto — ¿empezamos con un IG post?"
- `searchDocs({ query })` — searches `planning/docs/*.md` (a new docs surface for FAQs) and returns a citation-style answer.

KEEP only `describeImage` and `ingestUploadedFile` from the multimodal set — both still useful for guidance ("you pasted a competitor screenshot — I can describe its style and tell you which Reachy feature to use to match it").

### B. UI: floating widget mounted globally

#### B.1 Bubble (collapsed state)

Fixed position bottom-right of viewport. 56×56px circle, navy `var(--emma-ink)` background, amber `Emma` mono-mark inside (or just `E.` italic Fraunces amber). 0.5px navy border. Soft shadow `0 2px 8px rgba(30,42,58,0.12)`.

Hover: lifts 2px + amber dot pulse appears as notification badge if Emma has a proactive suggestion pending.

Click → expands to panel (B.2).

```css
.emma-bubble {
  position: fixed;
  bottom: 24px;
  right: 24px;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: var(--emma-ink);
  /* … */
}
```

Position is draggable. User drag → snap to nearest corner OR free-position (config in `src/server/config/emmaWidget.ts`: `SNAP_TO_CORNERS: true` for v1). Persists in `localStorage['reachy.emma.bubble.position']`.

#### B.2 Panel (expanded state)

Floating panel anchored to where the bubble was. Default size: 380×560px. Min: 320×420px. Max: 640×900px. Resizable from the top-left corner (since the panel anchors bottom-right by default). Resize handles use 16×16px hit area, visible only on hover.

Panel chrome:
- Header bar: `Emma` italic Fraunces small (24px) + amber dot, project chip if on a project route, S/M/L size buttons (size variants from 07b carry over), drag handle (in the header — grab cursor), minimize button (back to bubble).
- Body: messages list with autoscroll (07d behavior).
- Input area at bottom: same underline-only style from v4.

Drag behavior:
- Mousedown on header → drag follows cursor.
- Mouseup → settles at new position. Persists in `localStorage['reachy.emma.panel.position']`.
- Cannot drag outside viewport (clamp to viewport edges with 16px margin).
- Drag during streaming: pause auto-scroll until drag completes (so the chat doesn't jump while Garcia repositions).

Resize behavior:
- Resize from any corner OR edges (use `react-rnd` library if not too heavy; otherwise hand-roll with mouse events). Persists in `localStorage['reachy.emma.panel.size']`.
- Min/max enforced.
- During resize, internal scroll position stays anchored to bottom (so the latest message stays visible).

Show/hide:
- Click bubble → panel opens with `scale 0.95 → 1 + opacity 0 → 1` over 200ms.
- Click minimize OR Esc → panel collapses to bubble with reverse animation.
- Click outside panel → does NOT close (it's a working surface, not a popover). User must explicitly minimize.

#### B.3 Global mount

In `src/app/(authenticated)/layout.tsx` (or wherever the authenticated app shell lives — verify via `grep -n "session\|getSession" src/app/**/layout.tsx`):

```tsx
{children}
<EmmaWidget />  {/* renders bubble + panel via React portal to document.body */}
```

Mount only when user is authenticated. Skip on `/login`, `/`, public landing pages — config-driven exclusion list in `src/server/config/emmaWidget.ts`:

```ts
export const EMMA_EXCLUDED_ROUTE_PATTERNS = [
  /^\/login/,
  /^\/$/,
  /^\/public/,
];
```

#### B.4 Project awareness

When Garcia is on `/app/projects/[slug]/...`, the widget header shows a small project chip `[Reachy ▾]`. The chat thread used is THAT project's thread. Switching projects switches threads. The chip is clickable → opens project switcher in the panel header.

When Garcia is on a non-project route (`/app/library`, `/app/settings`), the widget falls back to a "general" thread (one per user) OR prompts Garcia to pick a project context first.

### C. Concierge behavior pattern

Emma's system prompt rewrites to be a concierge:

```ts
export const EMMA_CONCIERGE_SYSTEM_SECTIONS = {
  ROLE: 'You are Emma — a concierge guide inside Reachy. You help indie hackers learn the app and decide what to do next. You do NOT generate assets directly; the user does that through the app surfaces. Your job: explain features, point to the right place, suggest next steps, narrate the current state.',
  TOOL_USE_BIAS: 'Prefer explanations and navigation hints over actions. When you DO want to take an action on the user\'s behalf (navigateTo, highlightElement), ask first with a 1-line confirmation: "te llevo a X — ¿okay?" or "te marco el botón — ¿lo ves?" Wait for confirmation before calling the tool.',
  FORMAT: 'Keep messages SHORT. 1-3 short paragraphs max per turn. Bullet lists only when listing options. No essays.',
  CONTEXT_AWARENESS: 'Call getCurrentPageContext at the start of every turn to know where the user is. Tailor responses to that route.',
  LANGUAGE: 'Match the brand kit language of the current project. Outside a project context: default to Spanish unless the user types in English.',
};
```

Example concierge turns:

> **Garcia:** "no sé qué hacer ahora"
> **Emma:** *(calls `getCurrentPageContext` → user is on `/app/projects/reachy/library`)*
> *(calls `recommendNextStep({ projectId: 'reachy' })`)*
> "Estás en la library de Reachy. Tienes 12 piezas — el último carrusel quedó con `quality_warning` en 2 cards. Tres movidas posibles:
> — **revisar** el carrusel y mejorar las 2 cards
> — **generar** un IG post nuevo desde Generate → Image
> — **arrancar autopilot** subiendo el último brief que tengas
>
> ¿Cuál?"

> **Garcia:** "el carrusel"
> **Emma:** "Te llevo. ¿Okay?"
> **Garcia:** "sí"
> **Emma:** *(calls `navigateTo({ path: '/app/projects/reachy/campaigns/abc123' })`)*

This is night-and-day from the current "Emma generates" pattern. Garcia drives, Emma guides.

---

## Files

Create:
- `src/components/app/emma-widget.tsx` — bubble + panel container, mounted globally
- `src/components/app/emma-bubble.tsx` — collapsed state
- `src/components/app/emma-panel.tsx` — expanded state with drag + resize
- `src/components/app/emma-project-chip.tsx` — project chip in panel header
- `src/server/ai/chat/tools/{navigateTo,highlightElement,getCurrentPageContext,summarizeProject,findInLibrary,explainFeature,recommendNextStep,searchDocs}.ts` (8 new tool files)
- `src/server/config/emmaConcierge.ts` — concierge system prompt sections (replaces parts of existing chatSystemPrompts.ts)
- `src/server/config/emmaFeatures.ts` — feature knowledge base (typed array)
- `src/server/config/emmaWidget.ts` — bubble/panel defaults + excluded routes
- `src/hooks/use-emma-position.ts` — drag + resize + localStorage persistence

Edit:
- `src/app/(authenticated)/layout.tsx` (or app shell) — mount `<EmmaWidget />`
- `src/components/app/emma-chat.tsx` — refactor to be used INSIDE the panel (lose page-level layout)
- `src/server/ai/chat/handler.ts` — update tool registration (remove worker tools, add concierge tools)
- `src/server/config/chatSystemPrompts.ts` — replace worker-leaning instructions with concierge ones

Delete or repurpose:
- `src/app/app/projects/[slug]/chat/page.tsx` — either delete (redirect to project page with auto-open panel) OR keep as an "expanded Emma" view (low priority)
- `src/server/ai/chat/tools/{generateImage,writeCopy,regenerateAsset,iterateImageCopy,enqueueImageVariation,saveAsCampaignAsset,listLayouts,listChannels,listVisualStyles}.ts` — REMOVE (or move to an `archive/` folder if you want to revive them later)

---

## Optional dependency

`react-rnd` for drag + resize. ~30KB gzipped. Alternative: hand-roll with `pointerdown` + `pointermove` + `pointerup` (cleaner, no dep). WebSearch first to confirm `react-rnd` is still maintained in May 2026; if abandoned, hand-roll.

---

## Verify

```bash
pnpm typecheck && pnpm lint && pnpm build
```

In Chrome:

1. **Bubble visible everywhere authenticated**: navigate to `/app/projects/reachy`, `/app/library`, `/app/settings` → bubble persists bottom-right.
2. **Click bubble → panel opens** with animation. Body shows the current project's thread.
3. **Drag bubble** → it follows cursor → release → snaps to corner OR free position (per config). Reload → position restored from localStorage.
4. **Drag panel** by header → moves. Resize from corner → resizes within min/max. Reload → both restored.
5. **Minimize** → panel scale-collapses to bubble.
6. **Context awareness**: ask "¿dónde estoy?" → Emma calls `getCurrentPageContext` → answers with route + project.
7. **Concierge behavior**: ask "haz un post" → Emma proposes the flow ("te llevo a Generate → Image") with confirmation, doesn't call generateImage (which no longer exists as a tool).
8. **navigateTo**: confirm "sí" → Emma calls the tool → router pushes the new path → bubble/panel persists during navigation.
9. **highlightElement**: ask "¿dónde edito mi marca?" → Emma navigates to identity page + highlights the relevant section with an amber pulse for 3 seconds.
10. **Project switch**: panel header chip → click → switcher modal → pick different project → thread switches to that project's history.
11. **Excluded routes**: navigate to `/login` → bubble does NOT appear.
12. **Anti-hardcode grep**: `rg -n '#[0-9a-fA-F]{6}\|fixed.*bottom.*[0-9]+px' src/components/app/emma-widget.tsx src/components/app/emma-bubble.tsx src/components/app/emma-panel.tsx` → all values reference tokens, 0 inline.

---

## Done

Reply with:
- 1 screenshot of the bubble in bottom-right on a non-chat route (e.g., library).
- 1 screenshot of the panel open with a project chat loaded.
- 1 short demo: drag panel + resize + reload → position/size persists.
- 1 example concierge turn (text only) showing the confirmation-before-action pattern.
- Confirmation that the old worker tools are removed (or archived).
- Honest paragraph: does Emma feel like a guide now, or did the new tool set still let her over-do?
