// Curated list of Google Fonts that fit the editorial aesthetic.
// Phase 04+ may swap to the Google Fonts API for a richer picker.

export const HEADING_FONTS = [
  'Fraunces',
  'Playfair Display',
  'DM Serif Display',
  'Cormorant Garamond',
  'EB Garamond',
  'Spectral',
  'Crimson Pro',
  'Libre Caslon Text',
  'Merriweather',
  'Roboto Slab',
  'Bebas Neue',
  'Oswald',
  'Montserrat',
  'Poppins',
  'Inter',
  'Manrope',
  'DM Sans',
  'Work Sans',
  'IBM Plex Serif',
] as const;

export const BODY_FONTS = [
  'Inter',
  'Manrope',
  'DM Sans',
  'Work Sans',
  'IBM Plex Sans',
  'Source Sans 3',
  'Open Sans',
  'Lato',
  'Roboto',
  'Nunito',
  'Poppins',
  'Montserrat',
  'Spectral',
  'Crimson Pro',
  'EB Garamond',
  'Merriweather',
  'JetBrains Mono',
  'IBM Plex Mono',
] as const;

export type HeadingFont = (typeof HEADING_FONTS)[number];
export type BodyFont = (typeof BODY_FONTS)[number];
