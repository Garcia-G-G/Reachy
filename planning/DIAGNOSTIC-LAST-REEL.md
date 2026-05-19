# Diagnostic — last failed reel

Generated **2026-05-14**. Read-only diagnostic per request. No source code or DB rows modified.

The "last reel" in scope is **generation `40ab606a-0430-47d5-8632-50c7c6c97a81`** (Sora 2 Pro 720p, finished `2026-05-14 15:36:27`, status `done`). The DB claims duration = 25s but the rendered MP4 is **7.07s** — see §3.

---

## 1. Worker logs (last 300 lines, secrets redacted)

Worker process for this render: started May 13 19:41 PT (PID 81354). Logs were captured to `/private/tmp/claude-501/.../tasks/bkn4iu0wl.output`. No system journal / docker logs for the worker — it runs as a foreground `pnpm worker` Node process on the dev host.

Filtered to lines mentioning `40ab606a`:

```
[reachy:video] gen 40ab606a-0430-47d5-8632-50c7c6c97a81 scene 1/4 submitted to sora-2-pro (4s, jobId=video_6a05eac0da9481919f41788696c83f260b5d1cd9f0d0965a)
[reachy:video] gen 40ab606a-0430-47d5-8632-50c7c6c97a81 scene 3/4 submitted to sora-2-pro (8s, jobId=video_6a05eac19fa48193be53293724eb13f80893715cee87eb01)
[reachy:video] gen 40ab606a-0430-47d5-8632-50c7c6c97a81 scene 2/4 submitted to sora-2-pro (8s, jobId=video_6a05eac2900c8190b105af58b691110a057a4e2a8c954e4b)
[reachy:video] gen 40ab606a-0430-47d5-8632-50c7c6c97a81 all Sora jobs submitted in 3s
[reachy:video] gen 40ab606a-0430-47d5-8632-50c7c6c97a81 Sora poll #10: 3 scene(s) still rendering (min progress 0%)
[reachy:video] gen 40ab606a-0430-47d5-8632-50c7c6c97a81 scene 1 downloaded (1642175 bytes)
[reachy:video] gen 40ab606a-0430-47d5-8632-50c7c6c97a81 Sora poll #20: 2 scene(s) still rendering (min progress 0%)
[reachy:video] gen 40ab606a-0430-47d5-8632-50c7c6c97a81 Sora poll #30: 2 scene(s) still rendering (min progress 0%)
[reachy:video] gen 40ab606a-0430-47d5-8632-50c7c6c97a81 scene 3 downloaded (4245517 bytes)
[reachy:video] gen 40ab606a-0430-47d5-8632-50c7c6c97a81 scene 2 downloaded (2273369 bytes)
[reachy:video] gen 40ab606a-0430-47d5-8632-50c7c6c97a81 TTS x4 ready in 26s (4¢, voice=sage, lang=es)
[reachy:video] ffmpeg cmd:
ffmpeg -t 5 -i /var/folders/.../reachy-reel-sora-6Ma5U0/sora-0.mp4 -t 7 -i .../sora-1.mp4 -t 7 -i .../sora-2.mp4 -loop 1 -t 6 -i .../brand-bg.png -i .../scene-tts-0.mp3 -i .../scene-tts-1.mp3 -i .../scene-tts-2.mp3 -i .../scene-tts-3.mp3 -y -filter_complex [0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,format=yuv420p,drawbox=...,drawtext=...,fade=t=in:st=0:d=0.4,fade=t=out:st=4.6:d=0.4[v0];[1:v]...,fade=t=out:st=6.6:d=0.4[v1];[2:v]...,fade=t=out:st=6.6:d=0.4[v2];[3:v]scale=1080:1920,fps=30,format=yuv420p,...,fade=t=out:st=5.6:d=0.4[v3];[v0][v1]xfade=transition=fade:duration=0.4:offset=4.6[vx1];[vx1][v2]xfade=transition=fade:duration=0.4:offset=11.2[vx2];[vx2][v3]xfade=transition=fade:duration=0.4:offset=17.8[vx3];[4:a]apad=whole_dur=5,atrim=0:5,...[as0];[5:a]apad=whole_dur=7,...[as1];[6:a]apad=whole_dur=7,...[as2];[7:a]apad=whole_dur=6,...[as3];[as0][as1][as2][as3]concat=n=4:v=0:a=1[afinal] -map [vx3] -map [afinal] -c:v libx264 -preset medium -crf 22 -pix_fmt yuv420p -r 30 -movflags +faststart -c:a aac -b:a 128k -shortest /var/folders/.../out.mp4
[reachy:video] generation 40ab606a-0430-47d5-8632-50c7c6c97a81 done (sora-pro-720p), 1529667 bytes, slug=reachy
[reachy:video] job 40ab606a-0430-47d5-8632-50c7c6c97a81 completed (gen=40ab606a-0430-47d5-8632-50c7c6c97a81)
```

