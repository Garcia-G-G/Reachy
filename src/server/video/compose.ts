import 'server-only';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpeg from 'fluent-ffmpeg';
import sharp from 'sharp';
import { type PlannedScene, REEL_DIMENSIONS, REEL_TRANSITION_SEC } from '@/lib/reel-templates';

export interface ComposeSceneInput {
  /** Path to the still image (PNG/JPG) used as the background. Required when scene.background='image'. */
  imagePath?: string;
  /** Plain text headline to overlay; pass empty string to skip drawtext. */
  text: string;
  /** Slot data passed through from the planner. */
  scene: PlannedScene;
}

export interface ComposeReelArgs {
  scenes: ComposeSceneInput[];
  /** Final output path on disk; the caller uploads the result to R2. */
  outputPath: string;
  /** Brand background hex used by `background: 'brand'` CTA scenes. */
  brandColorHex: string;
  /** Brand text color hex used on top of the brand bg. */
  brandTextHex: string;
  /** Optional onProgress callback ([0..1]). */
  onProgress?: (pct: number) => void;
}

/**
 * Output 1080x1920 yuv420p H.264 with +faststart, the standard for IG Reels /
 * TikTok / Shorts. drawtext text is escaped against ffmpeg's expression
 * grammar so a user-supplied "Don't worry — it's fast." doesn't blow up the
 * filter chain.
 *
 * IMPLEMENTATION NOTE: We write each scene's text to a temp file and use
 * `textfile=` instead of `text=`. That sidesteps almost every drawtext
 * escaping pitfall (single quotes, colons, percent signs, backslashes).
 * Source: https://ffmpeg.org/ffmpeg-filters.html#drawtext-1
 */
