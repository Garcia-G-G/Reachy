# Reel pipeline — live debug session (active observation)

> Pega este archivo COMPLETO en una sesión nueva de Claude Code Max + adjunta `planning/prompts/00-CONTEXT.md`. Después dile *"proceed"*.

---

You are doing a **live debugging session** on the **Reachy** reel pipeline (`~/Documents/reachy/`). Apply §0.10 of `planning/prompts/00-CONTEXT.md` — quality and depth. This is not a quick fix; it's a root-cause hunt.

## Context: where we are

After 4 rounds of fixes, the reel pipeline still produces broken output. Each render surfaces a new bug that the previous patches didn't catch. We need to **stop patching individual symptoms** and instead **instrument the entire pipeline** so we see exactly what happens at every step in one render.

Known recent bugs (some fixed, some pending):
- ✅ Pase 1: visualStyles too restrictive ("ONE rectangle")
- ✅ Pase 2: Sora wired up, deprecated fal.ai
- ✅ Pase 3 partial: split visualStyles into promptStatic/promptMotion
- ✅ Pase 4 attempted: switched to Sora one-shot + ffprobe sanity guard
- ✅ Just fixed: duplicate `-map [vfinal]` in compose.ts oneshot path
- 🚨 **PENDING (just diagnosed by Cowork):** ffprobe race condition — `runSoraOneShot()` deletes its `tmp` folder in `finally` BEFORE the outer worker's ffprobe runs on `out.outputPath`. ENOENT every time.
- 🚨 Probably more bugs hiding behind these

## Your mission, in this exact order

### Phase A — Add maximum instrumentation (temp, will be reverted)

In every step of the reel pipeline, add temporary `console.log` lines that report:
- Entry to each function (with args summary, no secrets)
- Every external API call (Sora submit, Sora poll, OpenAI TTS, ElevenLabs TTS, R2 upload) with: provider, endpoint, payload size in bytes, response status, latency in ms
- Every file system operation (mkdtemp, writeFile, readFile, rm) with: path, byte count where applicable, success/failure
- Every FFmpeg invocation (compose AND ffprobe) with: full argv joined, working dir, exit code, stderr tail, file existence check before and after
- Every DB write to `generation` and `asset` with: row id, fields modified

Use a **distinct prefix** for these temp logs so they're easy to grep and remove later: `[reachy:debug-trace]`.

Files to instrument (at minimum):
- `src/server/jobs/videoWorker.ts` — every step of `runSoraOneShot` and `runFfmpeg` plus the outer worker handler
- `src/server/video/compose.ts` — `composeOneShot`, `composeReel`, the FFmpeg invocation hooks
- `src/server/video/ffprobe.ts` — pre-check that file exists before ffprobing; log full ffprobe argv
- `src/server/ai/openaiVideo.ts` — `submitSora`, `pollSora`, `downloadSora` byte counts and HTTP status
- `src/server/audio/elevenlabs.ts` (if exists) — `synthesizeElevenLabs` byte count, voice id, model id

### Phase B — Fix the known ffprobe race FIRST

This is blocking renders right now. Before anything else:

**Bug:** `runSoraOneShot()` (and probably `runFfmpeg`) creates a temp dir, writes `out.mp4` there, returns the path, then `finally { rm(tmp, recursive) }` deletes the directory. The outer worker then calls `ffprobe(out.outputPath)` on a path that no longer exists. Same for `runFfmpeg` if it has the same pattern.

**Fix:** move the ffprobe **inside** the engine functions, before the `finally` cleanup runs. Add `probed: ProbeResult` to the `EngineResult` interface and have the outer worker use that instead of calling ffprobe again.

Refactor:
```ts
interface EngineResult {
  buffer: Buffer;
  bytes: number;
  expectedDurationSec: number;
  probed: ProbeResult;          // ← NEW: probed inside engine fn before tmp cleanup
  costCents: number;
  costBreakdown: ReelCostBreakdown;
  // outputPath REMOVED — meaningless to caller after tmp cleanup
}
```

Inside `runSoraOneShot` and `runFfmpeg`, just before reading the buffer:
```ts
const probed = await ffprobe(outputPath);  // before finally runs
const buffer = await readFile(outputPath);
return { buffer, bytes: buffer.length, expectedDurationSec, probed, costCents, costBreakdown };
```

