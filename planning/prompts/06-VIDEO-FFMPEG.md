# Phase 06 — REELS / SHORTS with FFmpeg + optional fal.ai (Veo 3.1)

> **Read `00-CONTEXT.md`. Phases 01–05 complete.**
> **Take your time. Apply §0.10 of `00-CONTEXT.md` (Quality & depth directive). Do NOT deliver in 5 minutes — research, plan, build, verify, refactor, re-read. Garcia values depth over speed.**

## Goal

Garcia generates short videos (15–30s, 9:16, 1080×1920) composed from:
- Images generated in Phase 04
- Text overlay (Brand Kit phrases, hooks, CTAs)
- Optional music (from a local royalty-free library)
- Smooth transitions

And optionally: invoke **fal.ai Veo 3.1 Fast** to generate the video from scratch (more expensive but more impactful).

## Mandatory prior research

WebSearch:
- `fluent-ffmpeg` — latest version and Node 22 compatibility
- How to install `ffmpeg` binary in Docker (Alpine vs Debian) — easiest with `linuxserver/ffmpeg` or `apt-get install ffmpeg`
- `complexFilter` filters for: zoompan (Ken Burns effect), drawtext, overlay PNG, fade in/out
- Pixel format required by Instagram/TikTok: `yuv420p`
- Recommended bitrate: ~5 Mbps for 1080×1920 @ 30fps
- **fal.ai Veo 3.1 Fast** — input shape, output (video URL), polling

## Steps

### 1. Local setup

```bash
pnpm add fluent-ffmpeg @types/fluent-ffmpeg
# in macOS/Linux dev:
brew install ffmpeg     # mac
sudo apt install ffmpeg # linux
```

Validate at boot: `src/server/video/ensureFfmpeg.ts` runs `ffmpeg -version` and crashes if not present.

### 2. Reel template catalog

`src/server/video/templates.ts`:
```ts
export const REEL_TEMPLATES = {
  'pitch-30s': {
    label: 'Pitch 30s — Problem / Solution / CTA',
    durationSec: 30,
    scenes: [
      { kind: 'image', durationSec: 5, textTop: '', textBottom: '{{problem}}' },
      { kind: 'image', durationSec: 5, textBottom: '{{problem_amplified}}' },
      { kind: 'image', durationSec: 8, textBottom: '{{solution}}' },
      { kind: 'image', durationSec: 8, textBottom: '{{benefit}}' },
      { kind: 'image', durationSec: 4, textCenter: '{{cta}}', bg: 'brand' },
    ],
  },
  'feature-15s': {
    label: 'Feature highlight 15s',
    durationSec: 15,
    scenes: [
      { kind: 'image', durationSec: 3, textTop: '{{hook}}' },
      { kind: 'image', durationSec: 6, textBottom: '{{feature}}' },
      { kind: 'image', durationSec: 3, textBottom: '{{benefit}}' },
      { kind: 'image', durationSec: 3, textCenter: '{{cta}}' },
    ],
  },
  'launch-20s': { /* similar */ },
} as const;
```

### 3. LLM-assisted scene generator

Server Action `planReel({ projectId, templateKey, idea, lang })`:
1. Calls OpenAI with brand kit + idea + template, returns `scenes` filled with text and an `imagePrompt` per scene
2. Shows the user the plan in an editable panel (they can adjust texts and prompts)
3. "Generate images and compose" button

### 4. Composition pipeline

