'use server';

import { and, desc, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { type ImageFormat, IMAGE_FORMAT_KEYS } from '@/server/ai/formats';
import { type ImageProvider } from '@/server/ai/imageGen';
import { buildImagePrompt } from '@/server/ai/promptBuilder';
import { db } from '@/server/db/client';
import { asset } from '@/server/db/schema/assets';
import { brandKit } from '@/server/db/schema/brandKits';
import { generation } from '@/server/db/schema/generations';
import { project } from '@/server/db/schema/projects';
import { getImageQueue } from '@/server/jobs/queue';
import { getSession } from '@/server/getSession';

const enqueueInput = z.object({
  projectId: z.string().uuid(),
  idea: z.string().trim().min(3).max(600),
  format: z.enum(IMAGE_FORMAT_KEYS as [ImageFormat, ...ImageFormat[]]),
  provider: z.enum(['openai', 'fal']),
  model: z.string().trim().min(2).max(80),
  n: z.union([z.literal(1), z.literal(2), z.literal(4)]),
  language: z.enum(['en', 'es']).default('en'),
});

export type EnqueueImageGenerationInput = z.infer<typeof enqueueInput>;

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

export async function enqueueImageGeneration(
  input: EnqueueImageGenerationInput,
): Promise<ActionResult<{ generationId: string; projectSlug: string }>> {
  const session = await getSession();
  if (!session) return { ok: false, error: 'unauthenticated' };

  const parsed = enqueueInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid input' };
  }

  // Ownership check + load project + brand kit in one round-trip-set.
  const [proj] = await db
    .select()
    .from(project)
    .where(and(eq(project.id, parsed.data.projectId), eq(project.userId, session.user.id)))
    .limit(1);
  if (!proj) return { ok: false, error: 'not-found' };

  const [kit] = await db
    .select()
    .from(brandKit)
    .where(eq(brandKit.projectId, proj.id))
    .limit(1);

  const prompt = buildImagePrompt({
    idea: parsed.data.idea,
    format: parsed.data.format,
    project: { name: proj.name, audience: proj.audience, tone: proj.tone },
    brandKit: kit ?? null,
    language: parsed.data.language,
  });

  // Insert generation row first so the worker has a target to update.
  const [gen] = await db
    .insert(generation)
    .values({
      projectId: proj.id,
      type: 'image',
      format: parsed.data.format,
      status: 'queued',
      provider: parsed.data.provider,
      model: parsed.data.model,
      prompt,
      params: {
        idea: parsed.data.idea,
        n: parsed.data.n,
        language: parsed.data.language,
      },
    })
    .returning();
  if (!gen) return { ok: false, error: 'enqueue failed' };

  try {
    await getImageQueue().add('generate', {
      generationId: gen.id,
      projectId: proj.id,
      prompt,
      format: parsed.data.format as ImageFormat,
      provider: parsed.data.provider as ImageProvider,
      model: parsed.data.model,
      n: parsed.data.n,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'queue error';
    await db
      .update(generation)
      .set({ status: 'failed', errorMessage: `queue add failed: ${msg}`, finishedAt: new Date() })
      .where(eq(generation.id, gen.id));
    return { ok: false, error: 'queue-unreachable' };
  }

  revalidatePath(`/app/projects/${proj.slug}/library`, 'layout');
  revalidatePath(`/app/projects/${proj.slug}/generate/image`, 'layout');
  return { ok: true, data: { generationId: gen.id, projectSlug: proj.slug } };
}

export async function listGenerationsForProject(
  projectId: string,
): Promise<typeof generation.$inferSelect[]> {
  const session = await getSession();
  if (!session) return [];

  const [proj] = await db
    .select({ id: project.id })
    .from(project)
    .where(and(eq(project.id, projectId), eq(project.userId, session.user.id)))
    .limit(1);
  if (!proj) return [];

  return db
    .select()
    .from(generation)
    .where(eq(generation.projectId, proj.id))
    .orderBy(desc(generation.createdAt))
    .limit(100);
}

export async function listAssetsForProject(
  projectId: string,
): Promise<typeof asset.$inferSelect[]> {
  const session = await getSession();
  if (!session) return [];

  const [proj] = await db
    .select({ id: project.id })
    .from(project)
    .where(and(eq(project.id, projectId), eq(project.userId, session.user.id)))
    .limit(1);
  if (!proj) return [];

  return db
    .select()
    .from(asset)
    .where(eq(asset.projectId, proj.id))
    .orderBy(desc(asset.createdAt))
    .limit(200);
}
