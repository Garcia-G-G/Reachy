# Image gen — full AI pivot (drop deterministic typography)

> Attach `planning/prompts/00-CONTEXT.md`. Apply §0.10. This is the architectural pivot. Throw out hedging. Commit to the new direction.

## Why we're pivoting

The deterministic typography overlay (AI = background, sharp + SVG = text) was the right call in 2024 when image models couldn't render readable text. In May 2026, `gpt-image-2` ships 99% character-level accuracy in Latin scripts (per OpenAI catalog). We're engineering around an AI weakness that no longer exists, and the cost is high: every output reads as "stock background + text overlay" instead of a designed composition. Text can't wrap around shapes, can't be set inside the image (cutouts), can't interact with the focal subject. That's the ceiling we keep hitting.

This pivot drops the overlay path entirely. The AI now renders everything visible — composition, color blocks, AND typography. Code's job becomes: **build a precise prompt that gives the AI a designer's brief**, then dispatch the call. Brand identity stays exact via prompt injection (hex colors, wordmark spelling, voice). Editing copy now costs an AI call ($0.21) instead of free re-render — explicitly surfaced in UI.

## Scope

In: imageGen, promptBuilder, layoutTemplates (becomes prompt templates), copyPlanner, imageWorker, generation-editor UI.
Out: composeImage.ts (delete or quarantine), public/fonts/* (no longer used at render time), `[asset].compose-state` overlay metadata.

## Tasks

### 1. Delete the overlay pipeline (or quarantine behind a flag)

`src/server/ai/composeImage.ts` — quarantine. Keep the file for emergency fallback but route nothing to it by default. Worker no longer calls `composeImage`. The "raw" buffer returned by the AI is the final asset.

`public/fonts/*.ttf` — leave on disk (small, harmless). Remove the `fontPath()` import from anywhere active.

`generation.params.composeState` — replace with `aiPromptState` (the exact prompt that produced the asset, brand colors snapshot, layout-template id, copy values). Used by re-render-this-asset action and by the editor's "Edit copy" feature.

### 2. Layout templates become prompt templates

`src/server/ai/layoutTemplates.ts` — wholesale refactor. Each layout entry is now:

```ts
interface LayoutPromptTemplate {
  id: LayoutId;
  label: string;
  // Slot definitions — the planner decides which to populate.
  slots: readonly TextRole[];
  // Free-text block injected into the AI prompt describing the layout's
  // visual structure. Includes positioning, hierarchy, typography style,
  // composition rules. Written for an art-director audience.
  promptDirective: (input: PromptDirectiveInput) => string;
  // Negative-space hint for image composition.
  negativeSpaceHint: string;
  // Reference image hint — when this layout looks particularly good with
  // a logo overlay or a specific photographic style, encoded here.
  referenceHint?: string;
}

interface PromptDirectiveInput {
  copy: PlannedCopy;
  brandColors: BrandColors;
  brandWordmark: string;          // exact spelling, exact case
  brandFontHint: string;          // "elegant high-contrast editorial serif"
}
```

Example for `editorial-collage`:
```ts
promptDirective: ({ copy, brandColors, brandWordmark, brandFontHint }) => `
EDITORIAL MAGAZINE LAYOUT
Composition: asymmetric, no center card, no balanced grid. Focal subject occupies the right 55% of the frame. Left 45% is breathing room with intentional negative space.

Typography integration (render these EXACTLY as written, integrated into the composition):
- Top-left corner: small mono uppercase label "${copy.eyebrow ?? ''}" in ${brandColors.ink}, ~3% of frame height. Treat as printed metadata.
- Lower-left, oversized italic ${brandFontHint}, weight 600, color ${brandColors.ink}, sizeable enough to dominate the left column: "${copy.headline ?? ''}" — should naturally bleed onto the right-side composition without losing legibility.
- Just below the headline: body text in clean sans-serif, color ${brandColors.ink} at 80% opacity, max 2 lines: "${copy.subheadline ?? ''}"
- Bottom-right corner: tiny mono uppercase wordmark "${brandWordmark}" in ${brandColors.accent}, ~2% of frame height.

Text must be crisp, legible, perfectly kerned. Treat typography as a first-class compositional element, not an overlay.
`.trim(),
```

Same treatment for `card-soft`, `quote-slab`, `badge-stamp`, `text-mask-cutout`, `announcement-banner`, `hero-centered`, `hero-split-left`. Each layout's directive describes positioning, scale, weight, color from brand, and integration with the AI composition.

`text-mask-cutout` becomes radically simpler — the AI handles the cutout natively now: *"The headline word '${copy.headline}' is rendered as massive cut-out letters revealing the underlying image inside the letterforms..."* — no more SVG mask code.

### 3. PromptBuilder rewrite

`src/server/ai/promptBuilder.ts` — single-pass builder:

```
[ART DIRECTOR BRIEF]
Render a single editorial-quality marketing image at ${spec.w}×${spec.h} for ${project.name}.
Style: ${visualStyle.promptStatic}.

Brand palette (use these EXACT hex values as the dominant colors):
- ink: ${brandColors.ink}
- paper: ${brandColors.paper}
- accent: ${brandColors.accent}

Brand voice: ${brandKit.voice ?? 'confident, editorial, direct'}.

[BRIEF]
${idea}

[LAYOUT DIRECTIVE]
${layout.promptDirective({ copy, brandColors, brandWordmark, brandFontHint })}

[NEGATIVE SPACE]
${layout.negativeSpaceHint}

[QUALITY]
- Magazine-cover finish. Photographic depth. ONE clear focal element.
- All typography crisp, kerned, legible. No misspellings. No partial words.
- Treat brand colors as the dominant palette — don't introduce off-brand hues.
- This image will be posted as-is. It is the FINAL asset, not a draft.
```

No "ABSOLUTELY NO TEXT" directive anymore — we WANT text now, and the directive specifies exactly what + where.

### 4. CopyPlanner adapts

`src/server/ai/copyPlanner.ts`:
- Still generates `PlannedCopy` for the slots a layout requests.
- New constraint: copy is now rendered BY the AI, so wording quality matters more than slot length tolerance. The planner prompt should bias toward short, punchy, legible-at-scale phrasing. Long Spanish copy that overflows in code overlay also misrenders in AI text — keep it tight.
- Voice rules ES vs EN actually applied (the previous hardcoded English-leaning rules go).
- Remove the eyebrow numbering format constraint (`№ 1/N`) — let the planner choose what's natural for the brief.

### 5. Worker simplifies

`src/server/jobs/imageWorker.ts`:
- Remove the `composeImage` call. Buffer from `generateImage` is the asset, after `resizeToFormat`.
- Remove the raw-bg dual upload (no more `1-raw.png` + `1.png`). Single asset per variant.
- `composeState` → `aiPromptState`: persist `{ promptUsed, copy, layoutId, brandColors, brandWordmark, model, quality, effort }`.
- Edit-copy flow: NEW path. Re-runs `images.edit` with the previous asset as reference + the new copy in the directive. Cost ~$0.21 per edit. Persist new asset, link to original via `parentAssetId`.

### 6. Edit-copy in the editor: explicit cost, explicit confirm

`src/components/app/generation-editor.tsx`:
- The Edit Copy sidebar now shows a clear cost banner at the bottom:
  ```
  ⓘ Editing text triggers a fresh AI render
     Cost: $0.21 per edit · ~15 seconds
  ```
- "Re-render" button becomes "Apply edit ($0.21)".
- Every successful edit creates a new asset visible in the variants strip, marked `Edit 1, 2, 3...`. User can flip between original and edits.
- "Quick text fix" toggle (default OFF) — when ON, uses `images.edit` with strength=0.85 (high reference adherence, only changes the text region). When OFF, fresh `images.generate` with the new copy. Quick fix is faster + cheaper; fresh gives more flexibility for major copy changes.

### 7. Sequence mode aligns

`imageWorker.ts` sequence path: each frame K passes the previous frame as `images.edit` reference + a `sequenceDirective(K, totalFrames)` from the layout. The AI now handles BOTH visual continuity AND text continuity in one pass — eyebrow numbering, headline progression, wordmark consistency all happen inside the AI.

### 8. Effort tiers — keep, simplify

- `fast` — single `images.generate`, no reasoning.
- `balanced` — single `images.generate` with `reasoning_effort: 'medium'` (web search to confirm exact param for gpt-image-2 in May 2026).
- `high` — best-of-K critic loop: 4 candidates internal, gpt-4o vision picks winner against the layout brief + brand criteria.

`high` cost surfaces as ~5× per variant in the cost preview. Worth it for the hero asset.

### 9. Multi-reference for brand coherence

`getBrandReferenceImages(projectId)`:
- Brand kit logo (if `brandKit.logoUrl`).
- Last 3 best-rated assets from this project (if any).

Pass up to 4 refs to `images.edit` (catalog says up to 16; 4 is sufficient and faster). This anchors visual identity across generations — outputs cohere with the brand instead of drifting.

### 10. UI cleanup

`generate-image-form.tsx`:
- Remove "Visual style" dropdown? Probably not — keep, but the visualStyle now influences the prompt's style line, not a code path.
- Remove "Layout" picker? KEEP. The layout still drives the prompt directive — it just doesn't drive an SVG overlay anymore.
- Remove the "Edit copy" modal here entirely (it lives only in the editor page now).

### 11. Backward compat

Old generations have `composeState` in their params, not `aiPromptState`. The editor for old generations falls back to read-only mode (no edit copy, since the overlay path is gone). New generations use the new path. Don't migrate — let old assets stay as-is.

## Files

Edit:
- `src/server/ai/imageGen.ts` (already does the dispatch, just remove the overlay assumption)
- `src/server/ai/promptBuilder.ts` (full rewrite)
- `src/server/ai/layoutTemplates.ts` (full rewrite — templates become prompt directives)
- `src/server/ai/copyPlanner.ts` (voice rules, slot tightness)
- `src/server/jobs/imageWorker.ts` (drop composeImage, persist aiPromptState)
- `src/server/actions/images.ts` (rerenderOverlay → editAssetCopy with new AI call)
- `src/components/app/generation-editor.tsx` (cost banner, quick-fix toggle, edits list)
- `src/lib/image-models.ts` (note in tagline that quality applies end-to-end now)

Quarantine (don't delete, mark deprecated):
- `src/server/ai/composeImage.ts` (header comment: DEPRECATED, see git log for context)
- `src/server/typography/fonts.ts` (same)

## Research before implementation

WebSearch:
1. `openai gpt-image-2 reasoning_effort parameter exact name May 2026` — confirm.
2. `openai gpt-image-2 edit endpoint strength image_fidelity parameter` — for the quick-fix toggle.
3. `openai images.edit multi-reference 16 images limit 2026` — confirm and check ordering importance.

Document findings in a header comment in `imageGen.ts`.

## Verify

```
pnpm typecheck && pnpm lint && pnpm build
```

Then in `pnpm dev`:
1. Generate `editorial-collage` IG post with the Gerardo brief in Spanish → output has eyebrow, headline, subhead, wordmark ALL rendered by AI, integrated into the composition. Spelling correct. Brand colors used.
2. Edit the headline in the editor sidebar → cost banner shows $0.21, click apply, ~15s later new asset appears in variants strip marked "Edit 1".
3. Quick-fix toggle ON, edit just one word → faster (~8s), only that word region visibly changes, rest of composition stable.
4. Sequence n=4 → frames evolve in BOTH visual + text. Eyebrow numbering or labels progress naturally in the rendered image.
5. Brand kit logo set → second generation onwards visibly inherits the logo's visual vocabulary (color, line weight).
6. Effort=high, n=1 → cost ~$1.05, server log shows 4 internal candidates + 1 critic pick.
7. Old generation (pre-pivot) opens in editor as read-only with a banner: "This generation uses the legacy overlay pipeline. Re-generate to enable editing."

## Done

Reply with:
- 1 generation rendered with AI typography (Spanish brief, all slots populated by AI inside the image).
- 1 edit-copy result side by side with original (cost $0.21).
- 1 quick-fix edit (single word changed, rest stable).
- 4-frame sequence with both visual + text evolution.
- Cost breakdown per effort tier on a single 1080×1350 generation.
- A short note in the response on what AI text accuracy looked like across the test set (any misrenders, any typos, any cut letters).
