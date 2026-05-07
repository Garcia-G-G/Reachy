'use server';

import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  COPY_FORMAT_KEYS,
  type CopyFormat,
  type CopyLanguage,
  type CopyPayload,
} from '@/lib/copy-formats';
import { generateCopy } from '@/server/ai/copyGen';
import { db } from '@/server/db/client';
import { asset } from '@/server/db/schema/assets';
import { brandKit } from '@/server/db/schema/brandKits';
import { generation } from '@/server/db/schema/generations';
import { project } from '@/server/db/schema/projects';
import { getSession } from '@/server/getSession';
import { checkDailyUsage } from '@/server/lib/usage-cap';

// Validate format with a single-element fallback so z.enum gets at least one
// option even if the keys array is somehow empty at runtime (it isn't, but the
// type signature requires the non-empty tuple).
const FORMAT_VALUES = COPY_FORMAT_KEYS as [CopyFormat, ...CopyFormat[]];

const generateInput = z.object({
  projectId: z.string().uuid(),
  format: z.enum(FORMAT_VALUES),
  idea: z.string().trim().max(600).default(''),
  promptLanguage: z.enum(['en', 'es']).default('en'),
  /** When set, this overrides the project brief for this generation only. */
  oneShotBriefText: z.string().trim().max(50_000).optional(),
  /** When true, skip the project brief for this generation. */
  skipBrief: z.boolean().optional().default(false),
});

const variantInput = z.object({
  generationId: z.string().uuid(),
});

export type GenerateCopyInput = z.input<typeof generateInput>;
export type RegenerateCopyVariantInput = z.infer<typeof variantInput>;

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

interface GenerateOk {
  generationId: string;
  projectSlug: string;
  format: CopyFormat;
  payload: { es: unknown; en: unknown };
  costCents: number;
}

async function persistGenerationAndAssets(args: {
  projectId: string;
  projectSlug: string;
  format: CopyFormat;
  promptLanguage: 'en' | 'es';
  idea: string;
  result: Awaited<ReturnType<typeof generateCopy>>;
}): Promise<GenerateOk> {
  const { projectId, projectSlug, format, idea, result, promptLanguage } = args;

  // Wrap generation + asset inserts in a single transaction so we can never
  // end up with a billed generation row that has no assets (or assets with no
  // parent). If either insert fails, both roll back and the user sees the
  // failure path that re-records a `failed` generation row.
  const generationId = await db.transaction(async (tx) => {
    const [gen] = await tx
      .insert(generation)
      .values({
        projectId,
        type: 'copy',
        format,
        status: 'done',
        provider: 'openai',
        model: result.model,
        prompt: result.userPrompt,
        params: {
          idea,
          promptLanguage,
          systemPrompt: result.systemPrompt,
          usage: result.usage,
        },
        costCents: result.costCents,
        finishedAt: new Date(),
      })
      .returning({ id: generation.id });
    if (!gen) throw new Error('failed to insert generation row');

    const rows: Array<typeof asset.$inferInsert> = (['es', 'en'] as const).map((lang) => ({
      generationId: gen.id,
      projectId,
      kind: 'copy' as const,
      format,
      language: lang,
      text: serializePayload(result.payload[lang]),
    }));
    await tx.insert(asset).values(rows);
    return gen.id;
  });

  revalidatePath(`/app/projects/${projectSlug}/library`, 'layout');
  revalidatePath(`/app/projects/${projectSlug}/generate/copy`, 'layout');

  return {
    generationId,
    projectSlug,
    format,
    payload: result.payload,
    costCents: result.costCents,
  };
}

