import 'server-only';
import type { ParseCtx, ParsedFile } from '../types';
import { clipText } from '../util';

/** Plain-text parser. UTF-8 decode + clip at the per-file cap. */
export async function parse(buffer: Buffer, filename: string, _ctx: ParseCtx): Promise<ParsedFile> {
  const raw = buffer.toString('utf-8');
  const { text, truncated } = clipText(raw);
  return {
    filename,
    bytes: Buffer.byteLength(text, 'utf-8'),
    textBlocks: text.trim().length > 0 ? [{ source: filename, content: text }] : [],
    images: [],
    truncated,
  };
}
