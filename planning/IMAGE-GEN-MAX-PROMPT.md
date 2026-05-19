# Image generation — massive improvement pass

> Pega este archivo COMPLETO en una sesión nueva de Claude Code Max + adjunta `planning/prompts/00-CONTEXT.md`. Después dile *"proceed"*.

---

You are working on the **Reachy** repo (`~/Documents/reachy/`). Apply §0.10 of `planning/prompts/00-CONTEXT.md` — quality and depth, no shortcuts.

## Context

After 6+ rounds chasing reel quality (which has hit Sora's current ceiling), Garcia is pivoting to invest in **image generation** — Reachy's actually strong feature. The image pipeline (`gpt-image-1` via OpenAI) is producing clean, on-brand Instagram posts with rendered text that actually works. We're going to push it to its current state-of-the-art.

Garcia's specific ask: **add more OpenAI image models** to the engine selector, and **make the whole image generation feature massively better**.

## Current state (audited 2026-05-14 by Cowork)

Read these files first to confirm the audit:
- `src/server/ai/imageGen.ts` — provider dispatch + sharp resize
- `src/lib/image-formats.ts` — 7 formats + provider/model catalog
- `src/components/app/generate-image-form.tsx` — UI with model dropdown grouped by provider

What ALREADY works (do NOT redo):
- OpenAI provider with `gpt-image-1` model
- fal.ai provider with 4 models (`flux-2-pro`, `flux-2-flex`, `recraft-v3`, `nano-banana-2`)
- 7 formats: hero, og, post-ig, reel-cover, email-header, banner-tw, square
- Sharp resize with `cover` fit + center crop
- Per-model cost estimation
- Form selector grouped by provider

What's BROKEN or MISSING (this prompt fixes):
- Quality tier hardcoded to `'medium'` in `openaiImage()` — no UI control
- Only `gpt-image-1` exposed from OpenAI — no `gpt-image-1-mini`, no DALL-E variants, no newer models
- No image edit mode (regenerate is the only path)
- No brand reference images on the brand kit
- `visualStyles.ts` exists for reels but isn't injected into image prompts
- No campaign / multi-asset batch mode
- Format catalog stuck at 7 (missing Pinterest, YouTube thumb, LinkedIn variants, TikTok cover, etc.)

## Mission — 8 improvements

### Step 1 — Research current OpenAI image models (mandatory)

WebSearch + WebFetch the OpenAI official docs (`platform.openai.com/docs/models` and `/docs/api-reference/images`) as of May 2026. Confirm which of these exist and their pricing:

- `gpt-image-1` (current — confirm it's still the flagship)
- `gpt-image-1-mini` (cheaper variant — confirm name + pricing)
- `gpt-image-1.5` or `gpt-image-2` (newer? confirm if released)
- `dall-e-3` (legacy — confirm still callable)
- `dall-e-2` (cheaper legacy — confirm)

Also check current parameter ranges for each:
- Supported `size` values (`1024x1024`, `1024x1536`, `1536x1024`, `auto`, etc.)
- `quality` tiers (low / medium / high / auto)
- `output_format` (`png` / `jpeg` / `webp`)
- `output_compression` for jpeg/webp
- `background` (transparent / opaque)
- `n` (batch size limits)

**Document everything in a comment block at the top of `src/server/ai/imageGen.ts`** so the next person doesn't have to research again.

### Step 2 — Expose ALL OpenAI image models in the engine selector

**File:** `src/lib/image-models.ts` (create if doesn't exist)

```ts
export type ImageModelId = 'gpt-image-1' | 'gpt-image-1-mini' | 'gpt-image-1.5' | 'dall-e-3' | 'dall-e-2';

export interface ImageModelEntry {
  id: ImageModelId;
  label: string;
  tagline: string;
  /** Cost in cents per image at the default quality tier we use. */
  centsPerImage: number;
  /** True when the model supports the `quality` parameter (low/medium/high). */
  supportsQualityTier: boolean;
  /** True when the model can render text in the image cleanly (gpt-image-1 family yes, DALL-E historically no). */
  rendersTextWell: boolean;
  /** True when the model supports image editing (input image + edit prompt). */
  supportsEdit: boolean;
}

export const IMAGE_MODELS: Record<ImageModelId, ImageModelEntry> = {
  // populate after research
};

export const DEFAULT_IMAGE_MODEL: ImageModelId = 'gpt-image-1';
```

In the UI engine selector (`src/components/app/generate-image-form.tsx` or wherever), show all available models with:
- Label
- Tagline
- Cost per image at current quality tier
- Visual indicators for "renders text well" and "supports editing" (small icons)
- Greyed out if model is unavailable in this region/tier (with tooltip)

Default the selector to `gpt-image-1` (the current default).

### Step 3 — Quality tier selector (low / medium / high / auto)

`gpt-image-1` natively supports a `quality` parameter that drastically affects cost AND quality:
- `low`: ~$0.02 per square image
- `medium`: ~$0.07
- `high`: ~$0.19
- `auto`: model picks

Add a UI selector under the model dropdown:
- Radio: Low / Medium / High / Auto
- Default: Medium
- Show estimated cost change live as user picks (`+$0.48 for 4 variants high vs medium`)

Persist user's preference in localStorage so it sticks across sessions.

### Step 4 — Image edit mode (modify existing image)

`gpt-image-1` supports an edit endpoint: pass an input image + edit prompt, get a modified version. This is the killer feature for iterating on an asset.

**File:** `src/server/ai/imageGen.ts`

Add a new function `editImage(args: {sourceUrl: string; editPrompt: string; format: ImageFormat; model: ImageModelId; quality: QualityTier}): Promise<...>`.

Internally:
1. Fetch the source image bytes
2. Call OpenAI `images.edit` with the bytes + edit prompt
3. Receive the modified image
4. Upload to R2 like normal

**UI** (`src/components/app/generate-image-form.tsx`):
- Add a tab / mode toggle: "Generate" (current) vs "Edit existing"
- "Edit existing" mode: dropdown to pick from project's library OR upload a file
- Then a textarea for the edit prompt (e.g. "make the background warm cream paper instead of blue")
- Render the edit. The result becomes a new asset in the library, NOT a replacement of the original.

This unlocks: iterate on a hero image, swap colors, add/remove elements, change the focal subject — without regenerating from scratch.

### Step 5 — Reference image input (brand asset as style anchor)

Most users want their generated images to LOOK LIKE their other brand assets. `gpt-image-1` accepts up to 16 reference images that anchor style/composition.

**UI flow:**
- In Identity (brand kit) form, add an optional "Reference images" upload field. Up to 4 images that exemplify the brand visual style. Stored in R2 at `<projectId>/brand-references/`.
- In the Generate form, by default the model gets these references injected (toggleable per generation).
- Show a small preview row of "Using N brand references" above the prompt field.

Backend: `imageGen.ts` `generateImage()` accepts an optional `referenceImageUrls: string[]`. The OpenAI client method (`images.generate` or `images.edit` with multiple image inputs) gets called with these refs.

This is THE feature that makes generated images feel "on-brand" without writing 200-word prompts every time.

### Step 6 — Visual style integration for images (mirror reels)

Currently the reel pipeline has `visualStyles.ts` with `promptStatic` per style. Images should use the SAME catalog so the brand looks consistent across reels and image assets.

**File:** `src/server/ai/promptBuilder.ts` (already exists, expand it)

Currently `buildImagePrompt` only uses brand kit colors/fonts. Extend to inject `style.promptStatic` from `visualStyles.ts` when the project has a visual style set.

Also expose a per-generation visual style override in the UI — sometimes you want a hero in `editorial` even though your default is `flat-2d`.

### Step 7 — Batch / campaign mode

The killer feature for Reachy's positioning: **one input → N coherent assets**.

New page or expanded form: "**Campaign generator**".
- Input: one campaign brief (e.g. "Launch announcement for Reachy v0.2 — focus on the new image editing feature")
- Output: 8 assets generated in one batch with consistent visual style:
  - 1× Hero image (1920×1080)
  - 1× OG image (1200×630)
  - 4× Instagram posts (1080×1350) — variations of the message
  - 1× Twitter banner (1500×500)
  - 1× Email header (1200×400)

Backend: `src/server/actions/campaigns.ts` (new) → orchestrates 8 parallel image generations with shared visual style + brand kit + ONE LLM-planned scene brief per format.

Show a progress indicator as each asset completes. Total cost displayed up front (~$0.50-$2 depending on quality tier).

### Step 8 — Format library expansion

Current formats are 7. Add:
- `pinterest` (1000×1500)
- `youtube-thumbnail` (1280×720)
- `linkedin-post-square` (1200×1200)
- `linkedin-post-landscape` (1200×627)
- `email-banner-wide` (1500×400)
- `tiktok-cover` (1080×1920)
- `og-square` (1080×1080)

Also add format groups in the UI (Social / Email / Web / Print) so 14 formats don't overwhelm the dropdown.

## Note on fal.ai

fal.ai is ALREADY integrated for images (Cowork audit confirmed: `flux-2-pro`, `flux-2-flex`, `recraft-v3`, `nano-banana-2` are live in `image-formats.ts`). DO NOT redo this. Optionally consider adding **Ideogram V3** (best at rendering complex text in images, better than gpt-image-1 for copy-heavy designs) as a new fal.ai entry. WebSearch the current fal.ai SDK ID before adding.

## Verification

1. `pnpm typecheck`, `pnpm lint`, `pnpm build` all pass.
2. Open `/app/projects/<slug>/generate/image`. Verify:
   - Model dropdown shows N options (one per OpenAI image model that exists)
   - Quality tier selector visible, default medium
   - Cost estimate updates live as user changes model/quality/variants
3. Generate an image with each new model at default quality. Verify cost in DB matches estimate.
4. Test edit mode: pick an existing asset, prompt "change the background color to warm cream", verify a new asset appears with the change.
5. Upload a brand reference, generate, verify the result reflects the reference style.
6. Generate a campaign (8 assets at once). Verify all 8 land in the library with consistent style.

## Acceptance criteria

- [ ] All current OpenAI image models exposed in selector
- [ ] Quality tier selector working with live cost preview
- [ ] Image edit mode shipped (modify existing instead of regenerate)
- [ ] Reference image input wired through brand kit + per-generation toggle
- [ ] Visual style from `visualStyles.ts` applied to image prompts
- [ ] Campaign generator: 1 input → 8 coherent assets in one batch
- [ ] 7+ new format options added with grouped UI
- [ ] (Optional) fal.ai models added behind feature flag, OR documented as TODO

## Final report

- ✅ All 8 steps completed (or explicit decision to defer some)
- 📁 Files modified
- 🤖 Which OpenAI models are currently live + their costs
- 💰 Total spent on test renders during this pass
- 🎨 Sample assets: paste R2 URLs of 1 asset per new model, plus 1 campaign batch (all 8)
- 💡 Decisions you made (e.g. "DALL-E 2 doesn't seem worth exposing — text rendering is bad")
- ⚠️ Anything pending (e.g. "fal.ai images deferred for Garcia's decision")
- 🚀 Next: Garcia decides which features to lean on for the next demo
