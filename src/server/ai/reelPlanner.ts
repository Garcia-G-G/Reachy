import 'server-only';
import {
  type PlannedScene,
  REEL_TEMPLATES,
  type ReelPlan,
  type ReelTemplateKey,
} from '@/lib/reel-templates';
import type { BrandKit } from '@/server/actions/brandKits';
import type { Project } from '@/server/actions/projects';
import { getOpenAI } from './openai';

/**
 * Default text model for scene planning. Schema-bound JSON, no chain of
 * thought needed — same gpt-5.5 + reasoning_effort=none we use for copy.
 */
export const DEFAULT_PLANNER_MODEL = 'gpt-5.5';

export interface PlanReelArgs {
  template: ReelTemplateKey;
  idea: string;
  language: 'en' | 'es';
  project: Pick<Project, 'name' | 'audience' | 'tone' | 'description' | 'websiteUrl'>;
  brandKit: BrandKit | null;
  model?: string;
}

export interface PlanReelResult {
  plan: ReelPlan;
  costCents: number;
  usage: {
    promptTokens: number;
    cachedPromptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model: string;
}

const PRICING = { 'gpt-5.5': { input: 5, output: 30 } };

function estimateCostCents(prompt: number, cached: number, completion: number): number {
  const p = PRICING['gpt-5.5'];
  const fresh = Math.max(0, prompt - cached);
  const usd = (fresh * p.input + cached * p.input * 0.5 + completion * p.output) / 1_000_000;
  return Math.max(1, Math.round(usd * 100));
}

function buildSystemPrompt(args: PlanReelArgs): string {
  const tone = args.brandKit?.voice?.tone?.trim() || args.project.tone || '';
  const dontSay = (args.brandKit?.voice?.dontSay ?? []).slice(0, 12).join(', ');
  const keywords = (args.brandKit?.keywords ?? []).slice(0, 12).join(', ');
  const audience = args.project.audience?.trim() || 'indie hackers and technical founders';

  // Caption safe zones (drawtext y= positions in compose.ts):
  //   top    → y=160, 3-line max ~200px high → top 19% of frame
  //   bottom → y=h-th-220, 3-line max ~200px → bottom 22% of frame
  //   center → 3-line max ~290px → middle 15%
  // Image prompts must keep subjects/faces OUT of those zones, otherwise
  // the caption box (opaque black) covers them like in the May 12 test.
  if (args.language === 'es') {
    return [
      'Eres un guionista de vídeos verticales (9:16, 1080×1920) para apps SaaS.',
      `Tono: ${tone || 'directo, claro, sin jerga'}`,
      dontSay && `NO uses: ${dontSay}`,
      keywords && `Palabras clave del producto: ${keywords}`,
      `Audiencia: ${audience}`,
      'Texto sobre vídeo: máximo 6 palabras por escena, una frase corta que se lea en 2 segundos.',
      'Prompts de imagen (críticos):',
      '  • Composición vertical 9:16 — el sujeto debe ocupar el TERCIO CENTRAL del encuadre.',
      '  • Deja el 20% superior y el 25% inferior limpios (ahí va la leyenda con caja oscura).',
      '  • Encuadre medio o cuerpo entero, NUNCA primer plano de cara cortada por arriba o abajo.',
      '  • Estilo editorial moderno: paleta cálida, luz natural, profundidad de campo media.',
      '  • Sin marca de agua, sin texto, sin logos, sin caracteres legibles en pantallas.',
      'Cumple el JSON Schema entregado. No inventes campos. Mantén el orden de las escenas.',
    ]
      .filter(Boolean)
      .join('\n');
  }

  return [
    'You are a screenwriter for vertical (9:16, 1080×1920) video reels for SaaS apps.',
    `Tone: ${tone || 'direct, clear, no jargon'}`,
    dontSay && `DO NOT use: ${dontSay}`,
    keywords && `Product keywords: ${keywords}`,
    `Audience: ${audience}`,
    'Overlay text: max 6 words per scene, one short line readable in 2 seconds.',
    'Image prompts (critical):',
    '  • Vertical 9:16 composition — subject must sit in the CENTRAL THIRD of the frame.',
    '  • Keep the top 20% and bottom 25% clean (that is where the dark caption box lands).',
    '  • Medium or full-body shot, NEVER a tight face crop that gets clipped at the top or bottom.',
    '  • Modern editorial style: warm palette, natural light, mid depth-of-field.',
    '  • No watermark, no text, no logos, no readable characters on any screen in frame.',
    'Respect the provided JSON schema. Do not invent fields. Keep scene order.',
  ]
    .filter(Boolean)
    .join('\n');
}

function buildUserPrompt(args: PlanReelArgs): string {
  const tpl = REEL_TEMPLATES[args.template];
  const slots = tpl.scenes
    .map(
      (s, i) =>
        `  ${i + 1}. slot=${s.slot} duration=${s.durationSec}s position=${s.textPosition} background=${s.background ?? 'image'}`,
    )
    .join('\n');

  return [
    `Product: ${args.project.name}.`,
    args.project.description?.trim() && args.project.description.trim(),
    args.project.websiteUrl?.trim() && `Site: ${args.project.websiteUrl.trim()}`,
    '',
    `Idea: ${args.idea.trim()}`,
    '',
    `Template: ${args.template} — ${tpl.label}`,
    `Total: ${tpl.durationSec}s, ${tpl.scenes.length} scenes:`,
    slots,
    '',
    'Return JSON. Set `imagePrompt: ""` for any scene whose `background` is "brand".',
  ]
    .filter(Boolean)
    .join('\n');
}

function jsonSchemaFor(template: ReelTemplateKey): Record<string, unknown> {
  const tpl = REEL_TEMPLATES[template];
  const sceneCount = tpl.scenes.length;
  return {
    type: 'object',
    additionalProperties: false,
    required: ['tagline', 'scenes'],
    properties: {
      tagline: { type: 'string' },
      scenes: {
        type: 'array',
        minItems: sceneCount,
        maxItems: sceneCount,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['slot', 'durationSec', 'text', 'textPosition', 'imagePrompt', 'background'],
          properties: {
            slot: { type: 'string' },
            durationSec: { type: 'number' },
            text: { type: 'string' },
            textPosition: { type: 'string', enum: ['top', 'bottom', 'center'] },
            imagePrompt: { type: 'string' },
            background: { type: 'string', enum: ['image', 'brand'] },
          },
        },
      },
    },
  };
}

