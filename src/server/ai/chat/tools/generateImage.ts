import 'server-only';
import { tool } from 'ai';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { getLayout } from '@/server/ai/layoutTemplates';
import { buildImagePrompt } from '@/server/ai/promptBuilder';
import { canonicalizeVisualStyleKey } from '@/server/ai/visualStyles';
import { TOOL_DESCRIPTIONS } from '@/server/config/chatToolDescriptions';
import { db } from '@/server/db/client';
import { asset } from '@/server/db/schema/assets';
import { generation } from '@/server/db/schema/generations';
import { getImageQueue } from '@/server/jobs/queue';
import type { EmmaToolContext } from '../context';

/**
 * generateImage — Emma enqueues an image-gen job on the existing
 * pipeline and polls until done (or timeout). Returns the resulting
 * asset URLs + cost + critic score so the chat bubble can render them.
 *
 * Why polling inside the tool: the AI SDK tool-execute model is
 * synchronous from the model's POV — the model expects a result. We
 * could return early with a generation_id and a "check later" tool,
 * but that's a worse UX. Polling here keeps the conversation flowing
 * and lets the UI show a single "Generating…" placeholder bubble
 * that resolves into the image.
 *
 * Timeout: 5 min — matches the campaign-worker watchGeneration cap.
 * Past that we return { stillRendering: true, generationId } so the
 * model can apologize and offer to re-check.
 */
export function createGenerateImageTool(ctx: EmmaToolContext) {
  return tool({
    description: TOOL_DESCRIPTIONS.generateImage,
    inputSchema: z.object({
      format: z
        .enum([
          'hero',
          'og',
          'post-ig',
          'square',
          'og-square',
          'reel-cover',
          'tiktok-cover',
          'linkedin-post-square',
          'linkedin-post-landscape',
          'pinterest',
          'banner-tw',
          'youtube-thumbnail',
          'email-header',
          'email-banner-wide',
        ])
        .describe('The output dimensions / aspect ratio.'),
      layoutId: z
        .enum([
          'hero-centered',
          'hero-split-left',
          'quote-slab',
          'announcement-banner',
          'card-soft',
          'quote-large',
          'editorial-margin',
          'feature-stack',
          'editorial-collage',
          'text-mask-cutout',
          'badge-stamp',
        ])
        .describe('The composition + typography layout.'),
      idea: z
        .string()
        .min(1)
        .max(2000)
        .describe('The asset brief — what this specific image is about. ONE idea, concrete.'),
      n: z.union([z.literal(1), z.literal(2), z.literal(4)]).default(1),
      visualStyle: z
        .enum([
          'editorial-photo',
          'typographic-poster',
          'collage-zine',
          'brutalist-grid',
          'illustrated-vector',
          'memphis-pattern',
          'editorial-collage',
        ])
        .optional()
        .describe('Override the brand kit default visual style for this asset.'),
      referenceImageKeys: z
        .array(z.string())
        .max(4)
        .optional()
        .describe(
          'R2 keys of images uploaded earlier in this chat — passed as composition references.',
        ),
    }),
    execute: async (input) => {
      const layout = getLayout({ layoutId: input.layoutId });
      const visualStyle = canonicalizeVisualStyleKey(input.visualStyle ?? null);

      const prompt = buildImagePrompt({
        idea: input.idea,
        format: input.format,
        project: {
          name: ctx.project.name,
          audience: ctx.project.audience,
          tone: ctx.project.tone,
        },
        brandKit: ctx.brandKit,
        language: ctx.language,
        layout,
        visualStyleOverride: visualStyle,
        copy: {},
        effort: 'high',
      });

      const [gen] = await db
        .insert(generation)
        .values({
          projectId: ctx.projectId,
          type: 'image',
          format: input.format,
          status: 'queued',
          provider: 'openai',
          model: 'gpt-image-2',
          prompt,
          params: {
            idea: input.idea,
            n: input.n,
            language: ctx.language,
            quality: 'high',
            visualStyleOverride: input.visualStyle,
            layoutId: layout.id,
            mode: 'exploration',
            effort: 'high',
            source: 'emma-chat',
            threadId: ctx.threadId,
          },
        })
        .returning();
      if (!gen) return { error: 'failed to create generation row' };

      // Optional reference images from earlier in the chat — passed
      // straight through. The image worker honors `referenceImageKeys`
      // by fetching their bytes and calling openai.images.edit.
      await getImageQueue().add(
        'generate',
        {
          generationId: gen.id,
          projectId: ctx.projectId,
          prompt,
          format: input.format,
          provider: 'openai',
          model: 'gpt-image-2',
          n: input.n,
          quality: 'high',
          layoutId: layout.id,
          idea: input.idea,
          language: ctx.language,
          mode: 'exploration',
          effort: 'high',
          productBrief: ctx.productBrief ?? undefined,
          campaignRationale: undefined,
        },
        { jobId: gen.id },
      );

      // Poll generation.status — 5min cap, 2.5s interval.
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
          .where(eq(generation.id, gen.id))
          .limit(1);
        if (!row) continue;
        if (row.status === 'failed') {
          return {
            error: row.errorMessage ?? 'image generation failed',
            generationId: gen.id,
          };
        }
        if (row.status === 'done') {
          const assets = await db
            .select({ publicUrl: asset.publicUrl, storageKey: asset.storageKey })
            .from(asset)
            .where(eq(asset.generationId, gen.id));
          return {
            generationId: gen.id,
            assetUrls: assets.map((a) => a.publicUrl),
            r2Keys: assets.map((a) => a.storageKey),
            costCents: row.costCents ?? 0,
            layoutUsed: layout.id,
            format: input.format,
          };
        }
      }
      return {
        stillRendering: true,
        generationId: gen.id,
        message:
          'The image is still rendering after 5 minutes — that is unusual. Tell the user, then offer to re-check the generation by id.',
      };
    },
  });
}
