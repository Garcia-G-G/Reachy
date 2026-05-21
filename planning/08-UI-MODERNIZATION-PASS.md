# 08 — UI modernization pass (form picker lightening, library lightbox + editor link, in-editor Emma copilot)

> Attach `planning/prompts/00-CONTEXT.md` AND `planning/07j-EMMA-CONCIERGE-ALIVE.md`. Apply §0.10. **Grounded in the real codebase** (verified file paths + line numbers below). Garcia's pain in his words: *"la página me da la sensación que tiene mucho y el estilo que tiene lo hace ver como complicado o antiguo"* + *"las imágenes guardadas no se puedan ver en grande si no es para descargar"* + *"me gustaría que el editor sea inteligente, a lo mejor se podría hacer como un 'bot de ayuda' en la edición"*. Three coordinated, surgical changes — NOT a redesign.

---

## 🚨 Directive to CCM

Investigation already done. The actual divergence + gaps:

- The "heavy picker" Garcia screenshotted is `generate-image-form.tsx:LayoutTile` (13 big tiles in a 3-col grid with 80px preview + label + 2-line tagline). It's the FORM picker.
- The editor at `/generate/image/[generationId]` already has a compact `LayoutBlock` (3-col, 9px label, no tagline). That picker is fine.
- `library-grid.tsx` has zero click-to-view-large. The data passed in (`LibraryAsset` interface lines 8-17) is also thin — no headline, layout, colors, cost. Lightbox needs more data.
- `generation-editor.tsx` is the asset editor. Library assets can ALREADY open it (every `asset.generationId` is set in the schema) — but the library cells don't link to it. One-line miss.
- Emma's tool factory pattern is `createXTool(ctx: EmmaToolContext)` (see `src/server/ai/chat/tools/composeBrief.ts`). The context (`src/server/ai/chat/context.ts:17-32`) ALREADY has `focusedGenerationId` and `currentRoute`. The edit copilot reuses this infrastructure 1:1, just adds tools gated by `focusedGenerationId`.

Three tasks, three files mostly. Anti-hardcode applies. New tokens → `src/styles/control-tokens.css`. New tool descriptions → tool files. Paste-location-style config → `src/server/config/editCopilotTools.ts`.

---

## Task 1 — Lighten the FORM layout picker (and apply pattern to siblings)

### What's currently there

`src/components/app/generate-image-form.tsx:626-654` renders 13 `<LayoutTile>` buttons in a 3-col CSS grid:

```tsx
<div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
  <LayoutTile active={...} label="Default" sublabel={LAYOUT_META[...].label} ... />
  {LAYOUT_IDS.map(id => <LayoutTile label={LAYOUT_META[id].label} sublabel={LAYOUT_META[id].tagline} ... />)}
  <LayoutTile label="No overlay" sublabel="Raw AI image, no typography" ... />
</div>
```

`<LayoutTile>` (lines 1123-1158) renders:
- 80px-min-height SVG preview (the schematic from `layout-previews.tsx`)
- A bold label (likely defaults to Fraunces)
- A sublabel that's the full tagline ("Oversized italic headline on full-bleed photo. Magazine spread." — 56 chars, wraps to 2-3 lines)
- Per-tile border + padding + box-shadow when active

13 tiles × ~140px each × 3 cols = ~5 rows ≈ 700px of vertical space, every tile shouting for attention with its own description. This is what feels "complicado y antiguo".

### Target state — Compact strip with hover-to-detail

Replace the 3-col grid with a horizontal scrollable strip of compact chips. Tagline moves to a hover tooltip. A "See all" button opens the full gallery for users who want to comparison-shop.

