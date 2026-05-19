import 'server-only';
import { and, eq, like } from 'drizzle-orm';
import { FALLBACK_PALETTE } from '@/server/config/fallbackPalette';
import { visualStyleForTone } from '@/server/config/toneToVisualStyle';
import { voiceForTone } from '@/server/config/toneToVoice';
import { db } from '@/server/db/client';
import { brandKit } from '@/server/db/schema/brandKits';
import { project } from '@/server/db/schema/projects';
import type { ProductBrief } from './extractBrief';
import type { VisualIdentity } from './extractVisualIdentity';
import {
  briefPaletteIsSentinel,
  inferPaletteFromText,
  UNKNOWN_PALETTE_SENTINEL,
} from './inferPaletteFromText';

/**
 * Create a project + brand_kit row from a ProductBrief (Step 2's
 * autopilot output). Runs in a single DB transaction so a failure
 * never leaves a project orphaned without a brand kit.
 *
 * Vision identity, when present, overrides the brief's text-derived
 * palette (vision reads real images; the LLM reads "burnt orange").
 * Logo R2 key from vision is appended to referenceAssetKeys ahead of
 * any other reference image so the brand kit's first ref is the logo.
 */

export interface AutoCreateProjectInput {
  brief: ProductBrief;
  visualIdentity: VisualIdentity | null;
  userId: string;
  ingestionId: string;
}

export interface AutoCreateProjectResult {
  projectId: string;
  projectSlug: string;
  brandKitId: string;
}

/** Coarse slug helper — lowercase, dash-separated, no diacritics. The
 *  zod validator in actions/projects.ts mirrors this; keep both
 *  formats compatible. */
function isValidHex(s: string | null | undefined): s is string {
  return typeof s === 'string' && /^#[0-9a-fA-F]{6}$/.test(s);
}

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'project'
  );
}

/** Resolve a unique slug for this user — append `-2`, `-3`, … if the
 *  base slug collides with an existing project. */
async function uniqueSlug(userId: string, base: string): Promise<string> {
  const taken = await db
    .select({ slug: project.slug })
    .from(project)
    .where(and(eq(project.userId, userId), like(project.slug, `${base}%`)));
  const used = new Set(taken.map((r) => r.slug));
  if (!used.has(base)) return base;
  for (let n = 2; n < 1000; n++) {
    const candidate = `${base}-${n}`;
    if (!used.has(candidate)) return candidate;
  }
  // Pathological case — fall through to a timestamp suffix.
  return `${base}-${Date.now()}`;
}

export async function autoCreateProjectFromBrief(
  args: AutoCreateProjectInput,
): Promise<AutoCreateProjectResult> {
  const { brief, visualIdentity, userId, ingestionId } = args;

  // Phase 06 palette fallback chain — fixes monochrome-output bug for
  // text-only uploads. Resolution order (per slot):
  //   1. vision (when present and slot filled)
  //   2. text-inferred (when vision absent OR slot empty)
  //   3. brief.paletteHex (when not the "#000000" sentinel)
  //   4. FALLBACK_PALETTE (final safety net)
  //
  // Text-inference runs once when vision didn't fire OR when the brief
  // came back with the sentinel ("model couldn't confidently infer").
  // Cost ~1¢ — worth it to avoid shipping warmed-over editorial defaults
  // on every text-only upload.
  const briefSentinel = briefPaletteIsSentinel(brief.paletteHex);
  const needsTextInference =
    !visualIdentity || briefSentinel || !isValidHex(visualIdentity.paletteHex.ink);

  let textInferred: { ink: string; paper: string; accent: string } | null = null;
  if (needsTextInference) {
    const result = await inferPaletteFromText({
      brief: {
        name: brief.name,
        oneLiner: brief.oneLiner,
        problem: brief.problem,
        tone: brief.tone,
        audience: brief.audience,
      },
    });
    textInferred = { ink: result.ink, paper: result.paper, accent: result.accent };
    console.log(
      `[reachy:autopilot] palette inferred from text: ${result.ink} / ${result.paper} / ${result.accent} — ${result.reasoning.slice(0, 120)}`,
    );
  }

  const resolveSlot = (slot: 'ink' | 'paper' | 'accent'): string => {
    const v = visualIdentity?.paletteHex[slot];
    if (isValidHex(v)) return v;
    if (textInferred) return textInferred[slot];
    const fromBrief = brief.paletteHex[slot];
    if (isValidHex(fromBrief) && fromBrief !== UNKNOWN_PALETTE_SENTINEL) return fromBrief;
    return FALLBACK_PALETTE[slot];
  };

  const ink = resolveSlot('ink');
  const paper = resolveSlot('paper');
  const accent = resolveSlot('accent');

  // Reference images: logo first (when vision found one), then the
  // brief's curated set, dedup.
  const refKeys: string[] = [];
  if (visualIdentity?.logoR2Key) refKeys.push(visualIdentity.logoR2Key);
  for (const k of brief.referenceImages) {
    if (!refKeys.includes(k)) refKeys.push(k);
  }

  const baseSlug = slugify(brief.name);
  const slug = await uniqueSlug(userId, baseSlug);

  // Audience is a structured array in the brief; persist as JSON
  // string in project.audience (the existing column shape).
  const audienceJson = JSON.stringify(brief.audience ?? []);
  const tone = brief.tone;
  const voice = voiceForTone(tone);
  const visualStyle = visualStyleForTone(tone);

  return await db.transaction(async (tx) => {
    const [createdProject] = await tx
      .insert(project)
      .values({
        userId,
        name: brief.name,
        slug,
        description: brief.oneLiner,
        audience: audienceJson,
        tone,
        sourceIngestionId: ingestionId,
      })
      .returning();
    if (!createdProject)
      throw new Error('autoCreateProjectFromBrief: project insert returned no row');

    const [createdKit] = await tx
      .insert(brandKit)
      .values({
        projectId: createdProject.id,
        primaryColor: ink,
        bgColor: paper,
        accentColor: accent,
        voice,
        keywords: brief.valueProps.slice(0, 8),
        languages: brief.languages,
        visualStyle,
        referenceAssetKeys: refKeys,
        // allowsHumans + qualityGateEnabled keep their schema defaults
        // (true / true) — the user can flip them in the brand-kit UI.
      })
      .returning();
    if (!createdKit)
      throw new Error('autoCreateProjectFromBrief: brand_kit insert returned no row');

    return {
      projectId: createdProject.id,
      projectSlug: createdProject.slug,
      brandKitId: createdKit.id,
    };
  });
}
