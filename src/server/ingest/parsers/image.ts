import 'server-only';
import { MAX_IMAGES_PER_FILE } from '@/server/config/parserLimits';
import type { ParseCtx, ParsedFile } from '../types';
import { hashContent, persistExtractedImage } from '../util';

const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
};

export async function parse(buffer: Buffer, filename: string, ctx: ParseCtx): Promise<ParsedFile> {
  void MAX_IMAGES_PER_FILE; // single-file image parser; cap applied at aggregator
  const ext = filename.split('.').pop()?.toLowerCase() ?? 'png';
  const mime = MIME_BY_EXT[ext] ?? 'image/png';
  const id = hashContent(buffer);
  const persisted = await persistExtractedImage({
    buffer,
    mime,
    filename: `${id}-image`,
    prefix: ctx.extractedPrefix,
    source: filename,
    hint: 'direct upload',
  });
  return {
    filename,
    bytes: buffer.byteLength,
    textBlocks: [],
    images: [persisted],
  };
}
