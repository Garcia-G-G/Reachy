import 'server-only';
import { getOpenAI } from './openai';

/**
 * Best-of-K vision critic for `effort='high'`.
 *
 * Receives N candidate image buffers, sends them to a vision-capable
 * OpenAI model with a strict JSON schema, and returns the index of
 * the candidate the model judges strongest on composition, focal
 * clarity, negative space, palette harmony, and brand alignment.
 *
 * Research note (2026-05-14): gpt-4o is now legacy; gpt-5.4-mini is
 * the sweet-spot vision-capable, JSON-schema-supporting model
 * ($0.75 / $4.50 per 1M input / output). detail='low' is optimal
 * for composition judgment (no OCR needed), fixed at 85 tokens per
 * image. Typical critique: 4 × 85 = 340 image tokens + ~250 text =
 * ~590 input tokens, ~120 output → ~0.1¢ per call.
 *
 * Source URLs:
 *   - https://developers.openai.com/api/docs/guides/images-vision
 *   - https://developers.openai.com/api/docs/guides/structured-outputs
 *   - https://developers.openai.com/api/docs/models/gpt-5.4-nano
 *
 * Falls back to gpt-4o-mini when the gpt-5.x tier isn't available on
 * the account (which is the case for Reachy's current tier in this
 * environment — confirmed via failed completion 2026-05-14). Both
 * accept the same vision + json_schema combo.
 */

import type { LayoutPromptTemplate as Layout } from './layoutTemplates';

export interface CriticCandidate {
  /** Index in the original generation set (0-based). */
  index: number;
  /** Image bytes. The critic encodes these as data URLs so the model
   *  can see them without us re-uploading to R2 first. */
  buffer: Buffer;
}

export interface CriticArgs {
  /** The layout the variants were composed for — drives the critic
   *  prompt ("review for editorial-collage's negative space"). */
  layout: Layout;
  /** The user's brief — the critic should evaluate "best match for THIS". */
  brief: string;
  candidates: CriticCandidate[];
  /** Vision model id. Defaults to gpt-4o-mini (broadly available);
   *  callers on a higher tier can override to gpt-5.4-mini or gpt-5.5
   *  with `reasoning_effort: 'low'` for sharper judgment. */
  model?: string;
}

export interface CriticVerdict {
  /** Index into `candidates[]` of the winner. */
  winnerIndex: number;
  /** The model's brief justification — surfaced in worker logs so we
   *  can audit pick quality without listening through OpenAI usage. */
  reasoning: string;
  costCents: number;
}

const SYSTEM_PROMPT = [
  'You are a senior art director reviewing AI-generated image candidates for a marketing-asset pipeline.',
  '',
  'Judge each candidate on:',
  '  1. Composition strength — does the eye land somewhere intentional?',
  '  2. Focal clarity      — is there ONE clear subject, not a cluttered mess?',
  '  3. Negative space     — does the frame breathe in the right zones for typography overlay?',
  '  4. Palette harmony    — do the dominant hues match the brand brief?',
  '  5. Brand alignment    — does the result feel like a polished marketing asset, not stock or AI-generic?',
  '',
  'Penalize: flat abstract gradients with no focal subject, busy symmetric layouts, garish saturation, off-brand palette drift.',
  '',
  'Return strict JSON: { "winnerIndex": 0|1|2|3, "reasoning": "<one or two short sentences citing the criterion that decided it>" }.',
].join('\n');

function bufferToDataUrl(buf: Buffer, mime = 'image/png'): string {
  return `data:${mime};base64,${buf.toString('base64')}`;
}

