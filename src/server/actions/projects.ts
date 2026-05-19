'use server';

import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/server/db/client';
import { generation } from '@/server/db/schema/generations';
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

  // Capture the prior slug so we can invalidate its cached paths if the slug changes.
  const [prior] = await db
    .select({ slug: project.slug })
    .from(project)
    .where(and(eq(project.id, id), eq(project.userId, session.user.id)))
    .limit(1);

  try {
    const [row] = await db
      .update(project)
      .set(patch)
      .where(and(eq(project.id, id), eq(project.userId, session.user.id)))
      .returning();
    if (!row) return { ok: false, error: 'not-found' };

    revalidatePath('/app', 'layout');
    revalidatePath(`/app/projects/${row.slug}`, 'layout');
    if (prior && prior.slug !== row.slug) {
      revalidatePath(`/app/projects/${prior.slug}`, 'layout');
    }
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
  revalidatePath(`/app/projects/${row.slug}`, 'layout');
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

export interface ProjectOverviewStats {
  /** Count of generations in 'done' status for this project (all-time). */
  piecesDone: number;
  /** Count of generations currently queued or running. */
  inFlight: number;
  /** Sum of cost_cents for generations finished this calendar month. */
  monthSpendCents: number;
}

/**
 * Overview-page stats for a single project. The page was rendering hardcoded
 * zeros until this landed — see DIAGNOSTIC + dashboard screenshot from
 * 2026-05-14. Returns null when the project isn't owned by the current user
 * (caller can then 404).
 */
export async function getProjectOverviewStats(
  projectId: string,
): Promise<ProjectOverviewStats | null> {
  const session = await getSession();
  if (!session) return null;

  // Confirm ownership before counting — otherwise a crafted projectId from
  // another user would leak counts.
  const [owned] = await db
    .select({ id: project.id })
    .from(project)
    .where(and(eq(project.id, projectId), eq(project.userId, session.user.id)))
    .limit(1);
  if (!owned) return null;

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  // postgres-js v3.4.9 rejects raw Date objects bound via drizzle's
  // sql`…${value}` template — it tries to Buffer.from(date) which
  // throws ERR_INVALID_ARG_TYPE. Pre-serializing to ISO string lands
  // in postgres-js's string path and parses cleanly as timestamptz.
  const monthStartIso = monthStart.toISOString();

  // One aggregate query with filtered counts/sum so the page renders in
  // one round-trip. Drizzle's sql helper lets us inline FILTER (WHERE …).
  const [row] = await db
    .select({
      piecesDone: sql<number>`COUNT(*) FILTER (WHERE ${generation.status} = 'done')`,
      inFlight: sql<number>`COUNT(*) FILTER (WHERE ${generation.status} IN ('queued', 'running'))`,
      monthSpendCents: sql<number>`COALESCE(SUM(${generation.costCents}) FILTER (WHERE ${generation.status} = 'done' AND ${generation.finishedAt} >= ${monthStartIso}), 0)`,
    })
    .from(generation)
    .where(eq(generation.projectId, projectId));

  // Postgres COUNT/SUM come back as strings via the pg driver; coerce.
  return {
    piecesDone: Number(row?.piecesDone ?? 0),
    inFlight: Number(row?.inFlight ?? 0),
    monthSpendCents: Number(row?.monthSpendCents ?? 0),
  };
}

export async function getProjectBySlug(slug: string): Promise<Project | null> {
  const session = await getSession();
  if (!session) return null;

  // Filter out archived projects so /app/projects/{archived-slug} 404s.
  const [row] = await db
    .select()
    .from(project)
    .where(
      and(eq(project.userId, session.user.id), eq(project.slug, slug), isNull(project.archivedAt)),
    )
    .limit(1);
  return row ?? null;
}

function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = (err as { code?: unknown }).code;
  return code === '23505';
}
