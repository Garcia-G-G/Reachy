import 'server-only';
import { Worker } from 'bullmq';
import { eq } from 'drizzle-orm';
import { getFormat } from '@/server/ai/formats';
import { generateImage } from '@/server/ai/imageGen';
import { db } from '@/server/db/client';
import { asset } from '@/server/db/schema/assets';
import { generation } from '@/server/db/schema/generations';
import { putR2 } from '@/server/storage/r2';
import { createBullConnection, QUEUE_NAMES } from './connection';
import type { ImageGenJobData } from './queue';

export function startImageWorker(): Worker<ImageGenJobData> {
  const worker = new Worker<ImageGenJobData>(
    QUEUE_NAMES.imageGen,
    async (job) => {
      const { generationId, projectId, prompt, format, provider, model, n } = job.data;
      const fm = getFormat(format);

      await db.update(generation).set({ status: 'running' }).where(eq(generation.id, generationId));

      try {
        const result = await generateImage({ prompt, format, provider, model, n });

        for (const [i, buf] of result.buffers.entries()) {
          const key = `${projectId}/${generationId}/${i + 1}.png`;
          const upload = await putR2(key, buf, result.contentType);
          await db.insert(asset).values({
            generationId,
            projectId,
            kind: 'image',
            format,
            width: fm.w,
            height: fm.h,
            storageKey: upload.key,
            publicUrl: upload.publicUrl,
            bytes: upload.bytes,
          });
        }

        await db
          .update(generation)
          .set({
            status: 'done',
            finishedAt: new Date(),
            costCents: result.costCents,
          })
          .where(eq(generation.id, generationId));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[reachy:worker] generation ${generationId} failed:`, message);
        await db
          .update(generation)
          .set({
            status: 'failed',
            errorMessage: message,
            finishedAt: new Date(),
          })
          .where(eq(generation.id, generationId));
        throw err;
      }
    },
    {
      connection: createBullConnection(),
      concurrency: 4,
    },
  );

  worker.on('failed', (job, err) => {
    console.error(`[reachy:worker] job ${job?.id} failed: ${err.message}`);
  });
  worker.on('completed', (job) => {
    console.log(`[reachy:worker] job ${job.id} completed (gen=${job.data.generationId})`);
  });

  return worker;
}
