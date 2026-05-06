import 'server-only';

export const IMAGE_FORMATS = {
  hero: { w: 1920, h: 1080, label: 'Hero landing 16:9' },
  og: { w: 1200, h: 630, label: 'Open Graph' },
  'post-ig': { w: 1080, h: 1350, label: 'Instagram post 4:5' },
  'reel-cover': { w: 1080, h: 1920, label: 'Reel cover 9:16' },
  'email-header': { w: 1200, h: 400, label: 'Email header' },
  'banner-tw': { w: 1500, h: 500, label: 'Twitter banner' },
  square: { w: 1080, h: 1080, label: 'Square 1:1' },
} as const;

export type ImageFormat = keyof typeof IMAGE_FORMATS;
export type ImageFormatSpec = (typeof IMAGE_FORMATS)[ImageFormat];

export const IMAGE_FORMAT_KEYS = Object.keys(IMAGE_FORMATS) as ImageFormat[];

export function getFormat(key: ImageFormat): ImageFormatSpec {
  return IMAGE_FORMATS[key];
}
