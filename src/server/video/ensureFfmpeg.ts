import 'server-only';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

let cached: { ok: true; version: string } | { ok: false; error: string } | null = null;

/**
 * Resolve the system ffmpeg binary and surface a clean error if it's missing.
 * The video worker calls this on boot so a misconfigured environment fails
 * loud instead of silently dropping reel jobs.
 */
export async function ensureFfmpeg(): Promise<{ version: string }> {
  if (cached?.ok) return { version: cached.version };
  try {
    const { stdout } = await execAsync('ffmpeg -version');
    const versionLine = stdout.split('\n', 1)[0]?.trim() ?? 'unknown';
    cached = { ok: true, version: versionLine };
    return { version: versionLine };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    cached = { ok: false, error };
    throw new Error(
      `ffmpeg binary not found on PATH. Install it (brew install ffmpeg / apt install ffmpeg) before running the video worker. ${error}`,
    );
  }
}

export function ffmpegStatus(): typeof cached {
  return cached;
}
