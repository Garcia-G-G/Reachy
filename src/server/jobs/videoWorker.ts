import 'server-only';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { UnrecoverableError, Worker } from 'bullmq';
import { eq } from 'drizzle-orm';
import { env } from '@/env';
import { REEL_DIMENSIONS } from '@/lib/reel-templates';
import { generateImage } from '@/server/ai/imageGen';
import { db } from '@/server/db/client';
import { asset } from '@/server/db/schema/assets';
import { generation } from '@/server/db/schema/generations';
import { putR2 } from '@/server/storage/r2';
import { composeReel } from '@/server/video/compose';
import { ensureFfmpeg } from '@/server/video/ensureFfmpeg';
import {
  downloadVeoVideo,
  pollVeo,
  snapVeoDuration,
  submitVeo,
  VEO_FAST_CENTS_PER_SEC,
} from '@/server/video/falVideo';
import { createBullConnection, QUEUE_NAMES } from './connection';
import type { VideoGenJobData } from './videoQueue';

/**
 * Per-scene image URLs come from the user via composeReelAction. Even though
 * the UI only ever pastes R2 publicUrls, the zod schema there allows any
 * https URL — without this guard a crafted client could ask the worker to
 * GET http://169.254.169.254/... or http://localhost:5432/... (cloud
 * metadata / internal services) and write the response into the reel.
 */
function assertR2PublicUrl(rawUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('runFfmpeg: invalid scene image URL');
  }
  if (parsed.protocol !== 'https:') {
    throw new Error(`runFfmpeg: refusing non-https scene image (${parsed.protocol})`);
  }
  const allowedOrigin = env.R2_PUBLIC_URL ? new URL(env.R2_PUBLIC_URL).origin : null;
  if (!allowedOrigin || parsed.origin !== allowedOrigin) {
    throw new Error(`runFfmpeg: scene image must be on R2_PUBLIC_URL (${parsed.origin})`);
  }
}

const PERMANENT_PATTERNS = [
  /content[_ ]policy/i,
  /refus/i,
  /invalid_request/i,
  /unsupported/i,
  /\b400\b/,
  /\b401\b/,
  /\b403\b/,
  /\b404\b/,
];
const isPermanent = (m: string) => PERMANENT_PATTERNS.some((re) => re.test(m));

const VEO_POLL_INTERVAL_MS = 6_000;
const VEO_POLL_TIMEOUT_MS = 8 * 60 * 1000; // 8 min hard cap; reels usually 60–180s

