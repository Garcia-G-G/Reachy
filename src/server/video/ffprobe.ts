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
  // Pre-check: if the file was reaped by an engine's `finally { rm(tmp) }`
  // cleanup before we got here, ffprobe's error would be opaque. Throw a
  // clean "file not found" up the call stack so the race regression
  // (fixed in 1e9aded) stays visible if it ever returns.
  let exists = false;
  try {
    const { stat } = await import('node:fs/promises');
    const info = await stat(filePath);
    exists = info.isFile();
  } catch {
    // exists stays false
  }
  if (!exists) {
    throw new Error(`ffprobe: file not found at ${filePath}`);
  }
  return new Promise((resolve, reject) => {
    const argv = [
      '-v',
      'error',
      '-print_format',
      'json',
      '-show_format',
      '-show_streams',
      filePath,
    ];
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
      if (code !== 0) {
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
