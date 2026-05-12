'use server';

import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  REEL_TEMPLATE_KEYS,
  type ReelEngine,
  type ReelPlan,
  type ReelTemplateKey,
  type SceneSlot,
} from '@/lib/reel-templates';
import { planReel } from '@/server/ai/reelPlanner';
import { db } from '@/server/db/client';
import { asset } from '@/server/db/schema/assets';
import { brandKit } from '@/server/db/schema/brandKits';
import { generation } from '@/server/db/schema/generations';
import { project } from '@/server/db/schema/projects';
import { getSession } from '@/server/getSession';
import { getVideoQueue } from '@/server/jobs/videoQueue';
import { checkDailyUsage } from '@/server/lib/usage-cap';

const TEMPLATE_VALUES = REEL_TEMPLATE_KEYS as [ReelTemplateKey, ...ReelTemplateKey[]];

const planInput = z.object({
  projectId: z.string().uuid(),
  template: z.enum(TEMPLATE_VALUES),
  idea: z.string().trim().min(3).max(600),
  language: z.enum(['en', 'es']).default('en'),
});

const SCENE_SLOTS: [SceneSlot, ...SceneSlot[]] = [
  'problem',
  'problem_amplified',
  'solution',
  'benefit',
  'cta',
  'hook',
  'feature',
  'announcement',
  'detail',
];

const plannedSceneSchema = z.object({
  slot: z.enum(SCENE_SLOTS),
  durationSec: z.number().positive().max(30),
  text: z.string().trim().max(160),
  textPosition: z.enum(['top', 'bottom', 'center']),
  imagePrompt: z.string().trim().max(600),
  background: z.enum(['image', 'brand']),
});

const planSchema = z.object({
  template: z.enum(TEMPLATE_VALUES),
  tagline: z.string().trim().min(1).max(160),
  scenes: z.array(plannedSceneSchema).min(1).max(10),
});

// Tighten URL validation: z.string().url() accepts file://, javascript:, data:,
// ftp: — anything WHATWG considers a valid URL. Without the protocol guard a
// malicious caller could ask the worker to read /etc/passwd via file:// or
// hit an internal SSRF target. Restrict to http(s) on the public R2 host.
const httpsUrl = z
  .string()
  .url()
  .refine((u) => /^https?:\/\//i.test(u), {
    message: 'sceneImageUrl must be http(s)',
  });

const composeInput = z.object({
  projectId: z.string().uuid(),
  engine: z.enum(['ffmpeg', 'veo']),
  plan: planSchema,
  /** For engine='ffmpeg': one URL per scene (`null` for brand-bg scenes). */
  sceneImageUrls: z.array(httpsUrl.nullable()).optional(),
});

export type PlanReelInput = z.infer<typeof planInput>;
export type ComposeReelInput = z.infer<typeof composeInput>;

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function loadOwnedProject(projectId: string, userId: string) {
  const [proj] = await db
    .select()
    .from(project)
    .where(and(eq(project.id, projectId), eq(project.userId, userId), isNull(project.archivedAt)))
    .limit(1);
  return proj;
}

export async function planReelAction(
  input: PlanReelInput,
): Promise<ActionResult<{ plan: ReelPlan; costCents: number }>> {
  const session = await getSession();
  if (!session) return { ok: false, error: 'unauthenticated' };

  const parsed = planInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid input' };
  }

  const proj = await loadOwnedProject(parsed.data.projectId, session.user.id);
  if (!proj) return { ok: false, error: 'not-found' };

  // Planning calls OpenAI; count it against the copy cap (not video — that's
  // the actual reel generation).
  const usage = await checkDailyUsage(session.user.id, 'copy');
  if (!usage.ok) return { ok: false, error: `daily-cap (${usage.used}/${usage.cap})` };

  const [kit] = await db.select().from(brandKit).where(eq(brandKit.projectId, proj.id)).limit(1);

  try {
    const result = await planReel({
      template: parsed.data.template,
      idea: parsed.data.idea,
      language: parsed.data.language,
      project: {
        name: proj.name,
        audience: proj.audience,
        tone: proj.tone,
        description: proj.description,
        websiteUrl: proj.websiteUrl,
      },
      brandKit: kit ?? null,
    });
    return { ok: true, data: { plan: result.plan, costCents: result.costCents } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'plan failed' };
  }
}

export interface ComposeOk {
  generationId: string;
  projectSlug: string;
  engine: ReelEngine;
}