export async function pickBest(args: CriticArgs): Promise<CriticVerdict> {
  if (args.candidates.length === 0) {
    throw new Error('critic: candidates[] is empty');
  }
  if (args.candidates.length === 1) {
    // Trivial — no need to spend on a vision call.
    return { winnerIndex: 0, reasoning: 'single candidate', costCents: 0 };
  }

  const openai = getOpenAI();
  const model = args.model ?? 'gpt-4o-mini';
  // GPT-5.x reasoning models reject `temperature`, `top_p`,
  // `frequency_penalty`, `presence_penalty`, `logit_bias`. They DO
  // accept `reasoning_effort`. For a critic, `minimal` keeps latency
  // close to non-reasoning while still benefiting from the model's
  // visual-reasoning improvements. (Audited against the May 2026
  // OpenAI docs: developers.openai.com/api/docs/models/gpt-5.4-nano.)
  const isGpt5 = /^gpt-5/i.test(model);

  const userContent: Array<
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string; detail?: 'low' | 'high' | 'auto' } }
  > = [
    {
      type: 'text',
      text: [
        `Layout: ${args.layout.label}. Negative-space directive: ${args.layout.negativeSpaceHint}`,
        `Brief: ${args.brief}`,
        '',
        `Below are ${args.candidates.length} candidates indexed 0..${args.candidates.length - 1}. Pick the winner per the criteria.`,
      ].join('\n'),
    },
    ...args.candidates.map((c) => ({
      type: 'image_url' as const,
      image_url: {
        url: bufferToDataUrl(c.buffer),
        // 'low' = 85 tokens fixed, plenty for composition judgment (no OCR).
        detail: 'low' as const,
      },
    })),
  ];

  const completion = await openai.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'art_direction_verdict',
        strict: true,
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            winnerIndex: {
              type: 'integer',
              minimum: 0,
              maximum: Math.max(0, args.candidates.length - 1),
              description: '0-based index of the winning candidate.',
            },
            reasoning: {
              type: 'string',
              description: 'One or two short sentences citing the deciding criterion.',
            },
          },
          required: ['winnerIndex', 'reasoning'],
        },
      },
    },
    max_completion_tokens: 200,
    ...(isGpt5 ? { reasoning_effort: 'minimal' as const } : {}),
  });

  const choice = completion.choices[0];
  if (!choice) throw new Error('critic: no choices');
  // Strict JSON schema mode does NOT catch refusals — those still
  // surface as `message.refusal`. Length-cut completions don't either;
  // the model can output partial JSON before the token budget hits.
  // Treat both as hard failures (caller falls back to candidate 1).
  if (choice.message.refusal) {
    throw new Error(`critic: refused — ${choice.message.refusal}`);
  }
  if (choice.finish_reason === 'length') {
    throw new Error('critic: response truncated by max_completion_tokens');
  }
  const content = choice.message.content;
  if (!content) throw new Error('critic: empty response');

  let parsed: { winnerIndex: number; reasoning: string };
  try {
    parsed = JSON.parse(content);
  } catch (err) {
    throw new Error(`critic: invalid JSON — ${err instanceof Error ? err.message : String(err)}`);
  }

  // Cost estimate at gpt-4o-mini ($0.15/M in, $0.60/M out). Bump for
  // gpt-5.x if the caller overrode the model.
  const usage = completion.usage ?? { prompt_tokens: 0, completion_tokens: 0 };
  const isMini = /mini|nano/i.test(model);
  const inRate = isMini ? 0.15 : 5;
  const outRate = isMini ? 0.6 : 30;
  const cents =
    ((usage.prompt_tokens * inRate + usage.completion_tokens * outRate) / 1_000_000) * 100;
  return {
    winnerIndex: parsed.winnerIndex,
    reasoning: parsed.reasoning,
    costCents: Math.max(1, Math.round(cents)),
  };
}

// ═══════════════════════════════════════════════════════════════════
// Step 5 — rubric-based grading critic (single asset, not best-of-K).
// ═══════════════════════════════════════════════════════════════════

import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { BrandKit } from '@/server/actions/brandKits';
import { CHANNEL_TEMPLATES, type ChannelKey } from '@/server/config/channelTemplates';
import { clichesFor } from '@/server/config/cliches';
import {
  type AssetCriticKind,
  type RubricCriterion,
  rubricFor,
} from '@/server/config/criticRubrics';
import { CRITIC_PASS_THRESHOLD } from '@/server/config/criticThreshold';
import { getR2Object } from '@/server/storage/r2';
import { type AudioStats, audioStats } from '@/server/video/audioStats';

