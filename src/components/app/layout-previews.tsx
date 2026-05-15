'use client';

import type { LayoutId } from '@/lib/layout-meta';

/**
 * Schematic SVG previews of each layout. ~64×80 with the layout's
 * aspect roughly conveyed: a frame outline, the AI image region as a
 * subtle fill, and rectangles/dots marking where text + backdrops land.
 *
 * Intentionally schematic — these aren't pixel-accurate renders, they
 * just communicate the layout's STRUCTURE so users can pick visually
 * instead of parsing a dropdown label. Tuned to the editorial palette
 * (ink + paper + accent) so they sit naturally inside the existing UI.
 *
 * Color tokens used (inline so the component stays self-contained
 * regardless of how the host page configures CSS variables):
 *   ink    #14110D
 *   paper  #F1EBDF
 *   accent #B6481A
 */

const C = {
  ink: '#14110D',
  paper: '#F1EBDF',
  accent: '#B6481A',
  ghost: '#9c9486',
};

const VIEW = { w: 64, h: 80 };

interface PreviewProps {
  className?: string;
  /** Outer border weight in px (drawn inside the SVG so layouts don't
   *  get cropped). */
  strokeWidth?: number;
}

function Frame({
  children,
  fill,
  strokeWidth = 1,
}: {
  children: React.ReactNode;
  fill?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      viewBox={`0 0 ${VIEW.w} ${VIEW.h}`}
      width={VIEW.w}
      height={VIEW.h}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="layout preview"
    >
      <title>Layout preview</title>
      <rect
        x={strokeWidth / 2}
        y={strokeWidth / 2}
        width={VIEW.w - strokeWidth}
        height={VIEW.h - strokeWidth}
        fill={fill ?? C.paper}
        stroke={C.ink}
        strokeWidth={strokeWidth}
      />
      {children}
    </svg>
  );
}

// editorial-collage — full-bleed AI image (ghost fill) + asymmetric text:
// eyebrow top-left, oversized italic mid-left, sub bottom-left, mono
// wordmark bottom-right. Right side carries the "focal subject" (accent).
function EditorialCollage() {
  return (
    <Frame fill={C.ghost}>
      <rect x={40} y={18} width={20} height={36} fill={C.accent} opacity={0.6} />
      <rect x={6} y={8} width={20} height={2} fill={C.ink} />
      <rect x={6} y={34} width={28} height={6} fill={C.ink} />
      <rect x={6} y={44} width={22} height={4} fill={C.ink} />
      <rect x={6} y={66} width={24} height={2} fill={C.ink} />
      <rect x={50} y={72} width={10} height={2} fill={C.ink} />
    </Frame>
  );
}

// text-mask-cutout — paper field with three thick rect "letters" filled
// with the ghost-image color, then a tiny mono wordmark bottom-right.
function TextMaskCutout() {
  return (
    <Frame fill={C.paper}>
      {/* "Letter" rects filled with the ghost = image-through-text effect */}
      <rect x={8} y={24} width={12} height={32} fill={C.ghost} />
      <rect x={24} y={24} width={12} height={32} fill={C.ghost} />
      <rect x={40} y={24} width={16} height={32} fill={C.ghost} />
      {/* mini wordmark */}
      <rect x={48} y={72} width={10} height={2} fill={C.ink} />
    </Frame>
  );
}

// badge-stamp — full-bleed photo (ghost), italic headline top-left, a
// solid accent circle mid-right, sub below circle, wordmark bottom-left.
function BadgeStamp() {
  return (
    <Frame fill={C.ghost}>
      <rect x={6} y={8} width={32} height={5} fill={C.ink} />
      <circle cx={48} cy={40} r={11} fill={C.accent} />
      <rect x={42} y={38} width={12} height={2} fill={C.paper} />
      <rect x={40} y={58} width={20} height={3} fill={C.ink} />
      <rect x={6} y={72} width={16} height={2} fill={C.ink} />
    </Frame>
  );
}

// card-soft — photo (ghost) + smaller centered paper card with shadow
// hint, eyebrow ABOVE card, wordmark BELOW.
function CardSoft() {
  return (
    <Frame fill={C.ghost}>
      <rect x={20} y={14} width={24} height={2} fill={C.ink} />
      {/* card shadow */}
      <rect x={14} y={26} width={36} height={26} fill={C.ink} opacity={0.18} />
      <rect x={13} y={24} width={36} height={26} fill={C.paper} />
      <rect x={18} y={32} width={26} height={3} fill={C.ink} />
      <rect x={20} y={40} width={22} height={2} fill={C.ink} opacity={0.6} />
      <rect x={26} y={62} width={14} height={1.5} fill={C.ink} opacity={0.6} />
    </Frame>
  );
}

