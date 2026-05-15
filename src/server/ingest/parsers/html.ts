import 'server-only';
import * as cheerio from 'cheerio';
import type { ParseCtx, ParsedFile, ParsedTextBlock } from '../types';
import { clipText } from '../util';

const HEADING_TAGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const;
const BLOCK_TAGS = ['p', 'li', 'blockquote', 'pre', 'figcaption', 'caption'] as const;

export async function parse(buffer: Buffer, filename: string, _ctx: ParseCtx): Promise<ParsedFile> {
  const raw = buffer.toString('utf-8');
  const $ = cheerio.load(raw);

  // Drop noisy nodes that never contain brand-relevant copy.
  $('script, style, noscript, template, svg').remove();

  const blocks: ParsedTextBlock[] = [];
  let currentHeading: { text: string; level: number } | null = null;

  $('body *').each((_, el) => {
    const tag = (el.type === 'tag' ? el.name : '').toLowerCase();
    if (HEADING_TAGS.includes(tag as (typeof HEADING_TAGS)[number])) {
      const text = $(el).text().trim();
      if (text.length === 0) return;
      const level = Number(tag.slice(1));
      currentHeading = { text, level };
      blocks.push({ source: filename, heading: text, headingLevel: level, content: text });
      return;
    }
    if (BLOCK_TAGS.includes(tag as (typeof BLOCK_TAGS)[number])) {
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

  // Body fallback: if no semantic blocks were picked up, capture the
  // whole body text as a single block so we never silently drop a page.
  if (blocks.length === 0) {
    const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
    if (bodyText.length > 0) {
      blocks.push({ source: filename, content: bodyText });
    }
  }

  // Image references — keep the src + alt so the aggregator can decide
  // whether to fetch them (we don't fetch external URLs here; only the
  // image parser handles real bytes).
  const images = $('img')
    .toArray()
    .map((el) => {
      const src = $(el).attr('src') ?? '';
      const alt = $(el).attr('alt') ?? '';
      return src ? `img · ${src}${alt ? ` (${alt})` : ''}` : '';
    })
    .filter((s) => s.length > 0);
  if (images.length > 0) {
    blocks.push({
      source: filename,
      heading: 'Image references',
      headingLevel: 0,
      content: images.join('\n'),
    });
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
    bytes: Buffer.byteLength(raw, 'utf-8'),
    textBlocks: finalBlocks,
    images: [],
    truncated: clipped.truncated,
  };
}
