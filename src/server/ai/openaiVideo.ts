import 'server-only';
import { getOpenAI } from './openai';

/**
 * Sora 2 video generation via the same OPENAI_API_KEY (no fal.ai). Pricing
 * confirmed via OpenAI developer docs (May 2026):
 *
 *   sora-2        @ 720p (720x1280 or 1280x720) → $0.10/s
 *   sora-2-pro    @ 720p                         → $0.30/s
 *   sora-2-pro    @ 1024p (1024x1792)            → $0.50/s   (not exposed)
 *
 * DEPRECATION: per OpenAI's docs the Sora 2 Videos API is announced to
 * sunset on 2026-09-24. We are intentionally building on a finite-runway
 * surface to ship the demo and early customers; the ReelEngine abstraction
 * lets us swap the provider later with localized changes (see
 * src/lib/reel-templates.ts and src/server/jobs/videoWorker.ts).
 *
 * The OpenAI SDK shape we rely on:
 *   • client.videos.create({ model, prompt, size, seconds })  -> Video
 *   • client.videos.retrieve(id)                              -> Video
 *   • client.videos.downloadContent(id, { variant: 'video' }) -> Response
 *
 * MP4 bytes do NOT come as a public URL — they stream from an authenticated
 * SDK call. We therefore don't need the SSRF host allowlist that
 * src/server/video/falVideo.ts has for fal.media.
 */

export const SORA_MODELS = ['sora-2', 'sora-2-pro'] as const;
export type SoraModel = (typeof SORA_MODELS)[number];

/** Sora-supported clip durations. The SDK types these as string literals. */
export const SORA_VALID_DURATIONS = [4, 8, 12] as const;
export type SoraDuration = (typeof SORA_VALID_DURATIONS)[number];

/** Cents per generated second, by model, at 720p. */
export const SORA_CENTS_PER_SEC: Record<SoraModel, number> = {
  'sora-2': 10,
  'sora-2-pro': 30,
};

/** Snap any requested length to the nearest supported Sora step. Ties round up. */
export function snapSoraDuration(seconds: number): SoraDuration {
  let best: SoraDuration = SORA_VALID_DURATIONS[0];
  let bestDelta = Math.abs(seconds - best);
  for (const candidate of SORA_VALID_DURATIONS) {
    const delta = Math.abs(seconds - candidate);
    if (delta < bestDelta || (delta === bestDelta && candidate > best)) {
      best = candidate;
      bestDelta = delta;
    }
  }
  return best;
}

export function soraCostCents(model: SoraModel, seconds: number): number {
  return Math.max(1, Math.round(SORA_CENTS_PER_SEC[model] * seconds));
}

export interface SoraSubmitArgs {
  model: SoraModel;
  prompt: string;
  /** Only 9:16 portrait for reels right now. */
  aspectRatio: '9:16';
  durationSec: SoraDuration;
}

export interface SoraJob {
  jobId: string;
  model: SoraModel;
  /** Echo back the duration so the caller can bill exactly what was requested. */
  durationSec: SoraDuration;
}

export interface SoraStatus {
  state: 'queued' | 'running' | 'done' | 'failed';
  /** 0–100, surfaced for UI progress when the API reports it. */
  progress?: number;
  errorMessage?: string;
}

/** Kick off a Sora generation. Returns the job id immediately. */
export async function submitSora(args: SoraSubmitArgs): Promise<SoraJob> {
  const openai = getOpenAI();
  // SDK requires VideoSeconds as a string literal ('4' | '8' | '12').
  const seconds = String(args.durationSec) as '4' | '8' | '12';
  // VideoSize: '720x1280' is 9:16 portrait. 1280x720 would be 16:9.
  const size = args.aspectRatio === '9:16' ? '720x1280' : '1280x720';
  const startedAt = Date.now();
  console.log(
    `[reachy:debug-trace] submitSora -> openai.videos.create model=${args.model} size=${size} seconds=${seconds} promptBytes=${args.prompt.length}`,
  );
  try {
    const video = await openai.videos.create({
      model: args.model,
      prompt: args.prompt,
      seconds,
      size,
    });
    console.log(
      `[reachy:debug-trace] submitSora ok jobId=${video.id} elapsedMs=${Date.now() - startedAt}`,
    );
    return { jobId: video.id, model: args.model, durationSec: args.durationSec };
  } catch (err) {
    console.error(
      `[reachy:debug-trace] submitSora failed elapsedMs=${Date.now() - startedAt} err=${(err as Error).message}`,
    );
    throw err;
  }
}

/** Poll a Sora job. State maps the SDK status to our internal enum. */
export async function pollSora(job: SoraJob): Promise<SoraStatus> {
  const openai = getOpenAI();
  const startedAt = Date.now();
  try {
    const video = await openai.videos.retrieve(job.jobId);
    console.log(
      `[reachy:debug-trace] pollSora jobId=${job.jobId} status=${video.status} progress=${video.progress ?? 'n/a'}% elapsedMs=${Date.now() - startedAt}`,
    );
    if (video.status === 'completed') return { state: 'done', progress: 100 };
    if (video.status === 'failed') {
      return { state: 'failed', errorMessage: video.error?.message ?? 'sora returned failed' };
    }
    if (video.status === 'in_progress') return { state: 'running', progress: video.progress };
    return { state: 'queued', progress: video.progress };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[reachy:debug-trace] pollSora threw jobId=${job.jobId} elapsedMs=${Date.now() - startedAt} err=${message}`,
    );
    return { state: 'failed', errorMessage: message };
  }
}

/**
 * Download the rendered MP4 bytes for a completed job. Unlike Veo (public
 * fal.media URL) the Sora response is an authenticated SDK stream, so
 * there is no URL to validate — the SDK only accepts our own job id.
 */
export async function downloadSora(jobId: string): Promise<{ buffer: Buffer; bytes: number }> {
  const openai = getOpenAI();
  const startedAt = Date.now();
  console.log(`[reachy:debug-trace] downloadSora -> openai.videos.downloadContent jobId=${jobId}`);
  const response = await openai.videos.downloadContent(jobId, { variant: 'video' });
  console.log(
    `[reachy:debug-trace] downloadSora response status=${response.status} contentLength=${response.headers.get('content-length') ?? 'n/a'} contentType=${response.headers.get('content-type') ?? 'n/a'}`,
  );
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  console.log(
    `[reachy:debug-trace] downloadSora ok jobId=${jobId} bytes=${buffer.length} elapsedMs=${Date.now() - startedAt}`,
  );
  return { buffer, bytes: buffer.length };
}
