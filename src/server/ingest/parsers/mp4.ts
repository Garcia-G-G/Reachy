import 'server-only';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { MAX_KEYFRAMES_PER_VIDEO } from '@/server/config/parserLimits';
import type { ParseCtx, ParsedFile, ParsedImage } from '../types';
import { hashContent, persistExtractedImage } from '../util';

/** Extract evenly-spaced keyframes from an mp4/mov via ffmpeg. We
 *  shell out to ffmpeg (same binary the reel pipeline uses; existing
 *  ensureFfmpeg.ts validates availability on worker boot).
 *
 *  Caption extraction is deferred to Step 2 (the vision-captioner runs
 *  on every ParsedImage). Here we just yield keyframe images with
 *  their R2 keys + sharp-derived width/height/palette. */
export async function parse(buffer: Buffer, filename: string, ctx: ParseCtx): Promise<ParsedFile> {
  const tmp = await mkdtemp(path.join(tmpdir(), 'reachy-mp4-'));
  try {
    const inputPath = path.join(tmp, 'input.mp4');
    await writeFile(inputPath, buffer);
    const framesDir = path.join(tmp, 'frames');
    await mkdir(framesDir, { recursive: true });

    const durationSec = await ffprobeDuration(inputPath);
    const frameCount = Math.min(MAX_KEYFRAMES_PER_VIDEO, Math.max(1, Math.floor(durationSec / 2)));
    const intervalSec = durationSec > 0 ? durationSec / (frameCount + 1) : 1;

    await runFfmpeg([
      '-y',
      '-i',
      inputPath,
      '-vf',
      `fps=1/${intervalSec.toFixed(3)},scale=720:-2`,
      '-frames:v',
      String(frameCount),
      '-q:v',
      '4',
      path.join(framesDir, 'frame-%03d.jpg'),
    ]);

    const images: ParsedImage[] = [];
    for (let i = 1; i <= frameCount; i++) {
      const framePath = path.join(framesDir, `frame-${String(i).padStart(3, '0')}.jpg`);
      let buf: Buffer;
      try {
        buf = await readFile(framePath);
      } catch {
        break; // ffmpeg produced fewer than expected; stop cleanly
      }
      const id = hashContent(buf);
      const persisted = await persistExtractedImage({
        buffer: buf,
        mime: 'image/jpeg',
        filename: `${hashContent(filename)}-keyframe-${i}-${id}`,
        prefix: ctx.extractedPrefix,
        source: `${filename} · keyframe ${i}`,
        hint: `t≈${(intervalSec * i).toFixed(1)}s`,
      });
      images.push(persisted);
    }

    return {
      filename,
      bytes: buffer.byteLength,
      textBlocks: [
        {
          source: filename,
          content: `[video] duration≈${durationSec.toFixed(1)}s · ${images.length} keyframes extracted`,
        },
      ],
      images,
    };
  } finally {
    await rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}

async function ffprobeDuration(filePath: string): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      filePath,
    ]);
    let out = '';
    child.stdout.on('data', (d) => {
      out += d.toString();
    });
    child.on('close', () => {
      const v = Number.parseFloat(out.trim());
      resolve(Number.isFinite(v) && v > 0 ? v : 0);
    });
    child.on('error', () => resolve(0));
  });
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', args, { stdio: 'ignore' });
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}`));
    });
    child.on('error', (err) => reject(err));
  });
}