// feature-stack — paper field, accent dot, three stacked rows centered.
function FeatureStack() {
  return (
    <Frame fill={C.paper}>
      <circle cx={32} cy={20} r={2.5} fill={C.accent} />
      <rect x={18} y={26} width={28} height={2} fill={C.accent} />
      <rect x={10} y={34} width={44} height={7} fill={C.ink} />
      <rect x={16} y={54} width={32} height={2} fill={C.ink} />
      <rect x={20} y={58} width={24} height={2} fill={C.ink} />
    </Frame>
  );
}

// quote-large — full-bleed paper, oversized italic centered text suggested
// as a wide thick rect; small mono wordmark bottom.
function QuoteLarge() {
  return (
    <Frame fill={C.paper}>
      <rect x={8} y={26} width={48} height={9} fill={C.ink} />
      <rect x={12} y={38} width={40} height={9} fill={C.ink} />
      <rect x={24} y={68} width={16} height={1.5} fill={C.accent} />
    </Frame>
  );
}

// editorial-margin — paper column on the LEFT 30%, photo (ghost) on
// the RIGHT 70%. Text rows in the left column.
function EditorialMargin() {
  return (
    <Frame fill={C.ghost}>
      <rect x={1} y={1} width={22} height={78} fill={C.paper} />
      <rect x={4} y={10} width={14} height={2} fill={C.accent} />
      <rect x={4} y={18} width={16} height={6} fill={C.ink} />
      <rect x={4} y={62} width={16} height={1.5} fill={C.ink} opacity={0.6} />
      <rect x={4} y={66} width={12} height={1.5} fill={C.ink} opacity={0.6} />
    </Frame>
  );
}

// hero-centered — photo + 3 centered rows.
function HeroCentered() {
  return (
    <Frame fill={C.ghost}>
      <rect x={20} y={26} width={24} height={2} fill={C.ink} />
      <rect x={10} y={32} width={44} height={6} fill={C.ink} />
      <rect x={22} y={52} width={20} height={3} fill={C.accent} />
    </Frame>
  );
}

// hero-split-left — text on left, photo on right.
function HeroSplitLeft() {
  return (
    <Frame fill={C.paper}>
      <rect x={32} y={1} width={31} height={78} fill={C.ghost} />
      <rect x={4} y={14} width={16} height={2} fill={C.ink} />
      <rect x={4} y={22} width={22} height={6} fill={C.ink} />
      <rect x={4} y={66} width={20} height={3} fill={C.accent} />
    </Frame>
  );
}

// quote-slab — full-bleed photo + translucent slab + italic on top.
function QuoteSlab() {
  return (
    <Frame fill={C.ghost}>
      <rect x={6} y={16} width={52} height={48} fill={C.paper} opacity={0.92} />
      <rect x={12} y={30} width={40} height={9} fill={C.ink} />
      <rect x={18} y={42} width={28} height={9} fill={C.ink} />
      <rect x={24} y={58} width={16} height={1.5} fill={C.ink} opacity={0.7} />
    </Frame>
  );
}

// announcement-banner — left-aligned bottom-anchored stack.
function AnnouncementBanner() {
  return (
    <Frame fill={C.ghost}>
      <rect x={5} y={48} width={14} height={2} fill={C.ink} />
      <rect x={5} y={54} width={36} height={10} fill={C.ink} />
      <rect x={5} y={68} width={28} height={2} fill={C.ink} opacity={0.7} />
    </Frame>
  );
}

const PREVIEW_REGISTRY: Record<LayoutId, () => React.ReactElement> = {
  'editorial-collage': EditorialCollage,
  'text-mask-cutout': TextMaskCutout,
  'badge-stamp': BadgeStamp,
  'card-soft': CardSoft,
  'feature-stack': FeatureStack,
  'quote-large': QuoteLarge,
  'editorial-margin': EditorialMargin,
  'hero-centered': HeroCentered,
  'hero-split-left': HeroSplitLeft,
  'quote-slab': QuoteSlab,
  'announcement-banner': AnnouncementBanner,
};

/** Render the schematic preview for a given layout id. Returns null for
 *  unknown ids (defensive — typescript narrows but client could pass any
 *  string in the future via a stale localStorage value, etc). */
export function LayoutPreview({ layoutId, className }: { layoutId: LayoutId } & PreviewProps) {
  const Renderer = PREVIEW_REGISTRY[layoutId];
  if (!Renderer) return null;
  return (
    <span
      className={className ?? 'inline-block leading-none'}
      style={{ width: VIEW.w, height: VIEW.h }}
    >
      <Renderer />
    </span>
  );
}
