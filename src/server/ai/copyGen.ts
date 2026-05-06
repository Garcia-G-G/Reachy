import 'server-only';
import type { CopyFormat, CopyPayload } from '@/lib/copy-formats';
import type { BrandKit } from '@/server/actions/brandKits';
import type { Project } from '@/server/actions/projects';
import { buildCopySystemPrompt, buildCopyUserPrompt, type PromptLanguage } from './copyPrompts';
import { copySchemas, schemaNameFor } from './copySchemas';
import { getOpenAI } from './openai';

/**
 * The OpenAI text model used for copy generation. As of May 2026, gpt-5.5 is
 * the latest frontier model with 1M context, $5/$30 per 1M tokens. Override
 * via the `model` argument for A/B testing.
 */
export const DEFAULT_COPY_MODEL = 'gpt-5.5';

export interface GenerateCopyArgs {
  format: CopyFormat;
  idea: string;
  project: Pick<Project, 'name' | 'audience' | 'tone' | 'description' | 'websiteUrl'>;
  brandKit: BrandKit | null;
  /** Language used to *prime* the system prompt. Output is always bilingual. */
  promptLanguage?: PromptLanguage;
  /** 0.7 for first attempts, 0.9 for variants. */
  temperature?: number;
  model?: string;
}

export interface GenerateCopyResult {
  /** The parsed bilingual payload. `es` and `en` shapes match the format. */
  payload: { es: CopyPayload['value']; en: CopyPayload['value'] };
  /** The exact system + user prompts sent, for debugging / cost audit. */
  systemPrompt: string;
  userPrompt: string;
  costCents: number;
  usage: {
    promptTokens: number;
    /**
     * Subset of promptTokens that came from OpenAI's prompt cache (≥1024
     * matching prefix tokens). Charged at half the regular input rate; we
     * use this for the cents estimate.
     */
    cachedPromptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model: string;
}

// Per-1M token pricing in USD as of May 2026. Sources: developers.openai.com.
// Used to record an estimate; not for invoicing.
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'gpt-5.5': { input: 5, output: 30 },
  'gpt-5.5-mini': { input: 0.5, output: 4 },
  'gpt-5': { input: 5, output: 30 },
  'gpt-5-mini': { input: 0.5, output: 4 },
  'gpt-4.1': { input: 2.5, output: 10 },
};

function estimateCostCents(
  model: string,
  prompt: number,
  cached: number,
  completion: number,
): number {
  const p = MODEL_PRICING[model] ?? MODEL_PRICING['gpt-5.5'];
  if (!p) return 0;
  // OpenAI charges cached input tokens at 50% of the regular input rate.
  // Source: https://developers.openai.com/api/docs/guides/prompt-caching
  const fresh = Math.max(0, prompt - cached);
  const usd = (fresh * p.input + cached * p.input * 0.5 + completion * p.output) / 1_000_000;
  return Math.max(1, Math.round(usd * 100));
}

export async function generateCopy(args: GenerateCopyArgs): Promise<GenerateCopyResult> {
  const promptLanguage: PromptLanguage = args.promptLanguage ?? 'en';
  const temperature = args.temperature ?? 0.7;
  const model = args.model ?? DEFAULT_COPY_MODEL;

  const systemPrompt = buildCopySystemPrompt({
    brandKit: args.brandKit,
    project: args.project,
    promptLanguage,
  });
  const userPrompt = buildCopyUserPrompt({
    format: args.format,
    idea: args.idea,
    project: args.project,
    promptLanguage,
  });

  const schema = copySchemas[args.format];
  const openai = getOpenAI();

  // GPT-5.x rejects any non-default temperature value (verified empirically:
  // 400 "does not support 0.7"). Older models accept the full 0..2 range.
  // For gpt-5.x we send `reasoning_effort: 'none'` instead — schema-bound
  // JSON does not benefit from chain-of-thought tokens, and they're billed.
  // (gpt-5.5 supports 'none'|'low'|'medium'|'high'|'xhigh', not 'minimal'.)
  const isGpt5 = /^gpt-5(\.|-|$)/.test(model);

  const completion = await openai.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: schemaNameFor(args.format),
        schema,
        strict: true,
      },
    },
    ...(isGpt5 ? { reasoning_effort: 'none' as const } : { temperature }),
  });

  const choice = completion.choices[0];
  if (!choice) throw new Error('OpenAI returned no choices.');
  if (choice.message.refusal) {
    throw new Error(`OpenAI refused: ${choice.message.refusal}`);
  }
  const content = choice.message.content;
  if (!content) throw new Error('OpenAI returned empty content.');

  let parsed: { es: unknown; en: unknown };
  try {
    parsed = JSON.parse(content);
  } catch (err) {
    throw new Error(
      `OpenAI returned invalid JSON for ${args.format}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!parsed || typeof parsed !== 'object' || !('es' in parsed) || !('en' in parsed)) {
    throw new Error(`OpenAI response for ${args.format} missing es/en keys.`);
  }

  const usage = completion.usage ?? {
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
  };
  const cached = usage.prompt_tokens_details?.cached_tokens ?? 0;

  return {
    payload: parsed as { es: CopyPayload['value']; en: CopyPayload['value'] },
    systemPrompt,
    userPrompt,
    costCents: estimateCostCents(model, usage.prompt_tokens, cached, usage.completion_tokens),
    usage: {
      promptTokens: usage.prompt_tokens,
      cachedPromptTokens: cached,
      completionTokens: usage.completion_tokens,
      totalTokens: usage.total_tokens,
    },
    model,
  };
}