```
┌─ Layout ─────────────────────────────────────────────────── default for IG post: Editorial · collage ── See all ↗ ─┐
│ ▦ Default  ▦ Editorial·collage  ▦ Text·cutout  ▦ Badge·stamp  ▦ Card·soft  ▦ Feature·stack  ▦ Quote·large  →     │
│  ●          ○                    ○              ○             ○            ○                ○                     │
└────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

Each chip:
- 56×72 SVG preview (existing `<LayoutPreview>` re-rendered at smaller size — `LayoutPreview` accepts implicit width from container)
- 11px sans label (NOT Fraunces — these are functional, see Task 1c)
- Selected = solid 1.5px ink outline + tiny accent dot indicator
- Hover (200ms delay) → shadcn `<Tooltip>` with the full `LAYOUT_META[id].tagline`
- Keyboard: ←/→ to navigate within the radiogroup, Enter to select

`See all ↗` opens a shadcn `<Dialog>` containing the CURRENT 3-col gallery (don't rebuild it, just lift the existing JSX into the dialog body). This preserves the rich comparison view for users who want it, while making the default state breathable.

### 1a. Implementation

Create `src/components/ui/control-picker.tsx`:

```tsx
'use client';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';

export interface ControlPickerItem<T extends string> {
  id: T;
  label: string;
  shortLabel?: string;
  tagline?: string;
  preview?: React.ReactNode;
}

export interface ControlPickerProps<T extends string> {
  label: string;
  hint?: React.ReactNode;
  items: readonly ControlPickerItem<T>[];
  value: T | null;
  onChange: (v: T) => void;
  disabled?: boolean;
  galleryRenderer?: () => React.ReactNode;
}

