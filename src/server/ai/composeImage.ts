import 'server-only';
import sharp from 'sharp';
import { allFontFacesCss, fontFamily } from '@/server/typography/fonts';
import type { Layout, TextBlock, TextColorRole } from './layoutTemplates';

/**
 * The compositing layer of the marketing-grade pipeline. Takes the AI-
 * generated background image and overlays brand-correct typography on
 * top — exact hex colors from the brand kit, exact TTF fonts from
 * public/fonts/, exact kerning and weights from the layout templates.
 *
 * The overlay is a single SVG that includes:
 *   1. An @font-face block with all four brand fonts inlined as base64
 *      (so sharp can rasterize without depending on system fonts).
 *   2. Optional backdrop rects (e.g. quote-slab's coloured slab).
 *   3. One <text> element per TextBlock with x/y/font/size/color resolved
 *      against the actual frame dimensions.
 *
 * Why SVG-via-sharp instead of node-canvas or skia-canvas:
 *   • sharp is already on the dependency list and is the libvips wrapper
 *     we use everywhere else. Adding another canvas implementation just
 *     duplicates surface area for the same outcome.
 *   • SVG <text> with @font-face gives us proper kerning, variable-font
 *     weight axes, and exact color rendering. Cairo/skia-canvas would
 *     also work but the SVG path is more declarative and easier to test.
 *   • sharp's `composite` step rasterizes the SVG with the inlined font
 *     bytes — fully self-contained, no external font resolution.
 *
 * Performance: a single render does (1) SVG string build + base64 read,
 * (2) sharp composite, (3) PNG encode. The base64 font read is cached
 * in-process so subsequent renders are essentially just (2) + (3).
 */

export interface BrandColors {
  /** Primary text color — used for `ink` slot. */
  ink: string;
  /** Background / inverse color — used for `paper` slot (e.g. on the
   *  quote-slab backdrop). */
  paper: string;
  /** Accent color — used for `accent` slot (CTAs, accent lines). */
  accent: string;
}

export interface PlannedCopy {
  eyebrow?: string;
  headline?: string;
  subheadline?: string;
  cta?: string;
  wordmark?: string;
}

export interface ComposeImageArgs {
  /** AI-generated background image. Any sharp-supported format. */
  background: Buffer;
  width: number;
  height: number;
  layout: Layout;
  copy: PlannedCopy;
  colors: BrandColors;
}

function resolveColor(role: TextColorRole, colors: BrandColors): string {
  switch (role) {
    case 'ink':
      return colors.ink;
    case 'paper':
      return colors.paper;
    case 'accent':
      return colors.accent;
  }
}

/** Pick the text payload for a block — copy slot when textSource matches a
 *  PlannedCopy field, the literal `text` for `static`. Returns null when
 *  the slot is empty (so we skip rendering it instead of painting a blank). */
function resolveText(block: TextBlock, copy: PlannedCopy): string | null {
  if (block.textSource === 'static') {
    return block.text?.trim() || null;
  }
  const raw = copy[block.textSource];
  return raw?.trim() || null;
}

/** Escape user-supplied text for safe embedding inside an SVG <text>
 *  element. SVG is XML — `<`, `>`, `&` need entity encoding; single and
 *  double quotes need encoding too because we set attributes with mixed
 *  delimiters in the template. */