Long drawtext/drawbox blocks elided for readability with `...`. Full text-file paths and drawtext parameters available in the raw log if needed. **No ffmpeg errors logged. No exit-code-non-zero handler fired.** The worker considered this a clean success.

Notable: **scene 1 was submitted at "4s" duration**, scenes 2 and 3 at "8s". See §6 for why.

---

## 2. generation row

| field | value |
|-------|-------|
| id | `40ab606a-0430-47d5-8632-50c7c6c97a81` |
| type | `video` |
| format | `informative-25s` |
| status | `done` |
| provider | `openai` |
| model | `sora-2-pro` |
| cost_cents | `605` ($6.05) |
| error_message | `null` |
| created_at | `2026-05-14 15:31:11.728412` |
| finished_at | `2026-05-14 15:36:27.311` |
| wall-clock | 5 min 16 s |

**prompt** (col): `Marketing que se arma solo.` (the plan tagline)

**params** (pretty-printed):
```json
{
  "engine": "sora-pro-720p",
  "plan": {
    "tagline": "Marketing que se arma solo.",
    "language": "es",
    "template": "informative-25s",
    "scenes": [
      {
        "slot": "hook",
        "durationSec": 5,
        "background": "image",
        "textPosition": "top",
        "text": "Marketing real para apps reales.",
        "imagePrompt": "Vertical 9:16 editorial motion background, 1080x1920. Warm cream paper texture (#f1ebdf) ... drift slowly in from off-frame during the first 2 seconds ... Static camera, no text, no letters, no numbers, no typography, no people, no faces, no photos, no UI, no logos."
      },
      {
        "slot": "insight",
        "durationSec": 7,
        "background": "image",
        "textPosition": "bottom",
        "text": "Subes tu marca; Reachy hace el resto.",
        "imagePrompt": "Vertical 9:16 editorial motion background, 1080x1920. Warm off-white paper (#f1ebdf) ... a brand asset being transformed into output ... no text, no letters, no words, no numbers, no typography, no people, no faces, no photographs, no screens, no logos."
      },
      {
        "slot": "insight",
        "durationSec": 7,
        "background": "image",
        "textPosition": "bottom",
        "text": "Este video lo armó la app misma.",
        "imagePrompt": "Vertical 9:16 editorial motion background, 1080x1920. Warm cream paper background (#f1ebdf) ... automated composition coming together ... Absolutely no text, no letters, no words, no numbers, no typography, no people, no faces, no photographs, no UI screens, no logos."
      },
      {
        "slot": "takeaway",
        "durationSec": 6,
        "background": "brand",
        "textPosition": "center",
        "text": "¿Cazaste el truco, Gerardo? Esto es Reachy.",
        "imagePrompt": ""
      }
    ]
  },
  "soraJobs": [
    { "jobId": "video_6a05eac0da9481919f41788696c83f260b5d1cd9f0d0965a", "model": "sora-2-pro", "durationSec": 4, "retries": 0 },
    { "jobId": "video_6a05eac2900c8190b105af58b691110a057a4e2a8c954e4b", "model": "sora-2-pro", "durationSec": 8, "retries": 0 },
    { "jobId": "video_6a05eac19fa48193be53293724eb13f80893715cee87eb01", "model": "sora-2-pro", "durationSec": 8, "retries": 0 },
    null
  ],
  "costBreakdown": {
    "cents": 605,
    "parts": { "tts": 4, "video": 600, "compose": 1 }
  }
}
```

