import 'server-only';

/**
 * Emma — feature knowledge base. Phase 07h.
 *
 * The catalog Emma references when the user asks "what is X" or
 * "how do I do Y". Each entry carries bilingual title + description,
 * a navPath she can use with the navigateTo tool, and a CTA label.
 *
 * Cannot be derived: this is Reachy's feature surface as Emma should
 * explain it. Tighten any line to update Emma's framing of that
 * feature across every conversation.
 */

export interface EmmaFeature {
  key: string;
  titleEs: string;
  titleEn: string;
  descriptionEs: string;
  descriptionEn: string;
  navPath?: string;
  /** Slug substituted into navPath at runtime when the path
   *  references a project (e.g. `/app/projects/{slug}/library`).
   *  The tool resolves {slug} from the current project context. */
  navPathRequiresProject?: boolean;
  ctaLabelEs: string;
  ctaLabelEn: string;
}

export const EMMA_FEATURES: readonly EmmaFeature[] = [
  {
    key: 'autopilot',
    titleEs: 'Autopilot',
    titleEn: 'Autopilot',
    descriptionEs:
      'Subes un brief (doc, deck, repo) y Reachy genera la campaña completa — brand kit, plan, ~18 piezas (imágenes, copy, reels) — con un crítico que filtra duds y reintentos automáticos.',
    descriptionEn:
      'Drop a brief (doc, deck, repo) and Reachy generates the full campaign — brand kit, plan, ~18 pieces (images, copy, reels) — with a critic that filters duds and auto-retries.',
    navPath: '/app/projects/new-from-upload',
    ctaLabelEs: 'arrancar autopilot',
    ctaLabelEn: 'start autopilot',
  },
  {
    key: 'generate-image',
    titleEs: 'Generar imagen',
    titleEn: 'Generate image',
    descriptionEs:
      'Crea una imagen suelta — eliges formato (LinkedIn, IG, OG, hero…), layout, estilo visual; el planner LLM escribe la tipografía y gpt-image-2 la renderiza inline. Best-of-4 critic disponible en effort=high.',
    descriptionEn:
      'Make a single image — pick format (LinkedIn, IG, OG, hero…), layout, visual style; the LLM planner writes the typography and gpt-image-2 renders it inline. Best-of-4 critic available at effort=high.',
    navPath: '/app/projects/{slug}/generate/image',
    navPathRequiresProject: true,
    ctaLabelEs: 'generar imagen',
    ctaLabelEn: 'generate image',
  },
  {
    key: 'generate-copy',
    titleEs: 'Generar copy',
    titleEn: 'Generate copy',
    descriptionEs:
      'Copy por canal (LinkedIn corto/largo, X thread, IG caption, email frío/cálido, blog outline, press release). Usa el brief del proyecto + la voz de marca; loop de auto-crítica corre detrás.',
    descriptionEn:
      'Channel copy (LinkedIn short/long, X thread, IG caption, cold/warm email, blog outline, press release). Uses the project brief + brand voice; self-critique loop runs in the background.',
    navPath: '/app/projects/{slug}/generate/copy',
    navPathRequiresProject: true,
    ctaLabelEs: 'escribir copy',
    ctaLabelEn: 'write copy',
  },
  {
    key: 'generate-reel',
    titleEs: 'Generar reel',
    titleEn: 'Generate reel',
    descriptionEs:
      'Reels de 8-30s vía Sora 2 + ffmpeg. Elige template (storytelling, demo, recap), narración (ElevenLabs TTS) y soundtrack. Costo ~$6-12 por reel.',
    descriptionEn:
      'Reels of 8-30s via Sora 2 + ffmpeg. Pick template (storytelling, demo, recap), narration (ElevenLabs TTS) and soundtrack. Cost ~$6-12 per reel.',
    navPath: '/app/projects/{slug}/generate/reel',
    navPathRequiresProject: true,
    ctaLabelEs: 'generar reel',
    ctaLabelEn: 'generate reel',
  },
  {
    key: 'library',
    titleEs: 'Library',
    titleEn: 'Library',
    descriptionEs:
      'El archivo de todo lo que has generado en el proyecto — imágenes, copys, reels. Filtra por canal o formato, abre cualquier pieza para verla en grande o iterarla.',
    descriptionEn:
      'The archive of everything you have generated in the project — images, copies, reels. Filter by channel or format, open any piece to view large or iterate.',
    navPath: '/app/projects/{slug}/library',
    navPathRequiresProject: true,
    ctaLabelEs: 'abrir library',
    ctaLabelEn: 'open library',
  },
  {
    key: 'identity',
    titleEs: 'Identidad (brand kit)',
    titleEn: 'Identity (brand kit)',
    descriptionEs:
      'Tu marca configurada — paleta, tipografías, tono de voz, audiencia, política de humanos en imágenes, estilo visual default. Reachy lo usa en cada generación para mantener coherencia.',
    descriptionEn:
      'Your brand setup — palette, typography, voice tone, audience, humans-in-imagery policy, default visual style. Reachy uses it on every generation to keep things coherent.',
    navPath: '/app/projects/{slug}/identity',
    navPathRequiresProject: true,
    ctaLabelEs: 'editar identidad',
    ctaLabelEn: 'edit identity',
  },
  {
    key: 'campaigns',
    titleEs: 'Campañas',
    titleEn: 'Campaigns',
    descriptionEs:
      'Campañas generadas por autopilot — cada una es una edición (~18 piezas) con su brief, plan, asset grid + scores del crítico. Aquí revisas, iteras y marcas piezas para publicar.',
    descriptionEn:
      'Campaigns generated by autopilot — each is an edition (~18 pieces) with its brief, plan, asset grid + critic scores. This is where you review, iterate, and mark pieces to ship.',
    navPath: '/app/projects/{slug}',
    navPathRequiresProject: true,
    ctaLabelEs: 'ver campañas',
    ctaLabelEn: 'view campaigns',
  },
  {
    key: 'project-overview',
    titleEs: 'Vista del proyecto',
    titleEn: 'Project overview',
    descriptionEs:
      'La home del proyecto — stats del mes (piezas hechas, en proceso, costo), últimas campañas, atajos a Generate / Library / Identity.',
    descriptionEn:
      'Project home — month stats (pieces done, in flight, cost), recent campaigns, shortcuts to Generate / Library / Identity.',
    navPath: '/app/projects/{slug}',
    navPathRequiresProject: true,
    ctaLabelEs: 'abrir el proyecto',
    ctaLabelEn: 'open the project',
  },
];

/** Lookup an Emma feature by key. Returns null when the key is
 *  unknown so the tool can fail gracefully. */
export function emmaFeatureByKey(key: string): EmmaFeature | null {
  return EMMA_FEATURES.find((f) => f.key === key) ?? null;
}

export const EMMA_FEATURE_KEYS = EMMA_FEATURES.map((f) => f.key);
