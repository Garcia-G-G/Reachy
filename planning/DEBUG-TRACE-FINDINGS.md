# Debug-trace findings — 2026-05-14

Live debug session on generation `f3116437-330f-431f-8be4-b036065b449a`
(demo Gerardo: Explainer · 25s, Sora 2 Pro 720p, Editorial motion, ES script-mode).

Worker log: `/private/tmp/claude-501/.../tasks/b02naidiv.output`.

## TL;DR

**Zero bugs found in the trace.** The render that ran under full
`[reachy:debug-trace]` observation completed cleanly end-to-end:

```
Sora submit → 2.18s    (1 job, 12s, prompt 2055 bytes)
Sora poll cycle → ~11.5 min wall-clock (Pro 720p)
Sora download → 1.37s   (2.92 MB, content-type video/mp4, status 200)
ElevenLabs TTS → 3.0s   (4 lines, voice=br0MPoLVxuslVxf61qHn, model=eleven_v3, lang=es)
composeOneShot ffmpeg → 6.00s exit 0
ffprobe (in-engine, pre-cleanup) → 99ms exit 0, duration=12.00s
R2 upload → 949ms, 1.71 MB
DB write → status=done, cost_cents=365, duration_sec=12
```

The ffprobe race fix from `1e9aded` (probe BEFORE the engine's
`finally { rm(tmp) }` runs) is observed working — the trace shows
`ffprobe enter path=… exists=true sizeBytes=1709039` immediately
followed by a clean `exitCode=0 elapsedMs=99`.

The truncation guard had nothing to fire on: expected 12.00s, got
12.00s. First Sora reel rendered to its planned length in five
attempts.

## Walk-through of every category the prompt asked us to check

### File-not-found / ENOENT

None observed. The race that previously ENOENT'd is gone — the
in-engine ffprobe sees the file at `sizeBytes=1709039` and probes
it successfully before the `finally { rm(tmp) }` runs.

### HTTP non-200 from external APIs

- `submitSora` → 2.18s, returned jobId cleanly
- `pollSora` × ~115 polls → all ok, status flowed `queued → in_progress → completed`
- `downloadSora response status=200 contentLength=2923778 contentType=video/mp4`
- ElevenLabs `synthesizeElevenLabs ok` × 4 with byte counts
- R2 putObject → no errors

No 4xx/5xx anywhere in the trace.

### Exit codes ≠ 0 from ffmpeg/ffprobe

- `composeOneShot ffmpeg ok` — exit 0
- `ffprobe close … exitCode=0 elapsedMs=99` — exit 0

### Promise rejections caught and swallowed

None observed. The only `catch` blocks in the hot path are:
- `pollSora` returns `{state:'failed', errorMessage}` instead of throwing — by design; the runSoraOneShot loop handles state==='failed' explicitly
- `renderSceneTts` falls back to silent audio if every TTS attempt fails — would have logged a warning, no warning fired this run

### DB writes with suspicious values

- `generation.status=done`, `error_message=null` ✓
- `generation.cost_cents=365` matches the engine's returned `costCents` exactly (Sora 12 × 30¢ = 360¢ + 4¢ ElevenLabs + 1¢ compose = 365¢)
- `asset.duration_sec=12` matches the in-engine ffprobe (`duration=12.00s`)
- `asset.bytes=1709039` matches the local-disk size pre-upload and the R2 upload size

No lies in the ledger.

### Race conditions

- The ffprobe-after-tmp-cleanup race is the one we fixed in `1e9aded`. Confirmed gone by the `[reachy:debug-trace] ffprobe enter path=… exists=true sizeBytes=1709039` line.
- No other races spotted. The Sora poll loop, ElevenLabs Promise.all, and R2 upload are all properly sequenced.

### Silent fallbacks

The OpenAI TTS fallback warning (`[reachy:video] gen X ElevenLabs not
configured — falling back to gpt-4o-mini-tts`) did NOT fire — confirming
ElevenLabs is configured and live. `provider=elevenlabs` was observed
in the log.

### Long latencies

- **Sora 2 Pro 720p: ~11.5 min wall-clock** for one 12s clip. At the high end of "normal" per OpenAI's docs (2–5 min typical) but not a bug. The hard cap is 15 min (`SORA_POLL_TIMEOUT_MS`) — we used ~76% of budget.
- ElevenLabs convert: 1.96s–3.02s per line. Fine.
- ffprobe: 99 ms. Fine.
- ffmpeg compose: 6.0 s. Fine.

### Cosmetic observations (P3 / not bugs)

- **Sora progress reporting is non-monotonic.** The trace shows values bouncing between `0%` and the actual progress on consecutive polls (e.g. `progress=46%` → `progress=0%` → `progress=50%`). This appears to be Sora's API resetting the counter between internal render phases. Not a bug, but if we ever surface progress in the UI we should clamp to a monotonically increasing value or smooth it.
- **`ffprobe enter` and `ffprobe spawn` are redundant log lines.** Both fire on every ffprobe call. We could collapse them in Phase G if we wanted; I'm keeping a single survivor under `[reachy:video]`.

## Severity table

| Bug | Severity | Status |
|---|---|---|
| ffprobe-after-tmp-cleanup race | P0 | ✅ fixed pre-trace in `1e9aded` |
| Sora progress non-monotonic | P3 | informational; no fix proposed |
| Duplicate `ffprobe enter` + `ffprobe spawn` log lines | P3 | will collapse in Phase G |

No P1 or P2 found in this trace.

## What this DOESN'T cover

This single render exercised the **happy path** end-to-end. The trace
did NOT cover any of:
- Sora moderation rejection (the safe-prompt retry path is in code but unused this run)
- ElevenLabs misconfiguration / no voice for active language (fallback to gpt-4o-mini-tts)
- BullMQ worker crash mid-Sora-poll (the persisted-soraJobs resume path is in code but unused)
- FFmpeg syntax error (the `iw`/`ih` fix from `99868fe` held, but any new filter we add could regress)
- Truncation guard firing (output matched plan exactly; no trip)

If any of those code paths regress, the existing `[reachy:video]` logs
should still surface it — but we won't know for certain until they're
exercised. The diagnostic stays useful for future failures: re-arm with
`tail -F | grep [reachy:debug-trace]` if a new bug shows up.

## Decision required

Phase F of the original prompt asks for a second render to validate.
With no P0/P1 fixes applied between renders, a second render only
re-validates the same path that just succeeded. **Recommendation:
skip Phase F and pocket the $3.65** — the first render IS the verified
one. If Garcia disagrees, re-render and the same path runs again.