**Scene 0 was billed for 4 seconds, not 5** (`soraJobs[0].durationSec: 4`). Total Sora seconds billed: 4 + 8 + 8 = 20s × $0.30 = $6.00. Cost ledger is internally consistent.

---

## 3. Asset count for this generation

**1 row in `asset`.** Worker only ever uploads the final composed MP4 to R2 — per-scene Sora MP4s live in the worker's tmp dir during compose and are removed afterwards.

| id | kind | bytes | duration_sec (DB) | storage_key |
|----|------|-------|-------------------|-------------|
| `9039fe2a-edc9-4f4f-b8c1-5343adc1a6a9` | `video` | `1,529,667` | `25` | `d4a6c3dc-c9bd-48f3-996f-5ad584f0b87a/reels/40ab606a-0430-47d5-8632-50c7c6c97a81.mp4` |

**`ffprobe` against the actual MP4 downloaded from R2:**

```
[STREAM] codec=h264   1080×1920   duration=7.066667s   nb_frames=212
[STREAM] codec=aac                 duration=7.040000s   nb_frames=166
[FORMAT] duration=7.066667         size=1529667         bit_rate=1731698
```

**The DB row's `duration_sec: 25` is a lie** — the worker writes the plan total at `videoWorker.ts:112`, never the real output. Real output: 7.07s (212 frames @ 30fps).

**Bonus check across all recent video generations:**

```
40ab606a   dur=7.07s   bytes=1529667   sora-pro-720p
3763f727   dur=7.07s   bytes=1051520   sora-pro-720p
4da9f83d   dur=7.07s   bytes=1619265   sora-pro-720p
a400c621   dur=23.80s  bytes=6238356   ffmpeg
1f65f6d7   dur=23.80s  bytes=6668319   ffmpeg
```

**Every Sora reel rendered so far has been truncated to exactly 7.07s (212 frames).** FFmpeg-path reels render at the correct 23.80s (= 25s plan − 3×0.4s xfade). This is a systemic Sora-path bug, not specific to today's render. The DB metadata hid it across three rounds.

---

## 4. R2 file inventory

**1 file** at `s3://<r2-bucket>/d4a6c3dc-c9bd-48f3-996f-5ad584f0b87a/reels/40ab606a-0430-47d5-8632-50c7c6c97a81.mp4` (1,529,667 bytes, non-empty).

Worker code (`videoWorker.ts:102-103`) does exactly one `putR2` per generation — the final composed MP4. Per-scene Sora MP4s are downloaded to local tmp (`runSora` at `videoWorker.ts:492`: `const path = join(tmp, 'sora-${i}.mp4')`) and removed via the `try…finally` at `videoWorker.ts:534`. Nothing uploaded mid-pipeline; nothing to inventory beyond the one final file.

Confirmed via `curl` HEAD: file exists, content-length matches DB `bytes`, content-type `video/mp4`. No 0-byte siblings (no other files under the prefix to query).

---

## 5. compose.ts findings

`src/server/video/compose.ts`. Sora-path branches inside the same `composeReel` function used for FFmpeg — the engine difference is whether a scene has `imagePath` or `videoPath`.

**Per-scene FFmpeg input construction (lines 120–131):**

