/**
 * Emma — starter card catalog. Phase 07b.
 *
 * NO `server-only` marker — the empty-state CLIENT component renders
 * these cards. Pure data, safe to ship to the browser.
 *
 * Four cards shown in the empty state. Each: a 22px glyph block
 * (single Fraunces-italic letter on a colored background) + a
 * short title, no caption. Click submits the card's prompt as the
 * user's first message.
 *
 * Bilingual: each starter has en + es copy. The emma-empty-state
 * component picks the right side based on brand kit language.
 *
 * Cannot be derived: these are CURATED first-touch prompts. They
 * model the "ask Emma anything" affordance with shapes the user
 * recognizes: a hero image, a copy piece, a brand audit, a
 * brainstorm. Tightening these tightens Emma's first impression.
 */

export type EmmaStarterGlyphColor = 'ink' | 'amber' | 'slate' | 'warm';

export interface EmmaStarter {
  id: string;
  glyph: string;
  glyphColor: EmmaStarterGlyphColor;
  titleEn: string;
  titleEs: string;
  promptEn: string;
  promptEs: string;
}

export const EMMA_STARTERS: readonly EmmaStarter[] = [
  {
    id: 'hero-image',
    glyph: 'I',
    glyphColor: 'ink',
    titleEn: 'A hero image',
    titleEs: 'Una imagen hero',
    promptEn: 'Make me a hero image for the next thing I want to launch.',
    promptEs: 'Hazme una imagen hero para lo próximo que quiero lanzar.',
  },
  {
    id: 'channel-copy',
    glyph: 'C',
    glyphColor: 'amber',
    titleEn: 'Channel copy',
    titleEs: 'Copy por canal',
    promptEn: 'Write me a LinkedIn post about the most recent feature.',
    promptEs: 'Escríbeme un post de LinkedIn sobre la feature más reciente.',
  },
  {
    id: 'brand-audit',
    glyph: 'B',
    glyphColor: 'slate',
    titleEn: 'Brand check',
    titleEs: 'Chequeo de marca',
    promptEn: 'Look at our brand kit and tell me what is missing or could be tighter.',
    promptEs: 'Mira nuestra identidad y dime qué falta o podría afinarse.',
  },
  {
    id: 'brainstorm',
    glyph: 'R',
    glyphColor: 'warm',
    titleEn: 'Riff with me',
    titleEs: 'Lluvia de ideas',
    promptEn: 'Brainstorm 5 angles for our next campaign — push past the safe ideas.',
    promptEs: 'Dame 5 ángulos para la próxima campaña — pasa de las ideas seguras.',
  },
];

/** Hex colors per glyphColor — used by emma-empty-state to paint the
 *  22px block. Sourced from emma-tokens.css palette so a design
 *  refresh stays in lockstep. */
export const EMMA_STARTER_GLYPH_BG: Record<EmmaStarterGlyphColor, string> = {
  ink: 'var(--emma-ink)',
  amber: 'var(--emma-amber)',
  slate: 'var(--emma-slate)',
  warm: 'var(--emma-warm)',
};
