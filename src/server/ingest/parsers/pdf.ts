import 'server-only';
import { PDFParse } from 'pdf-parse';
import type { ParseCtx, ParsedFile, ParsedTextBlock } from '../types';
import { clipText } from '../util';

/**
 * Parse a .pdf with pdf-parse@2 (the maintained TS rewrite that fixes
 * the autokent/pdf-parse@1.x ENOENT-on-Vercel bug).
 *
 * pdf-parse@2 returns `text` for the whole doc plus per-page `pages`
 * when available. We yield one ParsedTextBlock per page (source-
 * tagged "doc · page N") so heading hierarchy survives at the page
 * level, since most PDFs do not have a reliable heading structure
 * the parser can recover.
 *
 * Embedded image extraction is deferred to a future pass — pdfjs-dist
 * is browser-oriented (top-level await + canvas dep) and breaks Next
 * server-side imports, and pdf-parse@2 does not expose images.
 */
export async function parse(buffer: Buffer, filename: string, _ctx: ParseCtx): Promise<ParsedFile> {
  // pdf-parse@2 exposes per-page text via TextResult.pages (PageTextResult[]).
  let text = '';
  let pageTexts: { num: number; text: string }[] = [];
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    text = result.text ?? '';
    pageTexts = Array.isArray(result.pages) ? result.pages : [];
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      filename,
      bytes: 0,
      textBlocks: [{ source: filename, content: `[pdf parse error] ${msg}` }],
      images: [],
    };
  } finally {
    await parser.destroy().catch(() => {});
  }

  const blocks: ParsedTextBlock[] = [];
  for (const page of pageTexts) {
    const trimmed = page.text.replace(/\s+/g, ' ').trim();
    if (trimmed.length === 0) continue;
    blocks.push({ source: `${filename} · page ${page.num}`, content: trimmed });
  }
  if (blocks.length === 0 && text.trim().length > 0) {
    blocks.push({ source: filename, content: text.replace(/\s+/g, ' ').trim() });
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
    images: [],
    truncated: clipped.truncated,
  };
}
