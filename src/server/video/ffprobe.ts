import 'server-only';
import { spawn } from 'node:child_process';

export interface ProbeResult {
  /** Container duration in seconds (real, not planned). */
  durationSec: number;
  width: number;
  height: number;
  fps: number;
  videoCodec: string;
  audioCodec: string | null;
  /** Bytes per the container header (matches the file size on disk). */
  bytes: number;
}

interface RawStream {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  duration?: string;
  r_frame_rate?: string;
}

interface RawFormat {
  duration?: string;
  size?: string;
}

interface RawProbe {
  streams?: RawStream[];
  format?: RawFormat;
}

/**
 * Spawn `ffprobe` against a local MP4/image and return its real container
 * stats. Used by the worker to record asset.duration_sec from the actual
 * output instead of the planned total — that mismatch is what hid the
 * silent 7s truncation across 3 reels (see planning/DIAGNOSTIC-LAST-REEL.md).
 *
 * `ffprobe` is shipped alongside `ffmpeg` and is available wherever
 * fluent-ffmpeg works — both `pnpm dev` and the worker rely on it.
 */
export async function ffprobe(filePath: string): Promise<ProbeResult> {
  const startedAt = Date.now();
  // debug-trace: pre-check that the file actually exists before probing.
  // If it doesn't, ffprobe will fail with a less-obvious error and we'd
  // miss the real issue (e.g. tmp-dir-was-cleaned-up race).
  let exists = false;
  let sizeBytes = 0;
  try {
    const { stat } = await import('node:fs/promises');
    const info = await stat(filePath);
    exists = info.isFile();
    sizeBytes = info.size;
  } catch {
    // exists stays false
  }
  console.log(
    `[reachy:debug-trace] ffprobe enter path=${filePath} exists=${exists} sizeBytes=${sizeBytes}`,
  );
  if (!exists) {
    throw new Error(`ffprobe: file not found at ${filePath}`);
  }
  return new Promise((resolve, reject) => {
    const argv = ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', filePath];
    console.log(`[reachy:debug-trace] ffprobe spawn ffprobe ${argv.join(' ')}`);
    const child = spawn('ffprobe', argv);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('close', (code) => {
      const elapsedMs = Date.now() - startedAt;
      console.log(
        `[reachy:debug-trace] ffprobe close path=${filePath} exitCode=${code} elapsedMs=${elapsedMs}`,
      );
      if (code !== 0) {
        const tail = stderr.split('\n').slice(-5).join(' | ');
        console.warn(`[reachy:debug-trace] ffprobe stderr tail: ${tail}`);
        reject(new Error(`ffprobe failed (code ${code}): ${stderr.trim()}`));
        return;
      }
      try {
        const json = JSON.parse(stdout) as RawProbe;
        const streams = json.streams ?? [];
        const v = streams.find((s) => s.codec_type === 'video');
        const a = streams.find((s) => s.codec_type === 'audio');
        const durationSec = Number(json.format?.duration ?? v?.duration ?? 0);
        // r_frame_rate is "num/den" (e.g. "30/1"). Default to 30 if absent.
        const [numStr, denStr] = (v?.r_frame_rate ?? '30/1').split('/');
        const num = Number(numStr);
        const den = Number(denStr);
        const fps = den > 0 && Number.isFinite(num / den) ? num / den : 30;
        resolve({
          durationSec,
          width: v?.width ?? 0,
          height: v?.height ?? 0,
          fps,
          videoCodec: v?.codec_name ?? 'unknown',
          audioCodec: a?.codec_name ?? null,
          bytes: Number(json.format?.size ?? 0),
        });
      } catch (err) {
        reject(new Error(`ffprobe parse failed: ${(err as Error).message}`));
      }
    });
    child.on('error', reject);
  });
}