```ts
for (const s of scenes) {
  if (s.scene.background === 'brand') {
    cmd.input(brandBgPath).inputOptions(['-loop', '1', '-t', String(s.scene.durationSec)]);
    continue;
  }
  if (s.videoPath) {
    cmd.input(s.videoPath).inputOptions(['-t', String(s.scene.durationSec)]);
    continue;
  }
  if (!s.imagePath) continue;
  cmd.input(s.imagePath).inputOptions(['-loop', '1', '-t', String(s.scene.durationSec)]);
}
```

Note: image and brand-bg inputs use **`-loop 1 -t N`** (still image, looped to N seconds — guaranteed output is exactly N seconds). The Sora video branch uses **`-t N`** **without `-loop`** — if the source MP4 is shorter than `N`, FFmpeg silently reads only what's there. This is the structural origin of the truncation.

**Per-scene base chain (lines 181–199):**

```ts
const baseChain = isBrand
  ? `scale=...:format=yuv420p`
  : isVideo
    ? `scale=...:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,format=yuv420p`
    : `scale=...,crop=1080:1920,zoompan=...:d=${s.scene.durationSec * 30}:fps=30,format=yuv420p`;
```

Video scenes go through scale+crop+fps+format. No zoompan. Critically, the chain assumes the source has `s.scene.durationSec` worth of frames — there is no validation step.

**Per-scene fade out (line 228):**

```ts
const fade = `,fade=t=in:st=0:d=${REEL_TRANSITION_SEC},fade=t=out:st=${Math.max(0, s.scene.durationSec - REEL_TRANSITION_SEC)}:d=${REEL_TRANSITION_SEC}`;
```

For scene 0 with `durationSec: 5`, fade-out starts at t=4.6. But the actual sora-0.mp4 is 4 seconds long (see §6). **Fade-out is scheduled past the end of the source.**

**xfade chain (lines 240–248):**

```ts
for (let i = 1; i < scenes.length; i++) {
  const offset = Math.max(0, cumulative - REEL_TRANSITION_SEC);
  filters.push(
    `[${lastLabel}][v${i}]xfade=transition=fade:duration=0.4:offset=${offset}[${next}]`,
  );
  cumulative += scenes[i].scene.durationSec - REEL_TRANSITION_SEC;
}
```

For scene 0→1, offset is 4.6. xfade needs v0 to have at least 5.0 seconds of frames (offset + duration) to blend with v1. **With v0 ending at 4s, xfade behavior is undefined/truncating** — empirically the chain collapses and the entire output ends at ~7s regardless of what comes after.

**Error handling (lines 297–305):**

```ts
.on('end', () => resolve({ outputPath }))
.on('error', (err, _stdout, stderr) => {
  const tail = (stderr ?? '').split('\n').slice(-40).join('\n');
  reject(new Error(`${err.message}\n--- ffmpeg stderr (tail) ---\n${tail}`));
})
```

FFmpeg returns exit code 0 in this case (no error event fires) because it *successfully wrote a file*. The fact that the file is 7s instead of 24s is invisible to the worker — there is no post-render duration check. **Nothing in compose.ts validates the output duration against the expected total.**

---

## 6. videoWorker.ts findings

`src/server/jobs/videoWorker.ts`. Sora dispatch lives in `runSora` (lines 384–567).

**Parallel submission (lines 403–421):**

```ts
await Promise.all(
  data.plan.scenes.map(async (scene, i) => {
    if (scene.background === 'brand') return;
    const snapped = snapSoraDuration(scene.durationSec);
    const job = await submitSora({
      model: soraModel,
      prompt: scene.imagePrompt,
      aspectRatio: '9:16',
      durationSec: snapped,
    });
    sceneJobs[i] = { ...job, retries: 0 };
  }),
);
```

**All non-brand scenes submitted in parallel** (N = 3 here). The snap function lives in `src/lib/reel-cost.ts`:

```ts
export const SORA_VALID_DURATIONS = [4, 8, 12] as const;
export function snapSoraDuration(seconds: number): SoraDuration {
  // picks NEAREST supported value; ties round up
}
```