export async function generateCopyAction(
  input: GenerateCopyInput,
): Promise<ActionResult<GenerateOk>> {
  const session = await getSession();
  if (!session) return { ok: false, error: 'unauthenticated' };

  const parsed = generateInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid input' };
  }

  // Ownership + archive check. Archived projects are read-only.
  const [proj] = await db
    .select()
    .from(project)
    .where(
      and(
        eq(project.id, parsed.data.projectId),
        eq(project.userId, session.user.id),
        isNull(project.archivedAt),
      ),
    )
    .limit(1);
  if (!proj) return { ok: false, error: 'not-found' };

  const usage = await checkDailyUsage(session.user.id, 'copy');
  if (!usage.ok) return { ok: false, error: `daily-cap (${usage.used}/${usage.cap})` };

  const [kit] = await db.select().from(brandKit).where(eq(brandKit.projectId, proj.id)).limit(1);

  // Resolve which brief, if any, to use for this generation.
  // Precedence: explicit one-shot > project brief > none.
  let effectiveBrief: string | undefined;
  if (parsed.data.oneShotBriefText && parsed.data.oneShotBriefText.length > 0) {
    effectiveBrief = parsed.data.oneShotBriefText;
  } else if (!parsed.data.skipBrief && proj.briefText && proj.briefText.length > 0) {
    effectiveBrief = proj.briefText;
  }

  // Idea is required only when there is no brief; with a brief, it's the
  // optional "angle" for this specific post.
  const ideaTrimmed = parsed.data.idea;
  if (!effectiveBrief && ideaTrimmed.length < 3) {
    return { ok: false, error: 'idea-required' };
  }

  try {
    const result = await generateCopy({
      format: parsed.data.format,
      idea: ideaTrimmed,
      project: {
        name: proj.name,
        audience: proj.audience,
        tone: proj.tone,
        description: proj.description,
        websiteUrl: proj.websiteUrl,
      },
      brandKit: kit ?? null,
      promptLanguage: parsed.data.promptLanguage,
      temperature: 0.7,
      briefText: effectiveBrief,
    });

    const ok = await persistGenerationAndAssets({
      projectId: proj.id,
      projectSlug: proj.slug,
      format: parsed.data.format,
      promptLanguage: parsed.data.promptLanguage,
      idea: ideaTrimmed,
      result,
    });
    return { ok: true, data: ok };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'generation failed';
    // Persist a failed-generation row so the user has a trail in the archive.
    await db.insert(generation).values({
      projectId: proj.id,
      type: 'copy',
      format: parsed.data.format,
      status: 'failed',
      provider: 'openai',
      model: undefined,
      prompt: ideaTrimmed,
      params: { idea: ideaTrimmed, promptLanguage: parsed.data.promptLanguage },
      errorMessage: msg.slice(0, 500),
      finishedAt: new Date(),
    });
    return { ok: false, error: msg };
  }
}

export async function regenerateCopyVariant(
  input: RegenerateCopyVariantInput,
): Promise<ActionResult<GenerateOk>> {
  const session = await getSession();
  if (!session) return { ok: false, error: 'unauthenticated' };

  const parsed = variantInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid input' };
  }

  // Load original generation + verify ownership + archive state in one join.
  const [orig] = await db
    .select({
      id: generation.id,
      projectId: generation.projectId,
      projectSlug: project.slug,
      type: generation.type,
      format: generation.format,
      params: generation.params,
    })
    .from(generation)
    .innerJoin(project, eq(project.id, generation.projectId))
    .where(
      and(
        eq(generation.id, parsed.data.generationId),
        eq(project.userId, session.user.id),
        isNull(project.archivedAt),
      ),
    )
    .limit(1);
  if (!orig) return { ok: false, error: 'not-found' };
  if (orig.type !== 'copy') return { ok: false, error: 'wrong-type' };

  const usage = await checkDailyUsage(session.user.id, 'copy');
  if (!usage.ok) return { ok: false, error: `daily-cap (${usage.used}/${usage.cap})` };

  const params = (orig.params ?? {}) as { idea?: string; promptLanguage?: 'en' | 'es' };
  const idea = params.idea?.trim();
  const promptLanguage = params.promptLanguage === 'es' ? 'es' : 'en';
  const format = orig.format as CopyFormat;
  if (!COPY_FORMAT_KEYS.includes(format)) return { ok: false, error: 'unknown-format' };

  // Reload project + brand kit fresh — they may have changed since the original.
  const [proj] = await db.select().from(project).where(eq(project.id, orig.projectId)).limit(1);
  if (!proj) return { ok: false, error: 'not-found' };
  const [kit] = await db.select().from(brandKit).where(eq(brandKit.projectId, proj.id)).limit(1);
  const effectiveBrief = proj.briefText && proj.briefText.length > 0 ? proj.briefText : undefined;

  if (!idea && !effectiveBrief) return { ok: false, error: 'missing-idea-and-brief' };

  try {
    const result = await generateCopy({
      format,
      idea: idea ?? '',
      project: {
        name: proj.name,
        audience: proj.audience,
        tone: proj.tone,
        description: proj.description,
        websiteUrl: proj.websiteUrl,
      },
      brandKit: kit ?? null,
      promptLanguage,
      temperature: 0.9, // hotter for variant
      briefText: effectiveBrief,
    });
    const ok = await persistGenerationAndAssets({
      projectId: proj.id,
      projectSlug: proj.slug,
      format,
      promptLanguage,
      idea: idea ?? '',
      result,
    });
    return { ok: true, data: ok };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'variant failed';
    return { ok: false, error: msg };
  }
}

