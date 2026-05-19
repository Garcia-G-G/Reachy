# Reel max quality — ElevenLabs all-in + dialog rico + Sora premium

> Pega este archivo COMPLETO en una sesión nueva de Claude Code Max + adjunta `planning/prompts/00-CONTEXT.md`. Después dile *"proceed"*.

---

You are working on the **Reachy** repo (`~/Documents/reachy/`). Apply §0.10 of `planning/prompts/00-CONTEXT.md` — quality and depth, no shortcuts.

## Context: Garcia's clear direction

After 5 attempts, Garcia is committed to AI-generated reels (no manual recording — the meta-marketing pitch requires it). He's also clear that **quality > cost** for now. Stop trimming features to save dollars. The hard ceiling is **$20 per reel** (sanity guard) but anything under that is fair game if it improves output.

**Garcia's notes from last review:**
1. ElevenLabs key IS configured. If the worker is still using OpenAI TTS, that's a bug — find it and fix it.
2. Stop capping features by price. Use the best models, longest durations, fullest pipelines.
3. **Use ElevenLabs for SFX and Music too**, not just voice. ElevenLabs has Sound Effects and Music endpoints — same API key. No Pixabay placeholders.
4. The dialog feels poor because TTS reads only the 4 short overlay lines. We need richer narration that EXPANDS on each line.

## Your mission

Push the reel pipeline to its current ceiling. After this pass, the rendered demo should sound and look like a real production, not a draft.

## Step 1 — Audit and fix ElevenLabs TTS

Garcia says the key is set. Verify it's actually being called.

