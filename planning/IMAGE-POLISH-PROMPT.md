# Image gen — polish pass

> Attach `planning/prompts/00-CONTEXT.md`. Apply §0.10.

## Goal

Ship 5 fixes to image gen so it stops looking like PowerPoint and starts looking like real Instagram posts.

## Tasks

### 1. IG-aesthetic layouts

In `src/server/ai/layoutTemplates.ts` add 4 new layouts:
- `card-soft` — floating card with soft shadow, headline + small sub
- `quote-large` — single italic phrase huge in Instrument Serif on solid color
- `editorial-margin` — text in left 30% column, image-led right 70%
- `feature-stack` — icon + eyebrow + headline + sub stacked centered with generous air

Change `DEFAULT_LAYOUT_FOR_FORMAT['post-ig']` from `hero-centered` → `card-soft`.

### 2. Variants UI redesign

Refactor `src/components/app/generate-image-form.tsx` post-render section:
- 1 large preview centered (max-w-[600px], format aspect ratio)
- Horizontal thumbnail strip below (4 small ~80px each) — click swaps preview
- Toolbar below preview: `[+ MORE LIKE THIS]` `[EDIT COPY]` `[↻ REGENERATE]` `[↓ DOWNLOAD]`
- Move `1080×1350` label to tooltip on hover
- Selected thumbnail: 1px ink border + shadow-print

### 3. Confirm quality high + check newer models

- Verify `DEFAULT_QUALITY_TIER === 'high'` in `src/lib/image-models.ts`
- WebSearch May 2026: did OpenAI ship `gpt-image-2` or `gpt-image-1.5`? If yes, add to catalog with pricing.

### 4. Add 3 models

In `src/lib/image-formats.ts` `IMAGE_PROVIDERS`:
- `gpt-image-1-mini` (OpenAI, cheaper, ~$0.02/img)
- `fal-ai/ideogram/v3` (best text rendering)
- `fal-ai/stable-diffusion-3.5-large`

WebSearch the exact fal.ai IDs before adding. Update `COST_CENTS_PER_IMAGE` in `src/server/ai/imageGen.ts`.

### 5. "More like this" variation mode

New action `enqueueVariations({ sourceAssetId, tweakPrompt? })` in `src/server/actions/images.ts`.

UX:
- Per-thumbnail `[+ MORE LIKE THIS]` button → opens compact modal
- Modal: source thumbnail preview + textarea (pre-filled with original idea) + tweak field (placeholder: "warmer, more centered, more negative space")
- Submit → enqueue 4 variants

Backend `src/server/jobs/imageWorker.ts`:
- Detect variation job → fetch source from R2 → call `openai.images.edit({ image: sourceBuffer, prompt: combinedPrompt, n: 4 })`
- Same layout/compose pipeline as fresh generation

Cost: same as fresh generation (~$0.76 at high × 4).

## Files

- Edit: `layoutTemplates.ts`, `generate-image-form.tsx`, `image-formats.ts`, `image-models.ts`, `imageGen.ts`, `images.ts`, `imageWorker.ts`
- Create: none

## Verify

```
pnpm typecheck && pnpm lint && pnpm build
```

Then in `pnpm dev`:
1. Generate post-ig with default → confirm `card-soft` layout
2. UI shows 1 big preview + thumbnail strip + toolbar
3. Click `[+ MORE LIKE THIS]` → modal → 4 new variants
4. Switch model to Ideogram → text in image is crisp
5. `gpt-image-1-mini` available in dropdown

## Done

Reply with: 1 screenshot of new grid + 1 of variation modal + final model list.
