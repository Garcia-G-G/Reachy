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
import { resolveVisualStyle } from './visualStyles';

/**
 * Default text model for scene planning. Schema-bound JSON, no chain of
 * thought needed — same gpt-5.5 + reasoning_effort=none we use for copy.
 */
export const DEFAULT_PLANNER_MODEL = 'gpt-5.5';

export interface PlanReelArgs {
  template: ReelTemplateKey;
  /** Required in AI mode (mode='ai'). Ignored when customScript is provided. */
  idea: string;
  language: 'en' | 'es';
  project: Pick<Project, 'name' | 'audience' | 'tone' | 'description' | 'websiteUrl'>;
  brandKit: BrandKit | null;
  model?: string;
  /**
   * Script mode: when present, the planner does NOT generate scene text.
   * Each entry is the literal overlay line for the matching scene index. The
   * model only fills in `imagePrompt` (under the locked visual style) and a
   * `tagline`. Length must equal REEL_TEMPLATES[template].scenes.length —
   * the action validates this before calling, and we re-assert here.
   */
  customScript?: string[];
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

  // Visual style is the difference between Veo generating a stressed person
  // at a desk and an animated explainer with motion graphics. See
  // src/server/ai/visualStyles.ts. Defaults to 'editorial' when no brand kit.
  const style = resolveVisualStyle(args.brandKit?.visualStyle);

  // Caption safe zones (drawtext y= positions in compose.ts):
  //   top    → y=160, 3-line max ~200px high → top 19% of frame
  //   bottom → y=h-th-220, 3-line max ~200px → bottom 22% of frame
  //   center → 3-line max ~290px → middle 15%
  // Image prompts must keep subjects OUT of those zones, otherwise the
  // caption box (opaque black) covers them.
  const scriptMode = Array.isArray(args.customScript) && args.customScript.length > 0;

  if (args.language === 'es') {
    if (scriptMode) {
      return [
        'Eres director de arte de un reel vertical (9:16, 1080×1920) educativo.',
        `Audiencia: ${audience}`,
        keywords && `Palabras clave del producto: ${keywords}`,
        '',
        'El usuario ya escribió la línea exacta de cada escena — NO la cambies y NO la repitas en tu salida.',
        'Tu única tarea: redactar el `imagePrompt` de cada escena (qué se ve en pantalla detrás del texto) y un `tagline` corto para el reel.',
        '',
        `ESTILO VISUAL FIJO (${style.label}):`,
        `  ${style.prompt}`,
        '',
        'Cada `imagePrompt` debe respetar ese estilo al pie de la letra y dejar libres los safe-zones (20% superior, 25% inferior) para los subtítulos.',
        'Cumple el JSON Schema entregado. No inventes campos. Mantén el orden de las escenas.',
      ]
        .filter(Boolean)
        .join('\n');
    }
    return [
      'Eres un guionista de vídeos verticales (9:16, 1080×1920) educativos para apps SaaS.',
      `Tono: ${tone || 'directo, claro, sin jerga'}`,
      dontSay && `NO uses: ${dontSay}`,
      keywords && `Palabras clave del producto: ${keywords}`,
      `Audiencia: ${audience}`,
      'Enseñas, no vendes. Cada escena entrega UN insight, no una promesa de venta.',
      'Texto sobre vídeo: máximo 6 palabras por escena, una frase corta que se lea en 2 segundos.',
      '',
      `ESTILO VISUAL FIJO (${style.label}):`,
      `  ${style.prompt}`,
      '',
      'Cada `imagePrompt` que generes debe respetar ese estilo al pie de la letra.',
      'Cumple el JSON Schema entregado. No inventes campos. Mantén el orden de las escenas.',
    ]
      .filter(Boolean)
      .join('\n');
  }

