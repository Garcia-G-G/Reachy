# Image gen — focus + more GPT models

> Attach `planning/prompts/00-CONTEXT.md`. Apply §0.10.

## Goal

2 fixes:
1. Images come out "raw AI" — add post-processing so they look professionally edited (sharpened, color-graded).
2. Garcia says only `gpt-image-2` is showing in the model dropdown — verify all 4 OpenAI models render and are selectable.

## Tasks

### 1. Background post-processing (the "edited" look)

In `src/server/ai/composeImage.ts`, before the SVG composite step:

```ts
const enhanced = await sharp(resizedBackground, { failOn: 'none' })
  .modulate({ saturation: 1.12, brightness: 1.02 })   // subtle saturation bump
  .linear(1.05, -8)                                   // slight contrast lift
  .sharpen({ sigma: 0.8, m1: 0.5, m2: 1.5 })         // crisp edges, controlled grain
  .png({ compressionLevel: 6 })
  .toBuffer();
```

Then `sharp(enhanced).composite([...]).png().toBuffer()` for the typography overlay.

Numbers tuned for the editorial palette — saturation too high makes ink hex bleed, sharpen too aggressive creates halos around AI artifacts. If it feels off after first render, the knobs are: saturation (1.05–1.20), linear slope (1.03–1.08), sharpen sigma (0.6–1.0).

### 2. Verify all OpenAI models render in the dropdown

Open `src/components/app/generate-image-form.tsx` line ~441 — the `IMAGE_MODELS_BY_PROVIDER.map` block.

Expected: dropdown shows under `OpenAI` optgroup:
- `OpenAI · GPT Image 2`
- `OpenAI · GPT Image 1.5`
- `OpenAI · GPT Image 1`
- `OpenAI · GPT Image 1 mini`

Garcia is only seeing 1. Diagnose:
- Is `providerAvailability.openai` true? (If false, optgroup is disabled and may visually collapse.)
- Is the catalog in `src/lib/image-models.ts` still listing all 4 entries with `provider: 'openai'`?
- Is `IMAGE_MODELS_BY_PROVIDER` filter `IMAGE_MODELS[id].provider === 'openai'` returning all 4?
- Restart dev server — localStorage persistence on `MODEL_STORAGE_KEY` could be sticking to a stale id.

If the catalog is fine and the dropdown still shows 1, suspect tailwind/select styling collapsing the optgroup. Open browser devtools, inspect the `<select>`, count `<option>` children under `<optgroup label="OpenAI">`. Report what you find.

### 3. (Optional) Add gpt-image-2 quality presets as separate dropdown entries

If Garcia "only sees gpt-image-2" because he expects different *quality tiers* to be different *models*, expose them more obviously in the picker. Skip if (2) fixes it.

## Files

- Edit: `src/server/ai/composeImage.ts`, optionally `src/components/app/generate-image-form.tsx`
- Create: none

## Verify

```
pnpm typecheck && pnpm lint && pnpm build
```

Then in `pnpm dev`:
1. Generate a post-ig with `gpt-image-2` high — image should look noticeably sharper, slightly richer saturation vs the previous render.
2. Open the engine dropdown — confirm 4 OpenAI options visible and clickable.
3. Pick `gpt-image-1.5`, regenerate — confirm it actually hits 1.5 (server log line).
4. Pick `gpt-image-1-mini` at `medium` — generate at ~1¢, confirm it works.

## Done

Reply with: 1 before/after screenshot of the same idea rendered with vs without post-processing + a screenshot of the open dropdown showing all 4 OpenAI options + the cost line for `gpt-image-1-mini` at medium.