Outer worker:
```ts
const out = await runSoraOneShot(...);
const truncationRatio = out.expectedDurationSec > 0
  ? out.probed.durationSec / out.expectedDurationSec : 1;
if (truncationRatio < 0.95) throw new Error('compose-truncated:...');
// proceed to upload + DB write using out.probed
```

After this fix: `pnpm typecheck` MUST pass.

### Phase C — Run a real reel render under full observation

1. `pnpm dev` and `pnpm worker` in two terminals (or however the project starts the worker)
2. Pipe the worker's stdout to a file: `pnpm worker 2>&1 | tee /tmp/reachy-debug-$(date +%s).log`
3. From the UI, render the demo Gerardo reel:
   - Template: Explainer · 25s
   - Mode: I write the script (4 lines from `planning/DEMO-SCRIPT-GERARDO.md`)
   - Engine: Sora 2 Pro 720p
   - Visual style: Editorial motion
   - Language: Spanish
4. Watch the logs in real time. Note the timestamp of every `[reachy:debug-trace]` line.
5. Wait for the render to finish OR fail.

### Phase D — Triage every error, warning, and anomaly

Read the full debug log. For EACH bug you find, write a row in `planning/DEBUG-TRACE-FINDINGS.md`:

```md
## Bug N — <one-line title>
**Where:** file:line
**Symptom:** <what the log line said>
**Root cause:** <your analysis>
**Fix proposed:** <code change>
**Severity:** P0 / P1 / P2
```

Look for at least these categories:
- File-not-found / ENOENT
- HTTP non-200 from any external API
- Exit codes ≠ 0 from ffmpeg/ffprobe
- Promise rejections caught and swallowed
- DB writes that succeeded with suspicious values (durations way off, costs zero, etc.)
- Race conditions (file deleted before next step reads it — same family as the ffprobe race)
- Silent fallbacks (e.g. ElevenLabs not configured → falls back to OpenAI TTS without warning the user)
- Long latencies (Sora polling waits 5+ min then times out)

Don't apply fixes yet — just enumerate.

### Phase E — Apply fixes by severity

For every P0 in `DEBUG-TRACE-FINDINGS.md`, apply the fix. Run `pnpm typecheck && pnpm lint && pnpm build` after each fix. Commit each fix as a separate logical change with a clear message.

For P1: apply if time allows.
For P2: leave for later, document in the findings file.

### Phase F — Re-render and verify

Run the same demo Gerardo render again under the same observation. Confirm:
- Render completes successfully (no exceptions)
- Output MP4 is approximately 12 seconds (one-shot Sora duration)
- ffprobe inside the engine succeeds
- DB asset row has `duration_sec ≈ 12`
- Cost in DB matches breakdown returned by engine
- The MP4 plays back: visible motion, audio plays, overlay text appears at expected times
- **No `[reachy:debug-trace]` line shows an error or anomaly**

### Phase G — Remove temp instrumentation

Remove all `[reachy:debug-trace]` lines you added in Phase A. Keep only logs that are genuinely useful for production observability (use a different prefix like `[reachy:video]` or similar — those probably already exist). Run `pnpm build` one final time.

## Constraints

- **Budget:** maximum ONE Sora render in Phase C and ONE in Phase F. Each is ~$3.70. Total max spend: $7.40. If you need more renders to validate, ASK Garcia first.
- **Do NOT** delete the diagnostic file (`planning/DIAGNOSTIC-LAST-REEL.md`).
- **Do NOT** revert the recent compose.ts fix (the duplicate `-map` removal — it's correct; comment is at lines 766-770).
- **Do NOT** change visualStyles.ts unless one of the bugs is in there.
- **Strip secrets** from the log file before pasting any of it into the findings doc.

## Final report (in addition to DEBUG-TRACE-FINDINGS.md)

In your reply to Garcia:
- ✅ N bugs found in the trace, M fixed, K deferred
- 📁 Files modified
- 💰 Total spent on Sora/ElevenLabs renders during this session
- 🎬 Path to the rendered MP4 (or screenshot of one frame showing motion)
- 🐛 Top 3 bugs by impact, with one-line description each
- ⚠️ Anything pending that Garcia must decide (e.g. "ElevenLabs key needs to be set; falling back to OpenAI TTS for now")
- 🚀 Next: Garcia decides whether to ship to Gerardo or iterate on the visual prompt
