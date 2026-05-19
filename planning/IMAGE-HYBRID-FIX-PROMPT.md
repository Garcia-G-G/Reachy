# Image gen — surgical fixes + selective AI typography

> Attach `planning/prompts/00-CONTEXT.md`. Apply §0.10. Hybrid pass: 70% surgical bug fixes + unhardcoding, 30% selective handoff to AI for one element (accent stickers).

## Why

Audit found ALL of these locked in code, limiting variety and causing visible bugs:
- Text positions/sizes are fixed numeric literals — no auto-fit, no overflow detection. Result: headlines spill off the frame on long Spanish copy.
- Color resolution ignores background luminance. Result: dark ink on dark backgrounds = invisible body text.
- Visual styles embed hex literals — brand kit palette is overridden silently.
- Variant rotation is deterministic 1:1 maps, not actually varied.
- Sequence deltas too subtle — frames look identical.
- Copy planner has hardcoded English-leaning examples + voice rules baked in.

Plus: the deterministic typography overlay is the right call for the brand-exact headline/wordmark, but it's the WRONG call for small accent text (eyebrow, badge label) where natural integration with the image matters more than exact font fidelity. Let AI render those.

## Part A — Surgical fixes (the bulk of the work)

### A.1 Auto-fit headline (no more overflow)

