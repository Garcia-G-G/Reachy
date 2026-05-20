import 'server-only';
import { tool } from 'ai';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { ImageFormat } from '@/server/ai/formats';
import { getLayout, type LayoutId } from '@/server/ai/layoutTemplates';
import { buildImagePrompt } from '@/server/ai/promptBuilder';
import { canonicalizeVisualStyleKey } from '@/server/ai/visualStyles';
import { TOOL_DESCRIPTIONS } from '@/server/config/chatToolDescriptions';
import { db } from '@/server/db/client';
import { asset } from '@/server/db/schema/assets';
import { generation } from '@/server/db/schema/generations';
import { getImageQueue } from '@/server/jobs/queue';
import type { EmmaToolContext } from '../../context';

/**
 * regenerateAsset — produces a new asset informed by an existing one
 * plus a tweak hint. Re-uses the original generation's idea + format +
 * layout but appends the hint to the brief so Emma can land "make the
 * headline shorter / try a warmer palette / drop the subheadline".
 *
 * Scope: image-only for now. Copy regeneration is just a fresh
 * writeCopy call with the prior text + hint — Emma can handle that
 * pattern conversationally without a dedicated tool.
 */
export function createRegenerateAssetTool(ctx: EmmaToolContext) {
  return tool({
    description: TOOL_DESCRIPTIONS.regenerateAsset,
    inputSchema: z.object({
      generationId: z
        .string()
        .uuid()
        .describe('The original generation_id (you saw it in the prior tool_result).'),
      tweakHint: z
        .string()
        .min(1)
        .max(400)
        .describe(
          'SURGICAL change direction. NOT "improve it" — name the element + concrete delta.',
        ),
    }),
    execute: async (input) => {
      const [orig] = await db
        .select()
        .from(generation)
        .where(and(eq(generation.id, input.generationId), eq(generation.projectId, ctx.projectId)))
        .limit(1);
      if (!orig) return { error: 'generation not found (or owned by a different project)' };
      if (orig.type !== 'image') {
        return { error: `regenerateAsset only supports image generations (got ${orig.type})` };
      }

      const params = (orig.params ?? {}) as Record<string, unknown>;
      const originalIdea = typeof params.idea === 'string' ? params.idea : '';
      const layoutId = (params.layoutId as LayoutId) ?? 'hero-centered';
      const visualStyleOverride =
        typeof params.visualStyleOverride === 'string' ? params.visualStyleOverride : null;

      const newIdea = `${originalIdea}\n\nRevision note: ${input.tweakHint}`;
      const layout = getLayout({ layoutId });
      // generation.format is nullable text; we know image generations
      // always carry a format, so a defensive cast + 'square' fallback
      // is safe. The image worker validates the actual value.
      const format = (orig.format ?? 'square') as ImageFormat;
      const prompt = buildImagePrompt({
        idea: newIdea,
        format,
        project: { name: ctx.project.name, audience: ctx.project.audience, tone: ctx.project.tone },
        brandKit: ctx.brandKit,
        language: ctx.language,
        layout,
        visualStyleOverride: canonicalizeVisualStyleKey(visualStyleOverride),
        copy: {},
        effort: 'high',
      });

      const [newGen] = await db
        .insert(generation)
        .values({
          projectId: ctx.projectId,
          type: 'image',
          format: orig.format,
          status: 'queued',
          provider: 'openai',
          model: 'gpt-image-2',
          prompt,
          params: {
            ...params,
            idea: newIdea,
            tweakHint: input.tweakHint,
            parentGenerationId: orig.id,
            source: 'emma-chat-regenerate',
            threadId: ctx.threadId,
          },
        })
        .returning();
      if (!newGen) return { error: 'failed to create regeneration row' };

      await getImageQueue().add(
        'generate',
        {
          generationId: newGen.id,
          projectId: ctx.projectId,
          prompt,
          format,
          provider: 'openai',
          model: 'gpt-image-2',
          n: 1,
          quality: 'high',
          layoutId,
          idea: newIdea,
          language: ctx.language,
          mode: 'exploration',
          effort: 'high',
          productBrief: ctx.productBrief ?? undefined,
        },
        { jobId: newGen.id },
      );

      // Poll same as generateImage.
      const deadline = Date.now() + 5 * 60 * 1000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 2500));
        const [row] = await db
          .select({
            status: generation.status,
            errorMessage: generation.errorMessage,
            costCents: generation.costCents,
          })
          .from(generation)
          .where(eq(generation.id, newGen.id))
          .limit(1);
        if (!row) continue;
        if (row.status === 'failed') {
          return { error: row.errorMessage ?? 'regeneration failed', generationId: newGen.id };
        }
        if (row.status === 'done') {
          const assets = await db
            .select({ publicUrl: asset.publicUrl })
            .from(asset)
            .where(eq(asset.generationId, newGen.id));
          return {
            generationId: newGen.id,
            assetUrls: assets.map((a) => a.publicUrl),
            costCents: row.costCents ?? 0,
            parentGenerationId: orig.id,
          };
        }
      }
      return { stillRendering: true, generationId: newGen.id };
    },
  });
}
