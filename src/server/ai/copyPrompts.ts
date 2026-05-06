import 'server-only';
import { COPY_FORMATS, type CopyFormat } from '@/lib/copy-formats';
import type { BrandKit } from '@/server/actions/brandKits';
import type { Project } from '@/server/actions/projects';

/** Language used to *prime* the model's output. The output is always bilingual. */
export type PromptLanguage = 'en' | 'es';

interface BuildSystemArgs {
  brandKit: BrandKit | null;
  project: Pick<Project, 'name' | 'audience' | 'tone'>;
  promptLanguage: PromptLanguage;
}

interface BuildUserArgs {
  format: CopyFormat;
  idea: string;
  project: Pick<Project, 'name' | 'description' | 'websiteUrl'>;
  promptLanguage: PromptLanguage;
}

function joinList(items: readonly string[] | null | undefined, max = 12): string {
  if (!items || items.length === 0) return '';
  return items.slice(0, max).join(', ');
}

/**
 * The system prompt establishes role, tone, and the bilingual contract.
 * We default to English priming because GPT-5+ handles native ES well; if
 * Garcia later observes "translated-feeling" Spanish, switch to ES priming.
 */
export function buildCopySystemPrompt({
  brandKit,
  project,
  promptLanguage,
}: BuildSystemArgs): string {
  const tone = brandKit?.voice?.tone?.trim() || project.tone || '';
  const dontSay = joinList(brandKit?.voice?.dontSay);
  const doSay = joinList(brandKit?.voice?.doSay);
  const keywords = joinList(brandKit?.keywords);
  const audience = project.audience?.trim() || '';

  if (promptLanguage === 'es') {
    return [
      'Eres un copywriter de marketing para apps SaaS. Escribes en ESPAÑOL NATIVO y en INGLÉS NATIVO.',
      '',
      'REGLAS:',
      '- Cada salida incluye versión "es" y "en", siempre.',
      `- Tono: ${tone || 'directo, claro, sin jerga'}`,
      dontSay && `- NO uses: ${dontSay}`,
      doSay && `- Usa cuando encajen: ${doSay}`,
      keywords && `- Palabras clave del producto: ${keywords}`,
      `- Audiencia: ${audience || 'indie hackers y founders técnicos'}`,
      '- Sin emojis salvo que el formato sea ig-caption.',
      '- Sin signos de exclamación en exceso.',
      '- Concreto > abstracto. Beneficio > característica.',
      '- El español es el mercado primario — que la versión ES suene nativa, no traducida.',
      '- Respeta el JSON Schema entregado. No inventes campos.',
    ]
      .filter(Boolean)
      .join('\n');
  }

  return [
    'You are a marketing copywriter for SaaS apps. You write in NATIVE SPANISH and NATIVE ENGLISH.',
    '',
    'RULES:',
    '- Every output includes both "es" and "en" versions, always.',
    `- Tone: ${tone || 'direct, clear, no jargon'}`,
    dontSay && `- DO NOT use: ${dontSay}`,
    doSay && `- Lean into when they fit: ${doSay}`,
    keywords && `- Product keywords: ${keywords}`,
    `- Audience: ${audience || 'indie hackers and technical founders'}`,
    '- No emojis unless the format is ig-caption.',
    '- No excessive exclamation marks.',
    '- Concrete > abstract. Benefit > feature.',
    '- Spanish is the primary market — make the ES version sound native, not translated.',
    '- Respect the provided JSON schema. Do not invent fields.',
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildCopyUserPrompt({
  format,
  idea,
  project,
  promptLanguage,
}: BuildUserArgs): string {
  const fm = COPY_FORMATS[format];
  const site =
    project.websiteUrl?.trim() || (promptLanguage === 'es' ? '(sin sitio aún)' : '(no site yet)');
  const description = project.description?.trim() || '';

  if (promptLanguage === 'es') {
    return [
      `Producto: ${project.name}.`,
      description && description,
      `Sitio: ${site}`,
      '',
      `Idea o ángulo: ${idea.trim()}`,
      '',
      `Formato pedido: ${format} (${fm.label}).`,
      `Pista: ${fm.hint}`,
      '',
      'Devuelve JSON cumpliendo el schema indicado.',
    ]
      .filter(Boolean)
      .join('\n');
  }

  return [
    `Product: ${project.name}.`,
    description && description,
    `Site: ${site}`,
    '',
    `Idea or angle: ${idea.trim()}`,
    '',
    `Requested format: ${format} (${fm.label}).`,
    `Hint: ${fm.hint}`,
    '',
    'Return JSON matching the provided schema.',
  ]
    .filter(Boolean)
    .join('\n');
}
