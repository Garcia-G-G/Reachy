import 'server-only';
import { getOpenAI } from '@/server/ai/openai';
import {
  BRIEF_INSTRUCTION_LINES,
  BRIEF_SECTION_HEADERS,
  BRIEF_SECTION_HINTS,
  BRIEF_SYSTEM_LINES,
} from '@/server/config/briefExtractionPrompts';
import { FALLBACK_PALETTE } from '@/server/config/fallbackPalette';
import type { IngestedBundle } from './aggregate';

/**
 * Step 2 of autopilot — turn an IngestedBundle into a structured
 * ProductBrief that downstream steps (autoBrandKit, approval UI,
 * campaign planner) consume.
 *
 * The prompt is BUILT FROM THE BUNDLE, not hardcoded. Every value
 * the LLM sees in the prompt comes from upstream parsing data —
 * filenames, heading hierarchy, source-tagged blocks, table previews,
 * code symbols. No literal placeholders ("LAUNCH NOTES", "Read the
 * deep dive", etc.) appear here.
 */

export type ProductBriefTone = 'editorial' | 'playful' | 'technical' | 'enterprise' | 'indie';

export interface ProductBrief {
  name: string;
  oneLiner: string;
  problem: string;
  solution: string;
  features: { name: string; verb: string; value: string }[];
  audience: { role: string; painPoint: string }[];
  tone: ProductBriefTone;
  techStack: string[];
  valueProps: string[];
  paletteHex: { ink: string; paper: string; accent: string };
  languages: ('en' | 'es')[];
  referenceImages: string[];
  confidence: number;
}

export interface ExtractBriefResult {
  brief: ProductBrief;
  costCents: number;
  modelUsed: string;
}

export const DEFAULT_BRIEF_MODEL = 'gpt-5.5';
/** Same pricing table as reelPlanner — keep both in sync if the
 *  $/M numbers shift. */
const PRICING: Record<string, { input: number; output: number }> = {
  'gpt-5.5': { input: 5, output: 30 },
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
};

/** Hard cap on total prompt characters. ~4 chars per token gives
 *  ~60k tokens, matching the cap in the Step-2 brief. The bundle
 *  truncators below shave each section pro-rata to fit. */
const MAX_PROMPT_CHARS = 240_000;
const MAX_HEADINGS = 200;
const MAX_TEXT_BLOCKS = 400;
const MAX_TABLES = 20;
const MAX_TABLE_ROWS_PREVIEW = 12;
const MAX_CODE_FILES = 40;

function estimateCostCents(model: string, promptTokens: number, completionTokens: number): number {
  const rate = PRICING[model] ?? PRICING['gpt-4o-mini'];
  if (!rate) return 0;
  const cents = ((promptTokens * rate.input + completionTokens * rate.output) / 1_000_000) * 100;
  return Math.max(1, Math.round(cents));
}

function buildSystemPrompt(): string {
  return BRIEF_SYSTEM_LINES.join('\n');
}