/**
 * Phase 06 quality pivot — upgrade the grader to gpt-5.5 with
 * reasoning_effort='high'. The critic IS a senior art director; the
 * better the judgment, the sharper the retryHint, the better the
 * revision quality. Cost ~10¢ per critic call (vs ~3¢ for gpt-4o-mini),
 * but the next planCopy attempt benefits from a non-generic hint.
 */
const GRADE_MODEL = 'gpt-5.5';
const GRADE_REASONING_EFFORT = 'high' as const;

export interface AssetCriticResult {
  score: number;
  passes: boolean;
  issues: string[];
  retryHint?: string;
  rubricBreakdown: Record<string, number>;
  costCents: number;
  modelUsed: string;
}

/** Build the rubric-instruction block injected into every grader call.
 *  Phase 06 — anchored the scoring ceiling (7 = passable, 9 = ship-grade)
 *  and gave the model worked examples of what a SURGICAL retryHint
 *  looks like. The May 19 baseline plateaued because the judge had
 *  no concept of what 9+ looked like; without an anchor every "good"
 *  asset landed at 7.0-7.6. */
function rubricInstructions(criteria: readonly RubricCriterion[]): string {
  const lines = criteria.map((c) => `- ${c.key} (weight ${c.weight}/10): ${c.description}`);
  return [
    'Score each criterion below from 0 (worst) to 10 (best). ANCHOR your scoring to this ceiling:',
    '  - 4-5 = broken, off-brief, or visibly AI-generic.',
    '  - 6-7 = acceptable but unremarkable — the kind of asset that ships when nobody pushes back.',
    '  - 8   = clearly above the SaaS-template median — concrete, on-brand, one strong choice.',
    '  - 9   = the kind of asset a senior designer / editor at a top brand would ship.',
    '  - 10  = reserved for assets that would survive a portfolio review.',
    'Do NOT default to 7. If the asset is mid, write 6.',
    '',
    'Output JSON with one number per criterion key plus `issues` (specific complaints, each ≤ 200 chars) and `retryHint`. The `retryHint` is a SURGICAL CHANGE RECOMMENDATION for the next attempt — NOT "make it better". Name the EXACT element to change and a concrete replacement direction grounded in the brief.',
    '',
    'Two worked examples of GOOD retryHints (read these as the bar):',
    '  ✓ "Replace headline \\"Streamline customer feedback\\" with a specific outcome that names one of the feedback sources from the brief (Slack, Jira, surveys). Try: \\"Stop reading Slack threads on Monday morning.\\""',
    '  ✓ "The palette is bleeding into a stock-photo blue. Constrain to the brand\'s ink (#2A1810) + paper (#F1EBDF) + a single 8% accent. Drop the background gradient — switch to a flat color block."',
    '',
    'Two BAD retryHints (avoid these patterns):',
    '  ✗ "Make the headline more specific."        ← no element name, no direction',
    '  ✗ "Improve the composition."                ← no element, no concrete change',
    '',
    'If the asset already scores ≥ 8 across all criteria, set `retryHint` to "" (empty string).',
    '',
    'Rubric:',
    ...lines,
  ].join('\n');
}

/** Weighted-sum scoring from the per-criterion sub-scores. */
function weightedScore(subs: Record<string, number>, criteria: readonly RubricCriterion[]): number {
  let acc = 0;
  let totalWeight = 0;
  for (const c of criteria) {
    const sub = subs[c.key];
    if (typeof sub !== 'number') continue;
    acc += Math.max(0, Math.min(10, sub)) * c.weight;
    totalWeight += c.weight;
  }
  if (totalWeight === 0) return 0;
  return Number((acc / totalWeight).toFixed(2));
}

function buildJsonSchema(criteria: readonly RubricCriterion[]): Record<string, unknown> {
  const subProps: Record<string, unknown> = {};
  for (const c of criteria) {
    subProps[c.key] = { type: 'number', minimum: 0, maximum: 10 };
  }
  return {
    type: 'object',
    additionalProperties: false,
    required: [...criteria.map((c) => c.key), 'issues', 'retryHint'],
    properties: {
      ...subProps,
      issues: {
        type: 'array',
        minItems: 0,
        maxItems: 8,
        items: { type: 'string', minLength: 1, maxLength: 240 },
      },
      retryHint: {
        // Empty string when nothing to fix.
        type: 'string',
        minLength: 0,
        maxLength: 240,
      },
    },
  };
}

