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
  .regex(/^#([0-9a-fA-F]{3}){1,2}$/, 'Use a hex color (#abc or #aabbcc)');

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
  languages: z
    .array(z.enum(['en', 'es']))
    .min(1)
    .max(2)
    .optional(),
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

  const [kit] = await db.select().from(brandKit).where(eq(brandKit.projectId, proj.id)).limit(1);

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

  // Only write fields the caller provided. Unset columns inherit DB defaults
  // on INSERT and stay untouched on UPDATE.
  const insertValues: typeof brandKit.$inferInsert = { projectId };
  const updateSet: Partial<typeof brandKit.$inferInsert> = {};
  if (rest.primaryColor !== undefined) {
    insertValues.primaryColor = rest.primaryColor;
    updateSet.primaryColor = rest.primaryColor;
  }
  if (rest.secondaryColor !== undefined) {
    insertValues.secondaryColor = rest.secondaryColor;
    updateSet.secondaryColor = rest.secondaryColor;
  }
  if (rest.accentColor !== undefined) {
    insertValues.accentColor = rest.accentColor;
    updateSet.accentColor = rest.accentColor;
  }
  if (rest.bgColor !== undefined) {
    insertValues.bgColor = rest.bgColor;
    updateSet.bgColor = rest.bgColor;
  }
  if (rest.fontHeading !== undefined) {
    insertValues.fontHeading = rest.fontHeading;
    updateSet.fontHeading = rest.fontHeading;
  }
  if (rest.fontBody !== undefined) {
    insertValues.fontBody = rest.fontBody;
    updateSet.fontBody = rest.fontBody;
  }
  if (rest.voice !== undefined) {
    insertValues.voice = rest.voice;
    updateSet.voice = rest.voice;
  }
  if (rest.keywords !== undefined) {
    insertValues.keywords = rest.keywords;
    updateSet.keywords = rest.keywords;
  }
  if (rest.languages !== undefined) {
    insertValues.languages = rest.languages;
    updateSet.languages = rest.languages;
  }

  const [row] = await db
    .insert(brandKit)
    .values(insertValues)
    .onConflictDoUpdate({
      target: brandKit.projectId,
      set: updateSet,
    })
    .returning();

  if (!row) return { ok: false, error: 'upsert failed' };

  revalidatePath(`/app/projects/${proj.slug}/identity`);
  return { ok: true, data: row };
}