`src/server/ai/composeImage.ts` `wrapLines()` — replace the constant `0.55 × fontSize` heuristic with a binary-search shrink:
- Try the layout's declared `sizeFrac` first.
- Wrap. If wrapped output exceeds `block.heightFrac × height` (or 4 lines, whichever first), shrink sizeFrac by 10% and retry.
- Cap at 8 attempts; floor at `0.5 × originalSizeFrac` (don't shrink below readable).
- Add `block.heightFrac` to TextBlock — when undefined, infer as `block.sizeFrac × lineHeightEm × 4` (assume max 4 lines tall).

Result: long Spanish copy shrinks to fit instead of bleeding off the canvas.

### A.2 Contrast-aware text color

In `src/server/ai/composeImage.ts`, before rendering each TextBlock:
- Use sharp to extract a small region of the resized background at the block's position+size — `.extract({ left, top, width, height }).stats()`.
- Compute luminance from `stats.channels[0..2].mean` using the WCAG formula: `L = 0.2126·R + 0.7152·G + 0.0722·B` normalized to 0-1.
- If `L < 0.4` (dark region), force text color to `paper` regardless of layout's declared role.
- If `L > 0.6` (light region), force `ink`.
- Mid-range (0.4-0.6): respect layout's declared color but draw an SVG `<feGaussianBlur>` halo behind the text in the opposite color (8px blur, 0.4 opacity) for legibility.

Override is sticky: persisted into `composeState.copy` so re-render-overlay reuses the same color decisions instead of recomputing.

### A.3 Adaptive backdrop sizes

`layoutTemplates.ts` `cardSoft` — change the backdrop dimensions from fixed `0.62 × 0.45` to a function that takes the wrapped headline + subhead and returns `{ widthFrac, heightFrac }` proportional to text bulk. Same for any layout with a backdrop that frames text.

API: extend `Backdrop` type with optional `sizeFn?: (text: WrappedTextDimensions) => { widthFrac, heightFrac }`. When present, `composeImage` calls it after wrapping; otherwise uses the literal values.

### A.4 Stronger sequence delta

`copyPlanner.ts` sequence variant + `imageGen.ts` sequence dispatch:
- Each frame's prompt now includes a SPECIFIC delta instruction (not the soft "evolve from previous"):
  - Frame 2: *"Shift the focal element 30% to the LEFT. Reduce its scale by 15%. Add a new color block in the right third."*
  - Frame 3: *"Continue the leftward drift. Introduce a counter-element at the bottom-right."*
  - Frame 4: *"Resolve the composition: focal element now centered, all secondary elements receded into background."*
- Layout's `sequenceHint(frameIndex, totalFrames)` returns these specific deltas instead of vague hints.
- Lower `images.edit` adherence to the reference: if the OpenAI API supports a `strength` or `image_fidelity` param, set it to ~0.55 (medium adherence — enough for continuity, low enough for visible motion). Web search the exact param name for gpt-image-2 edit endpoint.

### A.5 Unhardcode the visual styles palette

`src/server/ai/visualStyles.ts` — strip the `#f1ebdf / #14110d / #b6481a` hex literals from every entry's prompt template. Replace with `{paper} / {ink} / {accent}` placeholders. `promptBuilder.ts` substitutes them with `brandKit.bgColor / primaryColor / accentColor` at runtime. Now the brand kit ACTUALLY drives palette in the prompt, not the visualStyles defaults.

### A.6 Randomize variant rotation

`promptBuilder.ts` `ALT_STYLES_FOR` and `ALT_LAYOUTS_FOR` — replace the static 1:1 map with a deterministic shuffle seeded by `generationId` (so it's reproducible per generation but varies across generations). When the user hits regenerate, the shuffled order changes, so they see actually different rotations on the second run.

### A.7 Copy planner: strip English-leaning baked-in voice

`copyPlanner.ts:123-135` — move the hardcoded voice rules ("No exclamation marks", "No first-person pronouns", "No clichés like unlock/revolutionize/transform") into a `defaultVoiceRules(language)` function that returns ES-appropriate or EN-appropriate rules. Spanish has different cliché traps ("eleva tu marca", "lleva al siguiente nivel") — the planner should explicitly forbid those, not the English ones.

Brand voice from brand kit, when present, REPLACES the defaults instead of appending.

### A.8 Auto-fit feedback in UI

Surface in the editor: when auto-fit kicked in, show a small `"⤓ shrunk to fit"` badge below the canvas. When contrast forced an inversion, show `"↻ color auto-flipped for legibility"`. Garcia knows what the system did.

## Part B — Selective AI typography (the small handoff)

### B.1 New TextBlock kind: `aiAccent`

Extend `TextBlock` in `layoutTemplates.ts`:
```ts
{ role: 'aiAccent'; textSource: 'eyebrow' | 'static'; text?: string; promptIntegration: string }
```

Where `promptIntegration` is a directive injected into the AI prompt, e.g.:
*"In the upper-left quadrant, integrate a small editorial label reading [TEXT] in a clean sans-serif font, ink color [HEX], approximately 4% of frame height. Treat it as if printed on the image itself — let it interact with the composition naturally."*

When present, that text is NOT rendered by composeImage's overlay. The AI handles it inside the image. Code only handles the headline + wordmark (the brand-exact stuff).

### B.2 Update layouts to use aiAccent for eyebrow/badge

In `editorial-collage` and `badge-stamp`:
- Move the eyebrow from the deterministic overlay to an `aiAccent` block.
- Move the badge stamp's tiny inner text from overlay to `aiAccent` (the orange circle stays code-rendered as a backdrop; the text inside it goes to AI).

In `card-soft`: keep the eyebrow as overlay (it's outside any AI-rendered region, no integration benefit).

### B.3 PromptBuilder injects aiAccent integration directives

`promptBuilder.ts` — collect all `aiAccent` blocks from the layout, format their `promptIntegration` strings with the actual copy, and append to the prompt. This means the editorial directive's "NO TEXT" rule needs an exception — change to *"NO text EXCEPT where explicitly described below"* and list the aiAccent blocks.

Risk: gpt-image-2 catalog claims 99% text accuracy in Latin. If it misrenders the accent on some generations, the user can:
- Hit `↻ Regenerate` (full regen) — different attempt, the accent might come out clean.
- OR fall back to overlay mode for that specific block via a layout setting.

### B.4 Editor UI: per-block "rendered by" badge

In the editor sidebar's Edit Copy section, each slot shows a small badge: `[code]` or `[ai]`. Slots marked `[ai]` warn: *"AI-rendered text. Editing requires a full regeneration ($0.21)."* Slots marked `[code]` say nothing (free re-render is the default).

## Files

Edit:
- `src/server/ai/composeImage.ts` (auto-fit, contrast detect, halo)
- `src/server/ai/layoutTemplates.ts` (heightFrac, sizeFn, aiAccent role)
- `src/server/ai/promptBuilder.ts` (palette interpolation, aiAccent injection)
- `src/server/ai/copyPlanner.ts` (language-aware voice rules, sequence deltas)
- `src/server/ai/visualStyles.ts` (strip hex literals)
- `src/server/ai/imageGen.ts` (sequence adherence param if available)
- `src/server/jobs/imageWorker.ts` (persist auto-fit decisions in composeState)
- `src/components/app/generate-image-form.tsx` (rendered-by badges, auto-fit indicators)

## Research before implementation

WebSearch:
- `openai gpt-image-2 edit endpoint strength image_fidelity parameter 2026` — to confirm if there's an adherence knob for sequence frames.

## Verify

```
pnpm typecheck && pnpm lint && pnpm build
```

Then in `pnpm dev`:
1. Generate `editorial-collage` with idea in Spanish → headline auto-shrinks to fit, no overflow off frame.
2. Generate with `gpt-image-2`, dark abstract background → body text renders in `paper` color (auto-flipped), no invisible text.
3. Generate `badge-stamp` → the eyebrow inside the orange circle is rendered BY THE AI (visible in the image, not as a code overlay). Confirm by inspecting the raw bg in `composeState.rawAssets` — text already there.
4. Sequence n=4 → frame 2 visibly different from frame 1 (focal shifted, scale changed). Frame 4 visibly resolved.
5. Brand kit with custom colors `{ ink: #2A1810, paper: #F5E6D3, accent: #C73E1D }` → AI prompt actually mentions those hex values, not the editorial defaults.
6. Click regenerate twice → second run uses a different alt-layout/style than the first (rotation actually varies).
7. Edit Copy modal shows `[code]` next to headline, `[ai]` next to eyebrow with cost warning.

## Done

Reply with:
- 1 generation showing auto-shrunk headline (long ES copy fitting cleanly).
- 1 generation showing auto-flipped color (paper text on dark bg).
- 1 generation showing AI-rendered eyebrow integrated into the image (badge-stamp layout).
- 4-frame sequence with visible motion delta.
- Cost breakdown for a `card-soft` (mostly code) vs `badge-stamp` (mixed code+AI text) generation.