  if (scriptMode) {
    return [
      'You are the art director for a vertical (9:16, 1080×1920) educational reel.',
      `Audience: ${audience}`,
      keywords && `Product keywords: ${keywords}`,
      '',
      'The user has already written the exact line for each scene — do NOT change it and do NOT echo it back in your output.',
      'Your only job: write the `imagePrompt` for each scene (what appears on screen behind the text) and one short `tagline` for the reel.',
      '',
      `LOCKED VISUAL STYLE (${style.label}):`,
      `  ${style.prompt}`,
      '',
      'Every `imagePrompt` must follow that style exactly and keep the safe zones (top 20%, bottom 25%) clear for captions.',
      'Respect the provided JSON schema. Do not invent fields. Keep scene order.',
    ]
      .filter(Boolean)
      .join('\n');
  }

  return [
    'You are a screenwriter for vertical (9:16, 1080×1920) educational video reels for SaaS apps.',
    `Tone: ${tone || 'direct, clear, no jargon'}`,
    dontSay && `DO NOT use: ${dontSay}`,
    keywords && `Product keywords: ${keywords}`,
    `Audience: ${audience}`,
    'You teach, you do not sell. Each scene delivers ONE insight, not a sales promise.',
    'Overlay text: max 6 words per scene, one short line readable in 2 seconds.',
    '',
    `LOCKED VISUAL STYLE (${style.label}):`,
    `  ${style.prompt}`,
    '',
    'Every `imagePrompt` you produce must follow that style exactly.',
    'Respect the provided JSON schema. Do not invent fields. Keep scene order.',
  ]
    .filter(Boolean)
    .join('\n');
}

function buildUserPrompt(args: PlanReelArgs): string {
  const tpl = REEL_TEMPLATES[args.template];
  const scriptMode = Array.isArray(args.customScript) && args.customScript.length > 0;

  const slots = tpl.scenes
    .map((s, i) => {
      const base = `  ${i + 1}. slot=${s.slot} duration=${s.durationSec}s position=${s.textPosition} background=${s.background ?? 'image'}`;
      if (!scriptMode) return base;
      const line = args.customScript?.[i]?.trim() ?? '';
      return `${base}\n     line: ${JSON.stringify(line)}`;
    })
    .join('\n');

  return [
    `Product: ${args.project.name}.`,
    args.project.description?.trim() && args.project.description.trim(),
    args.project.websiteUrl?.trim() && `Site: ${args.project.websiteUrl.trim()}`,
    '',
    scriptMode ? null : `Idea: ${args.idea.trim()}`,
    scriptMode ? '' : null,
    `Template: ${args.template} — ${tpl.label}`,
    `Total: ${tpl.durationSec}s, ${tpl.scenes.length} scenes:`,
    slots,
    '',
    scriptMode
      ? 'For each scene, write an `imagePrompt` that visualizes the user\'s line in the locked style. Set `imagePrompt: ""` for any scene whose `background` is "brand". Echo each scene\'s line back verbatim in its `text` field — do not paraphrase.'
      : 'Return JSON. Set `imagePrompt: ""` for any scene whose `background` is "brand".',
  ]
    .filter((line): line is string => typeof line === 'string')
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

  const scriptMode = Array.isArray(args.customScript) && args.customScript.length > 0;
  if (scriptMode && args.customScript) {
    if (args.customScript.length !== tpl.scenes.length) {
      throw new Error(
        `reelPlanner: customScript has ${args.customScript.length} lines, template requires ${tpl.scenes.length}`,
      );
    }
    if (args.customScript.some((line) => line.trim().length === 0)) {
      throw new Error('reelPlanner: customScript lines cannot be empty');
    }
  }

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
  // In script mode the user's literal line is the source of truth for `text`,
  // even if the model paraphrased; the visualStyle locking only applies to
  // `imagePrompt`.
  const scenes: PlannedScene[] = tpl.scenes.map((slot, i) => {
    const planned = parsed.scenes[i];
    const sceneText = scriptMode
      ? (args.customScript?.[i]?.trim() ?? '')
      : (planned?.text?.trim() ?? '');
    return {
      slot: slot.slot,
      durationSec: slot.durationSec,
      text: sceneText,
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
