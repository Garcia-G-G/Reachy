import 'server-only';
import type { BrandKit } from '@/server/actions/brandKits';
import {
  CHANNEL_COPY_OUTPUT_LINES,
  CHANNEL_COPY_SECTION_HEADERS,
  CHANNEL_COPY_SYSTEM_LINES,
} from '@/server/config/channelCopyPrompts';
import { CHANNEL_TEMPLATES, type ChannelKey } from '@/server/config/channelTemplates';
import { clichesFor } from '@/server/config/cliches';
import type { ProductBrief } from '@/server/ingest/extractBrief';
import { getOpenAI } from './openai';

/**
 * Per-channel copy generator — one LLM call per PlannedAsset of
 * kind='copy'. The campaign worker calls this inline (no separate
 * BullMQ queue) since each call is a cheap ~1¢ structured-output
 * round-trip.
 *
 * Inputs are SECTIONED into the prompt from runtime data (the
 * channel spec, the brand kit, the product brief, the cliché list).
 * Static prose lives in src/server/config/channelCopyPrompts.ts so
 * src/server/ai/channelCopy.ts stays free of long literal strings.
 */

export interface GenerateChannelCopyArgs {
  brief: string;
  channel: ChannelKey;
  brandKit: BrandKit | null;
  productBrief: ProductBrief;
  language: 'en' | 'es';
  model?: string;
}

export interface GenerateChannelCopyResult {
  text: string;
  wordCount: number;
  costCents: number;
  modelUsed: string;
}

export const DEFAULT_CHANNEL_COPY_MODEL = 'gpt-4o-mini';

const PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-5.5': { input: 5, output: 30 },
};

function estimateCostCents(model: string, promptTokens: number, completionTokens: number): number {
  const rate = PRICING[model] ?? PRICING['gpt-4o-mini'];
  if (!rate) return 0;
  const cents = ((promptTokens * rate.input + completionTokens * rate.output) / 1_000_000) * 100;
  return Math.max(1, Math.round(cents));
}

function buildSystemPrompt(): string {
  return CHANNEL_COPY_SYSTEM_LINES.join('\n');
}

function buildUserPrompt(args: GenerateChannelCopyArgs): string {
  const spec = CHANNEL_TEMPLATES[args.channel];
  const sections: string[] = [];

  // Channel spec
  sections.push(
    [
      CHANNEL_COPY_SECTION_HEADERS.channel,
      `key: ${spec.key}`,
      `label: ${spec.label}`,
      `targetWordCount: ${spec.targetWordCount}`,
      `toneHints: ${spec.toneHints.join('; ')}`,
      `structureHints:\n${spec.structureHints.map((s) => `  - ${s}`).join('\n')}`,
      `language: ${args.language}`,
    ].join('\n'),
  );

  // Brand voice
  if (args.brandKit?.voice) {
    sections.push(
      [
        CHANNEL_COPY_SECTION_HEADERS.voice,
        `tone: ${args.brandKit.voice.tone}`,
        `doSay: ${(args.brandKit.voice.doSay ?? []).join(', ')}`,
        `dontSay: ${(args.brandKit.voice.dontSay ?? []).join(', ')}`,
      ].join('\n'),
    );
  }

  // Product brief — features + valueProps + audience are what the
  // copy can quote concretely.
  const pb = args.productBrief;
  const productLines = [
    `name: ${pb.name}`,
    `oneLiner: ${pb.oneLiner}`,
    `problem: ${pb.problem}`,
    `solution: ${pb.solution}`,
    `tone: ${pb.tone}`,
    `audience: ${pb.audience.map((a) => `${a.role} (${a.painPoint})`).join('; ')}`,
    `features: ${pb.features.map((f) => `${f.name} — ${f.verb}: ${f.value}`).join(' | ')}`,
    `valueProps: ${pb.valueProps.join(' | ')}`,
  ];
  sections.push([CHANNEL_COPY_SECTION_HEADERS.brief, productLines.join('\n')].join('\n'));

  // Asset brief — what THIS piece is about.
  sections.push([CHANNEL_COPY_SECTION_HEADERS.task, args.brief.trim()].join('\n'));

  // Cliché blacklist.
  const cliches = clichesFor(args.language);
  sections.push(
    [CHANNEL_COPY_SECTION_HEADERS.cliches, cliches.map((c) => `- ${c}`).join('\n')].join('\n'),
  );

  // Output spec.
  sections.push([CHANNEL_COPY_SECTION_HEADERS.output, ...CHANNEL_COPY_OUTPUT_LINES].join('\n'));

  return sections.join('\n\n');
}

const JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['text', 'wordCount'],
  properties: {
    text: { type: 'string', minLength: 1, maxLength: 8000 },
    wordCount: { type: 'integer', minimum: 1, maximum: 2000 },
  },
};

export async function generateChannelCopy(
  args: GenerateChannelCopyArgs,
): Promise<GenerateChannelCopyResult> {
  const model = args.model ?? DEFAULT_CHANNEL_COPY_MODEL;
  const isGpt5 = /^gpt-5/i.test(model);
  const openai = getOpenAI();

  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(args);

  const completion = await openai.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'channel_copy', schema: JSON_SCHEMA, strict: true },
    },
    ...(isGpt5 ? { reasoning_effort: 'none' as const } : { temperature: 0.7 }),
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error('generateChannelCopy: empty response');
  let parsed: { text: string; wordCount: number };
  try {
    parsed = JSON.parse(content) as typeof parsed;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`generateChannelCopy: invalid JSON — ${msg}`);
  }

  const usage = completion.usage ?? { prompt_tokens: 0, completion_tokens: 0 };
  const costCents = estimateCostCents(model, usage.prompt_tokens, usage.completion_tokens);

  return {
    text: parsed.text.trim(),
    wordCount: parsed.wordCount,
    costCents,
    modelUsed: model,
  };
}