**For scene 0 with `durationSec: 5`, `snapSoraDuration` returns 4** (|5−4|=1 < |5−8|=3). Sora is asked for a 4-second clip and obediently delivers one. The plan still says 5 seconds. **The 1-second mismatch is the root truncation source.**

**Polling loop (lines 437–504):**

- Interval: every 6 s (`SORA_POLL_INTERVAL_MS`)
- Hard timeout: 15 min (`SORA_POLL_TIMEOUT_MS = 15 * 60 * 1000`) — increased from 10 min in the moderation-retry commit so a safe-prompt resubmission has time to complete
- On scene fail: if `errorMessage` matches `/blocked by our moderation|moderation system|safety system|content policy/i` AND `job.retries < 1`, resubmit that scene with a moderation-safe fallback prompt (visualStyle motion language + abstract subject directive); otherwise throw
- One failed scene = whole-reel throw

The moderation-retry path is the only failure-recovery code. There is no per-scene duration retry, no Sora-actual-vs-planned reconciliation, and no FFmpeg-output post-check.

**Cost reporting (lines 549–556):**

```ts
let videoCostCents = 0;
for (let i = 0; i < data.plan.scenes.length; i++) {
  const scene = data.plan.scenes[i];
  const job = sceneJobs[i];
  if (!scene || scene.background === 'brand' || !job) continue;
  videoCostCents += soraCostCents(soraModel, job.durationSec);
}
```

Bills against the **stored job's actual durationSec** (4, 8, 8). Scene 0 only cost $1.20 — Sora delivered exactly what was asked. The DB ledger is honest. The wasted spend is on scenes 1 and 2: they generated 7s of footage that never plays because vx1 collapsed first.

**Success-path return (lines 547–566):**

```ts
const totalDur = data.plan.scenes.reduce((sum, s) => sum + s.durationSec, 0);
return {
  ...
  durationSec: totalDur,   // ← the plan total, not the real output
  costCents,
  costBreakdown: { ... },
};
```

**`durationSec: totalDur`** is what gets written to the asset row at `videoWorker.ts:112`. The 25s claim across all three Sora reels is generated here, three steps removed from the actual file. This is the second bug — a metadata lie that hid the truncation through three render cycles.

---

## My hypothesis

**The reel truncates to 7.07s because `snapSoraDuration` snaps `durationSec: 5` down to 4 seconds when it should round up to 8.** Sora generates 4 seconds of video for scene 0; compose.ts feeds that 4-second clip into a filter chain (`-t 5`, `fade=t=out:st=4.6:d=0.4`, `xfade=...:offset=4.6`) that all assume 5 seconds of source. When v0 runs out at t=4, the xfade chain has nothing to blend, vx1's effective duration collapses, and the `[vx3]` final output mapping ends around 7s (≈ 4s of scene 0 + 3s of bleed-through into scene 1 via xfade before the chain fully breaks). FFmpeg returns exit code 0 — it successfully wrote a file — and the worker writes the **plan-total** duration (25s) into the asset row at `videoWorker.ts:112` instead of probing the actual output. **Three Sora reels in a row have all been 7.07s / 212 frames** without anyone noticing because the DB ledger looks correct.

Two fixable causes, in order of severity:
1. **Snap direction:** for the Sora path, snap **up** to the next supported step (5 → 8) — the planner's `durationSec` is a minimum, not a target. Cost goes up modestly (a 5s scene becomes an 8s Sora bill = +$0.90 at Pro tier) but the chain's math holds.
2. **Output validation:** after FFmpeg writes the file, ffprobe it and write the *actual* duration to the asset row. Even with cause 1 fixed, this is the only thing that would catch a future regression of the same shape before it ships another zombie ledger.

The compose.ts xfade math is correct **only when the source matches `s.scene.durationSec` exactly**. The image path enforces this via `-loop 1`; the video path doesn't. Either fix the snap (cause 1) or rewrite compose to derive timings from `ffprobe` of each downloaded Sora MP4.
