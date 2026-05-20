import 'server-only';
import type { BrandKit } from '@/server/actions/brandKits';
import type { Project } from '@/server/actions/projects';
import type { ComposeBriefChannel } from '@/server/config/pasteLocations';
import type { ProductBrief } from '@/server/ingest/extractBrief';
import { getOpenAI } from './openai';

/**
 * composeBriefServerSide — Phase 07i.
 *
 * The LLM call behind Emma's `composeBrief` tool. Produces a
 * complete, HUMAN-VOICED brief that Garcia pastes into Reachy's
 * Generate page. Emma never tries to generate the asset herself —
 * she composes the brief; the user (or Reachy's existing pipelines)
 * runs the actual generation.
 *
 * Voice contract:
 *   - Specific reader, specific moment, specific outcome.
 *   - No corporate template language ("transform / unlock / etc.")
 *   - References features by name from the product brief when
 *     available.
 *   - 80-180 words for image/copy briefs; ≤250 for reels.
 *
 * Cost: ~3¢ per call (gpt-5.5, reasoning='medium', ~500 input +
 * 250 output tokens).
 */

const MODEL = 'gpt-5.5';

export interface ComposeBriefArgs {
  channel: ComposeBriefChannel;
  productContext: string;
  voiceHint?: string;
  project: Pick<Project, 'name' | 'audience' | 'tone'>;
  brandKit: BrandKit | null;
  productBrief: ProductBrief | null;
  language: 'en' | 'es';
}

export interface ComposeBriefResult {
  brief: string;
  costCents: number;
}

function buildSystemPrompt(language: 'en' | 'es'): string {
  if (language === 'es') {
    return [
      'Eres un copywriter senior componiendo un BRIEF para que el usuario lo pegue en su herramienta de generación.',
      '',
      'Reglas duras:',
      '- Escribe en español (es-MX) en voz humana. Como copywriter senior dictándose a sí mismo, no como un template SaaS.',
      '- 80-180 palabras (≤250 para reels).',
      '- Sustantivos concretos > sustantivos abstractos. "Más clientes" > "crecimiento". "Lunes 9:15" > "productividad".',
      '- NUNCA uses: transforma, eleva, lleva al siguiente nivel, desbloquea, potencia, soluciones que, eficientemente, optimiza, todo en uno.',
      '- Incluye: lector específico (rol + dolor), momento específico, outcome específico, 1-2 features con nombre, dirección de headline sugerida.',
      '- Si el brief es para imagen: describe el FEEL visual (qué tipo de composición, qué quiere transmitir). NO especifiques colores hex — eso lo hace la marca.',
      '- Si es para copy: incluye estructura sugerida (cómo abrir, dónde poner el feature, cómo cerrar) sin escribir el copy final.',
      '- Termina con UNA sugerencia de headline (no varias).',
    ].join('\n');
  }
  return [
    'You are a senior copywriter composing a BRIEF for the user to paste into their generation tool.',
    '',
    'Hard rules:',
    '- Write in English (US) in a human voice. Senior copywriter dictating to himself, not a SaaS template.',
    '- 80-180 words (≤250 for reels).',
    '- Concrete nouns over abstract. "More customers" > "growth". "Monday 9:15" > "productivity".',
    '- NEVER use: transform, elevate, unlock, level up, solutions that, streamline, supercharge, all-in-one, efficiently.',
    '- Include: specific reader (role + pain), specific moment, specific outcome, 1-2 named features, suggested headline direction.',
    "- For image briefs: describe the visual FEEL (composition shape, what it should convey). Do NOT specify hex colors — that's the brand's job.",
    '- For copy briefs: include suggested structure (how to open, where to place the feature, how to close) without writing the final copy.',
    '- End with ONE suggested headline (not a list).',
  ].join('\n');
}

function buildUserPrompt(args: ComposeBriefArgs): string {
  const lines: string[] = [];
  lines.push(`[CHANNEL] ${args.channel}`);
  lines.push('');
  lines.push(`[PROJECT] ${args.project.name}`);
  if (args.project.audience) lines.push(`Audience: ${args.project.audience}`);
  if (args.project.tone) lines.push(`Tone preference: ${args.project.tone}`);
  if (args.brandKit?.voice?.tone) {
    lines.push(`Brand voice tone: ${args.brandKit.voice.tone}`);
  }
  if (args.brandKit?.voice?.doSay && args.brandKit.voice.doSay.length > 0) {
    lines.push(`Brand do-say: ${args.brandKit.voice.doSay.slice(0, 6).join(', ')}`);
  }
  if (args.brandKit?.voice?.dontSay && args.brandKit.voice.dontSay.length > 0) {
    lines.push(`Brand don't-say: ${args.brandKit.voice.dontSay.slice(0, 6).join(', ')}`);
  }
  if (args.productBrief) {
    lines.push('');
    lines.push('[PRODUCT BRIEF]');
    lines.push(`Name: ${args.productBrief.name}`);
    lines.push(`One-liner: ${args.productBrief.oneLiner}`);
    lines.push(`Problem: ${args.productBrief.problem}`);
    lines.push(`Solution: ${args.productBrief.solution}`);
    if (args.productBrief.features.length > 0) {
      lines.push(
        `Features: ${args.productBrief.features
          .slice(0, 6)
          .map((f) => `${f.name} (${f.verb} ${f.value})`)
          .join(' / ')}`,
      );
    }
  }
  lines.push('');
  lines.push('[REQUESTED CONTEXT FROM EMMA]');
  lines.push(args.productContext);
  if (args.voiceHint) {
    lines.push('');
    lines.push(`[VOICE NUDGE] ${args.voiceHint}`);
  }
  lines.push('');
  lines.push(
    args.language === 'es'
      ? 'Compone el brief ahora. Solo el brief — sin preámbulo ni cierre.'
      : 'Compose the brief now. Brief only — no preamble or sign-off.',
  );
  return lines.join('\n');
}

function estimateCostCents(promptTokens: number, completionTokens: number): number {
  // gpt-5.5 pricing: $5/M in, $30/M out.
  const cents = ((promptTokens * 5 + completionTokens * 30) / 1_000_000) * 100;
  return Math.max(1, Math.round(cents));
}

export async function composeBriefServerSide(args: ComposeBriefArgs): Promise<ComposeBriefResult> {
  const openai = getOpenAI();
  const completion = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: buildSystemPrompt(args.language) },
      { role: 'user', content: buildUserPrompt(args) },
    ],
    reasoning_effort: 'medium' as const,
  });
  const content = completion.choices[0]?.message?.content ?? '';
  if (!content) {
    throw new Error('composeBrief: empty response');
  }
  const usage = completion.usage ?? { prompt_tokens: 0, completion_tokens: 0 };
  const costCents = estimateCostCents(usage.prompt_tokens, usage.completion_tokens);
  return { brief: content.trim(), costCents };
}
