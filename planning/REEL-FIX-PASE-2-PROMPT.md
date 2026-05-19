# Reel fix · pase 2 — CCM prompt copy-paste (Sora 2 + quality pass)

> Pega este archivo COMPLETO en una sesión nueva de Claude Code Max + adjunta `planning/prompts/00-CONTEXT.md`. Después dile *"proceed"*.

---

You are working on the **Reachy** repo (`~/Documents/reachy/`). Apply §0.10 of `planning/prompts/00-CONTEXT.md` (Quality & depth directive). Take your time, verify after every step, do NOT declare done in 5 minutes.

## Context: what's broken and what we're shipping

Garcia's first demo render (May 12, "scattered feedback") looked like stock-photo. Pase 1 over-corrected to "one tiny rectangle on paper" — visually empty. Audio was robotic English-accented Spanish. No real animation, only Ken Burns zoom.

We're now committing to a path Garcia approved:

1. **Drop fal.ai/Veo for video.** Use **OpenAI Sora 2** (same `OPENAI_API_KEY`, no new credentials). Default to **Sora 2 Pro 720p** ($0.30/s).
2. **Cap $20 per reel** as a hard sanity guard in the backend.
3. **Enrich visualStyles** back to mid-density — not "ONE rectangle" but real editorial compositions (multiple shapes with hierarchy, still no text/people).
4. **Upgrade TTS** to `gpt-4o-mini-tts` with `voice: 'sage'` and natural-pace instructions.
5. **Animate drawtext word-by-word** so overlay text appears as the narrator speaks it.
6. **Add background music + SFX** per visualStyle (royalty-free placeholders).

**Quality bar:** the next render of demo Gerardo (4-scene Explainer at Sora 2 Pro 720p, ~$9.60) should be sendable to a real prospect. If it's not, we iterate again.

---

## Step 1 — Sora 2 integration (new file)

**Research first:** WebSearch the OpenAI Node SDK v6 (`openai` package on npm) and OpenAI API docs for the current Sora video endpoint as of May 2026. Confirm:
- The SDK method (likely `client.videos.create()` or `client.videos.generate()` — verify exact name)
- Required vs optional parameters for `model: 'sora-2-pro'`, including `size` (720p variants), `seconds` (4/8/12), `prompt`
- How to poll status (similar to fal queue, or sync with longer timeout?)
- How to retrieve the final MP4 URL
- Pricing confirmation: Sora 2 base $0.10/s @ 720p, Sora 2 Pro $0.30/s @ 720p

If anything in the SDK has changed names, **adapt and document** what you found.

**Create `src/server/ai/openaiVideo.ts`** (mirror the structure of `src/server/video/falVideo.ts`):