`src/server/video/compose.ts`:
```ts
type Scene = { imagePath: string; durationSec: number; textTop?: string; textBottom?: string; textCenter?: string };

export async function composeReel({ scenes, outputPath, brandKit }: Args) {
  // 1. Per scene: apply Ken Burns (zoompan), text overlay, fade
  // 2. Concat with xfade transitions (0.4s)
  // 3. Optional audio, mixed to -16 LUFS
  return new Promise((resolve, reject) => {
    const cmd = ffmpeg();
    scenes.forEach(s => cmd.input(s.imagePath).inputOptions(['-loop 1', `-t ${s.durationSec}`]));
    if (audioPath) cmd.input(audioPath);

    const filters = [];
    scenes.forEach((s, i) => {
      // zoompan, scale to 1080x1920, drawtext
      filters.push(
        `[${i}:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,zoompan=z='zoom+0.001':d=${s.durationSec*30}:s=1080x1920,format=yuv420p,` +
        (s.textBottom ? `drawtext=fontfile='/path/Inter-Bold.ttf':text='${escape(s.textBottom)}':fontsize=64:fontcolor=white:x=(w-tw)/2:y=h-th-160:box=1:boxcolor=black@0.5:boxborderw=20,` : '') +
        `fade=t=in:st=0:d=0.4,fade=t=out:st=${s.durationSec-0.4}:d=0.4[v${i}]`
      );
    });
    // xfade chain
    let last = 'v0';
    let totalT = scenes[0].durationSec;
    for (let i = 1; i < scenes.length; i++) {
      const next = `vx${i}`;
      filters.push(`[${last}][v${i}]xfade=transition=fade:duration=0.4:offset=${totalT - 0.4}[${next}]`);
      last = next;
      totalT += scenes[i].durationSec - 0.4;
    }

    cmd.complexFilter(filters, [last])
       .outputOptions([
         '-c:v libx264', '-preset medium', '-crf 22',
         '-pix_fmt yuv420p', '-r 30',
         '-c:a aac', '-b:a 192k', '-ac 2',
         '-movflags +faststart',
       ])
       .output(outputPath)
       .on('end', () => resolve(outputPath))
       .on('error', reject)
       .run();
  });
}
```

> ⚠️ Escape `drawtext` text properly: no unescaped single quotes, no raw `:`. Use a text file via `textfile=` if it gets complex.

### 5. Veo 3.1 provider (alternative)

`src/server/video/falVideo.ts`:
```ts
export async function generateVeoReel({ prompt, durationSec }: Args) {
  const result = await fal.subscribe('fal-ai/veo-3.1/fast', {
    input: { prompt, aspect_ratio: '9:16', duration: durationSec },
  });
  // download result.video.url, return Buffer
}
```

UI: toggle "FFmpeg composition" vs "Generate with Veo 3.1 (more expensive)".

### 6. BullMQ worker for video

Same structure as image worker, queue `video-gen`. It's heavier and longer — set `concurrency: 1` per worker to avoid saturating CPU/disk on Hetzner.

### 7. UI — Reels generator (editorial)

`/app/projects/[slug]/generate/reel`:
- Select Template (pitch-30s, feature-15s, launch-20s)
- Textarea Idea
- "Generate plan" button → shows scene editor (each scene is an editable card: text + image prompt, all with editorial borders, no rounded corners)
- "Compose reel" button → enqueues
- Progress view: "Generating 4 images…" → "Composing video…" → "Ready, download"
  - Progress dots in mono font, no shadcn progress bar

### 8. Player and download

When done, show `<video controls poster="thumbnail.jpg">` with the reel inside an editorial frame (1px ink border, no radius). "Download MP4" button (signed URL R2).

### 9. Optional music

Folder `public/music/` with 5–10 royalty-free tracks (Pixabay Music, Free Music Archive). Selector "No music / Track 1 / Track 2 / …". User can also upload their own music (validate duration, max 50 MB).

## Acceptance criteria

- [ ] I generate a pitch-30s reel from an idea, FFmpeg composes correctly, output is 1080×1920 yuv420p
- [ ] Text overlays are legible, in correct position
- [ ] xfade transitions don't show black flashes
- [ ] Optionally I can choose Veo 3.1 and get a generated video
- [ ] Video is uploaded to R2 and viewable in the player
- [ ] The worker doesn't crash on malformed scenes (it has try/catch)

## Verification

Generate 1 FFmpeg reel + 1 Veo reel. View both in the player. Upload the FFmpeg one to a real Reel to validate format.

## Expected output

Report §0.8 + next phase: **07-LANDING.md** or **08-DEPLOY.md** depending on Garcia's priority.
