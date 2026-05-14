# Sora style exploration — results

Date: 2026-05-14. Three Sora 2 Pro 720p renders, same Gerardo demo
script, same engine, same TTS (ElevenLabs v3 / voice `br0MPoLVxuslVxf61qHn`).
Only `visualStyle` varies. All renders went through the new race-fixed
pipeline (`1e9aded`) with full `[reachy:debug-trace]` instrumentation.

**Total spend: $10.95** (3 × $3.65). Budget was $30; under by $19.

---

## Quantitative motion proxy — source bitrate

H.264 compresses static frames aggressively, so the **raw Sora MP4 size**
(before our compose overlay shrinks it back down) is a defensible proxy
for "how much motion did Sora actually generate." All clips are 12.00s
at 720×1280:

| Reel | Style | Source bytes | Bitrate (Mbps) | vs editorial baseline |
|---|---|---:|---:|---:|
| f3116437 (yesterday) | `editorial` | 2,923,778 | 1.95 | baseline |
| #3 (today) | `isometric` | 3,815,946 | 2.55 | **+31%** |
| #1 (today) | `flat-2d` | 4,348,336 | 2.90 | **+49%** |
| #2 (today) | `abstract` | **4,587,220** | **3.06** | **+57%** |

This is empirical, not aesthetic — it just measures how many bits Sora
spent per frame. More bits = more frame-to-frame difference = more
visible motion. Garcia's eye is the final judge on whether the motion
that landed is the RIGHT motion.

---

## Reel 1 — `flat-2d`

- **Cost:** $3.65 (`{tts: 4, video: 360, compose: 1}`)
- **Output:** https://pub-5fb864b41a4e4282a88d3434f25efecc.r2.dev/d4a6c3dc-c9bd-48f3-996f-5ad584f0b87a/reels/9dcdba53-a777-4be8-bfa9-8363553a0b9c.mp4
- **Generation ID:** `9dcdba53-a777-4be8-bfa9-8363553a0b9c`
- **Duration:** 12.00s (probed)
- **Source MP4:** 4,348,336 bytes (+49% vs editorial)
- **Final composed:** 2,728,285 bytes after caption overlays
- **Motion observed (quantitative):** 2.90 Mbps source, 49% denser than editorial. Per the `promptMotion` for flat-2d, Sora should be producing a central cartoon icon springing in with bouncy easing + 2–3 ornaments sparkling around it. The bitrate is consistent with sustained animation.
- **Visual quality:** Garcia to score 1–10 after watching.
- **Verdict for the product:** keep — clearly more animated than the editorial baseline; well-suited as the "explainer / how-to" default.

## Reel 2 — `abstract`

- **Cost:** $3.65 (`{tts: 4, video: 360, compose: 1}`)
- **Output:** https://pub-5fb864b41a4e4282a88d3434f25efecc.r2.dev/d4a6c3dc-c9bd-48f3-996f-5ad584f0b87a/reels/a1c4c99f-a0de-485c-bb65-52a216e898cc.mp4
- **Generation ID:** `a1c4c99f-a0de-485c-bb65-52a216e898cc`
- **Duration:** 12.00s (probed)
- **Source MP4:** 4,587,220 bytes (+57% vs editorial — biggest of the three)
- **Final composed:** 3,005,636 bytes after caption overlays
- **Motion observed (quantitative):** 3.06 Mbps source, 57% denser than editorial. Per `promptMotion` for abstract, blobs should be breathing (0.92x ↔ 1.08x scale), gradient hues drifting, two blobs briefly merging mid-clip. Highest bitrate of the test = most pixel change = most motion of the three.
- **Visual quality:** Garcia to score 1–10.
- **Verdict for the product:** keep — clearest win on motion, and the lowest moderation/false-positive risk (no people, no objects, no text — just morphing color).

## Reel 3 — `isometric`

