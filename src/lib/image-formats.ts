// Client-safe constants. No 'server-only' here so the values can flow into
// client components like the generator form.

/**
 * Format catalog covers the major social / web / email surfaces. Grouped
 * into `category` for the form's dropdown grouping so 14+ entries don't
 * overwhelm the picker.
 *
 * Adding a format here is enough to expose it everywhere — the engine maps
 * it to a provider-native aspect ratio (square / landscape / portrait) and
 * sharp resizes to the exact W×H after the model returns.
 */
export const IMAGE_FORMATS = {
  // ── Social ────────────────────────────────────────────────────────────
  'post-ig': { w: 1080, h: 1350, label: 'Instagram post 4:5', category: 'social' },
  'reel-cover': { w: 1080, h: 1920, label: 'Reel / Story cover 9:16', category: 'social' },
  'tiktok-cover': { w: 1080, h: 1920, label: 'TikTok cover 9:16', category: 'social' },
  square: { w: 1080, h: 1080, label: 'Square 1:1', category: 'social' },
  'og-square': { w: 1080, h: 1080, label: 'IG / OG square 1:1', category: 'social' },
  'linkedin-post-square': {
    w: 1200,
    h: 1200,
    label: 'LinkedIn post 1:1',
    category: 'social',
  },
  'linkedin-post-landscape': {
    w: 1200,
    h: 627,
    label: 'LinkedIn post landscape',
    category: 'social',
  },
  pinterest: { w: 1000, h: 1500, label: 'Pinterest pin 2:3', category: 'social' },
  'banner-tw': { w: 1500, h: 500, label: 'X / Twitter banner', category: 'social' },
  'youtube-thumbnail': {
    w: 1280,
    h: 720,
    label: 'YouTube thumbnail 16:9',
    category: 'social',
  },

  // ── Web ───────────────────────────────────────────────────────────────
  hero: { w: 1920, h: 1080, label: 'Hero landing 16:9', category: 'web' },
  og: { w: 1200, h: 630, label: 'Open Graph 1.91:1', category: 'web' },

  // ── Email ─────────────────────────────────────────────────────────────
  'email-header': { w: 1200, h: 400, label: 'Email header 3:1', category: 'email' },
  'email-banner-wide': {
    w: 1500,
    h: 400,
    label: 'Email banner wide 15:4',
    category: 'email',
  },
} as const;

export type ImageFormat = keyof typeof IMAGE_FORMATS;
export type ImageFormatSpec = (typeof IMAGE_FORMATS)[ImageFormat];
export const IMAGE_FORMAT_KEYS = Object.keys(IMAGE_FORMATS) as ImageFormat[];

/** Categories for the form's grouped dropdown — display order. */
export const IMAGE_FORMAT_CATEGORIES = ['social', 'web', 'email'] as const;
export type ImageFormatCategory = (typeof IMAGE_FORMAT_CATEGORIES)[number];

export const IMAGE_FORMAT_CATEGORY_LABELS: Record<ImageFormatCategory, string> = {
  social: 'Social',
  web: 'Web',
  email: 'Email',
};

export type ImageProvider = 'openai' | 'fal';

// The model catalog moved to src/lib/image-models.ts (IMAGE_MODELS +
// IMAGE_MODELS_BY_PROVIDER). Use those exports instead — they include
// per-model capability flags (rendersTextWell, supportsEdit, etc.) and
// per-quality-tier cost tables that this stale constant didn't carry.