export function ControlPicker<T extends string>({...}: ControlPickerProps<T>) {
  // Horizontal scroll strip + tooltip-on-hover + optional Dialog gallery escape.
  // No own state beyond hover; controlled via value/onChange.
}
```

Refactor `generate-image-form.tsx:626-654` to use `<ControlPicker>`. Pass the gallery JSX as `galleryRenderer` so the dialog still shows the rich tile grid.

### 1b. Apply the same primitive to its siblings

Other heavy controls in the same form (read `generate-image-form.tsx` end-to-end to confirm):
- **Visual style** — currently a native `<select>` (line ~600). Convert to `<ControlPicker>` with `VISUAL_STYLE_KEYS` from `src/lib/visual-styles-meta.ts`.
- **Image format** — currently a grouped native select. Convert to a 2-level picker (category strip + format strip) OR keep the select but restyle to match.
- **Model** — keep as a small radio toggle (only 2-3 models live).

### 1c. New tokens — control fonts and sizing

Create `src/styles/control-tokens.css`:

```css
:root {
  /* Compact functional controls — NOT editorial */
  --ctrl-chip-w: 56px;
  --ctrl-chip-h: 72px;
  --ctrl-chip-gap: 8px;
  --ctrl-chip-radius: 6px;
  --ctrl-chip-padding: 6px;
  --ctrl-strip-padding-y: 8px;

  --ctrl-label-size: 11px;
  --ctrl-label-line-height: 1.2;
  --ctrl-label-weight: 500;
  --ctrl-label-family: var(--font-sans);   /* Inter, NOT Fraunces */
  --ctrl-label-color: var(--ink-2, #2b2620);
  --ctrl-label-color-muted: var(--ink-3, #6f655a);

  --ctrl-header-size: 12px;
  --ctrl-header-family: var(--font-mono);   /* JetBrains, the mono-eyebrow vibe */
  --ctrl-header-weight: 500;
  --ctrl-header-tracking: 0.06em;
  --ctrl-header-transform: uppercase;

  --ctrl-selected-outline: 1.5px solid var(--ink, #14110D);
  --ctrl-selected-dot: 4px solid var(--accent, #B6481A);
  --ctrl-hover-bg: rgba(20, 17, 13, 0.04);

  --ctrl-tooltip-bg: var(--ink, #14110D);
  --ctrl-tooltip-fg: var(--paper, #F1EBDF);
  --ctrl-tooltip-radius: 4px;
  --ctrl-tooltip-padding: 6px 10px;
}
```

Import in `src/app/globals.css` after the existing token blocks. The principle: **editorial Fraunces stays in CONTENT** (page hero `display` class, asset preview headlines, Emma chat, library section titles like `library/page.tsx:135`). Functional controls use sans/mono.

### 1d. What NOT to change

- Don't touch `generation-editor.tsx:LayoutBlock` (lines 543-581) — it's already compact (3-col, 9px label, no tagline) and lives in a sidebar where the format works.
- Don't touch `layout-previews.tsx` — the SVG previews are correct, they're just being mounted in a too-large container.
- Don't touch the library page hero (`library/page.tsx:131-151`) — that editorial heading is the brand moment.

---

## Task 2 — Library: click-to-lightbox + link to editor

### What's currently there

`src/components/app/library-grid.tsx` (92 lines, full read confirmed):
- 3-col grid of `<Image fill>` thumbnails
- Each cell has: image (no onClick), serif format label, dimensions in mono eyebrow, "copy URL" button, "download" anchor with `download` attribute
- That's it. No view-large, no metadata beyond format/size.

`src/app/app/projects/[slug]/library/page.tsx:88-97` builds `images` with only: id, format, width, height, publicUrl, storageKey, bytes, createdAt. **No `generationId`** — even though the DB has it (`src/server/db/schema/assets.ts:asset.generationId`).

### Target state — Three coordinated additions

#### 2a. Expose `generationId` on the library asset payload

Edit `src/app/app/projects/[slug]/library/page.tsx`:
- The `LibraryAsset` interface (line 104) and the `images.map(...)` block (line 88-97) need `generationId: a.generationId` added.
- Confirm `listAssetsForProject` in `src/server/actions/images.ts` already selects `generationId` (it almost certainly does, but verify).

This single change unlocks library → editor routing.

#### 2b. Wire each grid cell to open the editor

Edit `src/components/app/library-grid.tsx`:
- Wrap the `<Image>` (line 41-47) in a `<Link href={`/app/projects/${slug}/generate/image/${asset.generationId}`}>` — passing the slug down from `Content` (`library/page.tsx:130`).
- Cursor-pointer + subtle hover state (1.5px ink border on hover) to signal interactivity.
- Keep the "copy URL" / "download" buttons separate (don't propagate the link).
- Also add a third button: **"Open editor →"** for the explicit affordance.

This is the cheapest win — library assets become editable without any new editor work, because the editor already exists and handles `generationId` rehydration.

#### 2c. Add a lightbox for "view large" without leaving the page

Some users want a quick big-view without committing to the editor. Add a shadcn `<Dialog>`-backed lightbox.

Create `src/components/app/library-lightbox.tsx`:
- Triggered by clicking a new "↗ Vista grande" link on each cell (alongside Copy URL / Download / Open editor).
- Modal contents:
  - Center: image at `max-h-[90vh]`, `object-contain`, dark backdrop (`bg-ink/92` via Tailwind opacity)
  - Right side panel (320px, collapsible via a small chevron): metadata
    - Format · dimensions · bytes
    - Created date
    - Headline (if we have it — fetch on demand from `/api/generations/:id` — keep this lazy so it doesn't block initial open)
    - Brand palette swatches (if available from the generation params)
    - Actions: ↓ Download · ⧉ Copy URL · ✎ Open editor · ⌫ Delete (with confirm; only available if delete server action exists)
- Keyboard: ←/→ to navigate prev/next asset in the current list, Esc closes, `D` downloads, `E` opens editor
- URL state: `?asset=<id>` on the library page so the open lightbox survives reload (reuse Next.js `useSearchParams` + `useRouter.replace`)

#### 2d. Lazy metadata fetch

The library page currently doesn't fetch generation metadata for every asset (would be expensive). The lightbox fetches on demand:

Create `src/app/api/assets/[assetId]/detail/route.ts`:
- Auth check (asset → project → user)
- Returns: `{ asset, generation: { headline, layoutId, colors, modelId, costCents, criticScore } }`

The lightbox calls this on open, caches in component state, shows skeleton placeholders for the metadata section until the response lands.

### 2e. Animation discipline

- Lightbox open: 180ms backdrop fade + 200ms scale (0.96 → 1.0) on the image
- Side panel collapse: 220ms width transition
- Honor `prefers-reduced-motion` — fall back to opacity only

All durations from existing `motion.css` tokens if available; otherwise add to `control-tokens.css`.

---

## Task 3 — Inline edit copilot in the asset editor

### What's currently there

`src/components/app/generation-editor.tsx` (713 lines, full read confirmed) is a 2-column desktop layout:
- **Left:** big canvas (max 1000px) + variant strip
- **Right (360px sidebar):** stacked blocks — `EditCopyBlock`, `LayoutBlock`, `ColorsBlock`, `ActionsBlock`

Each block calls a server action: `rerenderOverlay`, `swapLayout`, `swapColors`, `enqueueVariations` (imports lines 17-22). Each action enqueues a NEW generation and navigates to it (immutable workflow). Cost displayed as `~$0.21` per edit.

No Emma integration. The global `EmmaWidget` (`src/components/app/emma-widget.tsx`) is present but ambient — not context-bound to the current asset.

### Target state — Add `AskEmmaBlock` as a 5th sidebar block

This is the "bot de ayuda" Garcia asked for. It lives INSIDE the editor sidebar, not as a floating bubble, and it's scoped to the current generation.

#### 3a. The block

```
┌─ ✦ Pedile a Emma ────────────────────────────────────┐
│ Está viendo esta pieza. Decile qué cambiar.          │
│ ──────────────────────────────────────────────────── │
│ [chat thread — scrollable, max 320px tall]          │
│                                                      │
│ Sugerencias:                                         │
│ [headline más afilado] [palette más cálida]          │
│ [layout editorial-collage] [variante]                │
│ ──────────────────────────────────────────────────── │
│ Decile a Emma…                                  ↵    │
└──────────────────────────────────────────────────────┘
```

Chips are computed server-side from the generation state. If the current headline is generic → chip "headline más afilado". If layout is `feature-stack` → chips for `editorial-collage` and `badge-stamp`. Logic in `src/server/ai/editCopilotChips.ts`.

#### 3b. Backend — extend Emma, don't fork

The existing `/api/chat/[threadId]/stream/route.ts` and `buildEmmaTools(ctx)` already accept `clientContext` and `focusedGenerationId` (confirmed in `context.ts:31`). Two changes:

1. **Pass `focusedGenerationId` from the editor.** In `generation-editor.tsx`, mount a tiny `<AskEmmaBlock generationId={generationId} projectSlug={slug} />`. That component instantiates `useChat` against the project's existing thread, but POSTs with `clientContext: { currentRoute, focusedGenerationId: generationId }`.

2. **Register edit-copilot tools when `focusedGenerationId` is set.** In `src/server/ai/chat/tools/index.ts:buildEmmaTools`, add a conditional block:

   ```ts
   if (ctx.focusedGenerationId) {
     Object.assign(tools, {
       changeHeadline: createChangeHeadlineTool(ctx),
       applyVoice: createApplyVoiceTool(ctx),
       changeLayout: createChangeLayoutTool(ctx),
       changePalette: createChangePaletteTool(ctx),
       regenerateAsset: createRegenerateAssetTool(ctx),  // resurrected from _archive/ but now wraps swapLayout/rerenderOverlay
       addVariant: createAddVariantTool(ctx),
     });
   }
   ```

Each new tool is a thin wrapper around the existing server actions (`rerenderOverlay`, `swapLayout`, `swapColors`, `enqueueVariations`). NO new generation logic. Each `execute` returns `{ ok: true, newGenerationId, costCents }` or `{ ok: false, error }`.

Tool files in `src/server/ai/chat/tools/edit/`:
- `changeHeadline.ts` — calls `rerenderOverlay({ copy: { headline: newHeadline }, quickFix: true })`
- `applyVoice.ts` — calls `rerenderOverlay({ copy, quickFix: false })` after running the headline through a quick voice rewrite (use `generateText` with the brand kit's tone hint)
- `changeLayout.ts` — calls `swapLayout({ layoutId })`
- `changePalette.ts` — calls `swapColors({ colors })` after resolving a named palette (e.g. "más cálido" → bump accent saturation)
- `addVariant.ts` — calls `enqueueVariations({ sourceAssetId })`
- `regenerateAsset.ts` — full re-roll with a hint string

Persona inherits from 07j. System prompt extension (`src/server/config/chatSystemPrompts.ts:buildEmmaSystemPrompt`) when `focusedGenerationId` is set:

```
<edit-mode>
Garcia is in the editor for generation {focusedGenerationId}.
Current state: headline="{headline}", layout={layoutId}, palette={inkHex}/{paperHex}/{accentHex}.
You can call edit tools that re-render the asset. Each edit costs ~$0.21 and takes 15-30s.
When he says "más sobrio", you call applyVoice({ tone: 'sobrio' }). When he says "cambia el headline a X", you call changeHeadline({ newHeadline: 'X' }).
After each edit you confirm in 1 line and offer ONE follow-up question — never a list.
</edit-mode>
```

#### 3c. Frontend — the chip generator

```ts
// src/server/ai/editCopilotChips.ts
export async function suggestEditChips(ctx: EmmaToolContext): Promise<EditChip[]> {
  const gen = await loadGeneration(ctx.focusedGenerationId!);
  const chips: EditChip[] = [];
  if (gen.compose.headline && gen.compose.headline.length > 50) {
    chips.push({ label: 'headline más afilado', prompt: 'Acortá y filá el headline al máximo, conservando el sentido.' });
  }
  if (gen.compose.layoutId === 'feature-stack') {
    chips.push({ label: 'probar editorial', prompt: 'Cambiá el layout a editorial-collage.' });
  }
  // ... more rules
  chips.push({ label: 'variante', prompt: 'Generá una variante con el mismo brief.' });
  return chips.slice(0, 4);
}
```

Exposed via a new server action `getEditCopilotChips(generationId)` called by the editor on mount.

#### 3d. Component plumbing

Create `src/components/app/ask-emma-block.tsx`:
- Lightweight wrapper around the existing `useChat` from `@ai-sdk/react`
- POSTs to `/api/chat/[threadId]/stream` with `clientContext: { focusedGenerationId, currentRoute }`
- Renders messages in a compact format (no role labels — implied)
- Chips bar below the thread, before the input
- Click chip → pre-fills + submits
- On a successful edit-tool response, fires a callback that the editor uses to navigate to the new generation (same UX as the manual buttons)

Mount inside `generation-editor.tsx` sidebar as the LAST block, after `ActionsBlock`:

```tsx
<AskEmmaBlock
  generationId={generationId}
  projectSlug={slug}
  onNewGeneration={(newId) => { window.location.href = `/app/projects/${slug}/generate/image/${newId}`; }}
/>
```

### 3e. Avoid duplicate Emma surfaces

The global `EmmaWidget` bubble should COLLAPSE itself (or hide) when the editor's `AskEmmaBlock` is mounted, so Garcia doesn't see two Emma entry points fighting for attention. Add `data-emma-inline-mounted` to the document body when the block mounts; `EmmaWidget` checks this and hides if present.

---

## Files

Edit:
- `src/components/app/generate-image-form.tsx` — refactor lines 626-654 + the visual-style select to use `<ControlPicker>`
- `src/components/app/library-grid.tsx` — add Link wrapping the image, add "Open editor" + "Vista grande" buttons
- `src/app/app/projects/[slug]/library/page.tsx` — extend `LibraryAsset` payload with `generationId`, pass slug down
- `src/components/app/generation-editor.tsx` — mount `AskEmmaBlock` as 5th sidebar block
- `src/components/app/emma-widget.tsx` — auto-hide when `data-emma-inline-mounted` is on body
- `src/server/ai/chat/tools/index.ts` — conditional edit tool registration
- `src/server/config/chatSystemPrompts.ts` — append `<edit-mode>` block when `focusedGenerationId` is set
- `src/app/globals.css` — import new control-tokens.css

Create:
- `src/components/ui/control-picker.tsx` — reusable compact picker primitive
- `src/styles/control-tokens.css` — new tokens
- `src/components/app/library-lightbox.tsx` — Dialog-backed lightbox with side panel + keyboard nav
- `src/app/api/assets/[assetId]/detail/route.ts` — lazy metadata fetch for lightbox
- `src/components/app/ask-emma-block.tsx` — editor sidebar Emma instance
- `src/server/ai/editCopilotChips.ts` + `src/server/actions/getEditCopilotChips.ts` — context-aware chip generator
- `src/server/ai/chat/tools/edit/changeHeadline.ts`
- `src/server/ai/chat/tools/edit/applyVoice.ts`
- `src/server/ai/chat/tools/edit/changeLayout.ts`
- `src/server/ai/chat/tools/edit/changePalette.ts`
- `src/server/ai/chat/tools/edit/addVariant.ts`
- `src/server/ai/chat/tools/edit/regenerateAsset.ts` (lift from `_archive/` and adapt)

---

## Verify

```bash
pnpm typecheck && pnpm lint && pnpm build
```

In Chrome at `http://localhost:3000`:

1. **Form picker is light:** `/app/projects/reachy/generate/image` — Layout section is now a single horizontal strip, ≤120px tall, all 13 options visible (scroll horizontally on narrow viewports). Hover any chip → tooltip with tagline appears after 200ms. Click "See all ↗" → modal opens with the current 3-col gallery exactly as before. Select a layout from either surface → state updates correctly.
2. **Visual style picker** uses the same primitive.
3. **Editor LayoutBlock unchanged:** `/app/projects/reachy/generate/image/[some-gen-id]` — sidebar's Layout swap block looks exactly as it did before (the compact 3-col with 9px labels). Don't touch what works.
4. **Library → Editor link:** `/app/projects/reachy/library` — click any image thumbnail → routes to the editor for that generation. URL is `/generate/image/{generationId}`. Editor loads with the saved asset visible.
5. **Lightbox:** click "↗ Vista grande" on a library cell → modal opens with full-size image, right panel shows metadata (lazy-fetched from the new `/api/assets/:id/detail` endpoint, skeleton while loading). Arrow keys navigate prev/next. Esc closes. URL updates to `?asset=<id>` → reload preserves open state. `D` downloads. `E` opens editor.
6. **Edit copilot present:** in the editor, after the Actions block in the sidebar, there's an `Ask Emma` block with chat input + chip suggestions.
7. **Edit copilot works:** click chip "headline más afilado" → Emma streams a 1-line response → calls `changeHeadline` → editor navigates to the new generation in ~15s (uses the existing `rerenderOverlay` pipeline). Same for "palette más cálida".
8. **Free-form edit:** type "cambia el headline a 'Tu primer cliente, sin gastar en ads'" → Emma calls `changeHeadline({ newHeadline: '...' })` → editor navigates.
9. **Floating Emma hides:** when the editor's inline copilot is mounted, the global `EmmaWidget` bubble is hidden. When you navigate away from the editor, the bubble returns.
10. **Editorial brand intact:** library page hero (`/app/projects/reachy/library`) still uses Fraunces 56px title + serif subtitle. Project overview pages unchanged. Only CONTROLS got compact.
11. **Anti-hardcode check:** `rg -n 'minHeight: 80|width: 56|padding: 6px|#14110D|#F1EBDF|#B6481A' src/components/ui/control-picker.tsx src/components/app/library-lightbox.tsx src/components/app/ask-emma-block.tsx` → 0 matches (all via tokens).

---

## Done

Reply with:
- Before/after screenshots of the form layout picker (heavy 13-tile grid → compact strip).
- Screenshot of a tooltip showing on hover of a layout chip.
- Screenshot of "See all" gallery dialog open.
- Screenshot of library page with hover state showing the new cell affordances (Open editor + Vista grande links).
- Screenshot of lightbox open on a real asset with metadata side panel visible.
- Screenshot of editor sidebar showing the new `Ask Emma` block with chips.
- A 30-second screencap of using the edit copilot: type or chip-click an edit → Emma responds → asset re-renders → navigates to new generation.
- Honest paragraph: does the app now feel light and modern in CONTROLS while keeping editorial in CONTENT? List 2-3 next heavy spots if any remain (e.g., the brand kit form, the project overview cards).
