import 'server-only';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { DEDUP_HASH_PREFIX_LEN, MAX_TEXT_CHARS_PER_FILE } from '@/server/config/parserLimits';
import { putR2 } from '@/server/storage/r2';
import type { ParsedImage } from './types';

/** Truncate a long blob of text at the parser-level cap. Returns the
 *  truncated string and a `truncated` flag so the parser can surface
 *  that on its ParsedFile. */
export function clipText(text: string): { text: string; truncated: boolean } {
  if (text.length <= MAX_TEXT_CHARS_PER_FILE) return { text, truncated: false };
  return {
    text: `${text.slice(0, MAX_TEXT_CHARS_PER_FILE)}\n\n[truncated]`,
    truncated: true,
  };
}

/** Dedup prefix — short SHA-256 used by the aggregator and by parsers
 *  that need a stable id for an extracted asset before R2 upload. */
export function hashContent(content: string | Buffer): string {
  return createHash('sha256').update(content).digest('hex').slice(0, DEDUP_HASH_PREFIX_LEN);
}

/** Read width/height + dominant 3 colors from an image buffer via
 *  sharp. Used by the `image` parser and by `mp4` (per keyframe). */
export async function probeImage(buffer: Buffer): Promise<{
  width: number;
  height: number;
  palette: string[];
}> {
  const img = sharp(buffer, { failOn: 'none' });
  const meta = await img.metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;

  // Dominant palette: downscale to a tiny thumbnail and bucket the
  // pixels — `sharp.stats()` returns per-channel summary but doesn't
  // surface a true palette; the cheap-and-correct way is to read a
  // small thumbnail's raw pixels and tally the top buckets.
  const thumb = await img
    .clone()
    .resize(32, 32, { fit: 'cover' })
    .raw({ depth: 'uchar' })
    .toBuffer({ resolveWithObject: true });
  const buckets = new Map<string, number>();
  const channels = thumb.info.channels;
  for (let i = 0; i < thumb.data.length; i += channels) {
    const r = thumb.data[i] ?? 0;
    const g = thumb.data[i + 1] ?? 0;
    const b = thumb.data[i + 2] ?? 0;
    // 5-bit quantization → 32 buckets per channel
    const key = `${r >> 3}-${g >> 3}-${b >> 3}`;
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  const top = [...buckets.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  const palette = top.map(([bucket]) => {
    const [rb, gb, bb] = bucket.split('-').map(Number);
    const hex = (n: number) => ((n ?? 0) << 3).toString(16).padStart(2, '0');
    return `#${hex(rb ?? 0)}${hex(gb ?? 0)}${hex(bb ?? 0)}`;
  });
  return { width, height, palette };
}

/** Upload an extracted-from-parser image into R2 under the given
 *  prefix and return a ParsedImage. Caller controls the `source` /
 *  `hint` semantics; this helper just handles the upload + probe. */
export async function persistExtractedImage(args: {
  buffer: Buffer;
  mime: string;
  filename: string;
  /** R2 path PREFIX (already includes uploads/{userId}/{ingestionId}/extracted). */
  prefix: string;
  source: string;
  hint?: string;
}): Promise<ParsedImage> {
  const ext = args.mime.split('/').pop() ?? 'bin';
  const r2Key = `${args.prefix}/${args.filename}.${ext}`;
  const { width, height, palette } = await probeImage(args.buffer).catch(() => ({
    width: 0,
    height: 0,
    palette: [] as string[],
  }));
  const upload = await putR2(r2Key, args.buffer, args.mime);
  return {
    source: args.source,
    r2Key: upload.key,
    mime: args.mime,
    bytes: upload.bytes,
    width: width || undefined,
    height: height || undefined,
    palette: palette.length > 0 ? palette : undefined,
    hint: args.hint,
  };
}
