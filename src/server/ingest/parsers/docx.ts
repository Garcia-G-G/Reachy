import 'server-only';
import mammoth from 'mammoth';
import { MAX_IMAGES_PER_FILE } from '@/server/config/parserLimits';
import type { ParseCtx, ParsedFile, ParsedImage, ParsedTextBlock } from '../types';
import { clipText, hashContent, persistExtractedImage } from '../util';

/**
 * Parse a .docx using mammoth. mammoth's `convertToHtml` route yields
 * (a) paragraphs + headings as semantic HTML and (b) inline images via
 * an `image-convert` handler that we plug into to persist to R2 as we
 * go (without dropping the bytes into the HTML output).
 */
export async function parse(buffer: Buffer, filename: string, ctx: ParseCtx): Promise<ParsedFile> {
  const collectedImages: ParsedImage[] = [];
  let imageCount = 0;

  const result = await mammoth.convertToHtml(
    { buffer },
    {
      convertImage: mammoth.images.imgElement(async (image) => {
        if (imageCount >= MAX_IMAGES_PER_FILE) return { src: '' };
        const mime = image.contentType ?? 'image/png';
        const bytes = await image.read();
        const buf = Buffer.from(bytes);
        const id = hashContent(buf);
        const persisted = await persistExtractedImage({
          buffer: buf,
          mime,
          filename: `${hashContent(filename)}-img-${imageCount}-${id}`,
          prefix: ctx.extractedPrefix,
          source: `${filename} · embedded image ${imageCount + 1}`,
          hint: image.altText ?? undefined,
        });
        collectedImages.push(persisted);
        imageCount += 1;
        return { src: '' };
      }),
    },
  );

  // Now translate mammoth's HTML output into source-tagged text blocks
  // with heading hierarchy. We do this with a one-off cheerio pass.
  const cheerioMod = await import('cheerio');
  const $ = cheerioMod.load(result.value);

  const blocks: ParsedTextBlock[] = [];
  let currentHeading: { text: string; level: number } | null = null;
  $('body > *, h1, h2, h3, h4, h5, h6, p, li, blockquote').each((_, el) => {
    const tag = (el.type === 'tag' ? el.name : '').toLowerCase();
    if (tag.match(/^h[1-6]$/)) {
      const text = $(el).text().trim();
      if (text.length === 0) return;
      const level = Number(tag.slice(1));
      currentHeading = { text, level };
      blocks.push({ source: filename, heading: text, headingLevel: level, content: text });
      return;
    }
    if (tag === 'p' || tag === 'li' || tag === 'blockquote') {
      const text = $(el).text().trim();
      if (text.length === 0) return;
      blocks.push({
        source: filename,
        heading: currentHeading?.text,
        headingLevel: currentHeading?.level,
        content: text,
      });
    }
  });

  if (blocks.length === 0) {
    // Fallback for docs mammoth couldn't break down: keep the full text
    // body as one block.
    const text = $('body').text().replace(/\s+/g, ' ').trim();
    if (text.length > 0) blocks.push({ source: filename, content: text });
  }

  const totalText = blocks.map((b) => b.content).join('\n\n');
  const clipped = clipText(totalText);
  let finalBlocks = blocks;
  if (clipped.truncated) {
    let acc = 0;
    finalBlocks = [];
    for (const b of blocks) {
      if (acc + b.content.length > clipped.text.length) break;
      finalBlocks.push(b);
      acc += b.content.length;
    }
    finalBlocks.push({ source: filename, content: '[truncated]' });
  }

  return {
    filename,
    bytes: buffer.byteLength,
    textBlocks: finalBlocks,
    images: collectedImages,
    truncated: clipped.truncated,
  };
}
