/**
 * Emma — size mode + localStorage key constants. Phase 07b.
 *
 * NO `server-only` marker — these constants are pure data and the
 * size-toggle CLIENT component needs to read EMMA_SIZE_STORAGE_KEY +
 * EMMA_SIZE_OPTIONS at runtime in the browser.
 *
 * Single source of truth for "which sizes Emma supports" + "where
 * we persist the user's pick". Imported by both the size-toggle
 * component (which writes localStorage) and the canvas hydration
 * (which reads it on mount).
 *
 * Cannot be derived: each value is a deliberate product policy —
 * what sizes exist, what the default is, what storage key carries
 * it. Tightening any is a single-file change.
 */

export type EmmaSize = 's' | 'm' | 'l';

export const EMMA_SIZE_OPTIONS: readonly EmmaSize[] = ['s', 'm', 'l'];
export const EMMA_SIZE_DEFAULT: EmmaSize = 'm';
export const EMMA_SIZE_STORAGE_KEY = 'reachy.emma.size';
