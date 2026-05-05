'use server';

import { and, asc, eq, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/server/db/client';
import { project } from '@/server/db/schema/projects';
import { getSession } from '@/server/getSession';

const slugRegex = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

const createProjectInput = z.object({
  name: z.string().trim().min(2).max(60),
  slug: z
    .string()
    .trim()
    .regex(slugRegex, 'lowercase letters, numbers, dashes; min 2 chars')
    .min(2)
    .max(60),
  description: z.string().trim().max(280).optional().or(z.literal('')),
  websiteUrl: z.string().trim().url().optional().or(z.literal('')),
  audience: z.string().trim().max(200).optional().or(z.literal('')),
  tone: z.string().trim().max(200).optional().or(z.literal('')),
});

const updateProjectInput = createProjectInput.partial().extend({
  id: z.string().uuid(),
});

export type CreateProjectInput = z.infer<typeof createProjectInput>;
export type UpdateProjectInput = z.infer<typeof updateProjectInput>;
export type Project = typeof project.$inferSelect;

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

function emptyToNull<T extends string | undefined>(v: T): string | null {
  if (v === undefined || v === null || v.trim() === '') return null;
  return v;
}

export async function createProject(input: CreateProjectInput): Promise<ActionResult<Project>> {
  const session = await getSession();
  if (!session) return { ok: false, error: 'unauthenticated' };

  const parsed = createProjectInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid input' };
  }

  try {
    const [row] = await db
      .insert(project)
      .values({
        userId: session.user.id,
        name: parsed.data.name,
        slug: parsed.data.slug,
        description: emptyToNull(parsed.data.description),
        websiteUrl: emptyToNull(parsed.data.websiteUrl),
        audience: emptyToNull(parsed.data.audience),
        tone: emptyToNull(parsed.data.tone),
      })
      .returning();
    if (!row) return { ok: false, error: 'insert failed' };

    revalidatePath('/app', 'layout');
    return { ok: true, data: row };
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { ok: false, error: 'slug-taken' };
    }
    throw err;
  }
}

export async function updateProject(input: UpdateProjectInput): Promise<ActionResult<Project>> {
  const session = await getSession();
  if (!session) return { ok: false, error: 'unauthenticated' };

  const parsed = updateProjectInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid input' };
  }

  const { id, ...rest } = parsed.data;
  const patch: Partial<typeof project.$inferInsert> = {};
  if (rest.name !== undefined) patch.name = rest.name;
  if (rest.slug !== undefined) patch.slug = rest.slug;
  if (rest.description !== undefined) patch.description = emptyToNull(rest.description);
  if (rest.websiteUrl !== undefined) patch.websiteUrl = emptyToNull(rest.websiteUrl);
  if (rest.audience !== undefined) patch.audience = emptyToNull(rest.audience);
  if (rest.tone !== undefined) patch.tone = emptyToNull(rest.tone);

  try {
    const [row] = await db
      .update(project)
      .set(patch)
      .where(and(eq(project.id, id), eq(project.userId, session.user.id)))
      .returning();
    if (!row) return { ok: false, error: 'not-found' };

    revalidatePath('/app', 'layout');
    revalidatePath(`/app/projects/${row.slug}`);
    return { ok: true, data: row };
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { ok: false, error: 'slug-taken' };
    }
    throw err;
  }
}

export async function archiveProject(id: string): Promise<ActionResult<Project>> {
  const session = await getSession();
  if (!session) return { ok: false, error: 'unauthenticated' };

  const [row] = await db
    .update(project)
    .set({ archivedAt: new Date() })
    .where(and(eq(project.id, id), eq(project.userId, session.user.id)))
    .returning();
  if (!row) return { ok: false, error: 'not-found' };

  revalidatePath('/app', 'layout');
  return { ok: true, data: row };
}

export async function listProjectsForCurrentUser(): Promise<Project[]> {
  const session = await getSession();
  if (!session) return [];

  return db
    .select()
    .from(project)
    .where(and(eq(project.userId, session.user.id), isNull(project.archivedAt)))
    .orderBy(asc(project.createdAt));
}

export async function getProjectBySlug(slug: string): Promise<Project | null> {
  const session = await getSession();
  if (!session) return null;

  const [row] = await db
    .select()
    .from(project)
    .where(and(eq(project.userId, session.user.id), eq(project.slug, slug)))
    .limit(1);
  return row ?? null;
}

function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = (err as { code?: unknown }).code;
  return code === '23505';
}