```ts
import 'server-only';
import { getOpenAI } from './openai';

/**
 * Sora 2 via the same OPENAI_API_KEY. Replaces fal.ai/Veo as the default
 * AI video engine. Pricing as of May 2026:
 *   sora-2 base    @ 720p → $0.10/s
 *   sora-2-pro     @ 720p → $0.30/s
 *   sora-2-pro     @ 1024p → $0.50/s  (NOT exposed in our UI; overkill for 9:16)
 */
export type SoraModel = 'sora-2' | 'sora-2-pro';
export const SORA_VALID_DURATIONS = [4, 8, 12] as const;
export type SoraDuration = (typeof SORA_VALID_DURATIONS)[number];

export const SORA_CENTS_PER_SEC: Record<SoraModel, number> = {
  'sora-2': 10,         // $0.10/s
  'sora-2-pro': 30,     // $0.30/s @ 720p
};

export function snapSoraDuration(seconds: number): SoraDuration {
  // pick the nearest supported step; ties go to the longer
  let best: SoraDuration = SORA_VALID_DURATIONS[0];
  let bestDelta = Math.abs(seconds - best);
  for (const d of SORA_VALID_DURATIONS) {
    const delta = Math.abs(seconds - d);
    if (delta < bestDelta || (delta === bestDelta && d > best)) {
      best = d;
      bestDelta = delta;
    }
  }
  return best;
}

export interface SoraSubmitArgs {
  model: SoraModel;
  prompt: string;
  /** 9:16 only for now; Sora supports it via aspect_ratio or size param. Verify field name in SDK. */
  aspectRatio: '9:16';
  durationSec: SoraDuration;
}

export interface SoraJob {
  /** Provider job id used to poll. */
  jobId: string;
  model: SoraModel;
}

export interface SoraStatus {
  state: 'queued' | 'running' | 'done' | 'failed';
  videoUrl?: string;
  errorMessage?: string;
}

export async function submitSora(args: SoraSubmitArgs): Promise<SoraJob> {
  // Use the SDK method confirmed in your research. Likely shape:
  //   const job = await openai.videos.create({
  //     model: args.model,
  //     prompt: args.prompt,
  //     size: args.aspectRatio === '9:16' ? '720x1280' : '1280x720',
  //     seconds: args.durationSec,
  //   });
  //   return { jobId: job.id, model: args.model };
  throw new Error('TODO: implement after SDK research');
}

export async function pollSora(job: SoraJob): Promise<SoraStatus> {
  // Likely:
  //   const status = await openai.videos.retrieve(job.jobId);
  //   if (status.status === 'completed') return { state: 'done', videoUrl: status.video_url };
  //   if (status.status === 'failed') return { state: 'failed', errorMessage: status.error?.message ?? 'unknown' };
  //   if (status.status === 'in_progress') return { state: 'running' };
  //   return { state: 'queued' };
  throw new Error('TODO: implement after SDK research');
}

export interface SoraDownloadResult {
  buffer: Buffer;
  contentType: string;
  bytes: number;
}

const ALLOWED_SORA_HOSTS = /(^|\.)(openai\.com|oaiusercontent\.com)$/i;

function assertSoraHost(rawUrl: string): URL {
  const parsed = new URL(rawUrl);
  if (parsed.protocol !== 'https:') {
    throw new Error(`downloadSoraVideo: refusing non-https url (${parsed.protocol})`);
  }
  if (!ALLOWED_SORA_HOSTS.test(parsed.hostname)) {
    throw new Error(`downloadSoraVideo: refusing host ${parsed.hostname}`);
  }
  return parsed;
}

export async function downloadSoraVideo(url: string): Promise<SoraDownloadResult> {
  assertSoraHost(url);
  const res = await fetch(url, { redirect: 'error' });
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  return {
    buffer,
    contentType: res.headers.get('content-type') ?? 'video/mp4',
    bytes: buffer.length,
  };
}

export function soraCostCents(model: SoraModel, seconds: number): number {
  return Math.max(1, Math.round(SORA_CENTS_PER_SEC[model] * seconds));
}
```

After implementing the TODOs from your SDK research, run `pnpm typecheck` — must pass.

## Step 2 — Replace `'veo'` with Sora in `ReelEngine`

**File:** `src/lib/reel-templates.ts`

Update the `ReelEngine` type and `REEL_ENGINES` catalog:

```ts
export type ReelEngine = 'ffmpeg' | 'sora-base' | 'sora-pro-720p';

export const REEL_ENGINES: ReadonlyArray<{ id: ReelEngine; label: string; tagline: string; secondsCost: number }> = [
  {
    id: 'ffmpeg',
    label: 'FFmpeg composition',
    tagline: 'AI images stitched with text overlays + TTS. Cheap and fast.',
    secondsCost: 0, // image+TTS billed separately
  },
  {
    id: 'sora-base',
    label: 'Sora 2 (base)',
    tagline: '720p, OpenAI native AI video. Animated. ~$0.10/s.',
    secondsCost: 10, // cents per second
  },
  {
    id: 'sora-pro-720p',
    label: 'Sora 2 Pro 720p',
    tagline: 'Premium quality, full motion. ~$0.30/s. Default for flagship reels.',
    secondsCost: 30,
  },
];
```

Update `TYPE_DEFAULT_ENGINE` — replace any `'veo'` with `'sora-pro-720p'`. Visual stays on FFmpeg (cheaper for ambient mood).

## Step 3 — `videoWorker.ts`: dispatch to Sora

**File:** `src/server/jobs/videoWorker.ts`

Find the section that handles `engine === 'veo'` and replace with sora dispatch. Use `submitSora`, `pollSora`, `downloadSora` from the new `openaiVideo.ts`. Compute `costCents` via `soraCostCents()`.

