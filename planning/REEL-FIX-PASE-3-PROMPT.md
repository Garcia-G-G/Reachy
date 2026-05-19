# Reel fix · pase 3 — Sora motion + FFmpeg error + cost UI

> Pega este archivo COMPLETO en una sesión nueva de Claude Code Max + adjunta `planning/prompts/00-CONTEXT.md`. Después dile *"proceed"*.

---

You are working on the **Reachy** repo (`~/Documents/reachy/`). Apply §0.10 of `planning/prompts/00-CONTEXT.md` (Quality & depth directive). Take your time, verify after every step.

## Context: what's broken after pase 2

Pase 2 wired up Sora 2 successfully and the render reached Sora ($6 was billed). But:

1. **Sora generated STATIC video** because `visualStyles.ts` prompts say `"Camera: completely static. NO zoom, NO pan, NO parallax."` — that line was written for FFmpeg image gen, NOT for Sora video. Sora obediently produced 8 seconds of a frozen frame.
2. **The next render crashed** with FFmpeg error code 234 (`-22 Invalid argument`, `Could not open encoder before EOF`, `frame= 0`). The encoder never received any frames — input is empty or malformed.
3. **The cost estimate doesn't render in the UI** even though `estimateReelCost` exists in `src/server/actions/reels.ts`.

This pase fixes all three.

---

## Step 1 — Split `VisualStyleEntry` into static + motion prompts

**File:** `src/server/ai/visualStyles.ts`

The current `prompt` field is reused for both image gen (FFmpeg path, where static is correct) and Sora video gen (where static makes Sora produce frozen frames). Split into two:

```ts
export interface VisualStyleEntry {
  label: string;
  tagline: string;
  /**
   * For FFmpeg image generation (gpt-image-1 / Recraft). Static composition.
   * The Ken Burns zoompan adds subtle motion later.
   */
  promptStatic: string;
  /**
   * For Sora 2 video generation. Same composition language as promptStatic
   * but with explicit motion direction so Sora generates animated frames.
   */
  promptMotion: string;
}
```

For each of the 6 styles, keep the existing prompt as `promptStatic` (just rename the field), and add a new `promptMotion` that describes how the composition animates over the 8 seconds.

**Example for `editorial`:**

```ts
editorial: {
  label: 'Editorial motion',
  tagline: 'Warm paper layout with multiple geometric marks; type added by overlay.',
  promptStatic: '<keep the existing prompt unchanged>',
  promptMotion: [
    'STYLE: warm cream paper background with visible grain and slight aging at the edges, like a high-quality editorial print magazine spread being assembled in front of you.',
    'Composition: 3-4 geometric marks arranged with editorial layout balance — a thin horizontal rule across the upper third, an oversized ink-colored shape (rectangle, half-circle, or punctuation) as the focal point in the central zone, a small burnt-sienna accent block in a quadrant for visual weight, and a thin vertical line at one edge.',
    'MOTION over 8 seconds: shapes drift in slowly from off-frame in the first 2 seconds with subtle easing, then settle into their final positions. The horizontal rule extends from left to right over 1 second like a pen stroke. The accent block pulses once gently at second 5. Camera holds completely still — only the elements move. Slow, deliberate, premium editorial pace. NO fast cuts, NO whip pans.',
    'Mid-century print design sensibility (Massimo Vignelli / Dieter Rams), but in motion.',
    'Palette: warm off-white paper (#f1ebdf) background, deep ink (#14110d) for primary marks, burnt sienna (#b6481a) for one accent only.',
    'CRITICAL CONSTRAINTS: NO text, NO letters, NO words, NO numbers, NO typography of any kind. NO real people, NO faces, NO photographs, NO UI screens, NO logos. Type is added by the renderer in a separate layer.',
  ].join(' '),
},
```

**Apply the same pattern to the other 5 styles.** Each `promptMotion` should:
- Keep the same composition language as `promptStatic`
- Replace any `"Camera: completely static. NO zoom, NO pan."` with `"MOTION over 8 seconds: <describe how elements move>. Camera holds still — only the elements move."`
- Reference the style's character (paper-cutout: shapes slide and settle; flat-2d: icon springs in; infographic: bars grow + line draws + numbers count up; isometric: cards float + figure walks; abstract: blobs morph and breathe)
- Keep all `CRITICAL CONSTRAINTS` (no text, no people)

Update `resolveVisualStyle` to return the full entry (no change needed — it already returns `VisualStyleEntry`).

**Update consumers:**

- `src/server/ai/reelPlanner.ts` — when building image prompts (FFmpeg path), use `style.promptStatic`. When the engine is `sora-base` or `sora-pro-720p`, use `style.promptMotion` and pass it to Sora directly (this is the master prompt for Sora, not per-scene image prompts).
- The reel planner should detect engine from `args.engine` (which already exists in PlanReelArgs or the equivalent — read the file).

