# Reel fix · pase 4 — Duration truth + ElevenLabs + Sora one-shot

> Pega este archivo COMPLETO en una sesión nueva de Claude Code Max + adjunta `planning/prompts/00-CONTEXT.md`. Después dile *"proceed"*.

---

You are working on the **Reachy** repo (`~/Documents/reachy/`). Apply §0.10 of `planning/prompts/00-CONTEXT.md`. Take your time, verify after every step.

## Context

The diagnostic in `planning/DIAGNOSTIC-LAST-REEL.md` identified the root cause of the 7-second reels:

> `snapSoraDuration(5)` returns 4 (nearest neighbor of Sora's valid set `[4, 8, 12]`), so scene 0 is generated as a 4s Sora clip but `compose.ts` treats it as 5s — `fade=t=out:st=4.6` and `xfade=offset:4.6` fall past the end of v0, the xfade chain collapses, FFmpeg exits 0, and the worker writes the planned 25s into `asset.duration_sec` instead of ffprobeing the actual 7s output.

This pase fixes 4 things:

1. **Asset duration must be ffprobed from the actual file**, not taken from the plan. The lie is what hid the bug for 3 rounds.
2. **Compose.ts math must use actual clip durations** (ffprobe), not template/planner durations. Defensive against any future duration mismatch.
3. **Pivot Sora to one-shot per reel** (single 12s clip, no multi-scene concat). Eliminates the math problem entirely. Garcia approved this.
4. **Switch TTS to ElevenLabs v3.** OpenAI `gpt-4o-mini-tts` voice quality has been the consistent complaint. ElevenLabs v3 supports emotion tags, native Spanish, and far better expressiveness. Garcia approved.

---

## Step 1 — Always ffprobe actual file before writing `asset.duration_sec`

**File:** `src/server/jobs/videoWorker.ts`

Find where the worker creates the final `asset` row after compose finishes. Currently it likely uses `plan.totalDurationSec` or similar. Change so it runs `ffprobe` on the final MP4 path and uses the real `format.duration` (or `streams[0].duration`) from the JSON output.

Add a helper in `src/server/video/ffprobe.ts` (new file):

```ts
import 'server-only';
import { spawn } from 'node:child_process';

export interface ProbeResult {
  durationSec: number;
  width: number;
  height: number;
  fps: number;
  videoCodec: string;
  audioCodec: string | null;
  bytes: number;
}

export async function ffprobe(filePath: string): Promise<ProbeResult> {
  return new Promise((resolve, reject) => {
    const child = spawn('ffprobe', [
      '-v', 'error',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      filePath,
    ]);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c) => (stdout += c.toString()));
    child.stderr.on('data', (c) => (stderr += c.toString()));
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(`ffprobe failed: ${stderr.trim()}`));
      try {
        const json = JSON.parse(stdout);
        const v = json.streams.find((s: any) => s.codec_type === 'video');
        const a = json.streams.find((s: any) => s.codec_type === 'audio');
        const durationSec = Number(json.format.duration ?? v?.duration ?? 0);
        const [num, den] = (v?.r_frame_rate ?? '30/1').split('/').map(Number);
        resolve({
          durationSec,
          width: v?.width ?? 0,
          height: v?.height ?? 0,
          fps: den ? num / den : 30,
          videoCodec: v?.codec_name ?? 'unknown',
          audioCodec: a?.codec_name ?? null,
          bytes: Number(json.format.size ?? 0),
        });
      } catch (e) {
        reject(new Error(`ffprobe parse failed: ${(e as Error).message}`));
      }
    });
    child.on('error', reject);
  });
}
```

**Also add a sanity check** in the worker: after compose, if `probed.durationSec < expectedSec * 0.8`, fail the generation with `error_message: 'compose-truncated:expected ${expected}s got ${actual}s'` and DO NOT write the asset. This is the guard that would have caught the 7s-instead-of-25s bug immediately.

## Step 2 — Compose.ts must use actual durations for fade/xfade math

**File:** `src/server/video/compose.ts`

Currently the fade/xfade math uses `scene.durationSec` from the plan. After downloading each Sora clip (in the multi-scene path that we're about to deprecate but still need to make safe in case it ever runs), call `ffprobe` on the downloaded MP4 and use **`probed.durationSec`** for:
- `fade=t=out:st=<probed - 0.4>`
- `xfade=offset:<accumulated probed durations - 0.4>`
- The `:t=<duration>` of any subsequent filter that needs the clip length

Even though we're pivoting to one-shot in Step 3, this defensive fix stays so the multi-scene code path can never produce another silent 7s.

## Step 3 — Pivot Sora to one-shot per reel

This is the architectural change. Instead of N parallel Sora jobs, **one Sora job per reel** with a 12-second clip that includes the full motion narrative.

**File:** `src/server/ai/reelPlanner.ts`

When the engine is `sora-base` or `sora-pro-720p`:
- Don't generate per-scene `imagePrompt`s
- Generate ONE master video prompt that combines:
  - The visualStyle's `promptMotion` (already exists)
  - A narrative beat sheet derived from the user's script lines, formatted as "Beats: [0-3s] <line 1>. [3-6s] <line 2>. [6-9s] <line 3>. [9-12s] <line 4>."
- Return a single-element scene plan with `durationSec: 12` and the master prompt as `imagePrompt`

**File:** `src/server/jobs/videoWorker.ts`

When engine is sora and the plan has length 1, take the one-shot path:
- Submit one Sora job with the master prompt and `durationSec: 12`
- Poll once, download once
- Skip concat entirely
- FFmpeg's only job: take the single Sora MP4, overlay the script lines as drawtext (timed to match the beat sheet — 0-3s, 3-6s, etc.), mix in the ElevenLabs audio, output final MP4

**Cost:** Sora 2 Pro 720p × 12s × $0.30 = **$3.60 per reel**. Down from the broken $6+ multi-scene attempts.

The multi-scene Sora path stays in the codebase for now but is unreachable from the UI — the form will only show single-prompt-style templates when Sora engine is selected. Document this in compose.ts comments.

## Step 4 — ElevenLabs v3 for TTS

**Research first:** WebSearch the current ElevenLabs Node SDK (`elevenlabs` or `@elevenlabs/elevenlabs-js` — verify package name) and pick:
- The right model id (likely `eleven_multilingual_v3` or current equivalent — confirm)
- A native Spanish editorial-warm voice. Suggested candidates: `Sofia` (es-ES), `Charlotte` (multilingual), or whichever has the "narrator/editorial" tag in the voice library.
- Whether the SDK supports emotion tags (`[whisper]`, `[excited]`, etc.) inline in the input text — confirm syntax

**Add env var:** `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID` (with a sensible default voice id).

Update `src/env.ts` to validate.

**Create `src/server/audio/elevenlabs.ts`:**

```ts
import 'server-only';
import { ElevenLabsClient } from 'elevenlabs'; // verify package
import { env } from '@/env';

export function isElevenLabsConfigured() {
  return Boolean(env.ELEVENLABS_API_KEY);
}

let client: ElevenLabsClient | null = null;
function getClient() {
  if (!env.ELEVENLABS_API_KEY) throw new Error('ELEVENLABS_API_KEY not set');
  if (!client) client = new ElevenLabsClient({ apiKey: env.ELEVENLABS_API_KEY });
  return client;
}

export interface SynthesizeArgs {
  text: string;
  language: 'es' | 'en';
  voiceId?: string;
}

export interface SynthesizeResult {
  buffer: Buffer;
  bytes: number;
  costCents: number;
}

export async function synthesizeElevenLabs(args: SynthesizeArgs): Promise<SynthesizeResult> {
  const client = getClient();
  const voiceId = args.voiceId ?? env.ELEVENLABS_VOICE_ID ?? '<DEFAULT_FROM_RESEARCH>';
  // verify exact method name in SDK after research
  const stream = await client.textToSpeech.convert(voiceId, {
    text: args.text,
    model_id: 'eleven_multilingual_v3', // verify
    output_format: 'mp3_44100_128',
    voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.3 },
  });
  // collect stream into buffer
  const chunks: Buffer[] = [];
  for await (const chunk of stream as any) chunks.push(Buffer.from(chunk));
  const buffer = Buffer.concat(chunks);
  // ElevenLabs pricing as of May 2026: ~$0.30 per 1k chars for v3 multilingual.
  // Verify and update.
  const costCents = Math.max(1, Math.round((args.text.length / 1000) * 30));
  return { buffer, bytes: buffer.length, costCents };
}
```

**Update `src/server/jobs/videoWorker.ts`:**

Replace the OpenAI TTS call with `synthesizeElevenLabs`. Keep the OpenAI fallback only if `isElevenLabsConfigured()` returns false (so reels still work without the new key).

Update the `ttsCostCents` accumulation to use the value returned from synthesizeElevenLabs.

Update the inline comment block (the one that talks about `nova` and `alloy`) to reflect the new provider.

## Step 5 — Verification (read these all before running anything)

1. `pnpm typecheck` MUST pass
2. `pnpm lint` MUST pass
3. `pnpm build` MUST pass
4. Garcia must drop the new env vars in `.env.local` before any TTS call:
   ```
   ELEVENLABS_API_KEY=...
   ELEVENLABS_VOICE_ID=...
   ```
   In your final report, **call out clearly** which env vars Garcia needs to set, and whether your code degrades gracefully if they're missing (it should — fall back to OpenAI TTS with a `console.warn`).
5. `pnpm dev` and trigger a fresh reel render with:
   - Template: Explainer · 25s
   - Mode: I write the script (4 lines from `planning/DEMO-SCRIPT-GERARDO.md`)
   - Engine: Sora 2 Pro 720p
   - Visual style: Editorial motion
   - Language: Spanish
6. Watch the worker logs. Verify:
   - Exactly 1 Sora job is submitted (not 4)
   - The Sora job's prompt contains both the visualStyle motion language AND the beat sheet
   - After download, ffprobe shows ~12s duration
   - Compose runs once, output ffprobe shows ~12s
   - `asset.duration_sec` written to DB is ~12 (the actual probed value)
   - `cost_cents` is ~360 (Sora) + ~10 (ElevenLabs) ≈ 370
7. Watch the rendered MP4. Verify:
   - It's actually ~12 seconds long
   - There IS visible motion (the visualStyle's promptMotion in action)
   - The voice sounds Spanish-native and expressive (not the old robotic gpt-4o-mini-tts)
   - The 4 overlay lines appear at their beat times (0-3s, 3-6s, 6-9s, 9-12s)
   - Total cost in the UI ≈ $3.70

## Acceptance criteria

- [ ] `src/server/video/ffprobe.ts` exists and is used by the worker
- [ ] `asset.duration_sec` always = actual probed duration of the final MP4
- [ ] Worker fails with `'compose-truncated'` error if probed < 80% of expected
- [ ] When engine is sora-*, exactly 1 Sora job per reel; plan has 1 scene of 12s
- [ ] FFmpeg compose for sora-one-shot path: download + overlay + audio mix only, no concat
- [ ] `src/server/audio/elevenlabs.ts` exists; SDK method verified via WebSearch
- [ ] `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID` added to `src/env.ts` schema and `.env.example`
- [ ] Worker uses ElevenLabs when configured, falls back to OpenAI TTS when not
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm build` all pass
- [ ] Re-rendered demo Gerardo: ~12s MP4, real motion, Spanish-native voice, beat-timed overlays, cost ≈ $3.70

## Final report

- ✅ All 5 steps completed
- 📁 Files modified
- 🐛 Confirmation that the duration-lie is fixed (paste the new asset row showing duration_sec matches the file)
- 🎙️ ElevenLabs voice + model id you ended up using (and why)
- 💰 Actual cost of the test render
- ⚠️ List the env vars Garcia must set before running this in his environment
- ⚠️ Anything pending (e.g. emotion tags syntax — descope to a v2 if SDK doesn't support cleanly)
- 🚀 Next: Garcia decides whether to ship to Gerardo or iterate on the script / motion prompt