For multi-scene Sora reels: if the plan has N scenes and engine is `sora-base` or `sora-pro-720p`, submit N separate Sora jobs (one per scene), poll each, download each, then concatenate them with FFmpeg using `xfade` transitions (same code path as the multi-image FFmpeg compose). Keep the per-scene drawtext overlay AND TTS audio mix.

> Sora outputs already have synthesized scenes — but our brand voiceover (TTS) and our overlay text need to layer ON TOP. That's the value of the hybrid: Sora gives the visual, our pipeline gives the brand consistency.

## Step 4 — Hard $20 cap in the backend

**File:** `src/server/actions/reels.ts` (the `composeReelAction`)

Before enqueueing, compute the total cost:
- For ffmpeg engine: imageGen × scenes + TTS chars × $0.000015 + ~$0.05 compose
- For sora-base or sora-pro-720p: `soraCostCents(model, totalSeconds) + TTS + compose`

```ts
const MAX_REEL_COST_CENTS = 2000; // $20 hard cap

const estimatedCents = estimateReelCost({ engine, plan });
if (estimatedCents > MAX_REEL_COST_CENTS) {
  return { ok: false, error: `over-budget:${estimatedCents}` };
}
```

Add `estimateReelCost` helper that accounts for engine, scene durations, and TTS character counts. Surface the estimate in the UI before the user clicks "Render reel" so they see the cost.

## Step 5 — Mark fal.ai video as deprecated (don't delete)

**Files:** `src/server/video/falVideo.ts`, anywhere it's imported.

Add a JSDoc comment at the top of `falVideo.ts`:

```ts
/**
 * @deprecated As of May 2026 we use Sora 2 via OPENAI_API_KEY (see
 * src/server/ai/openaiVideo.ts). This file is preserved for two reasons:
 *  1. We may still want fal.ai for FLUX/Recraft IMAGE generation in Phase 04
 *  2. Veo Standard remains a quality benchmark we may A/B against later
 * Do NOT wire this back into the reel UI without explicit approval from Garcia.
 */
```

Remove `'veo'` references from any UI-facing config (engine selectors, defaults, i18n labels). The file stays compilable but unreachable from user paths.

## Step 6 — Re-enrich `visualStyles.ts` (mid-density, not minimalist)

**File:** `src/server/ai/visualStyles.ts`

The current prompts produce empty frames ("one rectangle on paper"). Rewrite each `prompt` field with **richer compositions** — multiple shapes with clear hierarchy, but still no text/people. Use this exact code:

