# Image gen — editor page rebuild + AI effort mode

> Attach `planning/prompts/00-CONTEXT.md`. Apply §0.10. This is a transformation pass — NOT a polish pass. Take the time, do it right, refactor liberally.

## Why

Two structural problems Garcia has been raising for weeks:

1. **The preview is cramped.** The form + preview live in a single page as a `7fr_5fr` grid at `lg` only. On most desktops the preview is ~500px wide max, the toolbar wraps, the thumbnail strip is squashed. There's no proper editing surface.
2. **The AI is single-shot.** `openai.images.generate` is called once, returns N stochastic attempts, and that's the deliverable. No reasoning mode, no self-critique, no multi-strategy. Output reads as "raw model" not "designed".

Both must be fixed in the same pass — they're entangled (a real editor needs real outputs to edit; real outputs need a real surface to refine on).

## Part 1 — Editor page (UX rebuild)

### 1.1 Split form and editor into two routes

Create:
- `src/app/app/projects/[slug]/generate/image/page.tsx` — keep this route. Refactor to be the FORM ONLY, full-width single-column, plus a "Recent generations" gallery below the form (last 12 from this project).
- `src/app/app/projects/[slug]/generate/image/[generationId]/page.tsx` — NEW. The dedicated editor. Server-loads the generation + its assets + composeState. Renders `<GenerationEditor>` (new client component).

After enqueue, the form's `onSubmit` does `router.push(\`/app/projects/${slug}/generate/image/${generationId}\`)` immediately. Polling moves to the editor page so the user lands there and watches the assets fill in.

### 1.2 New `<GenerationEditor>` component

`src/components/app/generation-editor.tsx`. Layout:

```
┌──────────────────────────────────────────────────────────────────┐
│ ← Back to form    Reachy / Demo Gerardo / Generation #abc        │  ← header bar
│ format: IG post 4:5 · model: gpt-image-2 high · cost: $0.89      │
├──────────────────────────────────────────┬───────────────────────┤
│                                          │                       │
│                                          │  EDIT COPY            │
│                                          │  Eyebrow [______]     │
│                                          │  Headline[______]     │
│         [BIG CANVAS PREVIEW]             │  Sub     [______]     │
│         max-w-[1000px]                   │  CTA     [______]     │
│         aspect ratio per format          │  Wordmark[______]     │
│         centered, soft shadow            │  [Re-render]          │
│                                          │                       │
│                                          │  ─────────            │
│                                          │  LAYOUT               │
│                                          │  [grid of 8 layout    │
│                                          │   thumbnails, click   │
│                                          │   = swap layout]      │
│                                          │                       │
│                                          │  ─────────            │
│                                          │  COLORS (brand kit)   │
│                                          │  ink ●  paper ●  acc● │
│                                          │  [override per-asset] │
│                                          │                       │
│                                          │  ─────────            │
│                                          │  ACTIONS              │
│                                          │  [+ More like this]   │
│                                          │  [↻ Regenerate this]  │
│                                          │  [↓ Download]         │
│                                          │  [↓ Carousel]         │
│                                          │                       │
├──────────────────────────────────────────┴───────────────────────┤
│ FRAMES / VARIANTS                                                │
│ [thumb1] → [thumb2] → [thumb3] → [thumb4]   (sequence)           │
│ or  [thumb1]  [thumb2]  [thumb3]  [thumb4]  (exploration)        │
└──────────────────────────────────────────────────────────────────┘
```

Tech notes:
- `<GenerationEditor>` is a client component, takes `{ generationId, projectId, slug, initialState }` server-loaded.
- Polls until status=done (same logic as today, moved here).
- Edit Copy is now PERMANENTLY visible in the right sidebar (not a modal). Save → `rerenderOverlay` action runs, asset URL updates, canvas refreshes. Sub-second feedback loop.
- Layout swap calls a NEW server action `swapLayout({ assetId, layoutId, copy })` that re-uses the stored raw background, runs `composeImage` with the new layout, replaces the asset PNG. Free (no AI call).
- Color override calls `swapColors({ assetId, colors })` similarly — re-compose with overridden colors instead of brand kit defaults.
- "Regenerate this" enqueues a 1-frame regeneration of just the selected variant (re-uses the original idea + layout, fresh AI background).
- "More like this" stays as today (reference-image variation).

