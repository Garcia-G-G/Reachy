# Diagnostic — last failed reel

> Pega este archivo COMPLETO en una sesión nueva de Claude Code Max.
> Esto NO hace cambios de código — solo recolecta datos para que Garcia los comparta.

---

You are doing **read-only diagnostics** on the **Reachy** repo (`~/Documents/reachy/`). DO NOT edit any source files. Your only output is one new file: `planning/DIAGNOSTIC-LAST-REEL.md` containing the data described below.

## What we need to find out

The last reel render produced only 7 seconds of video despite the engine being Sora 2 Pro 720p (4 scenes × ~8s each = should be ~25-32s). Either Sora returned bad clips or FFmpeg silently dropped them. We need data, not theories.

## Steps (read-only)

### 1. Worker logs

Find where the BullMQ worker writes logs. Likely candidates:
- `docker compose -f docker/docker-compose.yml logs worker --tail=300`
- `tail -300 /tmp/worker.log` if logged to file
- `journalctl -u reachy-worker -n 300` if systemd
- Or the dev server console output if running locally

Capture the **last 300 lines** that mention the most recent reel — search for `reachy:video`, `gen `, `Sora`, `ffmpeg`, `compose`, `download`. Strip any API keys / tokens / signed URLs (replace with `[REDACTED]`).

### 2. Last generation row

Open Drizzle Studio (`pnpm db:studio`) or query directly:

```sql
SELECT id, type, format, status, provider, model, prompt, params,
       cost_cents, error_message, created_at, finished_at
FROM generation
WHERE type = 'video'
ORDER BY created_at DESC
LIMIT 1;
```

Capture all columns. Truncate `prompt` to first 500 chars if huge. Pretty-print `params` JSON.

### 3. Assets linked to that generation

```sql
SELECT id, kind, format, width, height, duration_sec, storage_key, public_url, bytes, created_at
FROM asset
WHERE generation_id = '<the id from step 2>'
ORDER BY created_at ASC;
```

We need to know how many assets actually got created. If 1, FFmpeg only had 1 Sora clip. If 4, all clips downloaded but concat dropped 3.

### 4. R2 file inventory for that generation

If R2 is configured locally, list the objects under that generation's prefix:
```bash
aws s3 ls s3://$R2_BUCKET/<projectId>/<generationId>/ --endpoint-url=https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com --profile r2
```
Or read the R2 client code in `src/server/storage/r2.ts` and replicate. Just need: how many files, their sizes (any 0-byte files = empty Sora downloads).

### 5. Compose.ts inspection (read-only)

Read `src/server/video/compose.ts` and identify:
- Lines that handle the multi-scene Sora concat path (search for `engine === 'sora'` or similar)
- The exact FFmpeg argv that gets built (paste the construction code, not just the call)
- Any `try/catch` that might be swallowing errors
- Any place where `sceneVideos.length === 0` should fail fast but doesn't

### 6. videoWorker.ts inspection (read-only)

Read `src/server/jobs/videoWorker.ts` for the Sora dispatch path:
- How many parallel Sora jobs are submitted
- Polling loop — max retries, timeout
- What happens if one Sora job fails — does the whole reel fail, or is the failed scene silently skipped?

## Output

Create **only** this file: `planning/DIAGNOSTIC-LAST-REEL.md` with sections:

```md
# Diagnostic — last failed reel

## 1. Worker logs (last 300 lines, secrets redacted)
```
<paste>
```

## 2. generation row
| field | value |
|-------|-------|
| id | ... |
| status | ... |
| ... | ... |
prompt (truncated): `...`
params: ```json {...} ```
error_message: `...`

## 3. Asset count for this generation
N rows. List below.
| id | kind | bytes | duration_sec | storage_key |
|----|------|-------|--------------|-------------|

## 4. R2 file inventory
N files in bucket prefix `<projectId>/<genId>/`. Sizes:
- file1.mp4 — N bytes
- file2.mp4 — N bytes (or 0 = empty)

## 5. compose.ts findings
- Sora concat path lives at lines L–L
- FFmpeg argv built as: `ffmpeg -i ... -i ... -filter_complex ... -c:v libx264 ...`
- Error handling: <describe>

## 6. videoWorker.ts findings
- N parallel Sora jobs submitted, polled every Xs
- Max wait per scene: Ys
- On failure of one scene: <does it skip silently? does it fail the whole reel?>

## My hypothesis
<one paragraph: based on the data above, what is your best guess for why the reel was only 7s? Be specific.>
```

## Constraints

- DO NOT edit any source code
- DO NOT delete any files
- DO NOT spend any money (no Sora calls, no OpenAI calls)
- Strip secrets from logs (anything matching `sk-`, `Bearer `, signed URL query strings, or env-key-shaped tokens — replace with `[REDACTED]`)
- If you can't access something (DB, logs, R2), write `UNAVAILABLE — <reason>` in that section so Garcia knows what to grant you

## Done

Tell Garcia: "Diagnóstico listo en `planning/DIAGNOSTIC-LAST-REEL.md` — pásalo a Cowork." That's all.
