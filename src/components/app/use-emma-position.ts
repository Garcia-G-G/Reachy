'use client';

import { useEffect, useState } from 'react';
import {
  EMMA_BUBBLE_MARGIN,
  EMMA_BUBBLE_SIZE,
  EMMA_PANEL_DEFAULTS,
  EMMA_WIDGET_STORAGE,
} from '@/server/config/emmaWidget';

/**
 * useEmmaPosition — Phase 07h widget persistence.
 *
 * Owns bubble + panel position + panel size, all with localStorage
 * hydration on mount. Hand-rolled drag/resize via pointer events;
 * no external dep.
 *
 * SSR: returns the defaults on first render so the markup matches.
 * Hydration on mount replaces with stored values if present.
 */

export interface Vec2 {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

const DEFAULT_BUBBLE_POSITION: Vec2 = {
  x: -1, // sentinel — "bottom-right anchor" handled by CSS default
  y: -1,
};
const DEFAULT_PANEL_POSITION: Vec2 = { x: -1, y: -1 };
const DEFAULT_PANEL_SIZE: Size = {
  width: EMMA_PANEL_DEFAULTS.width,
  height: EMMA_PANEL_DEFAULTS.height,
};

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* localStorage full / unavailable */
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Hook owns all three pieces of state — bubble position, panel
 *  position, panel size — plus open/closed. Returns setters that
 *  persist on every change. */
export function useEmmaPosition() {
  const [hydrated, setHydrated] = useState(false);
  const [open, setOpen] = useState(false);
  const [bubble, setBubble] = useState<Vec2>(DEFAULT_BUBBLE_POSITION);
  const [panelPos, setPanelPos] = useState<Vec2>(DEFAULT_PANEL_POSITION);
  const [panelSize, setPanelSize] = useState<Size>(DEFAULT_PANEL_SIZE);

  useEffect(() => {
    setOpen(readJson(EMMA_WIDGET_STORAGE.openState, false));
    setBubble(readJson(EMMA_WIDGET_STORAGE.bubblePosition, DEFAULT_BUBBLE_POSITION));
    setPanelPos(readJson(EMMA_WIDGET_STORAGE.panelPosition, DEFAULT_PANEL_POSITION));
    setPanelSize(readJson(EMMA_WIDGET_STORAGE.panelSize, DEFAULT_PANEL_SIZE));
    setHydrated(true);
  }, []);

  const updateOpen = (v: boolean) => {
    setOpen(v);
    writeJson(EMMA_WIDGET_STORAGE.openState, v);
  };
  const updateBubble = (v: Vec2) => {
    setBubble(v);
    writeJson(EMMA_WIDGET_STORAGE.bubblePosition, v);
  };
  const updatePanelPos = (v: Vec2) => {
    setPanelPos(v);
    writeJson(EMMA_WIDGET_STORAGE.panelPosition, v);
  };
  const updatePanelSize = (s: Size) => {
    const clamped: Size = {
      width: clamp(s.width, EMMA_PANEL_DEFAULTS.minWidth, EMMA_PANEL_DEFAULTS.maxWidth),
      height: clamp(s.height, EMMA_PANEL_DEFAULTS.minHeight, EMMA_PANEL_DEFAULTS.maxHeight),
    };
    setPanelSize(clamped);
    writeJson(EMMA_WIDGET_STORAGE.panelSize, clamped);
  };

  return {
    hydrated,
    open,
    bubble,
    panelPos,
    panelSize,
    setOpen: updateOpen,
    setBubble: updateBubble,
    setPanelPos: updatePanelPos,
    setPanelSize: updatePanelSize,
  };
}

/** Pointer-event-based drag handler. Returns ref + handler bundles
 *  the consumer attaches to the draggable element. Tracks live
 *  delta and calls onChange on each move; commits to localStorage
 *  via the persistence setter from useEmmaPosition once the gesture
 *  ends.
 *
 *  Position semantics: x/y are in pixels FROM the BOTTOM-RIGHT
 *  corner of the viewport (so the bubble sits at (margin, margin)
 *  by default and "moving up" increases y). This keeps the bubble
 *  glued to the bottom-right when the window resizes. */
export function makeDragHandlers(opts: {
  start: Vec2;
  onMove: (next: Vec2) => void;
  /** Viewport edges to clamp against (in px from bottom-right). */
  bounds: { minX: number; minY: number; maxX: () => number; maxY: () => number };
}) {
  return (e: React.PointerEvent<HTMLElement>) => {
    e.preventDefault();
    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const startX = opts.start.x;
    const startY = opts.start.y;

    function onPointerMove(ev: PointerEvent) {
      // We're tracking offset from bottom-right, so dragging RIGHT
      // (+clientX) decreases x; dragging DOWN (+clientY) decreases y.
      const dx = ev.clientX - startClientX;
      const dy = ev.clientY - startClientY;
      const nextX = clamp(startX - dx, opts.bounds.minX, opts.bounds.maxX());
      const nextY = clamp(startY - dy, opts.bounds.minY, opts.bounds.maxY());
      opts.onMove({ x: nextX, y: nextY });
    }
    function onPointerUp() {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    }
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };
}

/** Resize handler — drags from the panel's top-left corner. Panel
 *  is anchored bottom-right so resizing up-left grows it. */
export function makeResizeHandlers(opts: { start: Size; onChange: (next: Size) => void }) {
  return (e: React.PointerEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const startW = opts.start.width;
    const startH = opts.start.height;
    function onPointerMove(ev: PointerEvent) {
      // Dragging up-left (-X, -Y) grows the panel because the
      // anchor is bottom-right.
      const dx = startClientX - ev.clientX;
      const dy = startClientY - ev.clientY;
      opts.onChange({ width: startW + dx, height: startH + dy });
    }
    function onPointerUp() {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    }
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };
}

/** Helper bounds — keeps the bubble/panel within the viewport with
 *  the configured margin. Returns numbers computed against the
 *  current viewport every call. */
export function bubbleBounds() {
  return {
    minX: EMMA_BUBBLE_MARGIN,
    minY: EMMA_BUBBLE_MARGIN,
    maxX: () => Math.max(0, window.innerWidth - EMMA_BUBBLE_SIZE - EMMA_BUBBLE_MARGIN),
    maxY: () => Math.max(0, window.innerHeight - EMMA_BUBBLE_SIZE - EMMA_BUBBLE_MARGIN),
  };
}

export function panelBounds(size: Size) {
  return {
    minX: EMMA_BUBBLE_MARGIN,
    minY: EMMA_BUBBLE_MARGIN,
    maxX: () => Math.max(0, window.innerWidth - size.width - EMMA_BUBBLE_MARGIN),
    maxY: () => Math.max(0, window.innerHeight - size.height - EMMA_BUBBLE_MARGIN),
  };
}
