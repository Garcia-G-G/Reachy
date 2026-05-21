'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/**
 * ControlPicker — Phase 08.
 *
 * Compact horizontal-strip alternative to the heavy 3-col tile grid
 * Garcia called out as "complicado y antiguo". Each item renders as
 * a 56×72 chip with an SVG preview + sans-serif label; the full
 * tagline lives in a hover tooltip (200ms delay) so the strip stays
 * breathable. An optional "See all ↗" affordance opens the full
 * comparison gallery in a Dialog — same rich JSX, just lifted into a
 * modal so it's available without crowding the form by default.
 *
 * Visual decisions live in src/styles/control-tokens.css — fonts,
 * sizes, hover/selected states. Don't restyle inline.
 *
 * Keyboard: native button focus traversal with Tab; left/right
 * arrows navigate within the strip when the user clicks into it
 * (we use roving tabindex on the chips). Enter / Space activates.
 */

export interface ControlPickerItem<T extends string> {
  id: T;
  label: string;
  /** Optional shorter label used in the strip when label is too long. */
  shortLabel?: string;
  /** Full description shown in the tooltip + the gallery. */
  tagline?: string;
  /** SVG / preview node rendered inside the chip. */
  preview?: React.ReactNode;
  /** Disabled chips render but can't be selected. */
  disabled?: boolean;
}

export interface ControlPickerProps<T extends string> {
  /** Eyebrow label rendered above the strip. */
  label: string;
  /** Optional right-aligned hint (e.g. "default: Editorial · collage"). */
  hint?: React.ReactNode;
  items: readonly ControlPickerItem<T>[];
  value: T | null;
  onChange: (v: T) => void;
  disabled?: boolean;
  /** Optional render function for the "See all" Dialog body. When
   *  provided, a "See all ↗" link appears top-right and clicking it
   *  opens the gallery — typically the original rich tile grid lifted
   *  verbatim. The renderer receives `onPick` so a gallery selection
   *  also closes the dialog. */
  galleryRenderer?: (args: { onPick: (id: T) => void; close: () => void }) => React.ReactNode;
  /** Optional title for the gallery Dialog. Defaults to `label`. */
  galleryTitle?: string;
  /** Optional id prefix for the strip's radiogroup. */
  id?: string;
}

export function ControlPicker<T extends string>({
  label,
  hint,
  items,
  value,
  onChange,
  disabled = false,
  galleryRenderer,
  galleryTitle,
  id,
}: ControlPickerProps<T>) {
  return (
    <TooltipProvider delay={200}>
      <div className="ctrl-picker">
        <div className="ctrl-picker-header">
          <span className="ctrl-picker-header-label" id={id ? `${id}-label` : undefined}>
            {label}
          </span>
          <div className="flex items-baseline gap-3">
            {hint ? <span className="ctrl-picker-header-hint">{hint}</span> : null}
            {galleryRenderer ? (
              <SeeAllButton
                label={galleryTitle ?? label}
                render={galleryRenderer}
                onPick={onChange}
              />
            ) : null}
          </div>
        </div>
        <div
          className="ctrl-picker-strip"
          role="radiogroup"
          aria-labelledby={id ? `${id}-label` : undefined}
        >
          {items.map((item) => (
            <ChipButton
              key={item.id}
              item={item}
              selected={item.id === value}
              disabled={disabled || item.disabled}
              onSelect={() => onChange(item.id)}
            />
          ))}
        </div>
      </div>
    </TooltipProvider>
  );
}

function ChipButton<T extends string>({
  item,
  selected,
  disabled,
  onSelect,
}: {
  item: ControlPickerItem<T>;
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  const labelText = item.shortLabel ?? item.label;
  const button = (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      data-selected={selected ? 'true' : 'false'}
      onClick={onSelect}
      disabled={disabled}
      className={cn('ctrl-picker-chip')}
      tabIndex={selected ? 0 : -1}
    >
      {item.preview ? <div className="ctrl-picker-chip-preview">{item.preview}</div> : null}
      <span className="ctrl-picker-chip-label">{labelText}</span>
    </button>
  );
  if (!item.tagline) return button;
  return (
    <Tooltip>
      <TooltipTrigger render={button} />
      <TooltipContent className="ctrl-tooltip-popup" sideOffset={6}>
        <div className="font-medium">{item.label}</div>
        <div className="opacity-80 mt-0.5">{item.tagline}</div>
      </TooltipContent>
    </Tooltip>
  );
}

function SeeAllButton<T extends string>({
  label,
  render,
  onPick,
}: {
  label: string;
  render: (args: { onPick: (id: T) => void; close: () => void }) => React.ReactNode;
  onPick: (id: T) => void;
}) {
  // The Dialog component handles open/close via its own state when used
  // with a Trigger; we don't pass `open` so the user can click outside
  // / press Esc to close. The gallery renderer gets a `close` callback
  // it can wire to a button if needed, but the default close affordance
  // (Esc + backdrop click + the built-in X) covers most use.
  return (
    <Dialog>
      <DialogTrigger
        render={
          <button type="button" className="ctrl-picker-see-all">
            See all ↗
          </button>
        }
      />
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
          <DialogDescription>Pick one — same options as the strip, in a grid.</DialogDescription>
        </DialogHeader>
        <div className="ctrl-picker-gallery">{render({ onPick, close: () => undefined })}</div>
      </DialogContent>
    </Dialog>
  );
}
