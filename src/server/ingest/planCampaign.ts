import 'server-only';
import { IMAGE_FORMATS, type ImageFormat } from '@/lib/image-formats';
import { REEL_TEMPLATES, type ReelTemplateKey } from '@/lib/reel-templates';
import {
  VISUAL_STYLE_KEYS,
  VISUAL_STYLE_META,
  type VisualStyleKey,
} from '@/lib/visual-styles-meta';
import { LAYOUT_IDS, LAYOUTS, type LayoutId } from '@/server/ai/layoutTemplates';
import { getOpenAI } from '@/server/ai/openai';
import { ASSET_COST_ESTIMATES, estimateReelCents } from '@/server/config/assetCostEstimates';
import {
  CAMPAIGN_PLANNER_INSTRUCTION_LINES,
  CAMPAIGN_PLANNER_SECTION_HEADERS,
  CAMPAIGN_PLANNER_SECTION_HINTS,
  CAMPAIGN_PLANNER_SYSTEM_LINES,
} from '@/server/config/campaignPlannerPrompts';
import { CHANNEL_KEYS, CHANNEL_TEMPLATES, type ChannelKey } from '@/server/config/channelTemplates';
import { DEFAULT_SLATE_SIZE } from '@/server/config/defaultSlateSize';
import type { ProductBrief } from './extractBrief';

/**
 * Step 3 of autopilot — turns a ProductBrief into a CampaignPlan:
 * a slate of marketing assets (images, copy, reels) that Garcia
 * reviews on the approval page.
 *
 * The system prompt is BUILT FROM RUNTIME CATALOGS — image formats,
 * layouts, visual styles, channel templates, reel durations. No
 * hardcoded option lists. If a layout is added to the registry, the
 * planner picks it up automatically.
 *
 * Cost: ~3-5¢ per planning call at gpt-5.5 (one structured-output
 * call, ~2k input + ~1.5k output).
 */

export type ReelDuration = (typeof REEL_TEMPLATES)[ReelTemplateKey]['durationSec'];

export type PlannedAsset =
  | {
      kind: 'image';
      format: ImageFormat;
      layoutId: LayoutId;
      visualStyle: VisualStyleKey;
      brief: string;
    }
  | {
      kind: 'copy';
      channel: ChannelKey;
      brief: string;
      targetWordCount?: number;
    }
  | {
      kind: 'reel';
      durationSec: number;
      visualStyle: VisualStyleKey;
      brief: string;
    };

export interface CampaignPlan {
  assets: PlannedAsset[];
  rationale: string;
  estimatedCostCents: number;
  estimatedDurationMinutes: number;
}

export interface PlanCampaignResult {
  plan: CampaignPlan;
  costCents: number;
  modelUsed: string;
}

export const DEFAULT_PLANNER_MODEL = 'gpt-5.5';
const PRICING: Record<string, { input: number; output: number }> = {
  'gpt-5.5': { input: 5, output: 30 },
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
};

function estimateLlmCostCents(
  model: string,
  promptTokens: number,
  completionTokens: number,
): number {
  const rate = PRICING[model] ?? PRICING['gpt-4o-mini'];
  if (!rate) return 0;
  const cents = ((promptTokens * rate.input + completionTokens * rate.output) / 1_000_000) * 100;
  return Math.max(1, Math.round(cents));
}

const REEL_DURATIONS = Array.from(
  new Set(Object.values(REEL_TEMPLATES).map((t) => t.durationSec)),
).sort((a, b) => a - b) as readonly number[];

function buildSystemPrompt(): string {
  return CAMPAIGN_PLANNER_SYSTEM_LINES.join('\n');
}

