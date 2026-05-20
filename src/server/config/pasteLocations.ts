/**
 * Channel → paste-location map. Phase 07i.
 *
 * Each composeBrief tool result returns one of these so Emma can
 * tell Garcia EXACTLY where to paste the brief. `path` is a
 * project-scoped route with the {slug} placeholder resolved at
 * tool-execute time. `field` names the form input that receives
 * the brief. `formatPreset` is the dropdown value to pre-select
 * (e.g. 'post-ig' for the image format picker).
 *
 * NO `server-only` marker — both server tool + client brief card
 * read this catalog.
 */

export type ComposeBriefChannel =
  | 'image-ig'
  | 'image-linkedin'
  | 'image-og'
  | 'image-email-header'
  | 'image-square'
  | 'copy-linkedin-long'
  | 'copy-linkedin-short'
  | 'copy-x-thread'
  | 'copy-ig-caption'
  | 'copy-email-cold'
  | 'copy-email-warm'
  | 'copy-blog-outline'
  | 'copy-press-release'
  | 'reel-15s'
  | 'reel-30s';

export interface PasteLocation {
  /** Project-scoped Reachy route — {slug} is substituted at tool
   *  execute time by the composeBrief tool. */
  path: string;
  /** Human label for the input field where the brief goes. */
  field: string;
  /** Optional preset to mention so Garcia picks the right
   *  format/template once he lands on the page. */
  formatPreset?: string;
  /** Bilingual short label used in the brief card chip
   *  ("ir a Generate → Image" / "go to Generate → Image"). */
  pageLabelEs: string;
  pageLabelEn: string;
}

export const PASTE_LOCATIONS: Record<ComposeBriefChannel, PasteLocation> = {
  'image-ig': {
    path: '/app/projects/{slug}/generate/image',
    field: 'Idea',
    formatPreset: 'post-ig',
    pageLabelEs: 'Generate → Image',
    pageLabelEn: 'Generate → Image',
  },
  'image-linkedin': {
    path: '/app/projects/{slug}/generate/image',
    field: 'Idea',
    formatPreset: 'linkedin-post-landscape',
    pageLabelEs: 'Generate → Image',
    pageLabelEn: 'Generate → Image',
  },
  'image-og': {
    path: '/app/projects/{slug}/generate/image',
    field: 'Idea',
    formatPreset: 'og',
    pageLabelEs: 'Generate → Image',
    pageLabelEn: 'Generate → Image',
  },
  'image-email-header': {
    path: '/app/projects/{slug}/generate/image',
    field: 'Idea',
    formatPreset: 'email-header',
    pageLabelEs: 'Generate → Image',
    pageLabelEn: 'Generate → Image',
  },
  'image-square': {
    path: '/app/projects/{slug}/generate/image',
    field: 'Idea',
    formatPreset: 'square',
    pageLabelEs: 'Generate → Image',
    pageLabelEn: 'Generate → Image',
  },
  'copy-linkedin-long': {
    path: '/app/projects/{slug}/generate/copy',
    field: 'Brief',
    formatPreset: 'linkedin-post-long',
    pageLabelEs: 'Generate → Copy',
    pageLabelEn: 'Generate → Copy',
  },
  'copy-linkedin-short': {
    path: '/app/projects/{slug}/generate/copy',
    field: 'Brief',
    formatPreset: 'linkedin-post-short',
    pageLabelEs: 'Generate → Copy',
    pageLabelEn: 'Generate → Copy',
  },
  'copy-x-thread': {
    path: '/app/projects/{slug}/generate/copy',
    field: 'Brief',
    formatPreset: 'x-thread',
    pageLabelEs: 'Generate → Copy',
    pageLabelEn: 'Generate → Copy',
  },
  'copy-ig-caption': {
    path: '/app/projects/{slug}/generate/copy',
    field: 'Brief',
    formatPreset: 'instagram-caption',
    pageLabelEs: 'Generate → Copy',
    pageLabelEn: 'Generate → Copy',
  },
  'copy-email-cold': {
    path: '/app/projects/{slug}/generate/copy',
    field: 'Brief',
    formatPreset: 'email-pitch-cold',
    pageLabelEs: 'Generate → Copy',
    pageLabelEn: 'Generate → Copy',
  },
  'copy-email-warm': {
    path: '/app/projects/{slug}/generate/copy',
    field: 'Brief',
    formatPreset: 'email-pitch-warm',
    pageLabelEs: 'Generate → Copy',
    pageLabelEn: 'Generate → Copy',
  },
  'copy-blog-outline': {
    path: '/app/projects/{slug}/generate/copy',
    field: 'Brief',
    formatPreset: 'blog-outline',
    pageLabelEs: 'Generate → Copy',
    pageLabelEn: 'Generate → Copy',
  },
  'copy-press-release': {
    path: '/app/projects/{slug}/generate/copy',
    field: 'Brief',
    formatPreset: 'press-release-short',
    pageLabelEs: 'Generate → Copy',
    pageLabelEn: 'Generate → Copy',
  },
  'reel-15s': {
    path: '/app/projects/{slug}/generate/reel',
    field: 'Idea',
    formatPreset: '15s',
    pageLabelEs: 'Generate → Reel',
    pageLabelEn: 'Generate → Reel',
  },
  'reel-30s': {
    path: '/app/projects/{slug}/generate/reel',
    field: 'Idea',
    formatPreset: '30s',
    pageLabelEs: 'Generate → Reel',
    pageLabelEn: 'Generate → Reel',
  },
};

export function resolvePasteLocation(
  channel: ComposeBriefChannel,
  slug: string,
): { path: string; field: string; formatPreset?: string; pageLabel: string } & PasteLocation {
  const loc = PASTE_LOCATIONS[channel];
  const path = loc.path.replaceAll('{slug}', slug);
  return { ...loc, path, pageLabel: loc.pageLabelEs };
}
