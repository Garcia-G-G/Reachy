import 'server-only';
import type { BrandKit } from '@/server/actions/brandKits';
import {
  CHANNEL_COPY_OUTPUT_LINES,
  CHANNEL_COPY_SECTION_HEADERS,
  CHANNEL_COPY_SYSTEM_LINES,
} from '@/server/config/channelCopyPrompts';
import { CHANNEL_TEMPLATES, type ChannelKey } from '@/server/config/channelTemplates';
import { clichesFor } from '@/server/config/cliches';
import {
  type ChannelCopyExemplar,
  channelCopyExemplarsFor,
} from '@/server/config/exemplars/channels';
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

/** Phase 06 quality pivot — channel copy moves to gpt-5.5 with
 *  reasoning_effort='medium'. The full ProductBrief was already
 *  threaded in (good), but the model was gpt-4o-mini which produced
 *  acceptable-but-template prose. Medium reasoning + exemplars +
 *  self-critique closes the gap. Cost ~5¢ per channel call. */
export const DEFAULT_CHANNEL_COPY_MODEL = 'gpt-5.5';
export const DEFAULT_CHANNEL_COPY_REASONING = 'medium' as const;

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

/** Phase 06 — build the [GOOD EXAMPLES] block for the active channel.
 *  Exemplars are loaded before the brief so the model internalises
 *  voice and shape BEFORE seeing the per-asset task. */
function buildExemplarsSection(channel: ChannelKey): string {
  const exemplars: readonly ChannelCopyExemplar[] = channelCopyExemplarsFor(channel);
  if (exemplars.length === 0) return '';
  const formatExemplar = (ex: ChannelCopyExemplar, idx: number): string => {
    return [
      `  Example ${idx + 1}:`,
      `    scenario: ${ex.scenarioContext}`,
      `    brand: ${ex.brandHint}`,
      `    goodCopy:`,
      // Indent each line of the body so the LLM reads it as a block
      // rather than as the actual current task.
      ex.goodCopy
        .split('\n')
        .map((l) => `      ${l}`)
        .join('\n'),
      `    whyItWorks: ${ex.whyItWorks}`,
    ].join('\n');
  };
  return [
    '[GOOD EXAMPLES] — read these as the quality bar for THIS channel. Internalise the pattern (specific moments, concrete nouns, founder voice, no SaaS-speak). Do NOT copy verbatim; the `whyItWorks` line names the technique that generalises.',
    '',
    exemplars.map(formatExemplar).join('\n\n'),
  ].join('\n');
}

function buildUserPrompt(args: GenerateChannelCopyArgs): string {
  const spec = CHANNEL_TEMPLATES[args.channel];
  const sections: string[] = [];

  // 0. Exemplars FIRST — teaching signal lands before the task.
  const exemplarsBlock = buildExemplarsSection(args.channel);
  if (exemplarsBlock) sections.push(exemplarsBlock);

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

/** Phase 06 — channel-copy self-critique schema. Returns a score
 *  0-10 plus a SURGICAL revisionHint that names the exact line or
 *  passage to change. */
const CRITIQUE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['score', 'issues', 'revisionHint'],
  properties: {
    score: { type: 'number', minimum: 0, maximum: 10 },
    issues: {
      type: 'array',
      minItems: 0,
      maxItems: 6,
      items: { type: 'string', minLength: 1, maxLength: 240 },
    },
    revisionHint: { type: 'string', minLength: 0, maxLength: 400 },
  },
};
const CRITIQUE_PASS_SCORE = 8;
const CRITIQUE_MODEL = 'gpt-5.5';