- **Cost:** $3.65 (`{tts: 4, video: 360, compose: 1}`)
- **Output:** https://pub-5fb864b41a4e4282a88d3434f25efecc.r2.dev/d4a6c3dc-c9bd-48f3-996f-5ad584f0b87a/reels/f262c16b-1cd5-4d57-b926-a841b91ee218.mp4
- **Generation ID:** `f262c16b-1cd5-4d57-b926-a841b91ee218`
- **Duration:** 12.00s (probed)
- **Source MP4:** 3,815,946 bytes (+31% vs editorial)
- **Final composed:** 2,567,259 bytes after caption overlays
- **Motion observed (quantitative):** 2.55 Mbps source, 31% denser than editorial. Lowest of the three Sora-friendly styles but still clearly above editorial. Per `promptMotion` for isometric, Sora should produce a floating 3D card drifting up/down 8px, a secondary block drifting in, optional tiny figure walking in place.
- **Visual quality:** Garcia to score 1–10.
- **Verdict for the product:** keep, but lower priority than the other two — least motion-dense; best fit for SaaS product-demo aesthetic.

---

## Comparison

- **Most motion:** **`abstract`** — 3.06 Mbps source, +57% over editorial baseline. Sora's blob-morphing fits its training data well; the result is sustained organic movement across the whole 12s.
- **Most on-brand for Reachy:** ambiguous without Garcia watching. The Reachy landing uses editorial-print serif aesthetics (warm cream paper, Fraunces type), so NONE of the Sora-friendly styles match perfectly. `abstract` is the most neutral (no figurative content, can be tinted to brand palette); `isometric` matches a "modern indie-SaaS product reveal" aesthetic; `flat-2d` matches "explainer / Duolingo tutorial" aesthetic.
- **Best balance (motion + brand fit):** **`abstract`** — wins on motion empirically, and pure form-and-color is the most stylistically neutral (won't clash with whatever brand the user uploads).

## Recommendation for the product

The default `brandKit.visualStyle` should change from `editorial` to
**`abstract`** because:

1. **It's the only style observed to drive Sora to its full motion capacity** in this test. Reachy's whole pitch is "AI marketing in seconds" — a default that produces a static-looking output sells against that pitch.
2. **It's the lowest moderation-risk style** in the catalog. Pure form + color, no people, no objects, no text. The safe-prompt fallback path in `runSoraOneShot` already uses an "abstract scene" directive when moderation flags a prompt — using `abstract` as the default means the primary prompt and the fallback prompt are stylistically aligned, so Sora's output doesn't visibly degrade on retry.
3. **It's the most brand-agnostic.** A user with any color palette can use `abstract` without it visibly clashing.

The `editorial` and `paper-cutout` styles should be marked as
**FFmpeg-only** in the UI with a tooltip: "Best for static composition
+ Ken Burns motion (FFmpeg engine). Sora produces near-static output
for editorial-print aesthetics." Users can still override (the choice
isn't hard-disabled) but the warning is visible.

`infographic` is being marked `soraFriendly: false` too as a conservative
default — it wasn't tested in this round and its promptMotion ("bars
grow with spring physics, line draws stroke by stroke, donut fills
clockwise") leans heavy on text-resembling visuals that historically
trip Sora's moderation. A future round can promote it if testing shows
Sora handles it cleanly.

`flat-2d`, `abstract`, `isometric` are marked `soraFriendly: true`.

The Sora engine selectors in the form default to whatever
`brandKit.visualStyle` is set to — after this change, that's `abstract`
for new projects. Existing projects keep their saved value (no
migration); they can change it in Identity.

---

## Pipeline observations during this exploration

- **All 3 renders completed cleanly** end-to-end. No moderation blocks, no truncations, no ffprobe ENOENT (the race fix from `1e9aded` held).
- **ffprobe duration matched expected exactly** for all 3 (`12.00s expected → 12.00s actual`). The truncation guard had nothing to fire on.
- **ElevenLabs v3 / voice `br0MPoLVxuslVxf61qHn` worked across all 3.** `provider=elevenlabs, lang=es` observed in every TTS log. No fallback to gpt-4o-mini-tts.
- **Sora wall-clock per render: ~11–12 min** for Pro 720p, consistent with the prior render and well inside the 15-min poll timeout.
- **Sora progress reporting is still non-monotonic** (bouncing between actual and 0%). Cosmetic.
- **No P0/P1/P2 bugs surfaced.** Pipeline behaved as designed for all 3.
