/**
 * Client-safe mirror of src/server/config/criticThreshold.ts.
 *
 * The gallery UI needs the score bands to color-code asset cards.
 * The server-only file carries the `server-only` guard so the client
 * bundle can't import it directly — these numbers are duplicated here
 * by intent. If the bands change in the server config, update this
 * file in lockstep (the only consumer is campaign-gallery.tsx).
 */

export const CRITIC_GREEN_BAND_CLIENT = 8.0;
export const CRITIC_WARNING_BAND_CLIENT = 7.0;
