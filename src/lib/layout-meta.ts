// Client-safe layout metadata mirror. Server-side layoutTemplates.ts owns
// the full TextBlock geometry + negativeSpaceHint payload (those need
// server-only because they're consumed by sharp / OpenAI). The client
// form only needs id + label + per-format default for the picker UI.
//
// Keep these in sync with src/server/ai/layoutTemplates.ts — adding a
// new layout there means adding its id + label here. A typecheck-time
// guard would be nicer but layoutTemplates is server-only and can't be
// imported here, so it's a manual coupling.

import type { ImageFormat } from './image-formats';

export type LayoutId = 'hero-centered' | 'hero-split-left' | 'quote-slab' | 'announcement-banner';

export const LAYOUT_IDS: readonly LayoutId[] = [
  'hero-centered',
  'hero-split-left',
  'quote-slab',
  'announcement-banner',
];

export const LAYOUT_META: Record<LayoutId, { label: string; tagline: string }> = {
  'hero-centered': {
    label: 'Hero · centered',
    tagline: 'Eyebrow + headline + CTA, all centered. Works for posts, squares, hero images.',
  },
  'hero-split-left': {
    label: 'Hero · split-left',
    tagline: 'Headline left half, visual right half. Wide formats — OG, hero, LinkedIn landscape.',
  },
  'quote-slab': {
    label: 'Quote · slab',
    tagline: 'Italic headline on a coloured slab. Quotes, reel covers, statement squares.',
  },
  'announcement-banner': {
    label: 'Announcement · banner',
    tagline: 'Eyebrow + headline + sub, left-aligned, bottom-anchored. Email + banner formats.',
  },
};

/** Per-format default layout. Mirrors the server-side mapping. */
export const DEFAULT_LAYOUT_FOR_FORMAT: Record<ImageFormat, LayoutId> = {
  hero: 'hero-split-left',
  og: 'hero-split-left',
  square: 'hero-centered',
  'og-square': 'hero-centered',
  'post-ig': 'hero-centered',
  'reel-cover': 'quote-slab',
  'tiktok-cover': 'quote-slab',
  'linkedin-post-square': 'hero-centered',
  'linkedin-post-landscape': 'hero-split-left',
  pinterest: 'quote-slab',
  'banner-tw': 'announcement-banner',
  'youtube-thumbnail': 'hero-split-left',
  'email-header': 'announcement-banner',
  'email-banner-wide': 'announcement-banner',
};

/** Layout slot definitions — which copy fields each layout requests.
 *  The Edit Copy modal uses this to render exactly the right inputs. */
export const LAYOUT_SLOTS: Record<LayoutId, readonly LayoutSlot[]> = {
  'hero-centered': ['eyebrow', 'headline', 'cta'],
  'hero-split-left': ['eyebrow', 'headline', 'cta'],
  'quote-slab': ['headline', 'wordmark'],
  'announcement-banner': ['eyebrow', 'headline', 'subheadline'],
};

export type LayoutSlot = 'eyebrow' | 'headline' | 'subheadline' | 'cta' | 'wordmark';