### 1.3 Form page polish

`src/app/app/projects/[slug]/generate/image/page.tsx`:
- Form is now full-width centered, `max-w-[860px]` mx-auto.
- Idea textarea is bigger (min-h-32, prominent).
- Format / Model / Quality / Style / Layout / Variants laid out in a logical 2-column grid INSIDE the form.
- Big "Generate" button at the bottom.
- Below the form: "Recent generations" — a 4-column grid of the last 12 generation thumbnails for this project, clicking any opens that generation's editor page. Server-loaded (no client fetch).

### 1.4 Recent generations server action

`getRecentGenerations({ projectId, limit })` — returns the latest N generations with their first asset's publicUrl, status, format, createdAt, costCents. Reuse for the gallery + library page.

## Part 2 — AI effort mode (the "try harder")

### 2.1 New input: `effort`

Schema: `effort: z.enum(['fast', 'balanced', 'high']).default('balanced')`.
- `fast` — current behavior (single-shot, 1 attempt per requested variant).
- `balanced` — gpt-image-2 reasoning mode ON (`reasoning_effort: 'medium'`).
- `high` — reasoning mode `'high'` PLUS internal best-of-K critique (see 2.3).

Plumb through action → job data → worker → `generateImage`.

### 2.2 Reasoning mode wiring

In `src/server/ai/imageGen.ts`, when `model === 'gpt-image-2'`, conditionally pass `reasoning_effort` per the catalog. Web search the OpenAI API docs to confirm the exact parameter name and accepted values for gpt-image-2 in May 2026 — the docs at `https://developers.openai.com/api/docs/models/gpt-image-2` are authoritative. Don't invent. If the parameter doesn't exist, fall back to a verbose planning pass through gpt-4o BEFORE image gen that produces a denser, more directed prompt (which we then feed to images.generate).

### 2.3 Best-of-K critique mode (effort=high)

When `effort === 'high'`:
1. Generate `K = 4` internal candidates via images.generate (n=4, single call).
2. Send all 4 to gpt-4o vision with the prompt: *"You are a senior art director reviewing 4 candidates for [layout name]. Pick the one that best matches the brief, considering: composition strength, focal clarity, negative space, palette harmony, brand alignment. Output JSON: { winnerIndex, reasoning }."*
3. Return ONLY the winner as the user-facing variant.

User pays for 4 candidates + 1 critique call (~5¢ for gpt-4o vision with 4 small images). Net: ~5× the per-variant cost vs `fast`, but the result is curated. Surface the increased cost in the UI ("High effort: $X.XX, includes 4 internal candidates").

When `effort === 'high'` AND `n > 1`, run the K=4-pick-best pipeline N times. So `n=4 effort=high` = 16 internal candidates, 4 returned. Cost ~20× a fast single. Document loud in the UI.

### 2.4 Multi-strategy in exploration mode

When `mode === 'exploration'` AND `n > 1`, DON'T regenerate the same prompt N times stochastically. Instead, vary one axis per variant deliberately:
- Variant 1: requested layout, requested style.
- Variant 2: requested layout, ALTERNATE style (rotate through visualStyles catalog).
- Variant 3: ALTERNATE layout (e.g. if user picked editorial-collage, try badge-stamp), requested style.
- Variant 4: alternate layout + alternate style.

The user gets 4 genuinely different attempts to choose from instead of 4 near-duplicates. Variant metadata includes which axes were varied so the UI can show "Variant 2 — paper-cutout style" instead of just "Variant 2".

### 2.5 Reference-multi for variations

`openai.images.edit` accepts up to 16 reference images. When generating, ALWAYS pass:
- The brand kit logo (if present in `brandKit.logoUrl`).
- The previous best generation's first asset from this project (if any).

This anchors the model to the user's visual vocabulary across generations — outputs cohere with the brand instead of drifting per-prompt.

Add `getBrandReferenceImages(projectId)` server util that returns the buffers + handles the cases where there are 0/1/N refs available.

### 2.6 Editorial prompt rewrite

