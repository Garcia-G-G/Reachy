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
 * Build the AI prompt for the IMAGE behind the typographic overlay. The
 * renderer composes brand-typography on top after the image lands, so
 * the AI should NOT render text — but it SHOULD produce a strong
 * editorial composition with depth, focal subject, and planned negative
 * space. Earlier versions said "background only / nothing else" and got
 * back flat gradients; we now push the model toward magazine-cover
 * energy instead.
 *
 * The negativeSpaceHint from the layout tells the model where to keep
 * the frame quiet for the overlay; visualStyle drives palette and form.
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
  // Editorial directive FIRST — establishes the "magazine cover, not
  // stock gradient" mental model before the rest of the prompt lands.
  // This is the load-bearing line that fights the "flat AI gradient"
  // failure mode. We do NOT use the phrasing "background only" or
  // "nothing else" — those produce empty visuals.
  lines.push(
    'EDITORIAL COMPOSITION: photographic depth, intentional negative space, ONE clear focal element, magazine-spread aesthetic. Avoid flat abstract gradients, generic geometric shapes, balanced symmetric compositions. Think: small-press magazine cover, premium product editorial, art-direction-led brand photograph. Not stock background.',
  );
  lines.push(`Subject — what the image should show: """${safeIdea}"""`);
  lines.push(`Aspect ratio: ${fm.w}x${fm.h} (${fm.label}).`);
  lines.push(`Project: ${project.name}.`);
  if (audience) lines.push(`Audience: ${audience}.`);
  if (voiceTone) lines.push(`Visual tone: ${voiceTone}.`);
  if (palette) lines.push(`Brand palette: ${palette}.`);
  if (brandKit?.keywords && brandKit.keywords.length > 0) {
    lines.push(`Keywords to evoke: ${brandKit.keywords.slice(0, 8).join(', ')}.`);
  }
  // Layout-driven negative space — tells the model where to leave room
  // for the overlaid typography. Specific per-layout instructions.
  lines.push(`COMPOSITION FRAMING: ${layout.negativeSpaceHint}`);
  // Style body — drives palette + form. Still useful even though we've
  // moved away from "background only" language elsewhere.
  lines.push(`Visual style: ${style.label}. ${style.promptStatic}`);
  // Restated at the tail — image models weight tail tokens more strongly.
  // We keep the no-text guardrail hard but no longer call the image a
  // "background" (that's the word that produces empty gradients).
  if (language === 'es') {
    lines.push(
      'ABSOLUTAMENTE NADA DE TEXTO: NO renderices letras, palabras, números ni tipografía dentro de la imagen. NO firmas, NO marcas de agua. La tipografía la añadimos en post-producción. Compón una imagen visualmente fuerte y editorial — pero sin texto en los píxeles.',
    );
  } else {
    lines.push(
      'ABSOLUTELY NO TEXT: do NOT render letters, words, numbers, or typography inside the image. No signatures, no watermarks. Text will be added in post-production. Compose a visually strong, editorial image — just without any text in the pixels themselves.',
    );
  }

  return lines.filter(Boolean).join(' ');
}