async function callChannelCopyOnce(
  args: GenerateChannelCopyArgs,
  revisionHint: string | null,
): Promise<{
  text: string;
  wordCount: number;
  costCents: number;
  modelUsed: string;
}> {
  const model = args.model ?? DEFAULT_CHANNEL_COPY_MODEL;
  const isGpt5 = /^gpt-5/i.test(model);
  const openai = getOpenAI();

  const systemPrompt = buildSystemPrompt();
  let userPrompt = buildUserPrompt(args);
  if (revisionHint) {
    userPrompt += `\n\n[REVISION NOTE]\n${revisionHint}\nApply this CONCRETE change in your next attempt.`;
  }

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
    // gpt-5.x reasoning models reject temperature; gpt-5.5 with
    // reasoning_effort='medium' is the Phase 06 default.
    ...(isGpt5 ? { reasoning_effort: DEFAULT_CHANNEL_COPY_REASONING } : { temperature: 0.7 }),
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

/** Phase 06 — self-critique pass for channel copy. Returns a score
 *  and surgical revisionHint for the next attempt. Mirrors the
 *  copyPlanner critique pattern. */
async function critiqueChannelCopy(args: {
  text: string;
  channel: ChannelKey;
  brandKit: BrandKit | null;
  productBrief: ProductBrief;
  language: 'en' | 'es';
}): Promise<{ score: number; issues: string[]; revisionHint: string; costCents: number }> {
  const openai = getOpenAI();
  const spec = CHANNEL_TEMPLATES[args.channel];

  const systemLines = [
    'You are a senior copy editor grading marketing channel copy. Be strict — a 7 means "acceptable but unremarkable"; a 9 means "the kind of post the founder would screenshot to send to their team".',
    '',
    'Score the copy 0-10 weighted on:',
    '  1. Specificity — does it reference brand-named features / lived moments, or generic SaaS phrasing?',
    '  2. Voice fit — does it sound like a founder of THIS product, or a content-mill template?',
    '  3. Channel fit — does the rhythm match the target channel (LinkedIn longform, X thread, IG caption, etc.)?',
    '  4. Cliché avoidance — any banned phrases (streamline, leverage, seamless, etc.)?',
    '  5. Earned opening / earned close — does the first line and last line do work?',
    '',
    'Return JSON { score, issues, revisionHint }. The `revisionHint` MUST be SURGICAL:',
    '  ✗ Bad:  "Make it more specific."',
    '  ✓ Good: "Replace the opening sentence \\"In today\'s competitive landscape\\" with a specific founder moment — e.g., the on-call story from the brief\'s `problem` field. The second paragraph already names a concrete number; mirror that voice up top."',
    '',
    'If the copy already scores ≥ 8 across all criteria, set `revisionHint` to "".',
  ];

  const userLines = [
    `Channel: ${spec.label} (target ~${spec.targetWordCount} words)`,
    `Tone hints: ${spec.toneHints.join(', ')}`,
    `Language: ${args.language}`,
    `Brand voice tone: ${args.brandKit?.voice?.tone ?? '(not set)'}`,
    `Product: ${args.productBrief.name} — ${args.productBrief.oneLiner}`,
    `Problem: ${args.productBrief.problem}`,
    '',
    'Copy under review:',
    `"""${args.text}"""`,
  ];

  const completion = await openai.chat.completions.create({
    model: CRITIQUE_MODEL,
    messages: [
      { role: 'system', content: systemLines.join('\n') },
      { role: 'user', content: userLines.join('\n') },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'channel_copy_critique', schema: CRITIQUE_SCHEMA, strict: true },
    },
    reasoning_effort: 'medium' as const,
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error('critiqueChannelCopy: empty response');
  const parsed = JSON.parse(content) as {
    score: number;
    issues: string[];
    revisionHint: string;
  };
  const usage = completion.usage ?? { prompt_tokens: 0, completion_tokens: 0 };
  const costCents = estimateCostCents(CRITIQUE_MODEL, usage.prompt_tokens, usage.completion_tokens);
  return { ...parsed, costCents };
}

export async function generateChannelCopy(
  args: GenerateChannelCopyArgs,
): Promise<GenerateChannelCopyResult> {
  // v1 — first attempt.
  const v1 = await callChannelCopyOnce(args, null);
  let totalCostCents = v1.costCents;

  // Critique — opportunistic. Failures keep v1.
  let critique: Awaited<ReturnType<typeof critiqueChannelCopy>> | null = null;
  try {
    critique = await critiqueChannelCopy({
      text: v1.text,
      channel: args.channel,
      brandKit: args.brandKit,
      productBrief: args.productBrief,
      language: args.language,
    });
    totalCostCents += critique.costCents;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[reachy:channelCopy] critique threw — accepting v1: ${msg}`);
    return { ...v1, costCents: totalCostCents };
  }

  if (critique.score >= CRITIQUE_PASS_SCORE || !critique.revisionHint) {
    return { ...v1, costCents: totalCostCents };
  }

  console.log(
    `[reachy:channelCopy] critique scored ${critique.score} (<${CRITIQUE_PASS_SCORE}); revising with hint="${critique.revisionHint.slice(0, 100)}"`,
  );
  try {
    const v2 = await callChannelCopyOnce(args, critique.revisionHint);
    return { ...v2, costCents: totalCostCents + v2.costCents };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[reachy:channelCopy] revision threw — keeping v1: ${msg}`);
    return { ...v1, costCents: totalCostCents };
  }
}
