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
  type SoraSize,
  snapSoraDuration,
  soraCostCents,
  submitSora,
} from '@/server/ai/openaiVideo';
import { resolveVisualStyle } from '@/server/ai/visualStyles';
import { isElevenLabsConfigured, synthesizeElevenLabs } from '@/server/audio/elevenlabs';
import { generateMusic } from '@/server/audio/elevenlabsMusic';
import { generateSfx } from '@/server/audio/elevenlabsSfx';
import { db } from '@/server/db/client';
import { asset } from '@/server/db/schema/assets';
import { generation } from '@/server/db/schema/generations';
import { putR2 } from '@/server/storage/r2';
import {
  buildOneShotAudioTrack,
  composeOneShot,
  composeReel,
  type OneShotBeat,
} from '@/server/video/compose';
import { ensureFfmpeg } from '@/server/video/ensureFfmpeg';
import { ffprobe, type ProbeResult } from '@/server/video/ffprobe';
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
      console.log(
        `[reachy:debug-trace] worker pickup generationId=${generationId} engine=${engine} template=${plan.template} sceneCount=${plan.scenes.length} attemptsMade=${job.attemptsMade}`,
      );
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
            : await runSoraOneShot(job.data, progressCb);

        // Truth: out.probed was captured INSIDE the engine fn before its tmp
        // dir was cleaned up. The previous version called ffprobe(out.outputPath)
        // here, which raced the engine's `finally { rm(tmp) }` cleanup and
        // ENOENT'd every time. The plan-total lie (asset.duration_sec = sum
        // of scene.durationSec) hid the 7s Sora truncation for three reels;
        // see planning/DIAGNOSTIC-LAST-REEL.md.
        const probed = out.probed;
        const expected = out.expectedDurationSec;
        const truncationRatio = expected > 0 ? probed.durationSec / expected : 1;
        if (truncationRatio < 0.95) {
          throw new Error(
            `compose-truncated: expected ${expected.toFixed(2)}s got ${probed.durationSec.toFixed(2)}s ` +
              `(${(truncationRatio * 100).toFixed(0)}% of plan; ` +
              `ffprobe ${probed.videoCodec} ${probed.width}x${probed.height} @ ${probed.fps}fps)`,
          );
        }
        console.log(
          `[reachy:video] gen ${generationId} ffprobe: ${probed.durationSec.toFixed(2)}s ${probed.videoCodec} ${probed.width}x${probed.height} @ ${probed.fps}fps (expected ${expected.toFixed(2)}s)`,
        );

        console.log(
          `[reachy:debug-trace] worker uploading to R2 generationId=${generationId} bytes=${out.bytes}`,
        );
        const r2Start = Date.now();
        const key = `${projectId}/reels/${generationId}.mp4`;
        const upload = await putR2(key, out.buffer, 'video/mp4');
        console.log(
          `[reachy:debug-trace] worker R2 ok key=${upload.key} bytes=${upload.bytes} elapsedMs=${Date.now() - r2Start}`,
        );

        await db.insert(asset).values({
          generationId,
          projectId,
          kind: 'video',
          format: plan.template,
          width: probed.width || REEL_DIMENSIONS.width,
          height: probed.height || REEL_DIMENSIONS.height,
          // Real probed duration — never the plan total. The asset row is the
          // single source of truth for what the user can actually watch.
          durationSec: Math.round(probed.durationSec),
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
  /** ffprobe of the final composed MP4. The engine functions run ffprobe
   *  BEFORE their `finally { rm(tmp) }` cleanup, then ship the result
   *  through here. Probing outside the engine would race the tmp-dir
   *  cleanup and ENOENT every time — that's the bug Cowork diagnosed
   *  in the live-debug session. */
  probed: ProbeResult;
  /** Total intended duration from the plan/engine. Used by the truncation
   *  guard: if probed.durationSec < 0.95 × expectedDurationSec the worker
   *  fails the generation with `compose-truncated` instead of writing a lie. */
  expectedDurationSec: number;
  costCents: number;
  /** Per-component cost breakdown — same shape returned by estimateReelCost
   *  so the client and server agree on TTS / video-gen / image-gen / compose
   *  attribution. Persisted into generation.params.costBreakdown so the UI
   *  can show "Cost: $3.70 (Sora $3.60 · TTS $0.09 · compose $0.01)". */
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

    // ffprobe MUST run before the `finally` block below clears the tmp dir
    // — otherwise the outer worker would race the cleanup and ENOENT (the
    // bug Cowork diagnosed in the live-debug session). Probe + read both
    // happen on the file while it still exists.
    const probed = await ffprobe(outputPath);
    const buffer = await readFile(outputPath);
    const totalDur = data.plan.scenes.reduce((sum, s) => sum + s.durationSec, 0);
    const expectedDur = totalDur - (data.plan.scenes.length - 1) * 0.4;
    const costCents = 1 + autoImageCostCents + tts.ttsCostCents;
    return {
      buffer,
      bytes: buffer.length,
      probed,
      expectedDurationSec: expectedDur,
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
  const isEs = data.plan.language === 'es';
  const useEleven = isElevenLabsConfigured();
  if (!useEleven) {
    console.warn(
      `[reachy:video] gen ${data.generationId} ElevenLabs not configured — falling back to gpt-4o-mini-tts. Set ELEVENLABS_API_KEY + ELEVENLABS_VOICE_ID_${isEs ? 'ES' : 'EN'} in .env.local for editorial-quality narration.`,
    );
  }
  // OpenAI fallback knobs — only consulted when ElevenLabs is missing.
  const ttsVoice = 'sage' as const;
  const ttsInstructions = isEs
    ? 'Voz de narrador editorial cálido y natural. Ritmo conversacional, NO lento, con pausas naturales solo entre frases. Tono profesional pero cercano. Acentúa correctamente el español.'
    : 'Warm editorial narrator. Natural conversational pace, NOT slow, with subtle pauses between sentences. Professional but friendly tone.';
  try {
    const ttsStart = Date.now();
    let ttsCostCents = 0;
    const sceneAudios = await Promise.all(
      data.plan.scenes.map(async (scene, i) => {
        // narration (full sentence) is the canonical TTS source; fall back
        // to text (overlay headline) only when narration is missing — that
        // preserves the legacy single-field plan shape so old scenes still
        // render audio. The on-screen drawtext keeps using `text`.
        const text = (scene.narration?.trim() || scene.text?.trim()) ?? '';
        if (!text) return null;
        const path = join(tmp, `scene-tts-${i}.mp3`);
        if (useEleven) {
          const synth = await synthesizeElevenLabs({ text, language: isEs ? 'es' : 'en' });
          await writeFile(path, synth.buffer);
          ttsCostCents += synth.costCents;
          return path;
        }
        const openai = getOpenAI();
        const speech = await openai.audio.speech.create({
          model: 'gpt-4o-mini-tts',
          voice: ttsVoice,
          input: text,
          instructions: ttsInstructions,
          response_format: 'mp3',
        });
        const buf = Buffer.from(await speech.arrayBuffer());
        await writeFile(path, buf);
        // ~$0.015/min audio; per-scene cost rounds to <1¢ but we keep the
        // 1¢ floor for ledger consistency.
        ttsCostCents += Math.max(1, Math.round((text.length / 1000) * 4));
        return path;
      }),
    );
    const provider = useEleven ? 'elevenlabs' : 'gpt-4o-mini-tts';
    console.log(
      `[reachy:video] gen ${data.generationId} TTS x${sceneAudios.filter(Boolean).length} ready in ${Math.round((Date.now() - ttsStart) / 1000)}s (${ttsCostCents}¢, provider=${provider}, lang=${isEs ? 'es' : 'en'})`,
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
 *
 * DEPRECATED PATH: kept as a fallback only. The dispatch in startVideoWorker
 * routes sora-* engines through runSoraOneShot, which sidesteps the
 * snapSoraDuration → -t/xfade mismatch that truncated three reels to 7s
 * (see planning/DIAGNOSTIC-LAST-REEL.md). Do NOT rewire this without
 * also fixing compose.ts to ffprobe each clip and derive fade/xfade
 * timings from the actual durations.
 */
// biome-ignore lint/correctness/noUnusedVariables: kept as documented fallback for the multi-scene Sora path
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

    // ffprobe BEFORE the finally block reaps tmp — see EngineResult.probed.
    const probed = await ffprobe(outputPath);
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
    const expectedDur = totalDur - (data.plan.scenes.length - 1) * 0.4;
    return {
      buffer,
      bytes: buffer.length,
      probed,
      expectedDurationSec: expectedDur,
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
 * Sora 2 one-shot: a SINGLE 12s Sora call instead of N parallel per-scene
 * calls. Eliminates the per-scene-duration math that produced the 7s
 * truncation across three reels (see planning/DIAGNOSTIC-LAST-REEL.md).
 *
 * Architecture:
 *   1. Build a master prompt = visualStyle.promptMotion + a beat sheet
 *      derived from the plan's per-scene `text` (4 lines mapped to
 *      0-3s / 3-6s / 6-9s / 9-12s windows).
 *   2. Submit ONE Sora job at 12s. Persist its id for BullMQ resume.
 *   3. Poll until done; download once.
 *   4. Render TTS narration the same way runFfmpeg/runSora do.
 *   5. composeOneShot the 12s clip with beat-timed drawtext overlays +
 *      a concatenated audio track padded to the beat windows.
 *
 * Cost: Sora 2 Pro 720p × 12s × $0.30 = $3.60 + TTS + 1¢ compose.
 *
 * The user-edited per-scene imagePrompt fields are intentionally NOT used —
 * Sora gets one master prompt for the whole reel. The PlanEditor's
 * per-scene imagePrompt inputs are decorative when engine is sora-*.
 */
const SORA_ONE_SHOT_DURATION_SEC = 12;

async function runSoraOneShot(
  data: VideoGenJobData,
  onProgress?: (pct: number) => void,
): Promise<EngineResult> {
  const tmp = await mkdtemp(join(tmpdir(), 'reachy-reel-oneshot-'));
  console.log(
    `[reachy:debug-trace] runSoraOneShot enter generationId=${data.generationId} engine=${data.engine} tmp=${tmp}`,
  );
  try {
    // Engine → (Sora model, output size, cost-tier key). Pro 1024p is the
    // premium tier ($0.50/s) for flagship demos; Pro 720p is the cheaper
    // default ($0.30/s); base is 720p only ($0.10/s).
    const soraModel: SoraModel =
      data.engine === 'sora-pro-1024p' || data.engine === 'sora-pro-720p' ? 'sora-2-pro' : 'sora-2';
    const soraSize: SoraSize = data.engine === 'sora-pro-1024p' ? '1024x1792' : '720x1280';
    const costRes: '720' | '1024' = data.engine === 'sora-pro-1024p' ? '1024' : '720';
    const style = resolveVisualStyle(data.visualStyle);

    // Map the plan's scene texts to evenly-spaced beat windows over the
    // 12s clip. The visualStyle motion + this beat sheet are the master
    // Sora prompt. Brand-bg scenes still get a beat window but no special
    // visual treatment (the user can still pick a closing tagline scene).
    const sceneTexts = data.plan.scenes.map((s) => s.text?.trim()).filter((t) => t && t.length > 0);
    const beatCount = Math.max(1, sceneTexts.length);
    const beatDur = SORA_ONE_SHOT_DURATION_SEC / beatCount;
    const beatSheet = sceneTexts
      .map((text, i) => `[${(i * beatDur).toFixed(1)}-${((i + 1) * beatDur).toFixed(1)}s] ${text}`)
      .join(' ');
    const masterPrompt = [
      style.promptMotion,
      '',
      `Beat sheet (12s total, ${beatCount} beats of ${beatDur.toFixed(1)}s each): ${beatSheet}`,
      '',
      'Sustain the locked visual style across all beats. The motion is continuous, with subtle pacing shifts as each beat lands. No cuts, no transitions, no camera moves — just the elements evolving in place over 12 seconds. CRITICAL: NO text, NO letters, NO words, NO numbers visible in the rendered video. NO real people, NO faces. The beat sheet is for pacing the visual rhythm only; the overlay text is added separately by our renderer.',
    ].join(' ');

    // Step 1+2: submit or resume.
    let storedJobs = await getStoredSoraJobs(data.generationId);
    if (storedJobs && storedJobs.length !== 1) storedJobs = null;
    let job: ScheduledSoraJob | null = storedJobs?.[0] ?? null;

    if (!job) {
      const submitted = await submitSora({
        model: soraModel,
        prompt: masterPrompt,
        aspectRatio: '9:16',
        durationSec: SORA_ONE_SHOT_DURATION_SEC,
        size: soraSize,
      });
      job = { ...submitted, retries: 0 };
      await persistSoraJobs(data.generationId, [job]);
      console.log(
        `[reachy:video] gen ${data.generationId} one-shot submitted to ${soraModel} (${SORA_ONE_SHOT_DURATION_SEC}s, jobId=${submitted.jobId})`,
      );
    } else {
      console.log(
        `[reachy:video] gen ${data.generationId} resuming one-shot job from storage (jobId=${job.jobId}, retries=${job.retries})`,
      );
    }

    // Step 3: poll until done.
    const videoPath = join(tmp, 'sora-oneshot.mp4');
    const startedAt = Date.now();
    let lastProgress = 0;
    while (true) {
      if (Date.now() - startedAt > SORA_POLL_TIMEOUT_MS) {
        throw new Error(`Sora one-shot polling timed out after ${SORA_POLL_TIMEOUT_MS / 1000}s`);
      }
      await new Promise((r) => setTimeout(r, SORA_POLL_INTERVAL_MS));
      const status = await pollSora(job);
      if (status.state === 'failed') {
        const errMsg = status.errorMessage ?? 'unknown';
        const isModerationBlock = MODERATION_BLOCK.test(errMsg);
        if (isModerationBlock && job.retries < 1) {
          // Same safe-prompt retry as the multi-scene path.
          const safePrompt = buildSafeSoraPrompt(data.visualStyle);
          console.warn(
            `[reachy:video] gen ${data.generationId} one-shot blocked by Sora moderation — retrying with safe prompt`,
          );
          const replacement = await submitSora({
            model: soraModel,
            prompt: safePrompt,
            aspectRatio: '9:16',
            durationSec: SORA_ONE_SHOT_DURATION_SEC,
            size: soraSize,
          });
          job = { ...replacement, retries: job.retries + 1 };
          await persistSoraJobs(data.generationId, [job]);
          console.log(
            `[reachy:video] gen ${data.generationId} one-shot resubmitted (jobId=${replacement.jobId})`,
          );
          continue;
        }
        throw new Error(`Sora one-shot failed: ${errMsg}`);
      }
      if (status.state === 'done') {
        const dl = await downloadSora(job.jobId);
        await writeFile(videoPath, dl.buffer);
        console.log(
          `[reachy:debug-trace] runSoraOneShot wrote Sora MP4 path=${videoPath} bytes=${dl.bytes}`,
        );
        console.log(
          `[reachy:video] gen ${data.generationId} one-shot downloaded (${dl.bytes} bytes)`,
        );
        break;
      }
      lastProgress = status.progress ?? lastProgress;
      onProgress?.(Math.min(0.85, (lastProgress / 100) * 0.85));
    }

    // Step 4: TTS narration + ElevenLabs music + ElevenLabs SFX in PARALLEL.
    // All three hit the same provider over independent endpoints; running
    // them in parallel saves ~5-10s wall-clock per reel vs sequential.
    // Each is best-effort — a music failure shouldn't kill the reel; the
    // music path is just omitted from the compose mix.
    const useElevenAudio = isElevenLabsConfigured();
    const [tts, music, sfxHits] = await Promise.all([
      renderSceneTts(data, tmp),
      useElevenAudio
        ? generateMusic({
            visualStyle: data.visualStyle ?? 'editorial',
            durationSec: SORA_ONE_SHOT_DURATION_SEC,
          }).catch((err) => {
            console.warn(
              `[reachy:music] gen ${data.generationId} music failed — continuing without music: ${(err as Error).message}`,
            );
            return null;
          })
        : Promise.resolve(null),
      useElevenAudio
        ? generateSfxBundleForReel(SORA_ONE_SHOT_DURATION_SEC).catch((err) => {
            console.warn(
              `[reachy:sfx] gen ${data.generationId} sfx failed — continuing without sfx: ${(err as Error).message}`,
            );
            return [] as Array<{ path: string; startSec: number; costCents: number }>;
          })
        : Promise.resolve([] as Array<{ path: string; startSec: number; costCents: number }>),
    ]);
    // Concatenate per-scene TTS mp3s into one audio file aligned to the
    // beat windows. apad each to its beat duration before concat so the
    // overlay text + voice stay in sync.
    let audioPath: string | undefined;
    if (tts.sceneAudios) {
      audioPath = await buildOneShotAudioTrack({
        tmpDir: tmp,
        sceneAudios: tts.sceneAudios,
        totalDurationSec: SORA_ONE_SHOT_DURATION_SEC,
      });
    }

    // Music: write returned bytes to disk so composeOneShot can read it
    // as an FFmpeg input (we already have the file path for SFX via the
    // disk cache; music is generated fresh each reel so we write it here).
    let musicPath: string | undefined;
    let musicCostCents = 0;
    if (music) {
      musicPath = join(tmp, 'music.mp3');
      await writeFile(musicPath, music.buffer);
      musicCostCents = music.costCents;
      console.log(
        `[reachy:music] gen ${data.generationId} music written path=${musicPath} bytes=${music.bytes}`,
      );
    }

    const sfxCostCents = sfxHits.reduce((sum, hit) => sum + hit.costCents, 0);

    // Step 5: compose. One video input + N beat-timed overlays + audio mix.
    const beats: OneShotBeat[] = data.plan.scenes.map((scene, i) => ({
      text: scene.text ?? '',
      startSec: i * beatDur,
      endSec: (i + 1) * beatDur,
      position: scene.textPosition,
    }));

    const outputPath = join(tmp, 'out.mp4');
    console.log(
      `[reachy:debug-trace] runSoraOneShot -> composeOneShot beats=${beats.length} hasAudio=${Boolean(audioPath)} hasMusic=${Boolean(musicPath)} sfxHits=${sfxHits.length} duration=${SORA_ONE_SHOT_DURATION_SEC}s outputPath=${outputPath}`,
    );
    const composeStart = Date.now();
    await composeOneShot({
      videoPath,
      beats,
      audioPath,
      musicPath,
      sfxHits: sfxHits.map((h) => ({ path: h.path, startSec: h.startSec })),
      durationSec: SORA_ONE_SHOT_DURATION_SEC,
      outputPath,
      onProgress: (pct) => onProgress?.(0.85 + pct * 0.15),
    });
    console.log(
      `[reachy:debug-trace] runSoraOneShot composeOneShot done elapsedMs=${Date.now() - composeStart}`,
    );

    // ffprobe BEFORE the finally block reaps tmp — see EngineResult.probed.
    // This is the bug fix: previously the outer worker called ffprobe on
    // outputPath after we returned, but our `finally { rm(tmp) }` had
    // already deleted the file. ENOENT every single render.
    const probed = await ffprobe(outputPath);
    console.log(
      `[reachy:debug-trace] runSoraOneShot ffprobe done duration=${probed.durationSec.toFixed(2)}s width=${probed.width} height=${probed.height} codec=${probed.videoCodec}`,
    );
    const buffer = await readFile(outputPath);
    const videoCostCents = soraCostCents(soraModel, SORA_ONE_SHOT_DURATION_SEC, costRes);
    const costCents = 1 + videoCostCents + tts.ttsCostCents + musicCostCents + sfxCostCents;
    return {
      buffer,
      bytes: buffer.length,
      probed,
      expectedDurationSec: SORA_ONE_SHOT_DURATION_SEC,
      costCents,
      costBreakdown: {
        cents: costCents,
        parts: {
          tts: tts.ttsCostCents,
          video: videoCostCents,
          music: musicCostCents > 0 ? musicCostCents : undefined,
          sfx: sfxCostCents > 0 ? sfxCostCents : undefined,
          compose: 1,
        },
      },
    };
  } finally {
    await rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Three short ElevenLabs SFX hits used in every reel: intro chime, midpoint
 * transition, outro click. The disk cache in elevenlabsSfx.ts keys by
 * description so the same chime hits the cache after the first reel renders.
 * Returned hits include their reel-relative start times so composeOneShot
 * can adelay each to its target.
 */
async function generateSfxBundleForReel(
  totalDurationSec: number,
): Promise<Array<{ path: string; startSec: number; costCents: number }>> {
  const midpoint = totalDurationSec / 2;
  const tailStart = Math.max(0, totalDurationSec - 0.6);
  const requests: Array<{ description: string; durationSec: number; startSec: number }> = [
    {
      description: 'soft brief chime, editorial intro stinger, warm',
      durationSec: 1.0,
      startSec: 0,
    },
    {
      description: 'subtle paper rustle transition swoosh, brief',
      durationSec: 1.0,
      startSec: midpoint,
    },
    { description: 'gentle UI click, brief, premium outro', durationSec: 0.6, startSec: tailStart },
  ];
  const results = await Promise.all(
    requests.map(async (req) => {
      const sfx = await generateSfx({
        description: req.description,
        durationSec: req.durationSec,
        promptInfluence: 0.6,
      });
      return { path: sfx.path, startSec: req.startSec, costCents: sfx.costCents };
    }),
  );
  return results;
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
