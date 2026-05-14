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

/** Output sizes the API supports today. We use the 9:16 portrait variants. */
export type SoraSize = '720x1280' | '1024x1792';

/** Sora-supported clip durations. The SDK types these as string literals. */
export const SORA_VALID_DURATIONS = [4, 8, 12] as const;
export type SoraDuration = (typeof SORA_VALID_DURATIONS)[number];

/**
 * Cents per generated second, by model AND output resolution. Sora 2 base
 * only supports 720p; Sora 2 Pro adds 1024p at a higher rate. We always
 * use the 9:16 portrait orientation, so the size values below stand for
 * 720x1280 and 1024x1792 respectively.
 */
export const SORA_CENTS_PER_SEC: Record<SoraModel, Record<'720' | '1024', number>> = {
  'sora-2': { '720': 10, '1024': 0 },
  'sora-2-pro': { '720': 30, '1024': 50 },
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

/**
 * Cost helper. Pass the resolution explicitly — Sora 2 Pro at 1024 is
 * 5/3 the rate of Sora 2 Pro at 720, so the model alone isn't enough.
 * Defaults to 720 for backwards compat.
 */
export function soraCostCents(
  model: SoraModel,
  seconds: number,
  res: '720' | '1024' = '720',
): number {
  const rate = SORA_CENTS_PER_SEC[model][res];
  if (rate === 0) {
    throw new Error(`Sora model '${model}' does not support resolution ${res}`);
  }
  return Math.max(1, Math.round(rate * seconds));
}

export interface SoraSubmitArgs {
  model: SoraModel;
  prompt: string;
  /** Only 9:16 portrait for reels right now. */
  aspectRatio: '9:16';
  durationSec: SoraDuration;
  /** Output resolution. Defaults to 720x1280; set 1024x1792 for the
   *  premium tier. Sora 2 Pro is the only model that accepts 1024x1792. */
  size?: SoraSize;
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
  // Premium tier passes 1024x1792 (only Sora 2 Pro supports it).
  const size = args.size ?? (args.aspectRatio === '9:16' ? '720x1280' : '1280x720');
  const video = await openai.videos.create({
    model: args.model,
    prompt: args.prompt,
    seconds,
    size,
  });
  return { jobId: video.id, model: args.model, durationSec: args.durationSec };
}

/** Poll a Sora job. State maps the SDK status to our internal enum. */
export async function pollSora(job: SoraJob): Promise<SoraStatus> {
  const openai = getOpenAI();
  try {
    const video = await openai.videos.retrieve(job.jobId);
    if (video.status === 'completed') return { state: 'done', progress: 100 };
    if (video.status === 'failed') {
      return { state: 'failed', errorMessage: video.error?.message ?? 'sora returned failed' };
    }
    if (video.status === 'in_progress') return { state: 'running', progress: video.progress };
    return { state: 'queued', progress: video.progress };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
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
  const response = await openai.videos.downloadContent(jobId, { variant: 'video' });
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  return { buffer, bytes: buffer.length };
}
