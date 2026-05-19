# Image gen — designer-grade layouts + editorial AI backgrounds

> Attach `planning/prompts/00-CONTEXT.md`. Apply §0.10.

## Goal

Stop producing Canva-template output. The current `card-soft` default is a centered cream rectangle on a generic AI gradient — the AI's contribution is invisible because the card covers most of the frame. Three concrete fixes:

1. Add 3 designer-grade layouts (no center-card-with-text crutch).
2. Fix `card-soft` so it isn't 2 lines on a giant cream box.
3. Prompt the AI to generate intentionally composed backgrounds (depth, planned negative space, editorial framing) — not flat abstract gradients.

## Tasks

### 1. Three new layouts in `src/server/ai/layoutTemplates.ts`

Each one defines `slots`, `negativeSpaceHint` (used by promptBuilder), `blocks[]`, optional `backdrops[]`, optional `mask` (new field — see task 4).

#### `editorial-collage`
Magazine-spread vibe. No card backdrop. Asymmetric.
- `eyebrow` — top-left, mono, small, e.g. `№ 03 · EL TRUCO`
- `headline` — italic Instrument Serif, oversized (sizeFrac ~0.16), positioned at 0.05/0.55, widthFrac 0.6, color ink. Bleeds onto the image.
- `subheadline` — body Inter, bottom-left, max 2 lines, sizeFrac 0.028
- `wordmark` — bottom-right, mono uppercase, small
- `negativeSpaceHint`: "Compose with intentional empty space in the LEFT HALF of the frame, especially the lower-left quadrant. Strong subject or color block in the right 40%."

#### `text-mask-cutout`
Typography filled with the AI image — like cut paper letters. New `mask` capability needed (task 4).
- Single huge headline word (1–2 words max, e.g. `REACHY` or wordmark from brand kit) at 0.5/0.5, sizeFrac 0.42, weight 700, font display
- `mask: { kind: 'text-fill-image', textBlock: 'headline' }` — sharp composites the AI image INTO the text shape via SVG `<mask>` or `composite({ blend: 'dest-in' })`. Outside the text: solid `paper` color or a gentle vignette.
- Tiny `wordmark` bottom-right as the only literal text on top of the cutout
- `negativeSpaceHint`: "High contrast composition with strong shapes — will be revealed only inside large letterforms. Avoid fine detail; bold gradients and chunky color blocks read best at headline scale."

#### `badge-stamp`
Editorial poster. Hero AI image full-frame + small badge sticker overlay.
- `headline` — top, italic Instrument Serif, sizeFrac 0.08, ink, max 4 words
- A circular `backdrops[]` rect (use cornerRadiusFrac=0.5 to fake a circle) at right-edge mid, color accent, ~25% width — the "stamp"
- `eyebrow` — inside the stamp circle, mono uppercase, color paper, e.g. `№ 03 · 2026`
- `subheadline` — below stamp, small italic, max 2 lines
- `wordmark` — bottom-left, mono small
- `negativeSpaceHint`: "Photographic depth of field — sharp focal subject in the LEFT 60% of the frame, gentle bokeh / negative space in the RIGHT 40% where a circular stamp will land."

Each layout exported, registered in the `LAYOUTS` map, and added to `LayoutId` type. Update `LAYOUT_META` and `LAYOUT_SLOTS` in `src/lib/layout-meta.ts` accordingly.

### 2. Fix `card-soft` — 4 slots and smaller card

Current: `slots: ['headline', 'subheadline']`, card covers ~55% of frame.

Change:
- Slots: `['eyebrow', 'headline', 'subheadline', 'wordmark']`
- Card backdrop: `widthFrac: 0.62, heightFrac: 0.45` (was ~0.75/0.55), centered → looks like a floating object, not a billboard.
- `eyebrow` rendered ABOVE the card (mono, small, color paper or accent).
- `wordmark` rendered BELOW the card (mono small, color ink/3).
- Headline + subheadline still inside the card.
- `negativeSpaceHint`: "Center-weighted composition with rich color and form spilling out from behind a centered floating card. The card will mask the middle ~40% — make sure the visible halo around it is the most interesting part of the image."

### 3. New default for `post-ig`: `editorial-collage`

In `DEFAULT_LAYOUT_FOR_FORMAT`, change `'post-ig': 'card-soft'` → `'post-ig': 'editorial-collage'`. Card-soft remains available as an explicit pick. Editorial-collage is the new flagship IG aesthetic.

### 4. Add mask capability to compose pipeline

In `src/server/ai/composeImage.ts`:
- Extend `Layout` type with optional `mask?: { kind: 'text-fill-image'; textBlock: TextRole }`.
- When present, build the SVG with a `<mask>` element where the text shape is white (visible) on black (hidden), then composite the background image filtered through that mask. Outside the mask, fill the canvas with `colors.paper` (or a soft vignette).
- Implementation hint: SVG `<mask>` + `<text>` works inside sharp's SVG rasterization. Test with `text-mask-cutout` layout — the headline letterforms should appear as cut-outs filled with the AI image, with the rest of the canvas solid paper.

### 5. Editorial-grade prompt for the AI background

Refactor `src/server/ai/promptBuilder.ts`:
- Already injects `layout.negativeSpaceHint`. Now ALSO inject a permanent editorial directive at the top of every prompt:
  ```
  Editorial composition: photographic depth, intentional negative space, ONE clear focal element, magazine-spread aesthetic. Avoid flat abstract gradients, generic geometric shapes, balanced symmetric compositions. Think: small-press magazine cover, not stock background.
  ```
- Re-emphasise "ABSOLUTELY NO text, words, letters, numbers, or typography in the image — text will be added in post."
- Strip any phrasing that implies "background only / nothing else" — that's what gives us empty gradients. We WANT a strong photographic/illustrative composition; we just don't want text rendered by the AI.

### 6. Layout picker UI — show layout previews

In `src/components/app/generate-image-form.tsx`, the layout dropdown currently shows label only. Replace with a 3-column grid of small layout thumbnails (40×50px SVG previews — schematic boxes representing where text goes). Static SVGs in `src/components/app/layout-previews.tsx`. Selecting one sets `layoutOverride`. Makes the choice between editorial-collage / text-mask-cutout / badge-stamp / card-soft etc. visual instead of name-only.

## Files

- Edit: `src/server/ai/layoutTemplates.ts`, `src/lib/layout-meta.ts`, `src/server/ai/composeImage.ts`, `src/server/ai/promptBuilder.ts`, `src/components/app/generate-image-form.tsx`
- Create: `src/components/app/layout-previews.tsx`

## Verify

```
pnpm typecheck && pnpm lint && pnpm build
```

Then in `pnpm dev`:
1. Generate an `Instagram post 4:5` with default → confirm `editorial-collage` layout (asymmetric, no center card).
2. Pick `text-mask-cutout` layout → headline `REACHY` → confirm letters are filled with the AI image.
3. Pick `badge-stamp` → confirm a circular accent-colored stamp lands in the right-third.
4. Pick `card-soft` → confirm modal now has 4 slot fields (eyebrow + headline + sub + wordmark), card visibly smaller than before.
5. Layout picker shows visual previews, not just labels.
6. Generic gradient backgrounds GONE — every output has a clear focal subject + planned negative space.

## Done

Reply with: 1 generation per new layout (3 R2 URLs) + 1 of card-soft revised + 1 screenshot of the visual layout picker. Note the model + cost per asset.
