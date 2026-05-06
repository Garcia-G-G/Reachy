import 'server-only';
import { getFal } from '@/server/ai/fal';

/**
 * Default fal.ai model for text-to-video reels in 9:16. Veo 3.1 Fast as of
 * May 2026: 720p, 24fps, costs ~$0.05/sec. See:
 *   https://fal.ai/models/fal-ai/veo3.1/fast/api
 */
export const DEFAULT_VEO_MODEL = 'fal-ai/veo3.1/fast';

export interface VeoSubmitArgs {
  prompt: string;
  /** 9:16 for reels; 16:9 for landscape video. */
  aspectRatio: '9:16' | '16:9';
  /** Veo 3.1 supports 5–10s per generation (verify per model card). */
  durationSec: number;
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

export async function downloadVeoVideo(url: string): Promise<DownloadResult> {
  const res = await fetch(url);
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
