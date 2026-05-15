import 'server-only';
import matter from 'gray-matter';
import { marked, type Tokens } from 'marked';
import type { ParseCtx, ParsedFile, ParsedTextBlock } from '../types';
import { clipText } from '../util';

type MarkedToken = ReturnType<typeof marked.lexer>[number];

/** Flatten a marked token list into source-tagged text blocks with
 *  heading hierarchy preserved. */
function tokensToBlocks(tokens: MarkedToken[], filename: string): ParsedTextBlock[] {
  const out: ParsedTextBlock[] = [];
  let currentHeading: { text: string; level: number } | null = null;
  for (const token of tokens) {
    if (token.type === 'heading') {
      const t = token as Tokens.Heading;
      currentHeading = { text: t.text, level: t.depth };
      out.push({
        source: filename,
        heading: t.text,
        headingLevel: t.depth,
        content: t.text,
      });
      continue;
    }
    if (token.type === 'paragraph' || token.type === 'blockquote' || token.type === 'list') {
      const raw = ('text' in token && token.text) || ('raw' in token && token.raw) || '';
      if (raw && raw.toString().trim().length > 0) {
        out.push({
          source: filename,
          heading: currentHeading?.text,
          headingLevel: currentHeading?.level,
          content: raw.toString().trim(),
        });
      }
      continue;
    }
    if (token.type === 'code') {
      const t = token as Tokens.Code;
      out.push({
        source: filename,
        heading: currentHeading?.text,
        headingLevel: currentHeading?.level,
        content: `[code · ${t.lang ?? 'plain'}]\n${t.text}`,
      });
    }
  }
  return out;
}

export async function parse(buffer: Buffer, filename: string, _ctx: ParseCtx): Promise<ParsedFile> {
  const raw = buffer.toString('utf-8');
  const { content, data: frontmatter } = matter(raw);
  const tokens = marked.lexer(content);
  const blocks = tokensToBlocks(tokens, filename);

  // Surface frontmatter as a leading "frontmatter" block so downstream
  // steps can pick up titles / descriptions / authorship.
  const fmKeys = Object.keys(frontmatter ?? {});
  if (fmKeys.length > 0) {
    const fmLines = fmKeys.map((k) => `${k}: ${JSON.stringify(frontmatter[k])}`);
    blocks.unshift({
      source: filename,
      heading: 'Frontmatter',
      headingLevel: 0,
      content: fmLines.join('\n'),
    });
  }

  const totalText = blocks.map((b) => b.content).join('\n\n');
  const clipped = clipText(totalText);
  // If clipped, drop trailing blocks until we're under the cap.
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
