import 'server-only';
import { tool } from 'ai';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/server/db/client';
import { campaignAsset } from '@/server/db/schema/campaignAssets';
import { campaign } from '@/server/db/schema/campaigns';
import { generation } from '@/server/db/schema/generations';
import type { EmmaToolContext } from '../context';

/**
 * recommendNextStep — Phase 07h.
 *
 * Reads the current project's state and returns a structured digest
 * Emma can synthesize into 2-4 bulleted options. Inputs the model
 * needs to make a good recommendation:
 *
 *   - Has the project ever generated anything? (drives "you have no
 *     assets — let's start with X" vs "let's iterate on what you have")
 *   - Last campaign status (planning / awaiting_approval / running /
 *     done / failed) + how many assets ended up with quality_warning
 *   - Recent generation activity (last 7 days count)
 *   - Brand kit completeness (palette, voice, visualStyle set)
 *
 * Pure read. Emma calls this when the user asks "what should I do"
 * or "where do I go next".
 */

export function createRecommendNextStepTool(ctx: EmmaToolContext) {
  return tool({
    description:
      'Read the current project state and return a digest Emma uses to suggest next actions. Call when the user asks "what should I do" / "where do I go next" / "no sé qué hacer".',
    inputSchema: z.object({}).strict(),
    execute: async () => {
      const projectId = ctx.projectId;

      // Last 5 generations regardless of status — anchors "have you
      // done anything recently".
      const recent = await db
        .select({
          id: generation.id,
          type: generation.type,
          status: generation.status,
          createdAt: generation.createdAt,
        })
        .from(generation)
        .where(eq(generation.projectId, projectId))
        .orderBy(desc(generation.createdAt))
        .limit(5);

      // Most recent campaign (any status).
      const [latestCampaign] = await db
        .select()
        .from(campaign)
        .where(eq(campaign.projectId, projectId))
        .orderBy(desc(campaign.createdAt))
        .limit(1);

      // If there's a campaign, count its quality_warning assets so
      // the recommendation can flag "review the 2 cards that flagged".
      let qualityWarningCount = 0;
      let totalAssetsInLastCampaign = 0;
      if (latestCampaign) {
        const assets = await db
          .select({ status: campaignAsset.status, statusDetail: campaignAsset.statusDetail })
          .from(campaignAsset)
          .where(eq(campaignAsset.campaignId, latestCampaign.id));
        totalAssetsInLastCampaign = assets.length;
        qualityWarningCount = assets.filter((a) => a.statusDetail === 'quality_warning').length;
      }

      const kit = ctx.brandKit;
      const brandKitGaps: string[] = [];
      if (!kit.primaryColor || !kit.bgColor || !kit.accentColor) brandKitGaps.push('palette');
      if (!kit.voice?.tone) brandKitGaps.push('voice tone');
      if (!kit.visualStyle) brandKitGaps.push('visual style');
      if (!kit.referenceAssetKeys || kit.referenceAssetKeys.length === 0)
        brandKitGaps.push('reference images');

      return {
        projectName: ctx.project.name,
        projectSlug: ctx.project.slug,
        recentGenerationCount: recent.length,
        hasAnyGenerations: recent.length > 0,
        recentGenerationsSummary: recent.map((r) => ({
          kind: r.type,
          status: r.status,
        })),
        latestCampaign: latestCampaign
          ? {
              id: latestCampaign.id,
              status: latestCampaign.status,
              totalAssets: totalAssetsInLastCampaign,
              qualityWarningCount,
            }
          : null,
        brandKitGaps,
        productBriefLoaded: ctx.productBrief !== null,
        language: ctx.language,
      };
    },
  });
}
