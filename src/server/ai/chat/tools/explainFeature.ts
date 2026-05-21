import 'server-only';
import { tool } from 'ai';
import { z } from 'zod';
import { EMMA_FEATURE_KEYS, emmaFeatureByKey } from '@/server/config/emmaFeatures';
import type { EmmaToolContext } from '../context';

/**
 * explainFeature — Phase 07h.
 *
 * Reads from the EMMA_FEATURES knowledge base and returns a
 * structured payload Emma can quote verbatim. The catalog covers
 * the major Reachy surfaces (autopilot, generate-image, library,
 * identity, campaigns, etc.).
 *
 * Pure read. Resolves {slug} in the navPath against the current
 * project context so Emma can pair the explanation with a
 * navigateTo call.
 */
export function createExplainFeatureTool(ctx: EmmaToolContext) {
  const keyEnum = EMMA_FEATURE_KEYS as [string, ...string[]];
  return tool({
    description:
      'Explain a Reachy feature. Returns bilingual title + description + CTA + navPath. Use when the user asks "what is X" or "how do I do Y".',
    inputSchema: z
      .object({
        featureKey: z
          .enum(keyEnum)
          .describe(
            'Catalog key — e.g. autopilot / generate-image / library / identity / campaigns.',
          ),
      })
      .strict(),
    execute: async (input) => {
      const feature = emmaFeatureByKey(input.featureKey);
      if (!feature) {
        return { error: `unknown feature key: ${input.featureKey}` };
      }
      const lang = ctx.language;
      const title = lang === 'es' ? feature.titleEs : feature.titleEn;
      const description = lang === 'es' ? feature.descriptionEs : feature.descriptionEn;
      const ctaLabel = lang === 'es' ? feature.ctaLabelEs : feature.ctaLabelEn;

      // Resolve {slug} in the nav path. If the feature requires a
      // project but there's no slug, surface that gap so Emma can
      // ask the user to pick a project first.
      let navPath: string | null = feature.navPath ?? null;
      let navRequiresProject = false;
      if (navPath?.includes('{slug}')) {
        const slug = ctx.project.slug ?? null;
        if (!slug) {
          navPath = null;
          navRequiresProject = true;
        } else {
          navPath = navPath.replaceAll('{slug}', slug);
        }
      }

      return {
        key: feature.key,
        title,
        description,
        ctaLabel,
        navPath,
        navRequiresProject,
      };
    },
  });
}
