import 'server-only';

/**
 * Default brand palette used when an autopilot ingestion produces no
 * images (pure text upload) AND the brief extractor's text-derived
 * paletteHex doesn't return usable values.
 *
 * Cannot be derived: these hex values are the Reachy landing's
 * editorial palette (paper / ink / accent) — the same ones already
 * embedded in src/styles/globals.css and the brand-kit form defaults.
 * Keeping them centralized here means a future palette refresh is a
 * single-file edit instead of a hunt-and-replace across the server.
 *
 * If you change these, update src/server/jobs/imageWorker.ts and
 * src/server/actions/images.ts (FALLBACK_COLORS) in lockstep — both
 * fall through to the same defaults when a brand kit is missing.
 */

export interface FallbackPalette {
  ink: string;
  paper: string;
  accent: string;
}

export const FALLBACK_PALETTE: FallbackPalette = {
  ink: '#14110D',
  paper: '#F1EBDF',
  accent: '#B6481A',
};
