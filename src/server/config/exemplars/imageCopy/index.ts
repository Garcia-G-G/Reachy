import 'server-only';
import type { LayoutId } from '@/server/ai/layoutTemplates';
import type { ImageCopyExemplar, ImageCopyExemplarFile } from './_types';
import announcementBanner from './announcement-banner';
import badgeStamp from './badge-stamp';
import cardSoft from './card-soft';
import editorialCollage from './editorial-collage';
import editorialMargin from './editorial-margin';
import featureStack from './feature-stack';
import heroCentered from './hero-centered';
import heroSplitLeft from './hero-split-left';
import quoteLarge from './quote-large';
import quoteSlab from './quote-slab';
import textMaskCutout from './text-mask-cutout';

export type { ImageCopyExemplar, ImageCopyExemplarFile };

const REGISTRY: Record<LayoutId, ImageCopyExemplarFile> = {
  'hero-centered': heroCentered,
  'hero-split-left': heroSplitLeft,
  'quote-slab': quoteSlab,
  'announcement-banner': announcementBanner,
  'card-soft': cardSoft,
  'quote-large': quoteLarge,
  'editorial-margin': editorialMargin,
  'feature-stack': featureStack,
  'editorial-collage': editorialCollage,
  'text-mask-cutout': textMaskCutout,
  'badge-stamp': badgeStamp,
};

/** Look up the exemplars curated for a given layout. Always returns 3
 *  entries (the file contract enforces this); empty array would mean
 *  the layout wasn't wired here — caller can decide whether to crash
 *  or skip the [GOOD EXAMPLES] section. */
export function imageCopyExemplarsFor(layoutId: LayoutId): readonly ImageCopyExemplar[] {
  return REGISTRY[layoutId]?.exemplars ?? [];
}