export interface CopyAssetView {
  id: string;
  generationId: string | null;
  format: CopyFormat;
  language: CopyLanguage;
  payload: CopyPayload['value'];
  rawText: string;
  createdAt: string;
}

/** Pair of (es, en) assets that came from one generation. */
export interface CopyEditionView {
  generationId: string;
  format: CopyFormat;
  createdAt: string;
  costCents: number | null;
  status: 'queued' | 'running' | 'done' | 'failed';
  errorMessage: string | null;
  es: CopyAssetView | null;
  en: CopyAssetView | null;
}

function serializePayload(value: unknown): string {
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

function deserializePayload(format: CopyFormat, raw: string | null): CopyPayload['value'] {
  if (raw === null) return '';
  // Tweet/linkedin/email-body are plain strings; everything else is JSON.
  if (format === 'tweet' || format === 'linkedin' || format === 'email-body') {
    return raw;
  }
  try {
    return JSON.parse(raw) as CopyPayload['value'];
  } catch {
    return raw; // fall back to raw text if it somehow isn't JSON
  }
}

export async function listCopyEditionsForProject(projectId: string): Promise<CopyEditionView[]> {
  const session = await getSession();
  if (!session) return [];

  const [proj] = await db
    .select({ id: project.id })
    .from(project)
    .where(
      and(
        eq(project.id, projectId),
        eq(project.userId, session.user.id),
        isNull(project.archivedAt),
      ),
    )
    .limit(1);
  if (!proj) return [];

  // Fetch the last 100 copy generations and their assets.
  const gens = await db
    .select()
    .from(generation)
    .where(and(eq(generation.projectId, proj.id), eq(generation.type, 'copy')))
    .orderBy(desc(generation.createdAt))
    .limit(100);

  if (gens.length === 0) return [];

  const genIds = gens.map((g) => g.id);
  // Pull only the copy-assets that belong to these generations — server-side
  // filter, no full-table scan. The composite predicate hits asset_generation_id_idx
  // and avoids returning every copy asset in the database.
  const scopedAssets = await db
    .select()
    .from(asset)
    .where(and(eq(asset.kind, 'copy'), inArray(asset.generationId, genIds)));

  const assetsByGen = new Map<string, typeof scopedAssets>();
  for (const a of scopedAssets) {
    if (!a.generationId) continue;
    const list = assetsByGen.get(a.generationId) ?? [];
    list.push(a);
    assetsByGen.set(a.generationId, list);
  }

  return gens.map((g) => {
    const list = assetsByGen.get(g.id) ?? [];
    const format = g.format as CopyFormat;
    const es = list.find((a) => a.language === 'es') ?? null;
    const en = list.find((a) => a.language === 'en') ?? null;

    const buildView = (a: (typeof list)[number] | null): CopyAssetView | null => {
      if (!a) return null;
      return {
        id: a.id,
        generationId: a.generationId,
        format,
        language: a.language as CopyLanguage,
        payload: deserializePayload(format, a.text),
        rawText: a.text ?? '',
        createdAt: a.createdAt.toISOString(),
      };
    };

    return {
      generationId: g.id,
      format,
      createdAt: g.createdAt.toISOString(),
      costCents: g.costCents,
      status: g.status,
      errorMessage: g.errorMessage,
      es: buildView(es),
      en: buildView(en),
    };
  });
}
