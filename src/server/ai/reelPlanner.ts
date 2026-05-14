import 'server-only';
import {
  type PlannedScene,
  REEL_TEMPLATES,
  type ReelEngine,
  type ReelPlan,
  type ReelTemplateKey,
} from '@/lib/reel-templates';
import type { BrandKit } from '@/server/actions/brandKits';
import type { Project } from '@/server/actions/projects';
import { getOpenAI } from './openai';
import { resolveVisualStyle } from './visualStyles';

// Each visualStyle prompt fragment in src/server/ai/visualStyles.ts is
// ~600 chars on its own, and the planner concatenates it with scene-specific
// subject text — locked-style imagePrompts routinely land at 800–1200 chars.
// The original 600-char cap predates visualStyles and was rejecting every
// styled plan at compose time with "Too big: expected string to have <=600
// characters". `composeReelAction` validates against this; the planner also
// clamps its own output here so a runaway model can never break the form.
export const MAX_IMAGE_PROMPT_CHARS = 2000;

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
   * Engine the plan will be composed with. Determines whether the planner
   * bakes the visualStyle's `promptStatic` (FFmpeg / image-gen path) or
   * `promptMotion` (Sora video path) into each scene's imagePrompt.
   * Without this, Sora 2 reads "camera completely static" and renders a
   * frozen frame. Defaults to 'ffmpeg' when omitted so older callers
   * keep their static behavior.
   */
  engine?: ReelEngine;
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

  // Visual style is the difference between Sora generating a stressed person
  // at a desk and an animated explainer with motion graphics. See
  // src/server/ai/visualStyles.ts. Defaults to 'editorial' when no brand kit.
  const style = resolveVisualStyle(args.brandKit?.visualStyle);
  // Sora engines need motion language baked into the imagePrompt — without
  // it Sora obediently produces frozen frames (camera-static prompts). The
  // FFmpeg path uses the static composition, which the Ken Burns zoompan
  // animates after the fact.
  const isMotionEngine = args.engine === 'sora-base' || args.engine === 'sora-pro-720p';
  const stylePrompt = isMotionEngine ? style.promptMotion : style.promptStatic;

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
        `  ${stylePrompt}`,
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
      `  ${stylePrompt}`,
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
      `  ${stylePrompt}`,
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
    `  ${stylePrompt}`,
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
      ? 'For each scene: (1) echo the user\'s line back verbatim in `text` (do not paraphrase); (2) write a `narration` that is that line EXPANDED into a full natural sentence of 15-25 words in the same language — keep the exact meaning but make it flow well when spoken over a 5-8 second scene; (3) write an `imagePrompt` that visualizes the line in the locked style (set `imagePrompt: ""` for any scene whose `background` is "brand"). Example: text="Marketing real para apps reales." → narration="Hacemos marketing real, hecho para apps reales, sin atajos ni plantillas vacías que no convencen a nadie."'
      : 'Return JSON. For every scene write a SHORT `text` (≤ 6 words, the on-screen kicker) AND a longer `narration` (15-25 words, what the narrator reads aloud over the scene — same language, flows well spoken, EXPANDS on the text rather than repeating it). Set `imagePrompt: ""` for any scene whose `background` is "brand".',
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
          required: [
            'slot',
            'durationSec',
            'text',
            'narration',
            'textPosition',
            'imagePrompt',
            'background',
          ],
          properties: {
            slot: { type: 'string' },
            durationSec: { type: 'number' },
            text: { type: 'string' },
            /** Full narration line the TTS reads. Distinct from `text`. */
            narration: { type: 'string' },
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
    // Narration is what the TTS reads. If the model produced one, take it.
    // Otherwise fall back to the overlay text so the worker still synthesizes
    // audio (degrades to the legacy single-field shape).
    const narration = planned?.narration?.trim();
    const rawPrompt = slot.background === 'brand' ? '' : (planned?.imagePrompt?.trim() ?? '');
    return {
      slot: slot.slot,
      durationSec: slot.durationSec,
      text: sceneText,
      narration: narration && narration.length > 0 ? narration : undefined,
      textPosition: slot.textPosition,
      imagePrompt: rawPrompt.slice(0, MAX_IMAGE_PROMPT_CHARS),
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