After this edit, run `pnpm typecheck`. MUST pass.

## Step 2 — Diagnose and fix the FFmpeg error

**Symptom:** `ffmpeg exited with code 234: frame= 0 ... Could not open encoder before EOF`. Encoder receives 0 frames.

**Likely causes (investigate in order):**

1. **Sora download returned empty file.** Check `src/server/ai/openaiVideo.ts` `downloadSoraVideo`:
   - Log the byte count of each download
   - If `bytes === 0`, throw immediately with a clear error so the worker fails fast instead of feeding empty into FFmpeg
   - Also check `Content-Length` header before reading the body
2. **Scene MP4 codec/resolution mismatch.** When concatenating multiple Sora videos via FFmpeg, all inputs need consistent codec, resolution, fps, and timebase. Sora outputs are usually H.264 720p30 but verify.
   - Add a `ffprobe` step on each downloaded scene file: log its width, height, fps, codec, duration
   - If any scene has different specs, normalize via a pre-pass (`ffmpeg -i input.mp4 -vf "scale=1080:1920,fps=30" -c:v libx264 -pix_fmt yuv420p normalized.mp4`)
3. **Concat command malformed.** Look at the actual FFmpeg invocation in `src/server/video/compose.ts` — when engine is sora and there are N Sora scene files plus per-scene drawtext overlays plus an audio mix, the command can grow complex.
   - Add a `console.log` of the full FFmpeg argv before running
   - Try the same command manually in a terminal — does it reproduce?
4. **Empty input list.** If the Sora job array is empty (e.g. all scenes failed silently), FFmpeg gets called with no inputs.
   - Guard: if `sceneVideos.length === 0`, throw `"No Sora scenes available — all generations failed"` before the FFmpeg call

**Action:**

1. Add structured logging at every step of the video assembly pipeline (Sora job submitted → polling → downloaded → file size → ffprobe stats → FFmpeg argv → exit code).
2. Re-run a Sora reel render. Read the logs. Identify which step fails.
3. Apply the fix matching the root cause:
   - If empty download → retry with backoff (3 attempts)
   - If codec mismatch → add normalize pre-pass
   - If concat malformed → fix the filter graph
   - If empty input → fail fast with clear error message

Document the root cause and the fix in your final report.

## Step 3 — Show cost in the UI

**File:** `src/components/app/generate-reel-form.tsx`

After the user picks template + engine + script, display the **estimated cost** under the engine selector. After the render completes, display the **actual cost** alongside the video player.

If `estimateReelCost` doesn't already exist as a client-callable function, expose it via a Server Action that takes `{ template, engine, scriptLines? }` and returns `{ estimatedCents }`.

UX:
```
Engine: Sora 2 Pro 720p · ≈ $9.60 estimated
[Render reel]
```

After render done:
```
Done. Cost: $9.62 actual (Sora $9.60 · TTS $0.02)
```

Use the `Reels.costNote` and `Reels.engineHint` i18n keys that already exist; add new keys if needed.

If the estimate exceeds `MAX_REEL_COST_CENTS` ($20), disable the "Render reel" button and show a warning (already part of pase 2 spec — verify it actually works).

## Step 4 — Verification

1. `pnpm typecheck` — MUST pass
2. `pnpm build` — MUST pass
3. `pnpm dev`
4. Open the reel form for the demo Gerardo project. Verify:
   - Engine selector shows `≈ $9.60 estimated` next to Sora 2 Pro 720p
5. Click Draft scenes. The plan now uses `promptMotion` instead of `promptStatic` (verify by checking the planner output or logging — the imagePrompt should mention motion verbs like "drift in", "extend", "pulse")
6. Click Render reel. Watch worker logs. If FFmpeg crashes again, the new logs should pinpoint the cause; iterate the fix in Step 2.
7. When the render completes:
   - Verify the video has actual motion (not a frozen frame)
   - Verify the actual cost is shown alongside the video
   - Save the MP4 path so Garcia can review

## Acceptance criteria

- [ ] `VisualStyleEntry` has `promptStatic` and `promptMotion`; all 6 styles populate both
- [ ] reelPlanner uses `promptStatic` for FFmpeg engine and `promptMotion` for Sora engines
- [ ] Sora-rendered scenes show actual motion (shapes moving, transitions, breathing)
- [ ] FFmpeg error is diagnosed and fixed (root cause documented)
- [ ] Cost estimate appears in the form before render; actual cost appears after
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm build` all pass
- [ ] A re-rendered demo Gerardo at Sora 2 Pro 720p completes successfully and visibly animates

## Final report (per §0.8)

- ✅ All 4 steps completed
- 📁 Files modified
- 🐛 Root cause of the FFmpeg crash + the fix you applied
- 🎬 Sample frame from the new Sora render showing visible motion
- 💰 Actual cost of the test render
- ⚠️ Anything still pending
