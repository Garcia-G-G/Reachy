import 'server-only';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { UnrecoverableError, Worker } from 'bullmq';
import { eq } from 'drizzle-orm';
import { env } from '@/env';
import type { ReelCostBreakdown } from '@/lib/reel-cost';
import { REEL_DIMENSIONS } from '@/lib/reel-templates';
import { generateImage } from '@/server/ai/imageGen';
import { getOpenAI } from '@/server/ai/openai';
import {
  downloadSora,
  pollSora,
  type SoraJob,
  type SoraModel,
  snapSoraDuration,
  soraCostCents,
  submitSora,
} from '@/server/ai/openaiVideo';
import { resolveVisualStyle } from '@/server/ai/visualStyles';
import { db } from '@/server/db/client';
import { asset } from '@/server/db/schema/assets';
import { generation } from '@/server/db/schema/generations';
import { putR2 } from '@/server/storage/r2';
import { composeReel } from '@/server/video/compose';
import { ensureFfmpeg } from '@/server/video/ensureFfmpeg';
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

const SORA_POLL_INTERVAL_MS = 6_000;
// 15 min total. Sora 2 Pro takes 2-5 min per scene; this also has to fit a
// possible moderation retry (resubmit takes another 2-5 min). If a reel
// runs longer than this we throw and let BullMQ retry resume polling from
// the persisted job ids.
const SORA_POLL_TIMEOUT_MS = 15 * 60 * 1000;

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
        const progressCb = (pct: number) => {
          // Surface ffmpeg progress to BullMQ. The status route can read
          // job.progress to show "Composing… 45%" instead of an opaque
          // "running" spinner. (Sora reports its own progress while
          // generating; we map it onto the same 0-100 scale.)
          void job.updateProgress(Math.round(pct * 100));
        };
        const out =
          engine === 'ffmpeg'
            ? await runFfmpeg(job.data, progressCb)
            : await runSora(job.data, progressCb);

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

        // Merge costBreakdown into existing params (which already holds
        // engine + plan from composeReelAction and, for sora-* engines,
        // soraJobs from the resumption path). The status API reads
        // params.costBreakdown so the done panel can show component costs.
        const [existing] = await db
          .select({ params: generation.params })
          .from(generation)
          .where(eq(generation.id, generationId))
          .limit(1);
        const mergedParams = {
          ...((existing?.params as Record<string, unknown>) ?? {}),
          costBreakdown: out.costBreakdown,
        };
        await db
          .update(generation)
          .set({
            status: 'done',
            finishedAt: new Date(),
            costCents: out.costCents,
            params: mergedParams,
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
  /** Per-component cost breakdown — same shape returned by estimateReelCost
   *  so the client and server agree on TTS / video-gen / image-gen / compose
   *  attribution. Persisted into generation.params.costBreakdown so the UI
   *  can show "Cost: $6.05 (Sora $6.00 · TTS $0.04 · compose $0.01)". */
  costBreakdown: ReelCostBreakdown;
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
          // Re-state the composition guarantee at the image model level —
          // diffusion models weight tail tokens more strongly than head, so
          // without these constraints the model occasionally crops faces
          // into the top 20% where the caption box lands.
          const composedPrompt = [
            scene.imagePrompt,
            'Vertical 9:16 composition (1080×1920).',
            'Subject sits in the central third; top 20% and bottom 25% remain visually quiet (no faces, no key product detail there).',
            'Modern editorial photography, no text, no watermark.',
          ].join(' ');
          // Inline scene images: fal.ai FLUX.2 [pro] — SOTA text-to-image
          // on fal as of May 2026, $0.04/image at $0.03/MP. Four scenes
          // per reel = ~16¢ images + 1¢ TTS + 1¢ compose ≈ $0.18 per reel.
          // Visible quality improvement over flux-2-flex: more consistent
          // lighting, less plastic-looking faces, sharper environmental
          // detail. Still ~10-15s per call, still parallelized.
          console.log(
            `[reachy:video] gen ${data.generationId} scene ${i + 1}/${data.plan.scenes.length} → generating image (fal flux-2-pro)…`,
          );
          const sceneStart = Date.now();
          const gen = await generateImage({
            prompt: composedPrompt,
            format: 'reel-cover',
            provider: 'fal',
            model: 'fal-ai/flux-2-pro',
            n: 1,
          });
          console.log(
            `[reachy:video] gen ${data.generationId} scene ${i + 1} image ready in ${Math.round((Date.now() - sceneStart) / 1000)}s`,
          );
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

    const tts = await renderSceneTts(data, tmp);

    const outputPath = join(tmp, 'out.mp4');
    await composeReel({
      scenes,
      outputPath,
      sceneAudios: tts.sceneAudios,
      brandColorHex: data.brandColorHex,
      brandTextHex: data.brandTextHex,
      visualStyle: data.visualStyle,
      onProgress,
    });

    const buffer = await readFile(outputPath);
    const totalDur = data.plan.scenes.reduce((sum, s) => sum + s.durationSec, 0);
    const costCents = 1 + autoImageCostCents + tts.ttsCostCents;
    return {
      buffer,
      bytes: buffer.length,
      durationSec: totalDur,
      costCents,
      costBreakdown: {
        cents: costCents,
        parts: { tts: tts.ttsCostCents, images: autoImageCostCents, compose: 1 },
      },
    };
  } finally {
    await rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Per-scene narration. Each scene's caption is rendered to its own MP3 so
 * the audio track stays synced with what's on screen. Best-effort: if any
 * TTS call fails we drop the whole audio track rather than ship a partial.
 *
 * Extracted so both runFfmpeg and runSora can share the same step — the
 * TTS pipeline is identical for both engines (only the visual source
 * differs).
 */
async function renderSceneTts(
  data: VideoGenJobData,
  tmp: string,
): Promise<{ sceneAudios: Array<string | null> | undefined; ttsCostCents: number }> {
  // gpt-4o-mini-tts (March 2025). `sage` is the editorial-warm voice that
  // handles Spanish phonemes natively; pace steered via `instructions`.
  const isEs = data.plan.language === 'es';
  const ttsVoice = 'sage' as const;
  const ttsInstructions = isEs
    ? 'Voz de narrador editorial cálido y natural. Ritmo conversacional, NO lento, con pausas naturales solo entre frases. Tono profesional pero cercano. Acentúa correctamente el español.'
    : 'Warm editorial narrator. Natural conversational pace, NOT slow, with subtle pauses between sentences. Professional but friendly tone.';
  try {
    const openai = getOpenAI();
    const ttsStart = Date.now();
    let ttsCostCents = 0;
    const sceneAudios = await Promise.all(
      data.plan.scenes.map(async (scene, i) => {
        const text = scene.text?.trim();
        if (!text) return null;
        const speech = await openai.audio.speech.create({
          model: 'gpt-4o-mini-tts',
          voice: ttsVoice,
          input: text,
          instructions: ttsInstructions,
          response_format: 'mp3',
        });
        const buf = Buffer.from(await speech.arrayBuffer());
        const path = join(tmp, `scene-tts-${i}.mp3`);
        await writeFile(path, buf);
        // ~$0.015/min audio; per-scene cost rounds to <1¢ but we keep the
        // 1¢ floor for ledger consistency.
        ttsCostCents += Math.max(1, Math.round((text.length / 1000) * 4));
        return path;
      }),
    );
    console.log(
      `[reachy:video] gen ${data.generationId} TTS x${sceneAudios.filter(Boolean).length} ready in ${Math.round((Date.now() - ttsStart) / 1000)}s (${ttsCostCents}¢, voice=${ttsVoice}, lang=${isEs ? 'es' : 'en'})`,
    );
    return { sceneAudios, ttsCostCents };
  } catch (err) {
    console.warn(
      `[reachy:video] gen ${data.generationId} TTS failed, continuing silent:`,
      err instanceof Error ? err.message : err,
    );
    return { sceneAudios: undefined, ttsCostCents: 0 };
  }
}

/**
 * Sora 2 multi-scene pipeline:
 *   1. For each non-brand scene, submit a separate Sora job seeded with the
 *      scene's imagePrompt (snapped to 4/8/12s).
 *   2. Poll all jobs in parallel until done/failed/timeout.
 *   3. Download each MP4 to local disk.
 *   4. Render TTS narration the same way the FFmpeg path does.
 *   5. Compose the final reel with composeReel(), passing each scene's
 *      videoPath as the visual source (Brand-bg scenes still use the
 *      synthesized solid PNG).
 *
 * Resumption: scene job ids are written to generation.params after the
 * initial submit batch so a BullMQ retry resumes polling existing jobs
 * instead of paying for fresh ones (a 4-scene Sora Pro reel is $9.60;
 * resubmits would double-bill).
 */
async function runSora(
  data: VideoGenJobData,
  onProgress?: (pct: number) => void,
): Promise<EngineResult> {
  const tmp = await mkdtemp(join(tmpdir(), 'reachy-reel-sora-'));
  try {
    const soraModel: SoraModel = data.engine === 'sora-pro-720p' ? 'sora-2-pro' : 'sora-2';

    // Step 1+2: submit per-scene jobs (or resume from stored ids).
    let storedJobs = await getStoredSoraJobs(data.generationId);
    if (storedJobs && storedJobs.length !== data.plan.scenes.length) {
      // Stored shape doesn't match current plan — start fresh.
      storedJobs = null;
    }
    const sceneJobs: Array<ScheduledSoraJob | null> =
      storedJobs ?? new Array(data.plan.scenes.length).fill(null);

    if (!storedJobs) {
      const submitStart = Date.now();
      await Promise.all(
        data.plan.scenes.map(async (scene, i) => {
          if (scene.background === 'brand') return;
          if (!scene.imagePrompt?.trim()) {
            throw new Error(`runSora: scene ${i + 1} (${scene.slot}) has no imagePrompt`);
          }
          const snapped = snapSoraDuration(scene.durationSec);
          const job = await submitSora({
            model: soraModel,
            prompt: scene.imagePrompt,
            aspectRatio: '9:16',
            durationSec: snapped,
          });
          sceneJobs[i] = { ...job, retries: 0 };
          console.log(
            `[reachy:video] gen ${data.generationId} scene ${i + 1}/${data.plan.scenes.length} submitted to ${soraModel} (${snapped}s, jobId=${job.jobId})`,
          );
        }),
      );
      await persistSoraJobs(data.generationId, sceneJobs);
      console.log(
        `[reachy:video] gen ${data.generationId} all Sora jobs submitted in ${Math.round((Date.now() - submitStart) / 1000)}s`,
      );
    } else {
      console.log(
        `[reachy:video] gen ${data.generationId} resuming ${sceneJobs.filter(Boolean).length} Sora jobs from storage`,
      );
    }

    // Step 3: poll until all done, with a shared per-scene timeout. Each
    // poll cycle reports the lowest progress across all in-flight jobs.
    const sceneVideoPaths: Array<string | null> = new Array(data.plan.scenes.length).fill(null);
    const startedAt = Date.now();
    let pollsCompleted = 0;
    while (true) {
      if (Date.now() - startedAt > SORA_POLL_TIMEOUT_MS) {
        throw new Error(`Sora polling timed out after ${SORA_POLL_TIMEOUT_MS / 1000}s`);
      }
      await new Promise((r) => setTimeout(r, SORA_POLL_INTERVAL_MS));

      let allDone = true;
      let minProgress = 100;
      let needsRePersist = false;
      await Promise.all(
        data.plan.scenes.map(async (scene, i) => {
          if (scene.background === 'brand') return;
          if (sceneVideoPaths[i]) return;
          const job = sceneJobs[i];
          if (!job) return;
          const status = await pollSora(job);
          if (status.state === 'failed') {
            const errMsg = status.errorMessage ?? 'unknown';
            const isModerationBlock = MODERATION_BLOCK.test(errMsg);
            if (isModerationBlock && job.retries < 1) {
              // Re-submit this scene with the visualStyle's motion language
              // alone, stripping the planner-generated narrative content that
              // most likely triggered the block. Mark retries=1 so we don't
              // loop if the safe prompt also fails. Persist immediately so a
              // BullMQ worker restart resumes from the new job, not the
              // already-blocked one (which would re-flag and loop forever).
              const snapped = snapSoraDuration(scene.durationSec);
              const safePrompt = buildSafeSoraPrompt(data.visualStyle);
              console.warn(
                `[reachy:video] gen ${data.generationId} scene ${i + 1} blocked by Sora moderation — retrying with safe prompt (${snapped}s)`,
              );
              const replacement = await submitSora({
                model: soraModel,
                prompt: safePrompt,
                aspectRatio: '9:16',
                durationSec: snapped,
              });
              sceneJobs[i] = { ...replacement, retries: job.retries + 1 };
              needsRePersist = true;
              allDone = false;
              minProgress = 0;
              console.log(
                `[reachy:video] gen ${data.generationId} scene ${i + 1} resubmitted (jobId=${replacement.jobId})`,
              );
              return;
            }
            throw new Error(`Sora scene ${i + 1} failed: ${errMsg}`);
          }
          if (status.state === 'done') {
            const dl = await downloadSora(job.jobId);
            const path = join(tmp, `sora-${i}.mp4`);
            await writeFile(path, dl.buffer);
            sceneVideoPaths[i] = path;
            console.log(
              `[reachy:video] gen ${data.generationId} scene ${i + 1} downloaded (${dl.bytes} bytes)`,
            );
            return;
          }
          allDone = false;
          minProgress = Math.min(minProgress, status.progress ?? 0);
        }),
      );
      if (needsRePersist) {
        await persistSoraJobs(data.generationId, sceneJobs);
      }

      pollsCompleted += 1;
      // Map Sora progress to the BullMQ scale, capping at 90% until compose runs.
      onProgress?.(Math.min(0.9, (minProgress / 100) * 0.9));

      if (allDone) break;
      if (pollsCompleted % 10 === 0) {
        const remaining = sceneVideoPaths.filter(
          (p, i) => !p && data.plan.scenes[i]?.background !== 'brand',
        ).length;
        console.log(
          `[reachy:video] gen ${data.generationId} Sora poll #${pollsCompleted}: ${remaining} scene(s) still rendering (min progress ${minProgress}%)`,
        );
      }
    }

    // Step 4: TTS — identical to the FFmpeg path.
    const tts = await renderSceneTts(data, tmp);

    // Step 5: compose. Brand-bg scenes pass undefined for both paths; the
    // composer synthesizes its own solid color background.
    const scenes = data.plan.scenes.map((scene, i) => ({
      videoPath: sceneVideoPaths[i] ?? undefined,
      imagePath: undefined,
      text: scene.text,
      scene,
    }));

    const outputPath = join(tmp, 'out.mp4');
    await composeReel({
      scenes,
      outputPath,
      sceneAudios: tts.sceneAudios,
      brandColorHex: data.brandColorHex,
      brandTextHex: data.brandTextHex,
      visualStyle: data.visualStyle,
      onProgress: (pct) => onProgress?.(0.9 + pct * 0.1),
    });

    const buffer = await readFile(outputPath);
    const totalDur = data.plan.scenes.reduce((sum, s) => sum + s.durationSec, 0);

    // Bill the SUM of snapped Sora seconds (the API charges per second we
    // requested, not what we render).
    let videoCostCents = 0;
    for (let i = 0; i < data.plan.scenes.length; i++) {
      const scene = data.plan.scenes[i];
      const job = sceneJobs[i];
      if (!scene || scene.background === 'brand' || !job) continue;
      videoCostCents += soraCostCents(soraModel, job.durationSec);
    }

    const costCents = 1 + videoCostCents + tts.ttsCostCents;
    return {
      buffer,
      bytes: buffer.length,
      durationSec: totalDur,
      costCents,
      costBreakdown: {
        cents: costCents,
        parts: { tts: tts.ttsCostCents, video: videoCostCents, compose: 1 },
      },
    };
  } finally {
    await rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Worker-internal Sora job — SoraJob plus a `retries` count that tracks
 * moderation-driven resubmissions. We persist this through generation.params
 * so a BullMQ retry doesn't lose the retry state and re-resubmit a scene
 * we already moderation-retried (which would loop indefinitely if the
 * safer prompt ALSO gets flagged).
 */
type ScheduledSoraJob = SoraJob & { retries: number };

interface StoredSoraJob {
  jobId: string;
  model: SoraModel;
  durationSec: 4 | 8 | 12;
  retries?: number;
}

/** Persist per-scene Sora jobs so a worker retry resumes polling vs paying again. */
async function persistSoraJobs(
  generationId: string,
  jobs: Array<ScheduledSoraJob | null>,
): Promise<void> {
  const stored: Array<StoredSoraJob | null> = jobs.map((j) =>
    j ? { jobId: j.jobId, model: j.model, durationSec: j.durationSec, retries: j.retries } : null,
  );
  const [row] = await db
    .select({ params: generation.params })
    .from(generation)
    .where(eq(generation.id, generationId))
    .limit(1);
  const merged = {
    ...((row?.params as Record<string, unknown>) ?? {}),
    soraJobs: stored,
  };
  await db.update(generation).set({ params: merged }).where(eq(generation.id, generationId));
}

async function getStoredSoraJobs(
  generationId: string,
): Promise<Array<ScheduledSoraJob | null> | null> {
  const [row] = await db
    .select({ params: generation.params })
    .from(generation)
    .where(eq(generation.id, generationId))
    .limit(1);
  const params = (row?.params ?? {}) as { soraJobs?: Array<StoredSoraJob | null> };
  if (!Array.isArray(params.soraJobs)) return null;
  return params.soraJobs.map((s) =>
    s
      ? { jobId: s.jobId, model: s.model, durationSec: s.durationSec, retries: s.retries ?? 0 }
      : null,
  );
}

/**
 * Sora moderation refusal — OpenAI returns "Your request was blocked by
 * our moderation system." We retry such scenes ONCE with a moderation-safe
 * fallback prompt (the visualStyle's motion language alone, stripped of
 * the per-scene narrative content the planner generated, which is the
 * most common trigger). The retry happens transparently to the user.
 */
const MODERATION_BLOCK =
  /blocked by our moderation|moderation system|safety system|content policy/i;

/** Build a moderation-safe Sora prompt: visualStyle motion + generic abstract subject. */
function buildSafeSoraPrompt(visualStyle: string | null | undefined): string {
  const style = resolveVisualStyle(visualStyle);
  return [
    style.promptMotion,
    'Subject: a purely abstract motion-graphics scene matching the style above. No specific objects, no products, no people, no recognizable items, no readable text. Pure form, color, and motion only.',
  ].join(' ');
}