function estimateGradeCostCents(promptTokens: number, completionTokens: number): number {
  // Phase 06 — grader runs on gpt-5.5 ($5/M in, $30/M out). Keep the
  // mini/nano fallback rate for parity in case the grader is overridden
  // for smoke scripts.
  let inRate = 0.15;
  let outRate = 0.6;
  if (/^gpt-5/i.test(GRADE_MODEL)) {
    inRate = /mini|nano/i.test(GRADE_MODEL) ? 0.75 : 5;
    outRate = /mini|nano/i.test(GRADE_MODEL) ? 4.5 : 30;
  }
  const cents = ((promptTokens * inRate + completionTokens * outRate) / 1_000_000) * 100;
  return Math.max(1, Math.round(cents));
}

/** Per-criterion sub-score map returned by the grader LLM. */
interface GraderResponse {
  issues: string[];
  retryHint: string;
  [criterionKey: string]: number | string | string[];
}

async function runGrader(args: {
  kind: AssetCriticKind;
  systemLines: readonly string[];
  userContent: Array<
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string; detail?: 'low' | 'high' | 'auto' } }
  >;
}): Promise<AssetCriticResult> {
  const criteria = rubricFor(args.kind);
  const openai = getOpenAI();
  const isGpt5 = /^gpt-5/i.test(GRADE_MODEL);
  const completion = await openai.chat.completions.create({
    model: GRADE_MODEL,
    messages: [
      { role: 'system', content: args.systemLines.join('\n') },
      { role: 'user', content: args.userContent },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: `critic_grade_${args.kind.toLowerCase()}`,
        schema: buildJsonSchema(criteria),
        strict: true,
      },
    },
    // gpt-5.x reasoning models reject temperature; non-reasoning fall
    // back to a conservative 0.2 (the May 2026 baseline).
    ...(isGpt5 ? { reasoning_effort: GRADE_REASONING_EFFORT } : { temperature: 0.2 }),
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error('critic.grade: empty response');
  let parsed: GraderResponse;
  try {
    parsed = JSON.parse(content) as GraderResponse;
  } catch (err) {
    throw new Error(
      `critic.grade: invalid JSON — ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const breakdown: Record<string, number> = {};
  for (const c of criteria) {
    const v = parsed[c.key];
    if (typeof v === 'number') breakdown[c.key] = v;
  }
  const score = weightedScore(breakdown, criteria);
  const passes = score >= CRITIC_PASS_THRESHOLD;
  const issues = Array.isArray(parsed.issues) ? parsed.issues : [];
  const retryHintRaw = typeof parsed.retryHint === 'string' ? parsed.retryHint.trim() : '';
  const usage = completion.usage ?? { prompt_tokens: 0, completion_tokens: 0 };
  const costCents = estimateGradeCostCents(usage.prompt_tokens, usage.completion_tokens);

  return {
    score,
    passes,
    issues,
    retryHint: retryHintRaw.length > 0 ? retryHintRaw : undefined,
    rubricBreakdown: breakdown,
    costCents,
    modelUsed: GRADE_MODEL,
  };
}

// ─── Image grader ──────────────────────────────────────────────────

export interface GradeImageArgs {
  /** Raw image bytes (fetched from R2 by the caller, or supplied
   *  directly for a unit test). */
  buffer: Buffer;
  /** The PlannedAsset.brief that produced this image. */
  brief: string;
  /** Layout the planner picked — used so the rubric understands what
   *  composition was being aimed at. */
  layoutLabel: string;
  /** Brand kit for palette + tone + allowsHumans context. */
  brandKit: BrandKit | null;
  language: 'en' | 'es';
}

export async function gradeImage(args: GradeImageArgs): Promise<AssetCriticResult> {
  const criteria = rubricFor('IMAGE');
  const systemLines = [
    'You are the autopilot critic grading a generated marketing image.',
    'Be strict — Reachy users rely on you to surface duds.',
    rubricInstructions(criteria),
  ];

  const brandLines = [
    `Asset brief: ${args.brief.slice(0, 600)}`,
    `Layout: ${args.layoutLabel}`,
    `Language: ${args.language}`,
  ];
  if (args.brandKit) {
    const palette = [args.brandKit.primaryColor, args.brandKit.bgColor, args.brandKit.accentColor]
      .filter(Boolean)
      .join(' / ');
    if (palette) brandLines.push(`Brand palette (ink / paper / accent): ${palette}`);
    if (args.brandKit.voice?.tone) brandLines.push(`Brand voice tone: ${args.brandKit.voice.tone}`);
    brandLines.push(`Humans allowed in output: ${args.brandKit.allowsHumans ? 'yes' : 'no'}`);
  }

  return runGrader({
    kind: 'IMAGE',
    systemLines,
    userContent: [
      { type: 'text', text: brandLines.join('\n') },
      {
        type: 'image_url',
        image_url: { url: bufferToDataUrl(args.buffer), detail: 'low' },
      },
    ],
  });
}

// ─── Copy grader ───────────────────────────────────────────────────

export interface GradeCopyArgs {
  text: string;
  channel: ChannelKey;
  /** The PlannedAsset.brief that produced this copy. */
  brief: string;
  brandKit: BrandKit | null;
  language: 'en' | 'es';
}

export async function gradeCopy(args: GradeCopyArgs): Promise<AssetCriticResult> {
  const criteria = rubricFor('COPY');
  const channelSpec = CHANNEL_TEMPLATES[args.channel];
  const cliches = clichesFor(args.language);

  const systemLines = [
    'You are the autopilot critic grading a piece of generated marketing copy.',
    'Be strict — Reachy users rely on you to surface duds. Generic SaaS-speak fails.',
    rubricInstructions(criteria),
  ];

  // Cheap inline cliché scan — surfaces literal matches as a head start
  // for the LLM (it still re-evaluates near-paraphrases).
  const lower = args.text.toLowerCase();
  const hitCliches = cliches.filter((c) => lower.includes(c.toLowerCase()));

  const userLines = [
    `Channel: ${channelSpec.label} (target ~${channelSpec.targetWordCount} words; tone hints: ${channelSpec.toneHints.join(', ')})`,
    `Language: ${args.language}`,
    `Brand voice tone: ${args.brandKit?.voice?.tone ?? '(not set)'}`,
    `Asset brief: ${args.brief.slice(0, 600)}`,
    '',
    `Cliché blacklist for ${args.language} (literal + paraphrases must be penalized):`,
    cliches.map((c) => `- ${c}`).join('\n'),
    '',
    hitCliches.length > 0
      ? `Literal cliché matches detected by upstream scan: ${hitCliches.join(', ')}`
      : 'No literal cliché matches (still check for paraphrases).',
    '',
    `Copy being graded:\n"""${args.text}"""`,
  ];

  return runGrader({
    kind: 'COPY',
    systemLines,
    userContent: [{ type: 'text', text: userLines.join('\n') }],
  });
}

// ─── Reel grader ───────────────────────────────────────────────────

export interface GradeReelArgs {
  /** R2 key OR public URL OR fs path for the reel mp4 — we fetch
   *  bytes locally to run ffmpeg. */
  videoR2Key?: string;
  videoPublicUrl?: string;
  videoPath?: string;
  brief: string;
  brandKit: BrandKit | null;
  language: 'en' | 'es';
}

/** Extract N keyframes from an mp4 to JPEG buffers via ffmpeg. */
async function extractKeyframes(
  videoPath: string,
  durationSec: number,
  count: number,
): Promise<Buffer[]> {
  const tmp = await mkdtemp(path.join(tmpdir(), 'reachy-critic-frames-'));
  try {
    const interval = durationSec > 0 ? durationSec / (count + 1) : 1;
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        'ffmpeg',
        [
          '-y',
          '-i',
          videoPath,
          '-vf',
          `fps=1/${interval.toFixed(3)},scale=720:-2`,
          '-frames:v',
          String(count),
          '-q:v',
          '4',
          path.join(tmp, 'kf-%03d.jpg'),
        ],
        { stdio: 'ignore' },
      );
      child.on('close', (code) =>
        code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}`)),
      );
      child.on('error', reject);
    });
    const out: Buffer[] = [];
    for (let i = 1; i <= count; i++) {
      try {
        const buf = await readFile(path.join(tmp, `kf-${String(i).padStart(3, '0')}.jpg`));
        out.push(buf);
      } catch {
        break;
      }
    }
    return out;
  } finally {
    await rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}