function escapeSvg(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Rough text wrapping. SVG <text> doesn't auto-wrap so we split the
 * input into lines based on an approximate character width.
 *
 * The math: at typical body widths and the variable fonts we use, a
 * character is roughly `0.55 × fontSize` wide. That's a coarse heuristic
 * but good enough for marketing copy where headlines are 4-10 words.
 * Each output line becomes one <tspan> with a `dy` offset.
 *
 * Words that exceed the line width on their own are kept whole (no
 * mid-word break) — they may visually overflow but that's better than
 * breaking a brand name in half.
 */
function wrapLines(text: string, widthPx: number, fontSizePx: number): string[] {
  const avgCharWidth = fontSizePx * 0.55;
  const maxCharsPerLine = Math.max(8, Math.floor(widthPx / avgCharWidth));
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (!current) {
      current = word;
      continue;
    }
    const candidate = `${current} ${word}`;
    if (candidate.length <= maxCharsPerLine) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function renderBlock(
  block: TextBlock,
  text: string,
  width: number,
  height: number,
  colors: BrandColors,
): string {
  // Pixel coordinates from normalized fractions.
  const xPx = block.x * width;
  const yPx = block.y * height;
  const widthPx = block.widthFrac * width;
  const sizePx = block.sizeFrac * height;
  const family = fontFamily(block.font);
  const color = resolveColor(block.color, colors);
  const align = block.align;
  const transformed = block.upper ? text.toUpperCase() : text;
  const letterSpacing = block.letterSpacingEm ? `${block.letterSpacingEm}em` : 'normal';
  const lineHeightEm =
    block.lineHeightEm ?? (block.font === 'display' || block.font === 'italic' ? 1.05 : 1.3);

  const lines = wrapLines(transformed, widthPx, sizePx);
  if (lines.length === 0) return '';

  // SVG text-anchor maps from layout `align` cleanly: left→start,
  // center→middle, right→end. The first tspan's `y` is the layout y,
  // subsequent tspans use `dy` = lineHeight × fontSize for line spacing.
  const anchor = align === 'left' ? 'start' : align === 'right' ? 'end' : 'middle';
  const dyPx = lineHeightEm * sizePx;
  const weight = block.weight ?? (block.font === 'display' ? 600 : 500);

  const tspans = lines
    .map((line, i) => {
      const dy = i === 0 ? 0 : dyPx;
      return `<tspan x="${xPx}" dy="${dy}">${escapeSvg(line)}</tspan>`;
    })
    .join('');

  return [
    `<text`,
    `  x="${xPx}"`,
    `  y="${yPx}"`,
    `  font-family="${family}"`,
    `  font-size="${sizePx}"`,
    `  font-weight="${weight}"`,
    `  fill="${color}"`,
    `  text-anchor="${anchor}"`,
    `  letter-spacing="${letterSpacing}"`,
    `  dominant-baseline="hanging"`,
    `>${tspans}</text>`,
  ].join(' ');
}

interface BackdropSvgPieces {
  /** SVG <filter> definitions (drop-shadows) gathered across all
   *  backdrops. Inserted inside <defs>. Empty when no backdrop wants
   *  a shadow. */
  filterDefs: string;
  /** The actual <rect> elements rendered after <defs>. */
  rects: string;
}

function renderBackdrops(
  layout: Layout,
  width: number,
  height: number,
  colors: BrandColors,
): BackdropSvgPieces {
  if (!layout.backdrops || layout.backdrops.length === 0) {
    return { filterDefs: '', rects: '' };
  }
  const filters: string[] = [];
  const rects = layout.backdrops
    .map((b, i) => {
      const x = b.x * width;
      const y = b.y * height;
      const w = b.widthFrac * width;
      const h = b.heightFrac * height;
      const color = resolveColor(b.color, colors);
      const opacity = b.opacity ?? 0.92;
      const r = b.cornerRadiusFrac ? b.cornerRadiusFrac * width : 0;
      const radiusAttrs = r > 0 ? ` rx="${r}" ry="${r}"` : '';

      // Drop-shadow path: build a SVG <filter> with feGaussianBlur +
      // feOffset + feMerge so the result is the shadow under the
      // original rect. The card-soft layout is the main user; quote
      // layouts skip the shadow because they're flat.
      let filterAttr = '';
      if (b.shadow) {
        const filterId = `bdshadow${i}`;
        filters.push(
          [
            `<filter id="${filterId}" x="-20%" y="-20%" width="140%" height="160%">`,
            `  <feGaussianBlur in="SourceAlpha" stdDeviation="${b.shadow.blurPx}"/>`,
            `  <feOffset dy="${b.shadow.offsetY}" result="off"/>`,
            `  <feComponentTransfer><feFuncA type="linear" slope="${b.shadow.opacity}"/></feComponentTransfer>`,
            `  <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>`,
            `</filter>`,
          ].join('\n'),
        );
        filterAttr = ` filter="url(#${filterId})"`;
      }

      return `<rect x="${x}" y="${y}" width="${w}" height="${h}"${radiusAttrs} fill="${color}" opacity="${opacity}"${filterAttr}/>`;
    })
    .join('\n');
  return { filterDefs: filters.join('\n'), rects };
}

/**
 * Build the SVG overlay string. Returns a complete document with the
 * @font-face block, optional backdrops, then one <text> per layout
 * block whose copy is non-empty.
 */
export async function buildOverlaySvg(
  layout: Layout,
  copy: PlannedCopy,
  width: number,
  height: number,
  colors: BrandColors,
): Promise<string> {
  const fontFaces = await allFontFacesCss();
  const backdrops = renderBackdrops(layout, width, height, colors);
  const texts = layout.blocks
    .map((block) => {
      const text = resolveText(block, copy);
      if (!text) return '';
      return renderBlock(block, text, width, height, colors);
    })
    .filter(Boolean)
    .join('\n');

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<defs>`,
    `<style>${fontFaces}</style>`,
    backdrops.filterDefs,
    `</defs>`,
    backdrops.rects,
    texts,
    `</svg>`,
  ].join('\n');
}

/**
 * Compose the final marketing-grade asset: AI background + brand-fontd
 * typographic overlay. Returns a PNG Buffer at the target dimensions.
 *
 * The background is first resized with cover/center crop (same fit we
 * used before) so it lands at exactly width×height. The SVG overlay is
 * generated at the same size and composited at offset (0, 0).
 */
export async function composeImage(args: ComposeImageArgs): Promise<Buffer> {
  const { background, width, height, layout, copy, colors } = args;
  const svg = await buildOverlaySvg(layout, copy, width, height, colors);

  // Step 1 — Resize the raw AI background to the target frame.
  // failOn:'none' shrugs off harmless upstream metadata that would
  // otherwise reject the input (Apple ColorSync chunks etc); same
  // setting we use in imageGen's resize step.
  const resizedBackground = await sharp(background, { failOn: 'none' })
    .resize(width, height, { fit: 'cover', position: 'centre' })
    .png({ compressionLevel: 6 })
    .toBuffer();

  // Step 2 — Editorial post-processing pass. AI image models return
  // technically-correct but visually flat output: saturation slightly
  // low, contrast soft, edges fuzzy where the model interpolates.
  // A light editorial grade closes the "this looks AI" gap without
  // crossing into Instagram-filter territory.
  //
  // Knobs (tuned 2026-05-14 against the editorial palette):
  //   modulate.saturation 1.12  — bump 12% so the brand sienna doesn't
  //                                read washed-out. Pushing past 1.20
  //                                makes the ink hex bleed magenta.
  //   modulate.brightness 1.02  — a barely-perceptible lift, mostly
  //                                useful for slightly underexposed
  //                                Sora-style outputs.
  //   linear(1.05, -8)          — pixel ← 1.05·pixel - 8. Gentle S-curve
  //                                equivalent that adds bite to mid-tones
  //                                without crushing the shadows.
  //   sharpen sigma 0.8 / m1 0.5 / m2 1.5
  //                              — radius 0.8 picks up edge detail on
  //                                gradients; m1 0.5 holds back over-
  //                                sharpening flat areas; m2 1.5 lets
  //                                actual edges crisp without halo. The
  //                                AI noise becomes intentional grain
  //                                instead of soft mush.
  //
  // If a brand reports the look feels off, drop saturation to 1.05–1.08
  // OR sharpen sigma to 0.6. Don't disable entirely — the un-graded
  // baseline is what users were complaining about.
  const enhanced = await sharp(resizedBackground, { failOn: 'none' })
    .modulate({ saturation: 1.12, brightness: 1.02 })
    .linear(1.05, -8)
    .sharpen({ sigma: 0.8, m1: 0.5, m2: 1.5 })
    .png({ compressionLevel: 6 })
    .toBuffer();

  // Step 3 — Composite the deterministic SVG overlay on top of the
  // graded background. The SVG rasterizes from the @font-face data URLs
  // embedded in it; at 72 DPI it matches the background pixel-for-pixel
  // (density:144 would double the overlay and trip libvips's same-or-
  // smaller guard — bug from 2026-05-14, do not re-introduce). Vector
  // text stays crisp because sharp renders from font outlines, not
  // raster.
  return sharp(enhanced)
    .composite([
      {
        input: Buffer.from(svg),
        top: 0,
        left: 0,
      },
    ])
    .png({ compressionLevel: 6 })
    .toBuffer();
}
