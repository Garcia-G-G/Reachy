# Sora style exploration — find what actually works

> Pega este archivo COMPLETO en una sesión nueva de Claude Code Max + adjunta `planning/prompts/00-CONTEXT.md`. Después dile *"proceed"*.

---

You are working on the **Reachy** repo (`~/Documents/reachy/`). Apply §0.10 of `planning/prompts/00-CONTEXT.md`.

## Context: why we're doing this

The last 4 reel renders ($15+ total) all looked static even though Sora 2 Pro 720p was used. After investigation, the conclusion is **not a code bug** — it's that **Sora 2 produces minimal motion when prompted with editorial / paper-cutout aesthetics** (simple geometric shapes on paper backgrounds). Sora's training data treats "magazine spread" as "static print", so it obediently produces a static-looking 12-second clip.

Sora's strengths are different: cartoon characters (flat-2d), morphing abstract shapes (abstract), and floating isometric scenes with tiny figures (isometric). We need to **prove this empirically** before recommending a default.

## Your mission

1. Generate **3 sample reels** in different Sora-friendly visual styles using the Gerardo demo script as the content.
2. Compare them side by side and identify which style produces the most visible motion.
3. Update the product defaults so users land on a Sora-friendly style by default.
4. Document a clear recommendation for which styles work with which engine.

## Budget

**Max $10 per reel, $30 total.** All 3 reels must complete or you stop and report. No surprise overruns.

## Step 1 — Pre-checks

1. Verify the recent fix in `compose.ts` line ~766 (no duplicate `-map [vfinal]`) is still in place.
2. Verify the ffprobe race fix from the live-debug pase is in place (ffprobe runs INSIDE `runSoraOneShot` before the `tmp` cleanup).
3. `pnpm build` — must pass.
4. If either fix is missing, STOP and report. Don't render anything until both are confirmed.

## Step 2 — Render 3 sample reels

For each reel, use the **demo Gerardo script** (4 lines from `planning/DEMO-SCRIPT-GERARDO.md`):
- `Marketing real para apps reales.`
- `Subes tu marca; Reachy hace el resto.`
- `Este video lo armó la app misma.`
- `¿Cazaste el truco, Gerardo? Esto es Reachy.`

**Common settings for all 3:**
- Template: Explainer · 25s
- Mode: I write the script
- Engine: **Sora 2 Pro 720p** (~$3.60 per reel — comfortably under $10 cap)
- Language: Spanish

**Render 3 reels with different visualStyle:**

| # | visualStyle | Why we're testing this |
|---|-------------|------------------------|
| 1 | `flat-2d` | Cartoon characters with springs/bouncing — Sora's wheelhouse for animation |
| 2 | `abstract` | Morphing color blobs — Sora handles smooth gradient motion well |
| 3 | `isometric` | Floating 3D cards with tiny figures — Sora's good at staged spatial scenes |

You can render these from the UI manually (one at a time) OR write a small one-off script in `scripts/render-style-samples.ts` that triggers them programmatically through the same `composeReelAction` path. Either way — track the cost per reel and confirm you stay under $10 each.

**After each reel completes**, write a row in `planning/SORA-STYLE-RESULTS.md`:

```md
## Reel N — `<visualStyle>`
- **Cost:** $X.XX
- **Output:** <path or R2 URL>
- **Duration:** Xs (probed)
- **Motion observed:** <describe what actually moves and how — be specific>
- **Visual quality:** <1-10 score with one-sentence justification>
- **Verdict for the product:** keep / iterate / drop
```

## Step 3 — Side-by-side comparison

After all 3 reels are done, write a final section in `SORA-STYLE-RESULTS.md`:

```md
## Comparison
- **Most motion:** style #X — why
- **Most on-brand for Reachy:** style #X — why
- **Best balance (motion + brand fit):** style #X — why

## Recommendation for the product
The default `brandKit.visualStyle` should change from `editorial` to `<recommended>` because [reasoning].

The `editorial` and `paper-cutout` styles should be marked as **FFmpeg-only** in the UI (with a tooltip "Best for static composition + Ken Burns motion") because Sora consistently produces near-static output for these aesthetics.

The Sora engine selectors should default to `flat-2d`, `abstract`, or `isometric` (whichever wins above).
```

## Step 4 — Apply the product change

Based on your recommendation in Step 3:

1. **Change `DEFAULT_VISUAL_STYLE`** in `src/server/ai/visualStyles.ts` from `'editorial'` to whichever style won.
2. **Add a new field** `soraFriendly: boolean` to `VisualStyleEntry`. Set it to `true` for `flat-2d`, `abstract`, `isometric`. Set it to `false` for `editorial`, `paper-cutout`. Set it to `false` for `infographic` unless your render results show otherwise.
3. **In the reel form** (`src/components/app/generate-reel-form.tsx`):
   - When the user selects a Sora engine (`sora-base` or `sora-pro-720p`), grey out the visualStyles where `soraFriendly === false` and add a tooltip: "This style is best with the FFmpeg engine — Sora produces static output for editorial-print aesthetics".
   - The user can still override (don't fully disable) but the warning is visible.
4. **Update `messages/en.json`** with the tooltip key.

## Step 5 — Verification

1. `pnpm typecheck` MUST pass
2. `pnpm lint` MUST pass
3. `pnpm build` MUST pass
4. Open the reel form in dev mode. Switch engine to Sora 2 Pro 720p. Verify the editorial/paper-cutout styles show the warning. Switch to FFmpeg. Verify all styles are equally selectable.

## Step 6 — Final report

In your reply to Garcia:

- ✅ All 3 reels rendered. Total spent: $X.XX (under budget).
- 📁 `planning/SORA-STYLE-RESULTS.md` written with results + comparison + recommendation.
- 🎬 Paste the 3 R2 URLs (or local paths) so Garcia can watch them in order.
- 💡 Recommended new `DEFAULT_VISUAL_STYLE`: `<value>`. Code change applied.
- ⚠️ If any reel had visible problems (motion still missing, voice off, drawtext misaligned), flag them — they may need their own fix pass.
- 🚀 Next: Garcia watches the 3 reels and decides which one (if any) is sendable to Gerardo, OR confirms the pivot to a non-AI tool for the demo.

## Constraints

- DO NOT render more than 3 reels. If the first one fails, fix the bug first, then render. Don't keep paying for broken renders.
- DO NOT touch `editorial` or `paper-cutout` `promptMotion` again — we've established they don't work with Sora regardless of prompt.
- DO NOT change `compose.ts` or `videoWorker.ts` core logic. The pipeline works; we're just changing which visualStyle is the default.
- ElevenLabs: if it's still not configured, OpenAI TTS fallback is fine for these 3 test renders. Note in the report whether ElevenLabs was active.