```ts
export const VISUAL_STYLES: Record<VisualStyleKey, VisualStyleEntry> = {
  editorial: {
    label: 'Editorial motion',
    tagline: 'Warm paper layout with multiple geometric marks; type added by overlay.',
    prompt: [
      'STYLE: warm cream paper background with visible grain and slight aging at the edges, like a high-quality editorial print magazine spread.',
      'Composition: 3-4 geometric marks arranged with editorial layout balance — a thin horizontal rule across the upper third, an oversized ink-colored shape (rectangle, half-circle, or punctuation) as the focal point in the central zone, a small burnt-sienna accent block in a quadrant for visual weight, and a thin vertical line at one edge.',
      'Treat the frame as a magazine page mock with intentional negative space. Mid-century print design sensibility (Massimo Vignelli / Dieter Rams).',
      'Palette: warm off-white paper (#f1ebdf) background, deep ink (#14110d) for primary marks, burnt sienna (#b6481a) for one accent only.',
      'Camera: completely static. NO zoom, NO pan, NO parallax.',
      'CRITICAL CONSTRAINTS: NO text, NO letters, NO words, NO numbers, NO typography of any kind in the image. NO real people, NO faces, NO photographs, NO UI screens, NO logos. Type is added by the renderer in a separate layer.',
    ].join(' '),
  },
  'paper-cutout': {
    label: 'Paper cutout',
    tagline: 'Layered colored paper shapes with hard drop shadows.',
    prompt: [
      'STYLE: flat paper cutout collage on warm cream background, with visible paper grain across all layers and hard drop shadows at a 30-degree angle.',
      'Composition: 3-4 layered geometric paper shapes (one circle, one rectangle, one half-moon or quarter-arc, one thin strip) in solid brand colors, overlapping with intentional hierarchy. The largest shape anchors the composition; smaller shapes provide rhythm.',
      'Style of Headway / Fable summaries — tactile, hand-cut feel, slight imperfection at the edges.',
      'Palette: cream (#fde9d8) background, deep ink (#14110d), forest green (#1f3a2f), burnt sienna (#b6481a) — distribute the colors across the shapes, no shape uses more than one color.',
      'Camera: completely static.',
      'CRITICAL CONSTRAINTS: NO text, NO letters, NO words, NO numbers, NO typography. NO real people, NO faces, NO photographs, NO realistic illustration, NO icons. Just clean cutout shapes.',
    ].join(' '),
  },
  'flat-2d': {
    label: 'Flat 2D explainer',
    tagline: 'Bold cartoon scene with one focal icon and supporting elements.',
    prompt: [
      'STYLE: flat 2D vector illustration scene, Lottie/Rive aesthetic, like a Duolingo or Mailchimp marketing illustration.',
      'Composition: ONE central cartoon icon (a heart, a star, a check mark, a speech bubble, a thumbs-up — pick the one most relevant) with thick black outlines and solid fill, surrounded by 2-3 small supporting decorative shapes (dots, sparkles, or small geometric ornaments) to add liveliness without clutter.',
      'Palette: one saturated brand color as solid background, white or off-white for the icon fill, black for outlines, one accent color for supporting elements.',
      'Camera: completely static.',
      'CRITICAL CONSTRAINTS: NO text, NO letters, NO words, NO numbers. NO real people, NO faces, NO realistic photographs. Cartoon icons only.',
    ].join(' '),
  },
  infographic: {
    label: 'Animated infographic',
    tagline: 'Multiple chart elements arranged like a mini editorial dashboard.',
    prompt: [
      'STYLE: minimalist data visualization composition on clean off-white background, like a New York Times infographic or The Pudding article.',
      'Composition: 2-3 chart elements arranged in editorial hierarchy — for example a primary bar chart (3-5 solid color bars of varying heights) as the focal point, a small donut chart in a corner, and a thin trend line connecting two abstract markers. NO numbers or labels rendered as text — just the abstract chart shapes.',
      'Palette: off-white (#f7f4ed) background, deep ink (#14110d) for primary data, one brand accent color for the highlighted data point, neutral mid-grey for secondary marks.',
      'Camera: completely static.',
      'CRITICAL CONSTRAINTS: NO text, NO letters, NO words, NO numbers in the image. NO axis labels, NO chart titles. NO real people. Pure shape, color, and abstract data form.',
    ].join(' '),
  },
  isometric: {
    label: 'Isometric mini',
    tagline: 'Floating 3D blocks and tiny figures in soft pastel.',
    prompt: [
      'STYLE: isometric 3D illustration scene, soft and clean, like Notion or Linear marketing illustrations.',
      'Composition: 2-3 floating isometric elements in 3D perspective with subtle drop shadows — a primary card or block as the focal point, a smaller secondary block at a different elevation, and optionally one tiny abstract figure (3-color silhouette, no facial features) interacting with the elements.',
      'Palette: soft pastel pink, sky blue, or cream background; element surfaces in soft pastel gradients with deep navy outlines.',
      'Camera: static isometric perspective at 30 degrees.',
      'CRITICAL CONSTRAINTS: NO text, NO letters, NO words, NO numbers, NO readable UI. NO real people, NO realistic faces. The cards are intentionally blank.',
    ].join(' '),
  },
  abstract: {
    label: 'Abstract shapes',
    tagline: 'Multiple soft color blobs morphing premium-style.',
    prompt: [
      'STYLE: premium abstract motion graphics composition, like Apple/Stripe/Vercel marketing visuals.',
      'Composition: 2-3 large soft color blobs with smooth gradients, arranged with intentional overlap and negative space. The primary blob is the focal point; secondary blobs add depth.',
      'Palette: rich gradients — pink-to-purple, sky-to-mint, or warm cream-to-sienna — on a near-black or warm cream background.',
      'Camera: completely static.',
      'CRITICAL CONSTRAINTS: NO text, NO letters, NO words, NO numbers. NO real people, NO objects, NO UI, NO icons. Pure form and color.',
    ].join(' '),
  },
};
```

