import 'server-only';
import { IMAGE_FORMATS, type ImageFormat, type ImageFormatSpec } from '@/lib/image-formats';

export { IMAGE_FORMATS, IMAGE_FORMAT_KEYS } from '@/lib/image-formats';
export type { ImageFormat, ImageFormatSpec, ImageProvider } from '@/lib/image-formats';

export function getFormat(key: ImageFormat): ImageFormatSpec {
  return IMAGE_FORMATS[key];
}