function buildUserPrompt(args: { brief: ProductBrief; slateTarget: number }): string {
  const sections: string[] = [];

  // SECTION: brief (the source of truth for slate content).
  const audience = args.brief.audience.map((a) => `${a.role} — ${a.painPoint}`).join('; ');
  const features = args.brief.features.map((f) => `${f.name} (${f.verb}: ${f.value})`).join('; ');
  const brief = [
    `name: ${args.brief.name}`,
    `oneLiner: ${args.brief.oneLiner}`,
    `problem: ${args.brief.problem}`,
    `solution: ${args.brief.solution}`,
    `tone: ${args.brief.tone}`,
    `languages: ${args.brief.languages.join(', ')}`,
    `audience: ${audience}`,
    `features: ${features}`,
    `techStack: ${args.brief.techStack.join(', ')}`,
    `valueProps: ${args.brief.valueProps.join(' | ')}`,
    `palette: ink ${args.brief.paletteHex.ink}, paper ${args.brief.paletteHex.paper}, accent ${args.brief.paletteHex.accent}`,
  ].join('\n');
  sections.push(
    [CAMPAIGN_PLANNER_SECTION_HEADERS.brief, CAMPAIGN_PLANNER_SECTION_HINTS.brief, brief].join(
      '\n',
    ),
  );

  // SECTION: image formats (catalog read at runtime).
  const formatLines = Object.entries(IMAGE_FORMATS).map(
    ([key, spec]) => `- ${key}: ${spec.w}×${spec.h} · ${spec.label}`,
  );
  sections.push(
    [
      CAMPAIGN_PLANNER_SECTION_HEADERS.imageFormats,
      CAMPAIGN_PLANNER_SECTION_HINTS.imageFormats,
      formatLines.join('\n'),
    ].join('\n'),
  );

  // SECTION: layouts.
  const layoutLines = LAYOUT_IDS.map((id) => `- ${id}: ${LAYOUTS[id].label}`);
  sections.push(
    [
      CAMPAIGN_PLANNER_SECTION_HEADERS.layouts,
      CAMPAIGN_PLANNER_SECTION_HINTS.layouts,
      layoutLines.join('\n'),
    ].join('\n'),
  );

  // SECTION: visual styles.
  const styleLines = VISUAL_STYLE_KEYS.map((key) => {
    const meta = VISUAL_STYLE_META[key];
    return `- ${key}: ${meta.tagline}`;
  });
  sections.push(
    [
      CAMPAIGN_PLANNER_SECTION_HEADERS.visualStyles,
      CAMPAIGN_PLANNER_SECTION_HINTS.visualStyles,
      styleLines.join('\n'),
    ].join('\n'),
  );

  // SECTION: copy channels.
  const channelLines = CHANNEL_KEYS.map((key) => {
    const c = CHANNEL_TEMPLATES[key];
    return `- ${key}: ${c.label} (~${c.targetWordCount} words)`;
  });
  sections.push(
    [
      CAMPAIGN_PLANNER_SECTION_HEADERS.channels,
      CAMPAIGN_PLANNER_SECTION_HINTS.channels,
      channelLines.join('\n'),
    ].join('\n'),
  );

  // SECTION: reel durations.
  sections.push(
    [
      CAMPAIGN_PLANNER_SECTION_HEADERS.reelDurations,
      CAMPAIGN_PLANNER_SECTION_HINTS.reelDurations,
      REEL_DURATIONS.map((d) => `- ${d}s`).join('\n'),
    ].join('\n'),
  );

  // SECTION: target slate size.
  sections.push(
    [
      CAMPAIGN_PLANNER_SECTION_HEADERS.slateTarget,
      CAMPAIGN_PLANNER_SECTION_HINTS.slateTarget,
      `target=${args.slateTarget} (min ${DEFAULT_SLATE_SIZE.min}, max ${DEFAULT_SLATE_SIZE.max})`,
      `suggested mix: images ${DEFAULT_SLATE_SIZE.mix.images}, copy ${DEFAULT_SLATE_SIZE.mix.copy}, reels ${DEFAULT_SLATE_SIZE.mix.reels}`,
    ].join('\n'),
  );

  // SECTION: instruction.
  sections.push(
    [CAMPAIGN_PLANNER_SECTION_HEADERS.instruction, ...CAMPAIGN_PLANNER_INSTRUCTION_LINES].join(
      '\n',
    ),
  );

  return sections.join('\n\n');
}

/**
 * Strict JSON schema for the campaign plan.
 *
 * OpenAI strict mode REJECTS `oneOf` inside array items (May 2026
 * docs / 400 in practice). The workaround: every item carries every
 * possible field, with `kind` as the discriminator. Unused fields
 * use sentinel values ('' or 0); the parser normalizes per-kind on
 * the way out. Less elegant than a discriminated union but the only
 * shape strict mode accepts.
 */
function jsonSchema(): Record<string, unknown> {
  const assetSchema = {
    type: 'object',
    additionalProperties: false,
    required: [
      'kind',
      'brief',
      'format',
      'layoutId',
      'visualStyle',
      'channel',
      'targetWordCount',
      'durationSec',
    ],
    properties: {
      kind: { type: 'string', enum: ['image', 'copy', 'reel'] },
      brief: { type: 'string' },
      format: {
        type: 'string',
        enum: ['', ...Object.keys(IMAGE_FORMATS)],
      },
      layoutId: { type: 'string', enum: ['', ...LAYOUT_IDS] },
      visualStyle: {
        type: 'string',
        enum: ['', ...(VISUAL_STYLE_KEYS as unknown as string[])],
      },
      channel: { type: 'string', enum: ['', ...CHANNEL_KEYS] },
      /** 0 = "use the channel default" for copy; ignored on image / reel. */
      targetWordCount: { type: 'integer', minimum: 0, maximum: 600 },
      /** 0 = "n/a" for image / copy. Reel rows MUST set this to a real duration. */
      durationSec: { type: 'integer', enum: [0, ...REEL_DURATIONS] },
    },
  };
  return {
    type: 'object',
    additionalProperties: false,
    required: ['assets', 'rationale', 'estimatedDurationMinutes'],
    properties: {
      assets: {
        type: 'array',
        minItems: DEFAULT_SLATE_SIZE.min,
        maxItems: DEFAULT_SLATE_SIZE.max,
        items: assetSchema,
      },
      rationale: { type: 'string' },
      estimatedDurationMinutes: { type: 'integer', minimum: 1, maximum: 600 },
    },
  };
}

