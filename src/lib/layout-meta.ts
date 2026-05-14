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

export type LayoutId =
  | 'hero-centered'
  | 'hero-split-left'
  | 'quote-slab'
  | 'announcement-banner'
  | 'card-soft'
  | 'quote-large'
  | 'editorial-margin'
  | 'feature-stack';

export const LAYOUT_IDS: readonly LayoutId[] = [
  'card-soft',
  'feature-stack',
  'quote-large',
  'editorial-margin',
  'hero-centered',
  'hero-split-left',
  'quote-slab',
  'announcement-banner',
];

export const LAYOUT_META: Record<LayoutId, { label: string; tagline: string }> = {
  'card-soft': {
    label: 'Card · soft',
    tagline: 'Floating brand card with soft shadow over photo. IG-native feel.',
  },
  'feature-stack': {
    label: 'Feature · stack',
    tagline: 'Accent dot + eyebrow + headline + sub, centered with generous air.',
  },
  'quote-large': {
    label: 'Quote · large',
    tagline: 'Huge italic phrase on full-bleed brand color. Statement squares.',
  },
  'editorial-margin': {
    label: 'Editorial · margin',
    tagline: 'Typography column left 30%, AI imagery right 70%. Magazine spread.',
  },
  'hero-centered': {
    label: 'Hero · centered',
    tagline: 'Eyebrow + headline + CTA centered. Classic.',
  },
  'hero-split-left': {
    label: 'Hero · split-left',
    tagline: 'Headline left, visual right. Wide formats — OG, hero, LinkedIn landscape.',
  },
  'quote-slab': {
    label: 'Quote · slab',
    tagline: 'Italic headline on a translucent slab over photo.',
  },
  'announcement-banner': {
    label: 'Announcement · banner',
    tagline: 'Eyebrow + headline + sub, left-aligned, bottom-anchored.',
  },
};

/** Per-format default layout. Mirrors the server-side mapping. */
export const DEFAULT_LAYOUT_FOR_FORMAT: Record<ImageFormat, LayoutId> = {
  hero: 'editorial-margin',
  og: 'editorial-margin',
  'post-ig': 'card-soft',
  square: 'feature-stack',
  'og-square': 'card-soft',
  'reel-cover': 'quote-large',
  'tiktok-cover': 'quote-large',
  'linkedin-post-square': 'feature-stack',
  'linkedin-post-landscape': 'editorial-margin',
  pinterest: 'quote-large',
  'banner-tw': 'announcement-banner',
  'youtube-thumbnail': 'editorial-margin',
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
  'card-soft': ['headline', 'subheadline'],
  'quote-large': ['headline', 'wordmark'],
  'editorial-margin': ['eyebrow', 'headline', 'subheadline'],
  'feature-stack': ['eyebrow', 'headline', 'subheadline'],
};

export type LayoutSlot = 'eyebrow' | 'headline' | 'subheadline' | 'cta' | 'wordmark';