Check `src/server/audio/elevenlabs.ts` (and wherever it's used in `videoWorker.ts`). Common bugs:

- `isElevenLabsConfigured()` returns false because the env var name is wrong (case sensitive, hyphens, etc.)
- The fallback to OpenAI TTS triggers silently when the ElevenLabs SDK throws (e.g. wrong voice id, deprecated model)
- The ElevenLabs HTTP call returns 401/422 and the catch swallows it
- `env.ELEVENLABS_API_KEY` validates as a string but is empty string `""` (Zod allows empty by default)

Add a `console.log` at every TTS dispatch with: `provider`, `model`, `voice`, `chars`, `httpStatus`, `bytes`, `ms`. Log to a distinct prefix like `[reachy:tts]` so we can grep it.

After this, render ONE reel and inspect the `[reachy:tts]` log lines to confirm:
- Provider is `elevenlabs`, NOT `openai`
- HTTP status is 200
- Bytes returned > 0
- The voice id used matches `env.ELEVENLABS_VOICE_ID`

If `provider=openai` is logged, fix the bug. Common fix: tighten `isElevenLabsConfigured()` to require non-empty key:
```ts
export function isElevenLabsConfigured() {
  return Boolean(env.ELEVENLABS_API_KEY?.trim() && env.ELEVENLABS_VOICE_ID?.trim());
}
```

## Step 2 — Split overlay from narration in the plan

Currently `scene.text` is used for BOTH the on-screen overlay (drawtext) and the TTS input. That makes the voice sound clipped because the narrator reads "Marketing real para apps reales" and stops dead in 3 seconds while the scene runs 8.

**Schema change.** Add to `PlannedScene` (in `src/lib/reel-templates.ts`):

```ts
export interface PlannedScene {
  // ...existing fields
  /** Short headline for on-screen drawtext (≤ 6 words, like a magazine kicker). */
  text: string;
  /** Full narration line for TTS (15-25 words, written as natural Spanish/English).
   *  When empty, falls back to `text`. */
  narration?: string;
}
```

**Planner change** (`src/server/ai/reelPlanner.ts`): when planning a reel (whether AI mode OR script mode), the LLM should generate BOTH `text` (the overlay headline) AND `narration` (the full sentence the narrator reads) per scene.

**Script-mode UX:** in `src/components/app/generate-reel-form.tsx`, when the user is in "I write the script" mode, expose TWO fields per scene:
- "Overlay text (≤ 6 words)" — exists now
- "Narration (full line)" — NEW

If the user only fills overlay, auto-derive narration with a short LLM call ("Expand this overlay into a full natural narration line, 15-20 words, same language: <text>"). Or ask GPT-5 to do it inline as part of the planner.

**Worker change** (`src/server/jobs/videoWorker.ts` `renderSceneTts`): use `scene.narration ?? scene.text` as the input to TTS. Drawtext stays on `scene.text`.

## Step 3 — ElevenLabs Music generation

WebSearch: ElevenLabs Music API endpoint, current model name, pricing per second, max duration. Likely:
- Endpoint: `POST /v1/music` or via SDK `client.music.compose({...})`
- Input: `prompt: string`, `duration_seconds: number`, `output_format: 'mp3_44100_128'`
- Output: streaming MP3 buffer
- Pricing: ~$0.005-$0.02 per second (verify)

**Create `src/server/audio/elevenlabsMusic.ts`:**

```ts
export interface MusicGenArgs {
  visualStyle: VisualStyleKey;
  durationSec: number;
  /** Drives the prompt: editorial → calm/strings, abstract → ambient/synth, flat-2d → upbeat/playful, etc. */
  mood?: string;
}

export interface MusicResult {
  buffer: Buffer;
  bytes: number;
  costCents: number;
}

const STYLE_TO_PROMPT: Record<VisualStyleKey, string> = {
  editorial:     'calm editorial ambient piano with subtle strings, premium magazine documentary feel, no vocals',
  'paper-cutout':'warm acoustic indie folk plucked guitar with light percussion, hand-made cozy feel, no vocals',
  'flat-2d':     'upbeat playful ukulele with happy hand claps and light synth, friendly explainer feel, no vocals',
  infographic:   'clean modern minimal electronic beat with subtle synth pads, data-driven feel, no vocals',
  isometric:     'dreamy synthwave pad with soft arpeggios, modern tech ambient, no vocals',
  abstract:      'cinematic ambient drone with evolving warm pads, premium tech feel, no vocals',
};

export async function generateMusic(args: MusicGenArgs): Promise<MusicResult> {
  const prompt = STYLE_TO_PROMPT[args.visualStyle] + (args.mood ? `. Mood: ${args.mood}.` : '');
  // Use ElevenLabs SDK — verify exact method via WebSearch
  // Capture bytes and compute cost
}
```

**Worker integration:** in `runSoraOneShot` (and `runFfmpeg`), call `generateMusic` after Sora returns and feed the result into `compose.ts` audio mix. The music plays under the TTS at -22 LUFS (background level).

If ElevenLabs Music generation fails, fall back to silent music track (don't crash the reel).

## Step 4 — ElevenLabs Sound Effects

WebSearch: ElevenLabs Sound Effects API endpoint. Likely:
- Endpoint: `POST /v1/sound-generation` or SDK `client.textToSoundEffects.convert({...})`
- Input: `text: string` (description of the SFX), `duration_seconds?: number`
- Output: short MP3 buffer (1-22s range typically)
- Pricing: small, per generation

**Create `src/server/audio/elevenlabsSfx.ts`:**

```ts
export interface SfxGenArgs {
  description: string;     // e.g. "soft paper rustle, brief and warm"
  durationSec?: number;    // optional hint
}

export async function generateSfx(args: SfxGenArgs): Promise<{buffer: Buffer; bytes: number; costCents: number}> {
  // Use ElevenLabs SDK
}
```

**Worker integration:** generate 2-3 SFX per reel:
- One "intro stinger" at t=0 (e.g. "soft chime, brief, editorial")
- One "transition swoosh" at the midpoint (e.g. "subtle paper rustle")
- One "outro click" at the end (e.g. "gentle UI click, brief")

Mix into the composite audio at -18 LUFS via FFmpeg `amix`.

These SFX should be cached on disk by their description hash so we don't regenerate the same chime every reel. Check cache before calling the API.

## Step 5 — Sora upgrade to premium tier as default

In `src/lib/reel-templates.ts`:

- Change `TYPE_DEFAULT_ENGINE` for the explainer/pitch templates from `'sora-pro-720p'` to a new `'sora-pro-1024p'` engine option.
- Add `'sora-pro-1024p'` to `ReelEngine` and to the SoraModel + cost mapping.
- Sora 2 Pro 1024p = $0.50/s × 12s = **$6 per oneshot reel**, comfortably under Garcia's $20 cap.

In the UI engine selector, expose Sora 2 Pro 1024p as the default for `informative-25s` and `pitch-30s` templates. FFmpeg and Sora 2 Pro 720p remain as cheaper alternatives.

## Step 6 — (Optional) Two-shot Sora for longer reels

If a template needs more than 12s of motion (the Explainer is 25s), make the Sora engine generate **2 separate 12s clips** and concat with FFmpeg's `xfade`. The duration math bug from earlier is gone now (we ffprobe each clip and use its actual duration for fade/xfade).

This gives a 24s reel with two distinct visual beats. Cost: 2 × $6 = $12. Still under $20.

If implementing, gate this behind a per-template flag `multiShotSora: boolean` so only the longer templates trigger it.

## Step 7 — Verification

1. `pnpm typecheck` MUST pass
2. `pnpm lint` MUST pass
3. `pnpm build` MUST pass
4. Render the demo Gerardo reel with:
   - Template: Explainer · 25s
   - Mode: I write the script
   - Engine: **Sora 2 Pro 1024p** (the new premium default)
   - Visual style: `abstract` (the Sora-friendly winner from the May 14 exploration)
   - Language: Spanish
5. **Inspect logs:**
   - `[reachy:tts]` confirms `provider=elevenlabs`, voice id matches env
   - `[reachy:music]` confirms ElevenLabs Music returned MP3 bytes > 0
   - `[reachy:sfx]` confirms 2-3 SFX generated, sizes > 0 each
6. **Watch the rendered MP4. Confirm:**
   - Voice sounds like a real Spanish narrator with natural prosody (not the OpenAI fallback)
   - Background music is audible but doesn't compete with voice
   - At least 2 SFX hits (intro + transition) audible
   - Narration covers the FULL scene duration (no awkward silence after a 3-word overlay)
   - If multi-shot: 2 distinct visual beats with smooth crossfade
7. **Cost check:** total in DB should be ~$6 (Sora) + ~$0.10 (TTS) + ~$0.30 (music) + ~$0.15 (SFX) + $0.01 (compose) ≈ **$6.60**. Under $20 cap with massive headroom.

## Acceptance criteria

- [ ] ElevenLabs TTS confirmed active (provider=elevenlabs in logs)
- [ ] ElevenLabs Music generated per reel; mixed at background level
- [ ] ElevenLabs SFX generated; 2-3 hits per reel
- [ ] `PlannedScene` has separate `text` (overlay) and `narration` (TTS) fields
- [ ] Worker uses `narration ?? text` for TTS input
- [ ] Sora 2 Pro 1024p available as engine option, default for informative/pitch templates
- [ ] (Optional) Two-shot Sora for templates that exceed 12s
- [ ] All `pnpm typecheck`, `pnpm lint`, `pnpm build` pass
- [ ] Re-rendered demo Gerardo at Sora Pro 1024p with full ElevenLabs audio: voice/music/SFX all present and balanced
- [ ] Total cost ≤ $20 (typical $6-13 depending on multi-shot)

## Final report

- ✅ All steps completed (or explicit decision to defer multi-shot)
- 📁 Files modified
- 🎙️ Confirmation that ElevenLabs TTS is now firing (paste a `[reachy:tts]` log line)
- 🎵 Music generation working (paste log + sample byte count)
- 🔊 SFX generation working (paste log + cached vs fresh per call)
- 💰 Actual cost of the test render
- 🎬 R2 URL of the new MP4 + ONE frame screenshot showing motion
- 💡 Anything in the SDK that surprised you (e.g. "ElevenLabs Music API is gated to paid tier — the free tier returned 402")
- 🚀 Next: Garcia decides whether this is sendable to Gerardo or one more iteration on the visual prompt
