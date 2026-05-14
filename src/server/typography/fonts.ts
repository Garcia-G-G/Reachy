import 'server-only';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Server-side font registry for the marketing-grade compositing layer.
 *
 * The image pipeline now separates concerns:
 *   1. AI generates the BACKGROUND only — no text inside the pixels.
 *   2. A deterministic SVG overlay paints the typography on top using
 *      these TTFs, with exact brand colors, exact kerning, exact font.
 *
 * The TTF files live in public/fonts/ so they're also reachable by the
 * client (preview overlays, future Canva-style editor). Server-side we
 * read them via node:fs and base64-embed into the SVG @font-face so
 * sharp can rasterize the text without depending on the host's installed
 * fonts (Docker / Kamal deploy targets have no editorial fonts by
 * default — relying on those would silently swap to a fallback and
 * defeat the entire brand-consistency premise).
 *
 * Roles → font files:
 *   display → Fraunces variable (headlines, eyebrows in elegant serif)
 *   italic  → Instrument Serif italic (display italics, the "twist" mark)
 *   body    → Inter variable (sub-headlines, body, CTA, body copy)
 *   mono    → JetBrains Mono variable (mono eyebrows, date stamps, IDs)
 *
 * Each TTF is loaded ONCE per process and cached as a base64 string —
 * embedding into SVG repeatedly would otherwise be O(n) memcpy per
 * generation. ~1.5 MB of fonts total; cache survives indefinitely.
 */

export type FontRole = 'display' | 'italic' | 'body' | 'mono';

const FONT_FILES: Record<FontRole, string> = {
  display: 'Fraunces-Variable.ttf',
  italic: 'InstrumentSerif-Italic.ttf',
  body: 'Inter-Variable.ttf',
  mono: 'JetBrainsMono-Variable.ttf',
};

/** Font family name used inside the SVG @font-face declaration. Keep these
 *  short and free of spaces so the `font-family` attribute on <text> nodes
 *  matches without quoting headaches. */
const FONT_FAMILY: Record<FontRole, string> = {
  display: 'ReachyDisplay',
  italic: 'ReachyItalic',
  body: 'ReachyBody',
  mono: 'ReachyMono',
};

function fontsDir(): string {
  // Resolve from process.cwd() so the path works in both `pnpm dev` (which
  // runs from the repo root) and `pnpm build && pnpm start` (next runtime).
  // public/ is the canonical Next static asset directory.
  return join(process.cwd(), 'public', 'fonts');
}

/** Filesystem path to a font role's TTF — exposed so callers that want to
 *  hand the path to a third-party (e.g. drawtext for the video pipeline)
 *  can reuse the same source of truth as the SVG overlay. */
export function fontPath(role: FontRole): string {
  return join(fontsDir(), FONT_FILES[role]);
}

/** SVG font family name used by composeImage. Match the @font-face's
 *  font-family value below. */
export function fontFamily(role: FontRole): string {
  return FONT_FAMILY[role];
}

// In-memory cache. Map keyed by role → base64 of the TTF bytes.
const base64Cache: Partial<Record<FontRole, string>> = {};

/** Base64 of the TTF bytes — used to inline the font into an SVG via
 *  `@font-face { src: url(data:font/ttf;base64,...) }`. First call per
 *  process pays the disk read; subsequent calls are cache hits. */
export async function fontBase64(role: FontRole): Promise<string> {
  const cached = base64Cache[role];
  if (cached) return cached;
  const buf = await readFile(fontPath(role));
  const encoded = buf.toString('base64');
  base64Cache[role] = encoded;
  return encoded;
}

/** Build a single `@font-face` CSS block for embedding into an SVG <style>
 *  block. Returns the full `@font-face { … }` string with the base64 data
 *  URL inline. */
export async function fontFaceCss(role: FontRole): Promise<string> {
  const encoded = await fontBase64(role);
  return [
    `@font-face {`,
    `  font-family: '${fontFamily(role)}';`,
    `  src: url(data:font/ttf;base64,${encoded}) format('truetype');`,
    `  font-weight: 100 900;`,
    `  font-style: normal;`,
    `  font-display: block;`,
    `}`,
  ].join('\n');
}

/** Batch helper: build the full `<style>` block for all four roles at
 *  once. composeImage calls this once per render so every text block has
 *  every font available. */
export async function allFontFacesCss(): Promise<string> {
  const blocks = await Promise.all(
    (Object.keys(FONT_FILES) as FontRole[]).map((role) => fontFaceCss(role)),
  );
  return blocks.join('\n');
}
