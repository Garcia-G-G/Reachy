import 'server-only';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { UnrecoverableError, Worker } from 'bullmq';
import { eq } from 'drizzle-orm';
import { REEL_DIMENSIONS } from '@/lib/reel-templates';
import { db } from '@/server/db/client';
import { asset } from '@/server/db/schema/assets';
import { generation } from '@/server/db/schema/generations';
import { putR2 } from '@/server/storage/r2';
import { composeReel } from '@/server/video/compose';
import { ensureFfmpeg } from '@/server/video/ensureFfmpeg';
import { downloadVeoVideo, pollVeo, submitVeo } from '@/server/video/falVideo';
import { createBullConnection, QUEUE_NAMES } from './connection';
import type { VideoGenJobData } from './videoQueue';

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
        const out = engine === 'veo' ? await runVeo(job.data) : await runFfmpeg(job.data);

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

async function runFfmpeg(data: VideoGenJobData): Promise<EngineResult> {
  const tmp = await mkdtemp(join(tmpdir(), 'reachy-reel-'));
  try {
    // Pull the per-scene images from R2 to temp files. The compositor needs
    // local paths because fluent-ffmpeg passes them straight to the binary.
    const scenes = await Promise.all(
      data.plan.scenes.map(async (scene, i) => {
        if (scene.background === 'brand') {
          return { imagePath: undefined, text: scene.text, scene };
        }
        const url = data.sceneImageUrls?.[i];
        if (!url) {
          throw new Error(
            `runFfmpeg: image URL missing for scene ${i + 1} (${scene.slot}). Generate the image first.`,
          );
        }
        const res = await fetch(url);
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
    });

    const buffer = await readFile(outputPath);
    const totalDur = data.plan.scenes.reduce((sum, s) => sum + s.durationSec, 0);
    return { buffer, bytes: buffer.length, durationSec: totalDur, costCents: 1 };
  } finally {
    await rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}

async function runVeo(data: VideoGenJobData): Promise<EngineResult> {
  const totalDur = data.plan.scenes.reduce((sum, s) => sum + s.durationSec, 0);
  // Compose one big prompt from the planned scenes — Veo doesn't accept a
  // multi-scene structured input. We narrate the reel as a single shot.
  const prompt = [
    `Vertical 9:16 marketing reel for "${data.plan.tagline}". Editorial photography aesthetic.`,
    ...data.plan.scenes.map(
      (s, i) => `Beat ${i + 1} (${s.durationSec}s, ${s.slot}): ${s.imagePrompt || s.text}`,
    ),
    'No text overlays. No watermark. Smooth cinematic motion.',
  ].join('\n');

  const submission = await submitVeo({
    prompt,
    aspectRatio: '9:16',
    durationSec: Math.min(totalDur, 10),
    model: data.veoModel,
  });

  const start = Date.now();
  while (Date.now() - start < VEO_POLL_TIMEOUT_MS) {
    await new Promise((r) => setTimeout(r, VEO_POLL_INTERVAL_MS));
    const status = await pollVeo(submission.model, submission.requestId);
    if (status.state === 'done' && status.videoUrl) {
      const dl = await downloadVeoVideo(status.videoUrl);
      // Veo 3.1 Fast pricing: ~$0.05/sec generated. Returned cents.
      const costCents = Math.max(1, Math.round(totalDur * 5));
      return { buffer: dl.buffer, bytes: dl.bytes, durationSec: totalDur, costCents };
    }
    if (status.state === 'failed') {
      throw new Error(`Veo failed: ${status.errorMessage ?? 'unknown'}`);
    }
  }
  throw new Error(`Veo timed out after ${VEO_POLL_TIMEOUT_MS / 1000}s`);
}
