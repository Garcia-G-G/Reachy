import 'server-only';
import { tool } from 'ai';
import { z } from 'zod';
import { getOpenAI } from '@/server/ai/openai';
import { TOOL_DESCRIPTIONS } from '@/server/config/chatToolDescriptions';
import { getR2Object } from '@/server/storage/r2';
import type { EmmaToolContext } from '../context';

/**
 * describeImage — gpt-4o vision call against an uploaded image.
 * Used when the user drops a screenshot / mood board / reference
 * without explaining what it is. Returns a structured analysis
 * (style, palette, composition, any text) so Emma can then propose
 * how to use it.
 *
 * Cost: ~$0.01-0.02 at detail='low'. We use low detail because
 * Emma needs the gist — palette + style + text — not pixel-level
 * fidelity.
 */
export function createDescribeImageTool(_ctx: EmmaToolContext) {
  return tool({
    description: TOOL_DESCRIPTIONS.describeImage,
    inputSchema: z.object({
      r2Key: z.string().min(1),
      focus: z
        .enum(['style', 'copy', 'composition', 'palette', 'all'])
        .default('all')
        .describe('What aspect to emphasize. Default `all` returns the full analysis.'),
    }),
    execute: async (input) => {
      const buf = await getR2Object(input.r2Key);
      const dataUrl = `data:image/png;base64,${buf.toString('base64')}`;
      const openai = getOpenAI();

      const systemLines = [
        'You are an art director analyzing an image that another designer is about to use as a reference.',
        'Return JSON with: description (2-3 sentences), palette (3-5 dominant hex codes), styleDescriptor (one phrase like "warm editorial photography" or "brutalist swiss design"), textInImage (verbatim text you can read, or empty if none), composition (one sentence on focal element + balance), suggestedUsesInBrand (1-2 sentences on how this could inform a brand asset).',
      ];

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemLines.join('\n') },
          {
            role: 'user',
            content: [
              { type: 'text', text: `Focus emphasis: ${input.focus}` },
              { type: 'image_url', image_url: { url: dataUrl, detail: 'low' } },
            ],
          },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'image_description',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              required: [
                'description',
                'palette',
                'styleDescriptor',
                'textInImage',
                'composition',
                'suggestedUsesInBrand',
              ],
              properties: {
                description: { type: 'string', minLength: 1, maxLength: 600 },
                palette: {
                  type: 'array',
                  minItems: 1,
                  maxItems: 6,
                  items: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
                },
                styleDescriptor: { type: 'string', minLength: 1, maxLength: 120 },
                textInImage: { type: 'string', minLength: 0, maxLength: 400 },
                composition: { type: 'string', minLength: 1, maxLength: 300 },
                suggestedUsesInBrand: { type: 'string', minLength: 1, maxLength: 400 },
              },
            },
          },
        },
        max_completion_tokens: 600,
      });
      const content = completion.choices[0]?.message?.content;
      if (!content) return { error: 'vision call returned empty' };
      try {
        return JSON.parse(content);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { error: `vision JSON parse failed: ${msg}` };
      }
    },
  });
}
