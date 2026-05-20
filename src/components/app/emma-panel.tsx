'use client';

import { useEffect } from 'react';
import {
  makeDragHandlers,
  makeResizeHandlers,
  panelBounds,
  type Size,
  type Vec2,
} from './use-emma-position';

/**
 * EmmaPanel — Phase 07h expanded state.
 *
 * Floating panel anchored bottom-right by default (matches the
 * bubble's anchor). Drag from the header bar; resize from the
 * top-left corner. Esc closes. Children render inside the body
 * (typically the compact EmmaChat).
 */

interface EmmaPanelProps {
  position: Vec2;
  size: Size;
  onMove: (next: Vec2) => void;
  onResize: (next: Size) => void;
  onClose: () => void;
  /** Optional chip / label rendered in the header (e.g. project name). */
  contextChip?: React.ReactNode;
  children: React.ReactNode;
}

export function EmmaPanel({
  position,
  size,
  onMove,
  onResize,
  onClose,
  contextChip,
  children,
}: EmmaPanelProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const useDefault = position.x < 0 || position.y < 0;
  const positionStyle: React.CSSProperties = useDefault
    ? {} // CSS default (bottom: 24px, right: 24px)
    : { right: position.x, bottom: position.y };

  const sizeStyle: React.CSSProperties = {
    width: size.width,
    height: size.height,
  };

  const handleDragStart = makeDragHandlers({
    start: useDefault ? { x: 24, y: 24 } : position,
    onMove,
    bounds: panelBounds(size),
  });

  const handleResizeStart = makeResizeHandlers({
    start: size,
    onChange: onResize,
  });

  return (
    <section
      className="emma-panel"
      style={{ ...positionStyle, ...sizeStyle }}
      role="dialog"
      aria-label="Emma"
    >
      {/* biome-ignore lint/a11y/noStaticElementInteractions: drag handle; close button has explicit aria + key handling */}
      <header className="emma-panel-header" onPointerDown={handleDragStart}>
        <span className="emma-panel-title">
          Emma<span className="emma-panel-period">.</span>
        </span>
        {contextChip ? <span className="emma-panel-chip">{contextChip}</span> : null}
        <button
          type="button"
          className="emma-panel-minimize"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onClose}
          aria-label="Minimize"
        >
          –
        </button>
      </header>
      {/* Resize handle — top-left corner. Drag to grow up-left.
          A <button> carries native interactive semantics
          (focusable, keyboard-accessible). The actual resize gesture
          is a drag, not a click — keyboard users keep the default
          panel size, which is the accessible fallback. */}
      <button
        type="button"
        className="emma-panel-resize-handle"
        onPointerDown={handleResizeStart}
        aria-label="Resize Emma"
        tabIndex={-1}
      />
      <div className="emma-panel-body">{children}</div>
    </section>
  );
}
