import 'server-only';
import { getFal } from '@/server/ai/fal';

/**
 * Default fal.ai model for text-to-video reels in 9:16. Veo 3.1 Fast as of
 * May 2026: 720p, 24fps. Pricing with audio is $0.15/sec (text-to-video).
 * Supported durations are 4 / 6 / 8 seconds — passing any other value to
 * submitVeo is rejected by the fal API. See:
 *   https://fal.ai/models/fal-ai/veo3.1/fast/api
 *   https://fal.ai/models/fal-ai/veo3.1/fast (pricing)
 *
 * We picked Fast over Standard because Standard's $0.40/sec made every
 * Visual reel cost $3.20 — too expensive for indie iteration. Quality
 * difference is noticeable but acceptable.
 */
export const DEFAULT_VEO_MODEL = 'fal-ai/veo3.1/fast';

/** Veo 3.1 Fast valid duration steps. submitVeo snaps to the nearest one. */
export const VEO_VALID_DURATIONS = [4, 6, 8] as const;

/** Cost in USD cents per generated second (Fast tier, with audio). */
export const VEO_CENTS_PER_SEC = 15;

/** Legacy alias — older call sites reference VEO_FAST_CENTS_PER_SEC. */
export const VEO_FAST_CENTS_PER_SEC = VEO_CENTS_PER_SEC;

/** Snap an arbitrary duration to the nearest fal-supported Veo step. */
export function snapVeoDuration(seconds: number): 4 | 6 | 8 {
  const candidates = VEO_VALID_DURATIONS;
  let best: 4 | 6 | 8 = candidates[0];
  let bestDelta = Math.abs(seconds - candidates[0]);
  for (const c of candidates) {
    const d = Math.abs(seconds - c);
    if (d < bestDelta) {
      best = c;
      bestDelta = d;
    }
  }
  return best;
}

export interface VeoSubmitArgs {
  prompt: string;
  /** 9:16 for reels; 16:9 for landscape video. */
  aspectRatio: '9:16' | '16:9';
  /** Must be one of VEO_VALID_DURATIONS (4/6/8). The caller should snap. */
  durationSec: 4 | 6 | 8;
  model?: string;
}

export interface VeoSubmitOk {
  requestId: string;
  model: string;
}

interface FalQueueClient {
  submit(
    endpointId: string,
    options: { input: Record<string, unknown> },
  ): Promise<{ request_id: string }>;
  status(
    endpointId: string,
    options: { requestId: string; logs?: boolean },
  ): Promise<{
    status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | string;
    queue_position?: number;
    logs?: Array<{ message?: string }>;
  }>;
  result(
    endpointId: string,
    options: { requestId: string },
  ): Promise<{ data?: { video?: { url?: string } } }>;
}

function asQueueClient(): FalQueueClient {
  const fal = getFal() as unknown as { queue: FalQueueClient };
  if (!fal.queue || typeof fal.queue.submit !== 'function') {
    throw new Error(
      'fal.ai client missing queue API. Update @fal-ai/client to a version that exposes fal.queue.submit/status/result.',
    );
  }
  return fal.queue;
}

/**
 * Kick off a Veo generation. Returns the fal request id immediately; the
 * caller polls `pollVeo` until status === 'COMPLETED' or 'FAILED'.
 *
 * We use the queue API (not `subscribe`) because Veo generations take
 * 60–300s — too long to hold a BullMQ worker slot blocked on a single HTTP
 * request. The worker polls every 6s until done. Webhook delivery would be
 * faster but requires a public ingress; deferred to Phase 08.
 */
export async function submitVeo(args: VeoSubmitArgs): Promise<VeoSubmitOk> {
  const model = args.model ?? DEFAULT_VEO_MODEL;
  const queue = asQueueClient();
  const { request_id } = await queue.submit(model, {
    input: {
      prompt: args.prompt,
      aspect_ratio: args.aspectRatio,
      duration: args.durationSec,
      // Veo 3.1 Standard generates synchronized dialogue/SFX/ambient. Without
      // this flag fal returns a silent clip — losing the headline reason for
      // picking Veo over FFmpeg + TTS in the first place.
      generate_audio: true,
    },
  });
  return { requestId: request_id, model };
}

export interface VeoStatus {
  state: 'queued' | 'running' | 'done' | 'failed';
  queuePosition?: number;
  videoUrl?: string;
  errorMessage?: string;
}

export async function pollVeo(model: string, requestId: string): Promise<VeoStatus> {
  const queue = asQueueClient();
  try {
    const status = await queue.status(model, { requestId, logs: true });
    if (status.status === 'COMPLETED') {
      const result = await queue.result(model, { requestId });
      const url = result.data?.video?.url;
      if (!url) {
        return { state: 'failed', errorMessage: 'COMPLETED without video.url' };
      }
      return { state: 'done', videoUrl: url };
    }
    if (status.status === 'FAILED') {
      const last = status.logs?.[status.logs.length - 1]?.message ?? 'fal returned FAILED';
      return { state: 'failed', errorMessage: last };
    }
    if (status.status === 'IN_PROGRESS') {
      return { state: 'running' };
    }
    return { state: 'queued', queuePosition: status.queue_position };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { state: 'failed', errorMessage: msg };
  }
}

export interface DownloadResult {
  buffer: Buffer;
  contentType: string;
  bytes: number;
}

/**
 * fal.ai serves Veo outputs from `*.fal.media` / `fal.media`. We never let an
 * arbitrary URL through — even though the URL comes back from our own polling
 * loop, defense-in-depth keeps an SSRF chain (compromised fal upstream, MITM
 * on the queue response, future webhook flow) from turning the worker into a
 * proxy onto the cluster's internal network.
 */
const ALLOWED_VEO_HOSTS = /(^|\.)fal\.media$/i;

function assertVeoHost(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('downloadVeoVideo: invalid URL');
  }
  if (parsed.protocol !== 'https:') {
    throw new Error(`downloadVeoVideo: refusing non-https url (${parsed.protocol})`);
  }
  if (!ALLOWED_VEO_HOSTS.test(parsed.hostname)) {
    throw new Error(`downloadVeoVideo: refusing host ${parsed.hostname}`);
  }
  return parsed;
}

export async function downloadVeoVideo(url: string): Promise<DownloadResult> {
  assertVeoHost(url);
  const res = await fetch(url, { redirect: 'error' });
  if (!res.ok) {
    throw new Error(`Download failed: ${res.status} ${res.statusText}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  return {
    buffer,
    contentType: res.headers.get('content-type') ?? 'video/mp4',
    bytes: buffer.length,
  };
}
