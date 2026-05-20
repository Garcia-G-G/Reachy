/**
 * Emma widget — global config. Phase 07h.
 *
 * NO `server-only` marker — the client widget reads these constants
 * to decide where to render, when to skip, what default size/
 * position to use, and which localStorage keys to persist into.
 *
 * Cannot be derived: every value below is a deliberate product
 * policy. Tightening any of them changes the widget UX across the
 * entire surface.
 */

/** Routes where the widget MUST NOT mount. Patterns are matched
 *  against pathname via `.test()`. */
export const EMMA_EXCLUDED_ROUTE_PATTERNS: readonly RegExp[] = [
  /^\/login(?:\/|$)/,
  /^\/$/, // public landing
  /^\/public(?:\/|$)/,
  /^\/api(?:\/|$)/, // any API route — shouldn't render anyway, defensive
];

export function isEmmaExcludedRoute(pathname: string): boolean {
  return EMMA_EXCLUDED_ROUTE_PATTERNS.some((re) => re.test(pathname));
}

/** Bubble (collapsed state) defaults. */
export const EMMA_BUBBLE_SIZE = 56;
export const EMMA_BUBBLE_MARGIN = 24;

/** Panel (expanded state) defaults + constraints. */
export const EMMA_PANEL_DEFAULTS = {
  width: 380,
  height: 560,
  minWidth: 320,
  minHeight: 420,
  maxWidth: 640,
  maxHeight: 900,
} as const;

/** localStorage keys for widget persistence. */
export const EMMA_WIDGET_STORAGE = {
  /** Last bubble x/y (when minimized). */
  bubblePosition: 'reachy.emma.bubble.position',
  /** Last panel x/y. */
  panelPosition: 'reachy.emma.panel.position',
  /** Last panel width/height. */
  panelSize: 'reachy.emma.panel.size',
  /** Last open/closed state — restored on reload. */
  openState: 'reachy.emma.panel.open',
} as const;

/** Resolve a project slug from a pathname. Returns null when the
 *  user isn't on a project route. Pure regex parsing — doesn't hit
 *  the DB. */
export function projectSlugFromPath(pathname: string): string | null {
  const m = /^\/app\/projects\/([^/]+)(?:\/|$)/.exec(pathname);
  if (!m) return null;
  const slug = m[1];
  // Skip the special "new" + "new-from-upload" routes which aren't
  // real project slugs.
  if (slug === 'new' || slug === 'new-from-upload') return null;
  return slug ?? null;
}
