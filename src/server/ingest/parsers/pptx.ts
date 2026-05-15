import 'server-only';
import JSZip from 'jszip';
import { MAX_IMAGES_PER_FILE } from '@/server/config/parserLimits';
import type { ParseCtx, ParsedFile, ParsedImage, ParsedTextBlock } from '../types';
import { clipText, hashContent, persistExtractedImage } from '../util';

/**
 * Parse a .pptx. PPTX = a zip with one `ppt/slides/slide{N}.xml` per
 * slide. Text content lives in `<a:t>` nodes. Embedded images live in
 * `ppt/media/`. We extract slide-by-slide so downstream steps preserve
 * narrative order.
 *
 * cheerio's XML mode handles the namespaced `a:t` selector cleanly,
 * which is why we use it here rather than a hand-rolled regex.
 */
export async function parse(buffer: Buffer, filename: string, ctx: ParseCtx): Promise<ParsedFile> {
  const zip = await JSZip.loadAsync(buffer);
  const blocks: ParsedTextBlock[] = [];
  const images: ParsedImage[] = [];

  // Iterate slides in numeric order (slide1, slide2, … not lexicographic).
  const slideFiles = Object.keys(zip.files)
    .filter((p) => /^ppt\/slides\/slide\d+\.xml$/i.test(p))
    .sort((a, b) => {
      const na = Number(a.match(/slide(\d+)\.xml/i)?.[1] ?? 0);
      const nb = Number(b.match(/slide(\d+)\.xml/i)?.[1] ?? 0);
      return na - nb;
    });

  const cheerioMod = await import('cheerio');
  for (let i = 0; i < slideFiles.length; i++) {
    const slidePath = slideFiles[i];
    if (!slidePath) continue;
    const slideEntry = zip.files[slidePath];
    if (!slideEntry) continue;
    const slideXml = await slideEntry.async('string');
    const $ = cheerioMod.load(slideXml, { xmlMode: true });
    const runs: string[] = [];
    $('a\\:t, t').each((_, el) => {
      const txt = $(el).text();
      if (txt && txt.trim().length > 0) runs.push(txt.trim());
    });
    if (runs.length > 0) {
      blocks.push({
        source: `${filename} · slide ${i + 1}`,
        heading: `Slide ${i + 1}`,
        headingLevel: 1,
        content: runs.join('\n'),
      });
    }
  }

  // Embedded media — keep PNG/JPEG/WEBP/GIF, persist into R2.
  const mediaFiles = Object.keys(zip.files).filter((p) =>
    /^ppt\/media\/.*\.(png|jpg|jpeg|webp|gif)$/i.test(p),
  );
  for (let i = 0; i < mediaFiles.length && images.length < MAX_IMAGES_PER_FILE; i++) {
    const path = mediaFiles[i];
    if (!path) continue;
    const entry = zip.files[path];
    if (!entry) continue;
    const buf = Buffer.from(await entry.async('arraybuffer'));
    const ext = path.split('.').pop()?.toLowerCase() ?? 'png';
    const mime = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
    const id = hashContent(buf);
    const persisted = await persistExtractedImage({
      buffer: buf,
      mime,
      filename: `${hashContent(filename)}-pptx-img-${i}-${id}`,
      prefix: ctx.extractedPrefix,
      source: `${filename} · embedded media (${path.split('/').pop()})`,
      hint: path.split('/').pop(),
    });
    images.push(persisted);
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
    images,
    truncated: clipped.truncated,
  };
}