## Step 7 — TTS upgrade in `videoWorker.ts`

Find the TTS section (around line 270-285):

**Before:**
```ts
const ttsVoice = data.plan.language === 'es' ? 'nova' : 'alloy';
const speech = await openai.audio.speech.create({
  model: 'tts-1',
  voice: ttsVoice,
  input: text,
});
```

**After (verify model name first via WebSearch):**
```ts
const isEs = data.plan.language === 'es';
const speech = await openai.audio.speech.create({
  model: 'gpt-4o-mini-tts',  // current OpenAI multilingual TTS as of May 2026
  voice: 'sage',              // editorial-warm voice; works for both ES and EN
  input: text,
  instructions: isEs
    ? 'Voz de narrador editorial cálido y natural. Ritmo conversacional, NO lento, con pausas naturales solo entre frases. Tono profesional pero cercano. Acentúa correctamente el español.'
    : 'Warm editorial narrator. Natural conversational pace, NOT slow, with subtle pauses between sentences. Professional but friendly tone.',
  response_format: 'mp3',
});
```

> **Important:** the previous instruction made the voice too slow. The new wording emphasizes "natural pace, NOT slow". Adjust `speed` parameter if available (target 1.0–1.05x for liveliness).

Update `ttsCostCents` formula to match the new model's pricing (verify in OpenAI docs).

## Step 8 — Word-by-word drawtext animation

**File:** `src/server/video/compose.ts`

Currently a single `drawtext` renders the full caption. Change so the text appears word by word at ~2.5 words/sec:

```ts
const words = scene.text.split(/\s+/).filter(Boolean);
const wordsPerSec = 2.5;
const wordFilters = words.map((word, idx) => {
  const start = (idx / wordsPerSec).toFixed(2);
  // ... build a drawtext filter for this word with enable='between(t,start,sceneDur)'
  // All words share the same (x, y) so they accumulate.
});
```

Edge cases:
- 1-word captions: render at t=0 with full duration (no animation needed).
- Scenes <3s: cap word-buckets to fit in the scene duration.
- Special chars: continue using `textfile=` escaping.
- Background box: use a separate `drawbox` filter that's persistent across the whole scene, not tied to any single drawtext (so it doesn't flicker).

## Step 9 — Background music + SFX

**Files:**
- NEW `public/music/` folder with placeholder MP3s per visualStyle (see below)
- NEW `public/sfx/transition.mp3` placeholder
- `src/server/video/compose.ts` — mix music + SFX into the final FFmpeg output

Create empty placeholder file paths (zero-byte mp3s) so the code compiles:
```
public/music/editorial.mp3
public/music/paper-cutout.mp3
public/music/flat-2d.mp3
public/music/infographic.mp3
public/music/isometric.mp3
public/music/abstract.mp3
public/sfx/transition.mp3
```