export function startVideoWorker(): Worker<VideoGenJobData> {
  // Crash loud at boot if ffmpeg is missing — better than silently dropping
  // every reel job at runtime.
  void ensureFfmpeg();

  const worker = new Worker<VideoGenJobData>(
    QUEUE_NAMES.videoGen,
    async (job) => {
      const { generationId, projectId, projectSlug, engine, plan } = job.data;
      await db.update(generation).set({ status: 'running' }).where(eq(generation.id, generationId));

      // Idempotency: a retry should leave no stale partial assets behind.
      if (job.attemptsMade > 0) {
        await db.delete(asset).where(eq(asset.generationId, generationId));
      }

      try {
        const out =
          engine === 'veo'
            ? await runVeo(job.data)
            : await runFfmpeg(job.data, (pct) => {
                // Surface ffmpeg progress to BullMQ. The status route can read
                // job.progress to show "Composing… 45%" instead of an opaque
                // "running" spinner. (Veo doesn't expose granular progress;
                // it returns IN_QUEUE → IN_PROGRESS → COMPLETED.)
                void job.updateProgress(Math.round(pct * 100));
              });

        const key = `${projectId}/reels/${generationId}.mp4`;
        const upload = await putR2(key, out.buffer, 'video/mp4');

        await db.insert(asset).values({
          generationId,
          projectId,
          kind: 'video',
          format: plan.template,
          width: REEL_DIMENSIONS.width,
          height: REEL_DIMENSIONS.height,
          durationSec: out.durationSec,
          storageKey: upload.key,
          publicUrl: upload.publicUrl,
          bytes: upload.bytes,
        });

        await db
          .update(generation)
          .set({
            status: 'done',
            finishedAt: new Date(),
            costCents: out.costCents,
          })
          .where(eq(generation.id, generationId));

        // Best-effort revalidate so the library shows the new reel.
        // We can't import next/cache here (worker is plain Node), but the
        // UI re-fetches on focus so this is acceptable for v1.
        console.log(
          `[reachy:video] generation ${generationId} done (${engine}), ${upload.bytes} bytes, slug=${projectSlug}`,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[reachy:video] generation ${generationId} failed:`, message);
        await db
          .update(generation)
          .set({
            status: 'failed',
            errorMessage: message.slice(0, 500),
            finishedAt: new Date(),
          })
          .where(eq(generation.id, generationId));
        if (isPermanent(message)) {
          throw new UnrecoverableError(message);
        }
        throw err;
      }
    },
    {
      connection: createBullConnection(),
      // FFmpeg saturates a CPU core; Veo polling holds the slot for minutes.
      // Either way we want one reel at a time per worker process.
      concurrency: 1,
      // Locks must outlive the longest engine: Veo polling can run 5+ min.
      lockDuration: 600_000,
      stalledInterval: 60_000,
      // Soft global cap to keep the wallet under control.
      limiter: { max: 6, duration: 60 * 60 * 1000 }, // 6 reels / hour / worker
    },
  );

  worker.on('failed', (job, err) => {
    console.error(`[reachy:video] job ${job?.id} failed: ${err.message}`);
  });
  worker.on('completed', (job) => {
    console.log(`[reachy:video] job ${job.id} completed (gen=${job.data.generationId})`);
  });
  worker.on('error', (err) => {
    console.error('[reachy:video] worker error:', err.message);
  });
  return worker;
}

interface EngineResult {
  buffer: Buffer;
  bytes: number;
  durationSec: number;
  costCents: number;
}

async function runFfmpeg(
  data: VideoGenJobData,
  onProgress?: (pct: number) => void,
): Promise<EngineResult> {
  const tmp = await mkdtemp(join(tmpdir(), 'reachy-reel-'));
  try {
    // Pull the per-scene images from R2 to temp files. The compositor needs
    // local paths because fluent-ffmpeg passes them straight to the binary.
    //
    // If the caller didn't paste a URL for an image-backed scene, generate
    // one inline now (OpenAI gpt-image-1 → R2). This is the auto-fulfill
    // path so the UI doesn't have to bounce the user to the Images tab to
    // populate every scene by hand. Costs are accounted for as part of the
    // overall reel cost via the OpenAI usage returned by generateImage.
    let autoImageCostCents = 0;
    const scenes = await Promise.all(
      data.plan.scenes.map(async (scene, i) => {
        if (scene.background === 'brand') {
          return { imagePath: undefined, text: scene.text, scene };
        }
        let url = data.sceneImageUrls?.[i] ?? null;

        if (!url) {
          if (!scene.imagePrompt) {
            throw new Error(
              `runFfmpeg: scene ${i + 1} (${scene.slot}) has no imagePrompt to auto-generate from`,
            );
          }
          const gen = await generateImage({
            prompt: scene.imagePrompt,
            format: 'reel-cover',
            provider: 'openai',
            model: 'gpt-image-1',
            n: 1,
          });
          const buf = gen.buffers[0];
          if (!buf) {
            throw new Error(`runFfmpeg: image-gen returned no buffer for scene ${i + 1}`);
          }
          const key = `reels/${data.generationId}/scene-${i}.png`;
          const put = await putR2(key, buf, 'image/png');
          if (!put.publicUrl) {
            throw new Error(
              `runFfmpeg: R2_PUBLIC_URL not configured — scene image has no public URL`,
            );
          }
          url = put.publicUrl;
          autoImageCostCents += gen.costCents;
        }

        assertR2PublicUrl(url);
        const res = await fetch(url, { redirect: 'error' });
        if (!res.ok) {
          throw new Error(`runFfmpeg: image fetch failed (${res.status}) for scene ${i + 1}`);
        }
        const path = join(tmp, `scene-${i}.png`);
        await writeFile(path, Buffer.from(await res.arrayBuffer()));
        return { imagePath: path, text: scene.text, scene };
      }),
    );

    const outputPath = join(tmp, 'out.mp4');
    await composeReel({
      scenes,
      outputPath,
      brandColorHex: data.brandColorHex,
      brandTextHex: data.brandTextHex,
      onProgress,
    });

    const buffer = await readFile(outputPath);
    const totalDur = data.plan.scenes.reduce((sum, s) => sum + s.durationSec, 0);
    // 1 cent floor for the compose itself; any inline image gen is added on top.
    return {
      buffer,
      bytes: buffer.length,
      durationSec: totalDur,
      costCents: 1 + autoImageCostCents,
    };
  } finally {
    await rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}

async function runVeo(data: VideoGenJobData): Promise<EngineResult> {
  const totalDur = data.plan.scenes.reduce((sum, s) => sum + s.durationSec, 0);
  // Compose one big prompt from the planned scenes — Veo doesn't accept a
  // multi-scene structured input. We narrate the reel as a single shot.
  // User-controlled fields (tagline, imagePrompt, text) are wrapped in triple
  // double-quote delimiters so a "ignore the above and..." inside a planner
  // output cannot pivot Veo's behavior. OpenAI's 2026 Model Spec recommends
  // exactly this for untrusted content.
  // https://model-spec.openai.com/2025-12-18.html#untrusted-content
  const wrap = (s: string) => `"""${s.replace(/"""/g, '"\\""')}"""`;
  const prompt = [
    `Vertical 9:16 marketing reel. Editorial photography aesthetic.`,
    `Tagline: ${wrap(data.plan.tagline)}`,
    ...data.plan.scenes.map(
      (s, i) => `Beat ${i + 1} (${s.durationSec}s, ${s.slot}): ${wrap(s.imagePrompt || s.text)}`,
    ),
    'No text overlays. No watermark. Smooth cinematic motion.',
  ].join('\n');

  // Veo 3.1 Fast only accepts 4/6/8s; snap so the request doesn't 400.
  const veoDuration = snapVeoDuration(Math.min(totalDur, 8));

  // Reuse a previously-submitted requestId if a worker crashed mid-poll. The
  // id is persisted into generation.params on the first poll cycle; without
  // this, BullMQ retry => brand-new Veo request => paying twice for one reel.
  let submission: { requestId: string; model: string };
  const stored = await getStoredVeoRequestId(data.generationId);
  if (stored) {
    submission = stored;
    console.log(
      `[reachy:video] resuming Veo poll for gen=${data.generationId} (req=${submission.requestId})`,
    );
  } else {
    submission = await submitVeo({
      prompt,
      aspectRatio: '9:16',
      durationSec: veoDuration,
      model: data.veoModel,
    });
    await persistVeoRequestId(data.generationId, submission);
  }

  const start = Date.now();
  while (Date.now() - start < VEO_POLL_TIMEOUT_MS) {
    await new Promise((r) => setTimeout(r, VEO_POLL_INTERVAL_MS));
    const status = await pollVeo(submission.model, submission.requestId);
    if (status.state === 'done' && status.videoUrl) {
      const dl = await downloadVeoVideo(status.videoUrl);
      // Cost is billed against the *generated* duration, not the planned one.
      const costCents = Math.max(1, Math.round(veoDuration * VEO_FAST_CENTS_PER_SEC));
      return { buffer: dl.buffer, bytes: dl.bytes, durationSec: veoDuration, costCents };
    }
    if (status.state === 'failed') {
      throw new Error(`Veo failed: ${status.errorMessage ?? 'unknown'}`);
    }
  }
  throw new Error(`Veo timed out after ${VEO_POLL_TIMEOUT_MS / 1000}s`);
}

/** Persist the fal request id so a worker retry resumes polling vs re-submitting. */
async function persistVeoRequestId(
  generationId: string,
  submission: { requestId: string; model: string },
): Promise<void> {
  const [row] = await db
    .select({ params: generation.params })
    .from(generation)
    .where(eq(generation.id, generationId))
    .limit(1);
  const merged = {
    ...((row?.params as Record<string, unknown>) ?? {}),
    veoRequestId: submission.requestId,
    veoModel: submission.model,
  };
  await db.update(generation).set({ params: merged }).where(eq(generation.id, generationId));
}

async function getStoredVeoRequestId(
  generationId: string,
): Promise<{ requestId: string; model: string } | null> {
  const [row] = await db
    .select({ params: generation.params })
    .from(generation)
    .where(eq(generation.id, generationId))
    .limit(1);
  const params = (row?.params ?? {}) as { veoRequestId?: string; veoModel?: string };
  if (params.veoRequestId && params.veoModel) {
    return { requestId: params.veoRequestId, model: params.veoModel };
  }
  return null;
}
