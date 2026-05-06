// Client-safe constants. No 'server-only' here so the values can flow into
// client components like the generator form.

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

export type ImageProvider = 'openai' | 'fal';

export const IMAGE_PROVIDERS: ReadonlyArray<{
  provider: ImageProvider;
  models: ReadonlyArray<{ id: string; label: string }>;
}> = [
  {
    provider: 'openai',
    models: [{ id: 'gpt-image-1', label: 'OpenAI · GPT Image 1' }],
  },
  {
    provider: 'fal',
    models: [
      { id: 'fal-ai/flux-2-pro', label: 'fal.ai · FLUX.2 [pro]' },
      { id: 'fal-ai/flux-2-flex', label: 'fal.ai · FLUX.2 [flex]' },
      { id: 'fal-ai/recraft-v3', label: 'fal.ai · Recraft V3' },
      { id: 'fal-ai/nano-banana-2', label: 'fal.ai · Nano Banana 2' },
    ],
  },
];