Add a helper `getStyleMusic(visualStyle: VisualStyleKey): string` that returns the path. In `compose.ts`, mix the music at -22 LUFS (background level, doesn't compete with TTS) and the SFX at -18 LUFS at each `xfade` transition timestamp. Use FFmpeg `amix` filter.

Tell Garcia in your final report: "**ACTION REQUIRED — Garcia must drop royalty-free MP3s into `public/music/` and `public/sfx/` before re-rendering. Sources: Pixabay Music (free, no attribution required), Free Music Archive, Uppbeat. Files must match the names in this list.**"

This prevents shipping a broken pipeline if the placeholders stay empty — the FFmpeg step should gracefully skip music if the file is empty/missing (check file size > 0 before mixing).

## Step 10 — UI selector simplification

**File:** `src/components/app/generate-reel-form.tsx`

The engine selector should show 3 options total:
- **FFmpeg** — `~$0.20 per reel`
- **Sora 2 (base)** — `~$0.80 per 8s scene` (= ~$3.20 for an Explainer-25s)
- **Sora 2 Pro 720p** — `~$2.40 per 8s scene` (= ~$9.60 for an Explainer-25s)  ← default for `informative-25s` and `pitch-30s`

Show the **estimated total cost** under the selector based on the chosen template (use `estimateReelCost`). Disable the option if it would exceed `MAX_REEL_COST_CENTS = 2000`.

## Step 11 — Verification

1. `pnpm db:up`
2. `pnpm typecheck` — must pass (0 errors)
3. `pnpm lint` — must pass
4. `pnpm build` — must pass
5. `pnpm dev` — bring app up
6. Open the demo Gerardo reel:
   - Template: Explainer · 25s
   - Mode: I write the script
   - 4 lines (corregidas):
     - "Marketing real para apps reales."
     - "Subes tu marca; Reachy hace el resto."
     - "Este video lo armó la app misma."
     - "¿Cazaste el truco, Gerardo? Esto es Reachy."
   - Visual style: Editorial motion
   - **Engine: Sora 2 Pro 720p**
   - Language: Spanish
7. Click "Draft scenes" — review imagePrompts, MUST mention paper/shapes/composition (per the new visualStyles), MUST NOT mention people/faces/text/numbers
8. Verify the cost estimate shown ≈ $9.60
9. Click "Render reel" — wait (Sora can take 2-5 min per scene; total ~10-20 min)
10. Watch the rendered MP4. Verify:
    - **No gibberish text inside the AI scenes** (Sora is much better at this than Flux but still verify)
    - **Real animation** (motion in each scene, not Ken Burns zoom)
    - **Voice sounds Spanish-native, natural pace, calm but lively**
    - **Overlay text appears word by word**
    - **Background music plays** (only if Garcia dropped MP3 files in `public/music/`; otherwise silent music track is fine)
    - Compositions are rich (3-4 elements with hierarchy), NOT empty rectangles

## Step 12 — Quality pass §0.10

Re-read every file you touched. Check:
- No leftover `tts-1` or `'veo'` references in active code paths (only in `falVideo.ts` which is deprecated)
- No `console.log` from debugging
- Types still strict
- Cost estimator covers all paths and matches actual billing
- Music skip-if-missing works (don't crash on empty file)
- Sora polling has a max retries / max duration to avoid infinite loops if API hangs

`pnpm build` final time. MUST be 0 errors, 0 warnings.

## Acceptance criteria

- [ ] `src/server/ai/openaiVideo.ts` exists with submitSora/pollSora/downloadSora wired to actual SDK calls
- [ ] `ReelEngine` type has `'sora-base'` and `'sora-pro-720p'`, no `'veo'`
- [ ] `videoWorker.ts` dispatches sora engines through openaiVideo
- [ ] `MAX_REEL_COST_CENTS = 2000` enforced before enqueue
- [ ] `falVideo.ts` marked `@deprecated` but compiles
- [ ] All 6 entries in `visualStyles.ts` use the new richer prompts
- [ ] TTS uses `gpt-4o-mini-tts` with `voice: 'sage'` and natural-pace instructions
- [ ] Drawtext renders word by word
- [ ] `public/music/<style>.mp3` and `public/sfx/transition.mp3` placeholders exist (0-byte ok); compose.ts mixes them when present
- [ ] UI selector shows 3 engines with cost estimates; over-budget options disabled
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm build` all pass
- [ ] Re-rendered demo Gerardo at Sora 2 Pro 720p: real animation, Spanish-native voice, word-by-word overlay, rich compositions

## Final report (per §0.8 of 00-CONTEXT)

Report:
- ✅ All 12 steps completed
- 📁 Files modified (paste `git diff --stat`)
- 🧪 Verification: typecheck/lint/build OK, smoke test result with sample MP4 link
- 🎙️ Sora SDK details: which method/parameters you ended up calling and any deviation from this prompt
- 💰 Total cost of the test render (should be ≈ $9.60 + TTS cents)
- 💡 Decisions you made (e.g. how you handled the Sora polling timeout, how the music mixing falls back gracefully)
- ⚠️ Garcia must drop royalty-free MP3s into `public/music/` (list the 6 paths) and `public/sfx/transition.mp3` before the music+SFX layer activates
- 🚀 Next: re-render the demo Gerardo and decide whether to ship to Gerardo
