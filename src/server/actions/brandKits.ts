'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/server/db/client';
import { brandKit } from '@/server/db/schema/brandKits';
import { project } from '@/server/db/schema/projects';
import { getSession } from '@/server/getSession';

const hexColor = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Use a 6-digit hex color (#aabbcc)');

const voiceSchema = z.object({
  tone: z.string().trim().max(280).default(''),
  doSay: z.array(z.string().trim().max(200)).max(20).default([]),
  dontSay: z.array(z.string().trim().max(200)).max(20).default([]),
});

const upsertBrandKitInput = z.object({
  projectId: z.string().uuid(),
  primaryColor: hexColor.optional().nullable(),
  secondaryColor: hexColor.optional().nullable(),
  accentColor: hexColor.optional().nullable(),
  bgColor: hexColor.optional().nullable(),
  fontHeading: z.string().trim().max(80).optional().nullable(),
  fontBody: z.string().trim().max(80).optional().nullable(),
  voice: voiceSchema.optional(),
  keywords: z.array(z.string().trim().min(1).max(40)).max(40).optional(),
  languages: z.array(z.enum(['en', 'es'])).min(1).max(2).optional(),
});

export type UpsertBrandKitInput = z.infer<typeof upsertBrandKitInput>;
export type BrandKit = typeof brandKit.$inferSelect;

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

export async function getBrandKitForProject(
  projectId: string,
): Promise<{ project: typeof project.$inferSelect; brandKit: BrandKit | null } | null> {
  const session = await getSession();
  if (!session) return null;

  const [proj] = await db
    .select()
    .from(project)
    .where(and(eq(project.id, projectId), eq(project.userId, session.user.id)))
    .limit(1);
  if (!proj) return null;

  const [kit] = await db
    .select()
    .from(brandKit)
    .where(eq(brandKit.projectId, proj.id))
    .limit(1);

  return { project: proj, brandKit: kit ?? null };
}

export async function upsertBrandKit(input: UpsertBrandKitInput): Promise<ActionResult<BrandKit>> {
  const session = await getSession();
  if (!session) return { ok: false, error: 'unauthenticated' };

  const parsed = upsertBrandKitInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid input' };
  }

  // Verify ownership of the parent project before any write.
  const [proj] = await db
    .select({ id: project.id, slug: project.slug })
    .from(project)
    .where(and(eq(project.id, parsed.data.projectId), eq(project.userId, session.user.id)))
    .limit(1);
  if (!proj) return { ok: false, error: 'not-found' };

  const { projectId, ...rest } = parsed.data;

  const [row] = await db
    .insert(brandKit)
    .values({
      projectId,
      primaryColor: rest.primaryColor ?? null,
      secondaryColor: rest.secondaryColor ?? null,
      accentColor: rest.accentColor ?? null,
      bgColor: rest.bgColor ?? null,
      fontHeading: rest.fontHeading ?? null,
      fontBody: rest.fontBody ?? null,
      voice: rest.voice ?? null,
      keywords: rest.keywords ?? [],
      languages: rest.languages ?? ['en'],
    })
    .onConflictDoUpdate({
      target: brandKit.projectId,
      set: {
        ...(rest.primaryColor !== undefined && { primaryColor: rest.primaryColor }),
        ...(rest.secondaryColor !== undefined && { secondaryColor: rest.secondaryColor }),
        ...(rest.accentColor !== undefined && { accentColor: rest.accentColor }),
        ...(rest.bgColor !== undefined && { bgColor: rest.bgColor }),
        ...(rest.fontHeading !== undefined && { fontHeading: rest.fontHeading }),
        ...(rest.fontBody !== undefined && { fontBody: rest.fontBody }),
        ...(rest.voice !== undefined && { voice: rest.voice }),
        ...(rest.keywords !== undefined && { keywords: rest.keywords }),
        ...(rest.languages !== undefined && { languages: rest.languages }),
      },
    })
    .returning();

  if (!row) return { ok: false, error: 'upsert failed' };

  revalidatePath(`/app/projects/${proj.slug}/identity`);
  return { ok: true, data: row };
}
