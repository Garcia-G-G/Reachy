# Image gen — sequence mode (variants as animation frames)

> Attach `planning/prompts/00-CONTEXT.md`. Apply §0.10.

## Goal

Today, picking `n=4` generates 4 independent attempts at the same prompt — exploration. Add a second mode: `n=2`/`n=4` as a SEQUENCE where each frame is a continuation of the previous one, like keyframes of a short animation. Same visual language across all frames, but elements move/morph and copy progresses (set up → punchline). Designed to be posted as an IG carousel or read left→right as a build.

## Tasks

### 1. New input field: `mode`

In `src/server/actions/images.ts` `enqueueImageGenerationInput` zod schema:
```ts
mode: z.enum(['exploration', 'sequence']).default('exploration'),
```
Plumb through `ImageGenJobData`, the worker, and `generateImage`. Default exploration — current behavior unchanged.

### 2. Sequence-aware copy planner

In `src/server/ai/copyPlanner.ts`, add `planCopySequence({ idea, layout, language, project, brandKit, frames })` that returns `PlannedCopy[]` of length `frames`. The LLM call instructs:
- Frames must read as a sequence (frame 1 sets up, last frame lands the punch).
- Same headline shape across frames OR a deliberate progression (e.g. eyebrow numbered `№ 1/4 · INTRO`, `№ 2/4 · EL TRUCO`, etc.).
- Wordmark constant across all frames.
- `subheadline` optional per frame — empty allowed for clean reveal frames.

Use OpenAI structured output (JSON schema) — array of `PlannedCopy` length `frames`.

### 3. Sequence-aware image gen

In `src/server/ai/imageGen.ts`, add a `sequence: { frameIndex: number; totalFrames: number; previousFrameBuffer?: Buffer }` optional input.

Dispatch:
- Frame 1: normal `images.generate` with the editorial prompt + appended directive: *"Frame 1 of N — establishes the composition. Strong focal subject in [layout's negative-space-aware position]. This is the OPENING frame of a 4-part sequence; subsequent frames will evolve from this composition."*
- Frame 2..N: `images.edit` with `previousFrameBuffer` as reference + appended directive: *"Frame K of N — continuation of the previous frame. Keep the same color palette, same overall composition, same focal subject. Move/transform ONE element subtly: [evolution hint from layout's `sequenceHint(frameIndex)`]. Do NOT redesign — evolve."*

Frame K's `sequenceHint` is layout-defined (see task 4) so the motion direction is intentional, not random.

### 4. New `sequenceHint` field on layouts

Extend `Layout` in `src/server/ai/layoutTemplates.ts`:
```ts
sequenceHint?: (frameIndex: number, totalFrames: number) => string;
```
Examples to ship:
- `editorial-collage.sequenceHint`: frame K out of N — "the focal element shifts from right side toward center, growing slightly larger each frame; the negative space on the left progressively shrinks as text content arrives."
- `badge-stamp.sequenceHint`: "the circular stamp rotates ~15° clockwise each frame; the photographic subject pulls into slightly tighter focus."
- `text-mask-cutout.sequenceHint`: "the image revealed inside the letterforms shifts perspective slightly each frame, like a parallax pan."

When `sequenceHint` is undefined, fall back to a generic continuity instruction.

### 5. Worker — generate frames serially

In `src/server/jobs/imageWorker.ts`, when `mode === 'sequence'`:
- Plan the copy sequence ONCE → `PlannedCopy[]` length `n`.
- Loop frame 1..n SERIALLY (each waits for the previous):
  - Frame 1: `generateImage({ ..., sequence: { frameIndex: 0, totalFrames: n } })`
  - Frame K: pass `sequence: { frameIndex: K, totalFrames: n, previousFrameBuffer: framesBuffersK-1 }`
- Compose each frame with its OWN `PlannedCopy[K]` so the typography progresses too.
- Cost: Same per-frame as exploration mode. Sequence has no premium — same OpenAI bill.

### 6. UI — mode toggle + ordered thumbnail strip

In `src/components/app/generate-image-form.tsx`:
- Above the `Variantes` radio, add a 2-button segmented control:
  ```
  MODO   [ Exploración ]  [ Secuencia ]
  ```
  - Exploración → label changes to "Variantes" below (current behavior).
  - Secuencia → label changes to "Frames", n=2 / n=4 only (no n=1 in sequence mode).
- After generation in sequence mode:
  - Thumbnail strip rendered with arrow separators: `[1] → [2] → [3] → [4]` instead of grid.
  - Selected thumb still drives the big preview.
  - Toolbar gains a `[↓ DOWNLOAD AS CAROUSEL]` button → zips the N frames named `01.png`, `02.png`, etc., for direct IG carousel upload.

### 7. Generation row — persist mode + sequence metadata

`generation.params` JSON gains `mode` and (when sequence) `sequenceMeta: { totalFrames, frameTexts: PlannedCopy[] }`. Re-render-overlay action handles per-frame edit by accepting `frameIndex` to know which copy slot to edit.

## Files

- Edit: `src/server/actions/images.ts`, `src/server/jobs/queue.ts` (job data), `src/server/jobs/imageWorker.ts`, `src/server/ai/imageGen.ts`, `src/server/ai/copyPlanner.ts`, `src/server/ai/layoutTemplates.ts`, `src/components/app/generate-image-form.tsx`
- Create: none

## Verify

```
pnpm typecheck && pnpm lint && pnpm build
```

Then in `pnpm dev`:
1. Mode `Exploración`, n=4 → behaves as today (4 independent attempts).
2. Mode `Secuencia`, n=4 → 4 frames generated serially, frame 2..4 visibly continue from frame 1 (same palette, same focal subject, evolved position/typography). Eyebrow numbers progress (`№ 1/4` → `№ 4/4`) when the layout supports it.
3. UI shows `[1] → [2] → [3] → [4]` strip with arrows.
4. `[↓ DOWNLOAD AS CAROUSEL]` produces `01.png`...`04.png`.
5. Edit Copy on frame 3 only re-renders frame 3 (others untouched).
6. `editorial-collage` + sequence → focal element migrates per the sequenceHint.

## Done

Reply with: 4-frame sequence rendered with `editorial-collage` (R2 URLs in order) + cost breakdown + 1 screenshot of the sequence thumbnail strip with arrows.