export async function composeReel(args: ComposeReelArgs): Promise<{ outputPath: string }> {
  const { scenes, outputPath, brandColorHex, brandTextHex } = args;
  if (scenes.length === 0) throw new Error('composeReel: at least one scene required');

  const fontFile = await resolveDrawtextFont();
  const tmp = await mkdtemp(join(tmpdir(), 'reachy-reel-'));

  try {
    // Pre-write each scene's overlay text to its own file so drawtext can
    // load them via textfile= without us having to escape the string. We
    // also pre-wrap by character count: drawtext does NOT auto-wrap, so a
    // long single-line caption overflows horizontally and gets clipped at
    // the 1080px frame edge. Width budgets are tuned empirically against
    // Helvetica at our font sizes (see overlayFontSize) within a 60px
    // safe-area margin on each side.
    const textFiles = await Promise.all(
      scenes.map(async (s, i) => {
        if (!s.text) return null;
        const path = join(tmp, `scene-${i}.txt`);
        const wrapped = wrapForDrawtext(s.text, s.scene.textPosition);
        await writeFile(path, wrapped, 'utf8');
        return path;
      }),
    );

    // For brand-background scenes we synthesize a solid-color PNG with sharp
    // and feed it through the same image-loop input path. Originally we used
    // ffmpeg's `lavfi color=...` virtual source, but fluent-ffmpeg's input
    // capability check rejects 'lavfi' (it's registered as a *device*, not a
    // *format*, in the binary's `-formats` list). One PNG per scene is
    // negligible (1080×1920 solid color compresses to <2KB).
    const brandBgPath = await ensureBrandBg(tmp, brandColorHex);

    // Validate up front (any missing imagePath would fail the ffmpeg run
    // halfway through with a noisy stack — surface a clean rejection).
    for (const [i, s] of scenes.entries()) {
      if (s.scene.background === 'image' && !s.imagePath) {
        throw new Error(`composeReel: scene ${i} is image-backed but imagePath missing`);
      }
    }

    return await new Promise<{ outputPath: string }>((resolve, reject) => {
      const cmd = ffmpeg();

      // Each scene becomes one input. Brand-bg scenes use the synthesized
      // solid-color PNG; image scenes use the per-scene still.
      for (const s of scenes) {
        const inputPath = s.scene.background === 'brand' ? brandBgPath : s.imagePath;
        if (!inputPath) continue; // unreachable after the validation above
        cmd.input(inputPath).inputOptions(['-loop', '1', '-t', String(s.scene.durationSec)]);
      }

      // Per-scene filter: scale → crop → zoompan (Ken Burns) → drawtext (if any) → fade
      const filters: string[] = [];
      scenes.forEach((s, i) => {
        const safeText = textFiles[i];
        const isBrand = s.scene.background === 'brand';
        const textColor = isBrand ? normalizeHex(brandTextHex) : 'white';
        const overlayY = drawtextY(s.scene.textPosition);

        // For image scenes we run the full pipeline. Brand-bg scenes only
        // need to be scaled to the final dims and have yuv420p applied — no
        // Ken Burns on a flat color.
        //
        // zoompan duration trap: without an explicit `:fps=N`, zoompan
        // emits `d` frames PER INPUT FRAME. With `-loop 1 -t 5` the input
        // is already 5 seconds of looped frames (~125 frames at the loop's
        // default rate) and zoompan multiplies that by d=150 → 18,750
        // output frames per scene → ~24-minute reels. Pinning `:fps=30`
        // makes zoompan output exactly `d` frames at 30 Hz, i.e. the
        // intended scene duration.
        //
        // Brand-bg chain must ALSO declare fps=30 explicitly — without it
        // the image chain ends up on timebase 1/30 (from zoompan:fps=30)
        // and the brand chain on timebase 1/25 (the input loop default),
        // and xfade refuses to blend mismatched timebases with:
        //   "First input link main timebase (1/30) do not match the
        //    corresponding second input link xfade timebase (1/25)"
        //
        // Source: https://ffmpeg.org/ffmpeg-filters.html#zoompan
        const baseChain = isBrand
          ? `scale=${REEL_DIMENSIONS.width}:${REEL_DIMENSIONS.height},fps=${REEL_DIMENSIONS.fps},format=yuv420p`
          : [
              `scale=${REEL_DIMENSIONS.width}:${REEL_DIMENSIONS.height}:force_original_aspect_ratio=increase`,
              `crop=${REEL_DIMENSIONS.width}:${REEL_DIMENSIONS.height}`,
              // Slow zoom-in over the scene duration. d= is in frames at fps.
              `zoompan=z='min(zoom+0.0008,1.15)':d=${s.scene.durationSec * REEL_DIMENSIONS.fps}:s=${REEL_DIMENSIONS.width}x${REEL_DIMENSIONS.height}:fps=${REEL_DIMENSIONS.fps}`,
              `format=yuv420p`,
            ].join(',');

        // expansion=none disables drawtext's %{...} expression evaluator on
        // the textfile contents — without it a user-supplied scene text like
        // "Try %{eif:1/0:d}" would be parsed as a filter expression instead
        // of rendered verbatim. ffmpeg's default is "normal" expansion.
        // https://ffmpeg.org/ffmpeg-filters.html#drawtext-1 ("expansion")
        const draw = safeText
          ? `,drawtext=fontfile='${fontFile}':textfile='${safeText}':expansion=none:fontsize=${overlayFontSize(s.scene.textPosition)}:fontcolor=${textColor}:x=(w-tw)/2:y=${overlayY}:line_spacing=10:box=1:boxcolor=0x000000${isBrand ? '00' : '88'}:boxborderw=24`
          : '';

        const fade = `,fade=t=in:st=0:d=${REEL_TRANSITION_SEC},fade=t=out:st=${Math.max(0, s.scene.durationSec - REEL_TRANSITION_SEC)}:d=${REEL_TRANSITION_SEC}`;

        filters.push(`[${i}:v]${baseChain}${draw}${fade}[v${i}]`);
      });

      // Chain xfade between consecutive scenes. Each xfade consumes
      // REEL_TRANSITION_SEC of the previous scene; offset is the cumulative
      // visible time so far minus that overlap.
      let lastLabel = 'v0';
      let cumulative = scenes[0]?.scene.durationSec ?? 0;
      for (let i = 1; i < scenes.length; i++) {
        const next = `vx${i}`;
        const offset = Math.max(0, cumulative - REEL_TRANSITION_SEC);
        filters.push(
          `[${lastLabel}][v${i}]xfade=transition=fade:duration=${REEL_TRANSITION_SEC}:offset=${offset}[${next}]`,
        );
        lastLabel = next;
        const sceneDur = scenes[i]?.scene.durationSec ?? 0;
        cumulative += sceneDur - REEL_TRANSITION_SEC;
      }

      cmd
        .complexFilter(filters, [lastLabel])
        .outputOptions([
          '-c:v',
          'libx264',
          '-preset',
          'medium',
          '-crf',
          '22',
          '-pix_fmt',
          'yuv420p',
          '-r',
          String(REEL_DIMENSIONS.fps),
          '-movflags',
          '+faststart',
          '-an', // strip audio (templates are silent for v1)
        ])
        .output(outputPath)
        .on('progress', (info) => {
          if (args.onProgress && typeof info.percent === 'number') {
            args.onProgress(Math.min(1, Math.max(0, info.percent / 100)));
          }
        })
        .on('end', () => resolve({ outputPath }))
        .on('error', (err, _stdout, stderr) => {
          // fluent-ffmpeg's err.message truncates to the last stderr chunk
          // (often just "Conversion failed!"), which hides the actual filter
          // graph parse error. Surface the tail of stderr in the rejection so
          // worker logs show what really broke.
          const tail = (stderr ?? '').split('\n').slice(-12).join('\n');
          const message = `${err.message}${tail ? `\n--- ffmpeg stderr (tail) ---\n${tail}` : ''}`;
          reject(new Error(message));
        })
        .run();
    });
  } finally {
    // Always clean up the temp text files even if compose threw.
    await rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}

function drawtextY(pos: 'top' | 'bottom' | 'center'): string {
  if (pos === 'top') return '160';
  if (pos === 'center') return '(h-th)/2';
  return 'h-th-220';
}

async function ensureBrandBg(dir: string, hex: string): Promise<string> {
  const { r, g, b } = hexToRgb(hex);
  const path = join(dir, 'brand-bg.png');
  await sharp({
    create: {
      width: REEL_DIMENSIONS.width,
      height: REEL_DIMENSIONS.height,
      channels: 3,
      background: { r, g, b },
    },
  })
    .png({ compressionLevel: 6 })
    .toFile(path);
  return path;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const trimmed = hex.trim().replace(/^#/, '');
  const expanded =
    trimmed.length === 3
      ? trimmed
          .split('')
          .map((c) => c + c)
          .join('')
      : trimmed.padEnd(6, '0').slice(0, 6);
  const n = Number.parseInt(expanded, 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

function overlayFontSize(pos: 'top' | 'bottom' | 'center'): number {
  // Center text gets the editorial-display treatment; corner text is smaller.
  return pos === 'center' ? 88 : 56;
}

/**
 * Pre-wrap text to fit within the 1080px reel frame (minus a 60px safe
 * margin on each side = 960px usable). drawtext does not auto-wrap, so an
 * unconstrained 12-word caption would render as a single line that runs
 * off both edges.
 *
 * Budgets are character counts at our fontfile (Helvetica/DejaVu) sizes,
 * tuned with a comfortable buffer:
 *   - center @88pt   → ~16 chars / line, max 3 lines
 *   - top/bot @56pt  → ~26 chars / line, max 3 lines
 * Words longer than the budget are kept on their own line (overflow is
 * acceptable for rare long words, e.g. a hashtag, vs. silently dropping).
 */
export function wrapForDrawtext(text: string, pos: 'top' | 'bottom' | 'center'): string {
  const trimmed = text.replace(/\s+/g, ' ').trim();
  if (!trimmed) return '';
  const maxChars = pos === 'center' ? 16 : 26;
  const maxLines = 3;
  const words = trimmed.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = word;
    if (lines.length >= maxLines) break;
  }

  if (current && lines.length < maxLines) lines.push(current);
  return lines.slice(0, maxLines).join('\n');
}

/** Strip leading '#' and pass through to ffmpeg's color parser. */
function normalizeHex(hex: string): string {
  const trimmed = hex.trim().replace(/^#/, '');
  return /^[0-9a-fA-F]{3,8}$/.test(trimmed) ? `0x${trimmed}` : '0x14110D';
}

/**
 * Find a font file ffmpeg can read. We try, in order: a project-shipped font
 * (preferred for editorial consistency), then a few macOS / Linux fallbacks.
 */
async function resolveDrawtextFont(): Promise<string> {
  // We don't bundle a font file yet — fall back to a known system font.
  // Comment about future improvement: copy Inter-Bold.ttf into public/fonts/
  // and prefer it here so reels match the editorial brand on every host.
  const candidates = [
    '/System/Library/Fonts/Helvetica.ttc',
    '/System/Library/Fonts/HelveticaNeue.ttc',
    '/System/Library/Fonts/Supplemental/Arial.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
  ];
  const { stat } = await import('node:fs/promises');
  for (const path of candidates) {
    try {
      await stat(path);
      return path;
    } catch {
      // try next
    }
  }
  throw new Error(
    'No drawtext-compatible font found. Install fontconfig or ship a TTF in public/fonts/.',
  );
}