Refactor `src/server/ai/promptBuilder.ts`:
- Strip current verbose paragraphs.
- New structure:
  ```
  EDITORIAL DIRECTIVE [ALWAYS]:
  Magazine-cover composition. Photographic depth. ONE clear focal element.
  Intentional negative space. NO text, words, letters, numbers — text is added in post.

  STYLE: [resolved style from visualStyles]

  LAYOUT NEGATIVE SPACE: [layout.negativeSpaceHint]

  BRAND PALETTE:
  - ink: [brandKit.primaryColor]
  - paper: [brandKit.bgColor]
  - accent: [brandKit.accentColor]
  Use these exact hues as the dominant palette of the image.

  BRIEF: [user's idea]

  EFFORT: [reasoning level — embedded as "Take time to consider composition before rendering" when reasoning isn't available natively]
  ```
- This is shorter, more directive, and gives the model a clearer mental model.

## Part 3 — Library page becomes a real gallery

`src/app/app/projects/[slug]/library/page.tsx` — currently exists, presumably shows assets. Refactor to:
- Masonry grid of all generations for the project.
- Filter by format, status, layout, model.
- Click any asset → opens the Generation Editor for its parent generation.
- Bulk download as ZIP for selected generations.

## Files

Create:
- `src/app/app/projects/[slug]/generate/image/[generationId]/page.tsx`
- `src/components/app/generation-editor.tsx`
- `src/server/ai/critic.ts` (the gpt-4o vision best-of-K)

Edit:
- `src/app/app/projects/[slug]/generate/image/page.tsx`
- `src/components/app/generate-image-form.tsx` (extract form, drop ResultPanel)
- `src/server/actions/images.ts` (new actions: swapLayout, swapColors, getRecentGenerations, getBrandReferenceImages)
- `src/server/jobs/queue.ts` + `src/server/jobs/imageWorker.ts` (effort + multi-strategy)
- `src/server/ai/imageGen.ts` (reasoning mode, multi-ref)
- `src/server/ai/promptBuilder.ts` (editorial directive rewrite)
- `src/lib/image-models.ts` (effort tier metadata)
- `src/app/app/projects/[slug]/library/page.tsx` (real gallery)

## Research before implementation

WebSearch the following before touching code:

1. `openai gpt-image-2 reasoning_effort parameter API May 2026` — exact param name + accepted values + how cost is billed for reasoning tokens.
2. `openai gpt-image-2 multi reference images edit endpoint 2026` — confirm 16-ref limit and how to pass them.
3. `gpt-4o vision JSON mode multi-image input 2026` — exact format for sending 4 images to gpt-4o for critique.

Document what you find at the top of each touched file as a comment.

## Verify

```
pnpm typecheck && pnpm lint && pnpm build
```

Then in `pnpm dev`:
1. Submit form → URL changes to `/generate/image/<id>` immediately, editor page loads with skeleton, polls, fills in.
2. Editor page big canvas is ≥800px wide on a 1440 monitor.
3. Edit a slot in the right sidebar → re-render <1s, no AI call, cost stays $0.
4. Swap layout in the right sidebar → re-render <1s, no AI call.
5. Effort=high, n=1 → cost preview shows ~5x the fast cost. After generation, server log shows 4 internal candidates + 1 critique pick. Result is the chosen winner.
6. Mode=exploration, n=4, fast → 4 returned variants are GENUINELY different (different layouts/styles), not 4 stochastic redraws of the same prompt. Each variant labeled with which axis was varied.
7. Brand kit has a logoUrl set → second generation onwards passes logo as a reference; outputs visibly anchor to brand identity (palette tightens).
8. Form page bottom shows last 12 generations as clickable thumbnails.
9. Library page is a masonry grid with filter chips.

## Done

Reply with:
- 1 screenshot of the new form page (full-width form + recent gallery below).
- 1 screenshot of the editor page with a generation loaded.
- 1 screenshot of effort=high cost preview + the 4 internal candidates the critic chose from (log dump is fine).
- 4 R2 URLs from a multi-strategy exploration run, with their varied-axis labels.
- The cost breakdown for fast / balanced / high on a single 1080×1350 generation.