function buildUserPrompt(bundle: IngestedBundle): string {
  const sections: string[] = [];

  // SECTION: file-type mix
  const mixLines = Object.entries(bundle.fileTypeMix).map(([ext, n]) => `- ${ext}: ${n}`);
  sections.push(
    [
      BRIEF_SECTION_HEADERS.fileTypeMix,
      BRIEF_SECTION_HINTS.fileTypeMix,
      mixLines.length > 0 ? mixLines.join('\n') : 'none',
    ].join('\n'),
  );

  // SECTION: heading hierarchy
  const headingLines = bundle.headings.slice(0, MAX_HEADINGS).map((h) => {
    const indent = '  '.repeat(Math.max(0, h.level - 1));
    return `${indent}H${h.level} · ${h.source} · ${h.text}`;
  });
  sections.push(
    [
      BRIEF_SECTION_HEADERS.headings,
      BRIEF_SECTION_HINTS.headings,
      headingLines.length > 0 ? headingLines.join('\n') : 'none',
    ].join('\n'),
  );

  // SECTION: text blocks (source-tagged). Cap and truncate per-block
  // so the model still sees a wide cross-section instead of a
  // front-loaded dump.
  const blockLines = bundle.textBlocks.slice(0, MAX_TEXT_BLOCKS).map((b) => {
    const head = b.heading ? `${b.source} (H${b.headingLevel ?? '?'}: ${b.heading})` : b.source;
    const body = b.content.replace(/\s+/g, ' ').slice(0, 600);
    return `· ${head}\n  ${body}`;
  });
  sections.push(
    [
      BRIEF_SECTION_HEADERS.textBlocks,
      BRIEF_SECTION_HINTS.textBlocks,
      blockLines.length > 0 ? blockLines.join('\n\n') : 'none',
    ].join('\n'),
  );

  // SECTION: tables — header row + first N rows previewed
  const tableLines: string[] = [];
  for (const t of bundle.tables.slice(0, MAX_TABLES)) {
    const preview = t.rows.slice(0, MAX_TABLE_ROWS_PREVIEW);
    tableLines.push(`· ${t.source}`);
    for (const row of preview) {
      tableLines.push(`  ${row.join(' | ')}`);
    }
    if (t.rows.length > preview.length) {
      tableLines.push(`  … ${t.rows.length - preview.length} more rows`);
    }
  }
  sections.push(
    [
      BRIEF_SECTION_HEADERS.tables,
      BRIEF_SECTION_HINTS.tables,
      tableLines.length > 0 ? tableLines.join('\n') : 'none',
    ].join('\n'),
  );

  // SECTION: code context
  const codeLines: string[] = [];
  for (const c of bundle.codeContext.slice(0, MAX_CODE_FILES)) {
    const parts: string[] = [];
    parts.push(`· ${c.language} · ${c.filename}`);
    if (c.symbols.length > 0) parts.push(`  exports: ${c.symbols.join(', ')}`);
    if (c.topComments.length > 0) parts.push(`  doc: ${c.topComments.slice(0, 4).join(' ')}`);
    codeLines.push(parts.join('\n'));
  }
  sections.push(
    [
      BRIEF_SECTION_HEADERS.code,
      BRIEF_SECTION_HINTS.code,
      codeLines.length > 0 ? codeLines.join('\n') : 'none',
    ].join('\n'),
  );

  // SECTION: image refs — R2 keys + dims + palette
  const imageLines = bundle.images.map((img) => {
    const pal = img.palette && img.palette.length > 0 ? ` palette=${img.palette.join(',')}` : '';
    const dim = img.width && img.height ? ` ${img.width}x${img.height}` : '';
    return `· ${img.r2Key}${dim}${pal}${img.hint ? ` (${img.hint})` : ''}`;
  });
  sections.push(
    [
      BRIEF_SECTION_HEADERS.images,
      BRIEF_SECTION_HINTS.images,
      imageLines.length > 0 ? imageLines.join('\n') : 'none',
    ].join('\n'),
  );

  // SECTION: instruction
  sections.push([BRIEF_SECTION_HEADERS.instruction, ...BRIEF_INSTRUCTION_LINES].join('\n'));

  // Total cap: trim middle sections (text blocks / code) first if we
  // overshoot, since they're the largest and most redundant.
  let assembled = sections.join('\n\n');
  if (assembled.length > MAX_PROMPT_CHARS) {
    // Coarse pass: chop text-blocks section (index 2 in the order
    // pushed above) to half then quarter — that's where bulk lives.
    const textIdx = 2;
    const textSection = sections[textIdx] ?? '';
    sections[textIdx] = textSection.slice(0, Math.floor(textSection.length / 2));
    assembled = sections.join('\n\n');
    if (assembled.length > MAX_PROMPT_CHARS) {
      const halved = sections[textIdx] ?? '';
      sections[textIdx] = halved.slice(0, Math.floor(MAX_PROMPT_CHARS / 4));
      assembled = sections.join('\n\n');
    }
    assembled += '\n\n[truncated to fit context window]';
  }

  return assembled;
}

const JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: [
    'name',
    'oneLiner',
    'problem',
    'solution',
    'features',
    'audience',
    'tone',
    'techStack',
    'valueProps',
    'paletteHex',
    'languages',
    'referenceImages',
    'confidence',
  ],
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 80 },
    oneLiner: { type: 'string', minLength: 1, maxLength: 90 },
    problem: { type: 'string', minLength: 1, maxLength: 600 },
    solution: { type: 'string', minLength: 1, maxLength: 600 },
    features: {
      type: 'array',
      minItems: 0,
      maxItems: 10,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'verb', 'value'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 80 },
          verb: { type: 'string', minLength: 1, maxLength: 24 },
          value: { type: 'string', minLength: 1, maxLength: 200 },
        },
      },
    },
    audience: {
      type: 'array',
      minItems: 0,
      maxItems: 3,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['role', 'painPoint'],
        properties: {
          role: { type: 'string', minLength: 1, maxLength: 80 },
          painPoint: { type: 'string', minLength: 1, maxLength: 200 },
        },
      },
    },
    tone: {
      type: 'string',
      enum: ['editorial', 'playful', 'technical', 'enterprise', 'indie'],
    },
    techStack: {
      type: 'array',
      minItems: 0,
      maxItems: 24,
      items: { type: 'string', minLength: 1, maxLength: 60 },
    },
    valueProps: {
      type: 'array',
      minItems: 0,
      maxItems: 5,
      items: { type: 'string', minLength: 1, maxLength: 160 },
    },
    paletteHex: {
      type: 'object',
      additionalProperties: false,
      required: ['ink', 'paper', 'accent'],
      properties: {
        ink: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
        paper: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
        accent: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
      },
    },
    languages: {
      type: 'array',
      minItems: 1,
      maxItems: 2,
      items: { type: 'string', enum: ['en', 'es'] },
    },
    referenceImages: {
      type: 'array',
      minItems: 0,
      maxItems: 8,
      items: { type: 'string', minLength: 1, maxLength: 400 },
    },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
  },
};

export async function extractBrief(args: {
  bundle: IngestedBundle;
  model?: string;
}): Promise<ExtractBriefResult> {
  const model = args.model ?? DEFAULT_BRIEF_MODEL;
  const isGpt5 = /^gpt-5/i.test(model);
  const openai = getOpenAI();

  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(args.bundle);

  const completion = await openai.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'product_brief',
        schema: JSON_SCHEMA,
        strict: true,
      },
    },
    ...(isGpt5 ? { reasoning_effort: 'none' as const } : {}),
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error('extractBrief: empty response from OpenAI');
  let parsed: ProductBrief;
  try {
    parsed = JSON.parse(content) as ProductBrief;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`extractBrief: model returned invalid JSON — ${msg}`);
  }

  // Defensive normalization — strict mode usually enforces this but we
  // see drift on small bundles. Empty palette values fall back to the
  // config defaults so downstream code never sees an empty hex.
  if (!parsed.paletteHex || typeof parsed.paletteHex !== 'object') {
    parsed.paletteHex = { ...FALLBACK_PALETTE };
  }
  for (const slot of ['ink', 'paper', 'accent'] as const) {
    if (!/^#[0-9a-fA-F]{6}$/.test(parsed.paletteHex[slot])) {
      parsed.paletteHex[slot] = FALLBACK_PALETTE[slot];
    }
  }

  const usage = completion.usage ?? { prompt_tokens: 0, completion_tokens: 0 };
  const costCents = estimateCostCents(model, usage.prompt_tokens, usage.completion_tokens);

  return { brief: parsed, costCents, modelUsed: model };
}