/** Probe the video container for duration only — keeps deps light
 *  vs importing the full ffprobe helper. */
async function probeDurationSec(videoPath: string): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      videoPath,
    ]);
    let out = '';
    child.stdout.on('data', (d) => {
      out += d.toString();
    });
    child.on('close', () => resolve(Number.parseFloat(out.trim()) || 0));
    child.on('error', () => resolve(0));
  });
}

export async function gradeReel(args: GradeReelArgs): Promise<AssetCriticResult> {
  // Resolve to a local fs path: prefer a direct videoPath (unit test
  // shortcut), otherwise fetch from R2.
  let videoPath: string | null = args.videoPath ?? null;
  let cleanup: (() => Promise<void>) | null = null;
  if (!videoPath && args.videoR2Key) {
    const buf = await getR2Object(args.videoR2Key);
    const tmp = await mkdtemp(path.join(tmpdir(), 'reachy-critic-reel-'));
    videoPath = path.join(tmp, 'reel.mp4');
    const { writeFile } = await import('node:fs/promises');
    await writeFile(videoPath, buf);
    cleanup = () => rm(tmp, { recursive: true, force: true });
  }
  if (!videoPath) {
    throw new Error('gradeReel: requires videoPath or videoR2Key');
  }

  try {
    const durationSec = await probeDurationSec(videoPath);
    const [keyframes, audio] = await Promise.all([
      extractKeyframes(videoPath, durationSec, 3),
      audioStats(videoPath),
    ]);

    const criteria = rubricFor('REEL');
    const systemLines = [
      'You are the autopilot critic grading a generated marketing reel.',
      'Be strict — Reachy users rely on you to surface duds. A frozen-frame Sora glitch fails motion_presence.',
      rubricInstructions(criteria),
    ];

    const audioLine = formatAudioStatsForPrompt(audio);
    const brandPalette = args.brandKit
      ? [args.brandKit.primaryColor, args.brandKit.bgColor, args.brandKit.accentColor]
          .filter(Boolean)
          .join(' / ')
      : '';
    const userLines = [
      `Asset brief: ${args.brief.slice(0, 600)}`,
      `Language: ${args.language}`,
      brandPalette ? `Brand palette (ink / paper / accent): ${brandPalette}` : '',
      `Total duration probed: ${durationSec.toFixed(2)}s`,
      `Audio mix stats: ${audioLine}`,
      '',
      `${keyframes.length} keyframes attached, equally spaced across the reel.`,
    ].filter(Boolean);

    return runGrader({
      kind: 'REEL',
      systemLines,
      userContent: [
        { type: 'text', text: userLines.join('\n') },
        ...keyframes.map((buf) => ({
          type: 'image_url' as const,
          image_url: { url: bufferToDataUrl(buf, 'image/jpeg'), detail: 'low' as const },
        })),
      ],
    });
  } finally {
    if (cleanup) await cleanup();
  }
}

function formatAudioStatsForPrompt(s: AudioStats): string {
  const peak = Number.isFinite(s.peakDb) ? `${s.peakDb.toFixed(1)} dBFS` : 'silent';
  const rms = Number.isFinite(s.rmsDb) ? `${s.rmsDb.toFixed(1)} dBFS` : 'silent';
  const clip = `${(s.clipFraction * 100).toFixed(3)}%`;
  return `peak ${peak} · rms ${rms} · clipped ${clip}`;
}