/** Flat-row → discriminated-union normalizer. */
interface FlatAssetRow {
  kind: 'image' | 'copy' | 'reel';
  brief: string;
  format: string;
  layoutId: string;
  visualStyle: string;
  channel: string;
  targetWordCount: number;
  durationSec: number;
}

function normalizeAsset(row: FlatAssetRow): PlannedAsset | null {
  const brief = (row.brief ?? '').trim();
  if (!brief) return null;
  if (row.kind === 'image') {
    if (!row.format || !row.layoutId || !row.visualStyle) return null;
    return {
      kind: 'image',
      format: row.format as ImageFormat,
      layoutId: row.layoutId as LayoutId,
      visualStyle: row.visualStyle as VisualStyleKey,
      brief,
    };
  }
  if (row.kind === 'copy') {
    if (!row.channel) return null;
    return {
      kind: 'copy',
      channel: row.channel as ChannelKey,
      brief,
      targetWordCount: row.targetWordCount > 0 ? row.targetWordCount : undefined,
    };
  }
  if (row.kind === 'reel') {
    if (!row.visualStyle || row.durationSec <= 0) return null;
    return {
      kind: 'reel',
      durationSec: row.durationSec,
      visualStyle: row.visualStyle as VisualStyleKey,
      brief,
    };
  }
  return null;
}

/** Sum the slate's COARSE asset costs (image / copy / reel). Used both
 *  by the planner result and by the review UI for live recompute. */
export function estimateSlateCostCents(assets: PlannedAsset[]): number {
  let total = 0;
  for (const a of assets) {
    if (a.kind === 'image') total += ASSET_COST_ESTIMATES.imageCents;
    else if (a.kind === 'copy') total += ASSET_COST_ESTIMATES.copyCents;
    else if (a.kind === 'reel') total += estimateReelCents(a.durationSec);
    else total += ASSET_COST_ESTIMATES.fallbackCents;
  }
  return total;
}

export async function planCampaign(args: {
  brief: ProductBrief;
  slateTarget?: number;
  model?: string;
}): Promise<PlanCampaignResult> {
  const model = args.model ?? DEFAULT_PLANNER_MODEL;
  const isGpt5 = /^gpt-5/i.test(model);
  const slateTarget = args.slateTarget ?? DEFAULT_SLATE_SIZE.target;
  const openai = getOpenAI();

  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt({ brief: args.brief, slateTarget });

  const completion = await openai.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'campaign_plan', schema: jsonSchema(), strict: true },
    },
    ...(isGpt5 ? { reasoning_effort: 'none' as const } : {}),
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error('planCampaign: empty response from OpenAI');
  let raw: { assets: FlatAssetRow[]; rationale: string; estimatedDurationMinutes: number };
  try {
    raw = JSON.parse(content) as typeof raw;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`planCampaign: invalid JSON — ${msg}`);
  }

  // Normalize flat-row schema (the strict-mode workaround) into the
  // discriminated-union PlannedAsset[] shape downstream code expects.
  const assets: PlannedAsset[] = [];
  for (const row of raw.assets ?? []) {
    const normalized = normalizeAsset(row);
    if (normalized) assets.push(normalized);
  }
  if (assets.length === 0) {
    throw new Error('planCampaign: model returned no usable assets after normalization');
  }

  // Coarse slate cost — overwrites whatever the model put in
  // estimatedCostCents (the model isn't expected to do arithmetic
  // reliably; we compute it from the catalog rates).
  const estimatedCostCents = estimateSlateCostCents(assets);

  const plan: CampaignPlan = {
    assets,
    rationale: raw.rationale,
    estimatedCostCents,
    estimatedDurationMinutes: raw.estimatedDurationMinutes,
  };

  const usage = completion.usage ?? { prompt_tokens: 0, completion_tokens: 0 };
  const costCents = estimateLlmCostCents(model, usage.prompt_tokens, usage.completion_tokens);

  return { plan, costCents, modelUsed: model };
}
