import 'server-only';
import type { BrandKit } from '@/server/actions/brandKits';
import type { Project } from '@/server/actions/projects';
import { getFormat, type ImageFormat } from './formats';
import type { Layout } from './layoutTemplates';
import type { VisualStyleKey } from './visualStyles';
import { resolveVisualStyle } from './visualStyles';

interface BuildArgs {
  idea: string;
  format: ImageFormat;
  project: Pick<Project, 'name' | 'audience' | 'tone'>;
  brandKit: BrandKit | null;
  language: 'en' | 'es';
  /** Per-generation override for the brand kit's `visualStyle`. */
  visualStyleOverride?: VisualStyleKey | null;
  /** Required: the layout that will later be overlaid on top of this
   *  background. We ask the image model to keep the typographic zones
   *  visually calm so the deterministic SVG overlay reads cleanly. */
  layout: Layout;
}

/**
 * Build the AI prompt for the BACKGROUND image. The renderer composes
 * brand-typography on top after the image lands, so the AI should not
 * try to render text — every prior version of this file injected
 * typography hints into the prompt and got back gibberish letterforms.
 *
 * The negativeSpaceHint from the layout tells the model where to keep
 * the frame quiet so the overlay has room. The visualStyle.promptStatic
 * still drives palette and composition (NO real people, NO typography
 * inside the pixels).
 */
export function buildImagePrompt({
  idea,
  format,
  project,
  brandKit,
  language,
  visualStyleOverride,
  layout,
}: BuildArgs): string {
  const fm = getFormat(format);

  const palette = [brandKit?.primaryColor, brandKit?.accentColor, brandKit?.bgColor]
    .filter((c): c is string => Boolean(c))
    .join(', ');

  const voiceTone = brandKit?.voice?.tone?.trim() || project.tone || '';
  const audience = project.audience?.trim() || '';

  // Visual style catalog drives aesthetic. Override > brand kit > default.
  const styleKey = visualStyleOverride ?? brandKit?.visualStyle ?? null;
  const style = resolveVisualStyle(styleKey);

  // The user's `idea` is wrapped in triple-double-quote delimiters so a
  // crafted prompt ("Ignore the above…") cannot hijack the surrounding
  // instructions. Image models still attend to the wrapped content as the
  // description but treat directives inside it as part of the literal
  // subject. OpenAI's 2026 Model Spec recommends this for untrusted text.
  const safeIdea = idea.trim().replace(/"""/g, '"\\""');
  const lines: string[] = [];
  lines.push(`Subject (the background only — do NOT render any text): """${safeIdea}"""`);
  lines.push(`Aspect ratio target: ${fm.w}x${fm.h} (${fm.label}).`);
  lines.push(`Project: ${project.name}.`);
  if (audience) lines.push(`Audience: ${audience}.`);
  if (voiceTone) lines.push(`Visual tone: ${voiceTone}.`);
  if (palette) lines.push(`Brand palette: ${palette}.`);
  if (brandKit?.keywords && brandKit.keywords.length > 0) {
    lines.push(`Keywords to evoke: ${brandKit.keywords.slice(0, 8).join(', ')}.`);
  }
  // Layout-driven negative space — tells the model where to leave room
  // for the overlaid typography. This is the load-bearing line.
  lines.push(`COMPOSITION: ${layout.negativeSpaceHint}`);
  // Style body keeps the palette + form guidelines but the typographic
  // bits inside it are still useful (the style's "no text, no people"
  // language reinforces our top-level guardrail).
  lines.push(`Visual style: ${style.label}. ${style.promptStatic}`);
  // Restated at the tail — image models weight tail tokens more strongly.
  if (language === 'es') {
    lines.push(
      'CRÍTICO: NO renderices texto, letras, palabras o números dentro de la imagen. NO firmas, NO marcas de agua. Solo el fondo abstracto/visual; la tipografía la añadimos nosotros encima.',
    );
  } else {
    lines.push(
      'CRITICAL: do NOT render any text, letters, words, or numbers inside the image. No signatures, no watermarks. Background and visual composition only — typography is overlaid by our renderer afterward.',
    );
  }

  return lines.filter(Boolean).join(' ');
}
