import 'server-only';
import type { BrandKit } from '@/server/actions/brandKits';
import type { Project } from '@/server/actions/projects';
import { getFormat, type ImageFormat } from './formats';

interface BuildArgs {
  idea: string;
  format: ImageFormat;
  project: Pick<Project, 'name' | 'audience' | 'tone'>;
  brandKit: BrandKit | null;
  language: 'en' | 'es';
}

export function buildImagePrompt({ idea, format, project, brandKit, language }: BuildArgs): string {
  const fm = getFormat(format);

  const palette = [brandKit?.primaryColor, brandKit?.accentColor, brandKit?.bgColor]
    .filter((c): c is string => Boolean(c))
    .join(', ');

  const voiceTone = brandKit?.voice?.tone?.trim() || project.tone || '';
  const audience = project.audience?.trim() || '';

  const lines: string[] = [];
  lines.push(idea.trim());
  lines.push(`Aspect ratio target: ${fm.w}x${fm.h} (${fm.label}).`);
  lines.push(`Project: ${project.name}.`);
  if (audience) lines.push(`Audience: ${audience}.`);
  if (voiceTone) lines.push(`Visual tone: ${voiceTone}.`);
  if (palette) lines.push(`Brand palette: ${palette}.`);
  if (brandKit?.fontHeading) {
    lines.push(`Typography reminiscent of ${brandKit.fontHeading}.`);
  }
  if (brandKit?.keywords && brandKit.keywords.length > 0) {
    lines.push(`Keywords to evoke: ${brandKit.keywords.slice(0, 8).join(', ')}.`);
  }
  if (language === 'es') {
    lines.push('Estética editorial moderna; composición limpia; sin marcas de agua.');
  } else {
    lines.push(
      'High-quality modern editorial aesthetic. Clean composition. No watermark, no text artifacts unless requested.',
    );
  }

  return lines.filter(Boolean).join(' ');
}