export async function composeReelAction(input: ComposeReelInput): Promise<ActionResult<ComposeOk>> {
  const session = await getSession();
  if (!session) return { ok: false, error: 'unauthenticated' };

  const parsed = composeInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid input' };
  }

  const proj = await loadOwnedProject(parsed.data.projectId, session.user.id);
  if (!proj) return { ok: false, error: 'not-found' };

  const usage = await checkDailyUsage(session.user.id, 'video');
  if (!usage.ok) return { ok: false, error: `daily-cap (${usage.used}/${usage.cap})` };

  // Brand colors are required for the brand-background CTA scene; fall back
  // to ink + paper if the project has no kit yet.
  const [kit] = await db.select().from(brandKit).where(eq(brandKit.projectId, proj.id)).limit(1);
  const brandColorHex = kit?.primaryColor ?? '#14110D';
  const brandTextHex = kit?.bgColor ?? '#F1EBDF';

  // sceneImageUrls is now optional. When omitted (or holes), the worker
  // auto-generates the missing scenes from each scene's imagePrompt via
  // OpenAI gpt-image-1 + R2 (see runFfmpeg in src/server/jobs/videoWorker.ts).
  // Validate length only when the caller does pass URLs so a stale client
  // can't desync the array with the plan.
  if (parsed.data.engine === 'ffmpeg' && parsed.data.sceneImageUrls) {
    if (parsed.data.sceneImageUrls.length !== parsed.data.plan.scenes.length) {
      return { ok: false, error: 'sceneImageUrls length mismatch' };
    }
  }

  const [gen] = await db
    .insert(generation)
    .values({
      projectId: proj.id,
      type: 'video',
      format: parsed.data.plan.template,
      status: 'queued',
      provider: parsed.data.engine === 'veo' ? 'fal' : 'ffmpeg',
      model: parsed.data.engine === 'veo' ? 'fal-ai/veo3.1/fast' : 'ffmpeg',
      prompt: parsed.data.plan.tagline,
      params: {
        engine: parsed.data.engine,
        plan: parsed.data.plan,
      },
    })
    .returning();
  if (!gen) return { ok: false, error: 'enqueue failed' };

  try {
    await getVideoQueue().add(
      'compose',
      {
        generationId: gen.id,
        projectId: proj.id,
        projectSlug: proj.slug,
        engine: parsed.data.engine as ReelEngine,
        plan: parsed.data.plan,
        brandColorHex,
        brandTextHex,
        sceneImageUrls: parsed.data.sceneImageUrls,
      },
      { jobId: gen.id },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'queue error';
    await db
      .update(generation)
      .set({ status: 'failed', errorMessage: `queue add failed: ${msg}`, finishedAt: new Date() })
      .where(eq(generation.id, gen.id));
    return { ok: false, error: 'queue-unreachable' };
  }

  revalidatePath(`/app/projects/${proj.slug}/library`, 'layout');
  revalidatePath(`/app/projects/${proj.slug}/generate/reel`, 'layout');
  return {
    ok: true,
    data: { generationId: gen.id, projectSlug: proj.slug, engine: parsed.data.engine },
  };
}

export interface ReelGenerationView {
  generationId: string;
  template: ReelTemplateKey;
  status: 'queued' | 'running' | 'done' | 'failed';
  errorMessage: string | null;
  costCents: number | null;
  createdAt: string;
  finishedAt: string | null;
  videoUrl: string | null;
  durationSec: number | null;
  bytes: number | null;
  engine: ReelEngine;
  tagline: string;
}

export async function listReelsForProject(projectId: string): Promise<ReelGenerationView[]> {
  const session = await getSession();
  if (!session) return [];

  const proj = await loadOwnedProject(projectId, session.user.id);
  if (!proj) return [];

  const gens = await db
    .select()
    .from(generation)
    .where(and(eq(generation.projectId, proj.id), eq(generation.type, 'video')))
    .orderBy(desc(generation.createdAt))
    .limit(50);
  if (gens.length === 0) return [];

  const ids = gens.map((g) => g.id);
  const assets = await db
    .select()
    .from(asset)
    .where(and(eq(asset.kind, 'video'), inArray(asset.generationId, ids)));
  const byGen = new Map<string, (typeof assets)[number]>();
  for (const a of assets) {
    if (a.generationId) byGen.set(a.generationId, a);
  }

  return gens.map((g) => {
    const a = byGen.get(g.id);
    const params = (g.params ?? {}) as { engine?: ReelEngine; plan?: ReelPlan };
    return {
      generationId: g.id,
      template: g.format as ReelTemplateKey,
      status: g.status,
      errorMessage: g.errorMessage,
      costCents: g.costCents,
      createdAt: g.createdAt.toISOString(),
      finishedAt: g.finishedAt?.toISOString() ?? null,
      videoUrl: a?.publicUrl ?? null,
      durationSec: a?.durationSec ?? null,
      bytes: a?.bytes ?? null,
      engine: params.engine ?? 'ffmpeg',
      tagline: params.plan?.tagline ?? g.prompt ?? '',
    };
  });
}