export async function planReel(args: PlanReelArgs): Promise<PlanReelResult> {
  const tpl = REEL_TEMPLATES[args.template];
  const model = args.model ?? DEFAULT_PLANNER_MODEL;
  const openai = getOpenAI();
  const isGpt5 = /^gpt-5(\.|-|$)/.test(model);

  const completion = await openai.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: buildSystemPrompt(args) },
      { role: 'user', content: buildUserPrompt(args) },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: `reel_plan_${args.template.replace(/-/g, '_')}`,
        schema: jsonSchemaFor(args.template),
        strict: true,
      },
    },
    ...(isGpt5 ? { reasoning_effort: 'none' as const } : {}),
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error('reelPlanner: empty response from OpenAI');
  const parsed = JSON.parse(content) as { tagline: string; scenes: PlannedScene[] };

  // Strict-mode minItems/maxItems is enforced for most cases in 2026 but not
  // 100% reliable per Pydantic AI #4438 and OpenAI community reports. Without
  // a runtime check, a model returning 4 scenes for a 5-scene template would
  // silently produce one empty-text scene at the end. Fail loud instead so
  // the worker can surface a retryable error to the UI.
  if (!Array.isArray(parsed.scenes) || parsed.scenes.length !== tpl.scenes.length) {
    throw new Error(
      `reelPlanner: model returned ${parsed.scenes?.length ?? 0} scenes, template requires ${tpl.scenes.length}`,
    );
  }
  if (typeof parsed.tagline !== 'string' || parsed.tagline.trim().length === 0) {
    throw new Error('reelPlanner: model returned empty tagline');
  }

  // Always overwrite duration/textPosition/background/slot with the template
  // values — the model's JSON shape is a hint, but the source of truth is the
  // template (otherwise a hallucinated 12s scene breaks the xfade math).
  const scenes: PlannedScene[] = tpl.scenes.map((slot, i) => {
    const planned = parsed.scenes[i];
    return {
      slot: slot.slot,
      durationSec: slot.durationSec,
      text: planned?.text?.trim() ?? '',
      textPosition: slot.textPosition,
      imagePrompt: slot.background === 'brand' ? '' : (planned?.imagePrompt?.trim() ?? ''),
      background: slot.background ?? 'image',
    };
  });

  const usage = completion.usage ?? {
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
  };
  const cached = usage.prompt_tokens_details?.cached_tokens ?? 0;

  return {
    plan: { template: args.template, tagline: parsed.tagline.trim(), scenes },
    costCents: estimateCostCents(usage.prompt_tokens, cached, usage.completion_tokens),
    usage: {
      promptTokens: usage.prompt_tokens,
      cachedPromptTokens: cached,
      completionTokens: usage.completion_tokens,
      totalTokens: usage.total_tokens,
    },
    model,
  };
}
