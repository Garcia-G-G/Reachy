# 07f — Emma · Wire quick-action buttons + fix hydration nesting bug

> Attach `planning/prompts/00-CONTEXT.md` AND `planning/07-PROJECT-CHAT-COPILOT.md` AND `planning/07e-EMMA-RENDER-ROLES-HOTFIX.md`. Apply §0.10. **Surgical hotfix.** Two visible production bugs: (A) hydration error from invalid HTML nesting in markdown-rendered asset previews, and (B) `mejorar` / `variante` / `guardar` buttons render but don't do anything when clicked.

---

## 🚨 Directive to CCM

Tight hotfix. Don't redesign. Verify in Chrome before declaring done.

- **Bug A is mechanical** — replace `<figure>`/`<figcaption>` with `<div>` inside the inline asset preview, OR escape the `<p>` parent. Both options below.
- **Bug B is a wiring gap** — the buttons exist but their `onClick` handlers either don't exist or are stubs. Wire them to the server actions/tools that ALREADY exist from Step 07.

---

## Bug A — Hydration error (invalid HTML nesting)

**Repro:** Chrome console (`/app/projects/reachy/chat`) shows:
```
Error: Hydration failed because the server rendered HTML didn't match the client.
<figure> cannot be a descendant of <p>
<figcaption> cannot be a descendant of <p>
<div> cannot be a descendant of <p>
```

**Root cause:** `react-markdown` renders a URL inside a `<p>` element. The custom `a` renderer (from 07e Task 1) returns `<InlineAssetPreview>` which internally renders a `<figure>` with `<figcaption>` + a `<div>` of quick-action chips. HTML spec doesn't allow block elements inside `<p>` — the browser auto-closes the `<p>` early on the client, mismatching the SSR output → hydration fails → React re-mounts the tree → event handlers temporarily detach → buttons stop working.

**Fix — pick ONE of these:**

### Option 1 (preferred, simpler): swap block elements for inline-block divs

In `src/components/app/inline-asset-preview.tsx`:

```diff
- <figure className="emma-inline-asset">
+ <span className="emma-inline-asset" role="figure">
    <img src={url} alt={caption ?? ''} />
-   <figcaption className="emma-inline-asset-caption">{caption}</figcaption>
+   <span className="emma-inline-asset-caption">{caption}</span>
-   <div className="emma-tool-chips emma-inline-asset-chips">
+   <span className="emma-tool-chips emma-inline-asset-chips">
      {/* chip buttons */}
-   </div>
- </figure>
+   </span>
+ </span>
```

CSS adjustment: `display: inline-block` on `.emma-inline-asset` and `display: block` on the inner `.emma-inline-asset-caption` + chips wrapper (which is now `<span>`, so explicit block).

`<span>` IS allowed inside `<p>`. Semantic loss is minor; preserve accessibility with `role="figure"` and `aria-label={caption}`.

### Option 2 (more correct semantics): unwrap from `<p>` via custom `p` renderer

In `src/components/app/chat-message.tsx`'s `ReactMarkdown` `components.p`:

```ts
p: ({ children, node }) => {
  // If the paragraph contains ONLY an image link/preview, render it without wrapping <p>
  const onlyChild = Array.isArray(children) && children.length === 1 ? children[0] : children;
  const isPreviewOnly =
    onlyChild &&
    typeof onlyChild === 'object' &&
    onlyChild?.type?.displayName === 'InlineAssetPreview';
  if (isPreviewOnly) return <>{children}</>;  // unwrap
  return <p className="emma-p">{children}</p>;
},
```

Set `InlineAssetPreview.displayName = 'InlineAssetPreview'` for the type-check.

Combine with Option 1 (use semantic `<figure>` again) for cleaner DOM. Option 2 alone is fragile because markdown can produce mixed paragraphs (`Here's the image: <a>`).

**Recommendation: ship Option 1.** Pragmatic, no fragility, valid HTML.

---

## Bug B — `mejorar` / `variante` / `guardar` buttons do nothing

**Repro:** Click `mejorar` in Chrome → zero network requests, zero console activity. The button renders but has no handler.

**Fix:** Wire each chip to the right action. These actions ALREADY exist as Emma tools from Step 07 — they just need to be called from the UI as inline operations (since the user already has the generation, no need to round-trip through the LLM).

### `mejorar` — iterate the existing asset with auto-critique

Calls `regenerateAsset({ assetId, tweakHint })` server action. The `tweakHint` comes from the existing Step 05 critic — pull the most recent `criticIssues` for this generation and pass them as the hint, e.g.:
```
"Address these issues: composition lacks clear focal point, palette feels muted. Bias toward bolder accent use."
```

If no critic issues stored (legacy gen), fall back to a generic hint: `"Sharpen the headline, tighten composition, emphasize the brand accent."` — stored in `src/server/config/quickActionHints.ts`.

UI feedback: chip text changes to `mejorando…` + the chip disabled. When the new generation arrives, render it inline below the original with an `Edit 1` label (mirrors the editor's variant strip pattern from Step 06).

### `variante` — generate a fresh variant from the same brief

Calls `generateImage({ format, layout, idea: originalBrief, style: originalStyle, n: 1 })` — exactly the same params as the original but new attempt. Cost: $0.21.

UI feedback: chip → `generando…` + disabled. New variant appears alongside the original (carousel-style: original + variants).

### `guardar` — promote to a campaign asset (library)

Calls `saveAsCampaignAsset({ generationId, channel })` — promotes the chat-generated asset to a permanent `campaign_asset` row that shows in the project library. If the chat hasn't been linked to a campaign, lazy-create a "Chat outputs" campaign for this project.

UI feedback: chip → `guardado ✓` for 2 seconds, then back to `guardar` (still clickable for idempotent re-save, no-op).

### Implementation

In `src/components/app/inline-asset-preview.tsx` (or wherever the chips render):

```tsx
const [busy, setBusy] = useState<'mejorar' | 'variante' | 'guardar' | null>(null);
const [savedFlash, setSavedFlash] = useState(false);

async function handleAction(action: 'mejorar' | 'variante' | 'guardar') {
  setBusy(action);
  try {
    if (action === 'mejorar') {
      const res = await regenerateAsset({ assetId, tweakHint: hintFor(criticIssues) });
      if (!res.ok) throw new Error(res.error);
      onNewVariant?.(res.data);
    } else if (action === 'variante') {
      const res = await enqueueImageVariation({ generationId, projectId });
      if (!res.ok) throw new Error(res.error);
      onNewVariant?.(res.data);
    } else if (action === 'guardar') {
      const res = await saveAsCampaignAsset({ generationId, projectId });
      if (!res.ok) throw new Error(res.error);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);
    }
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'failed');
  } finally {
    setBusy(null);
  }
}
```

Labels:
- `mejorar` → `busy === 'mejorar' ? 'mejorando…' : 'mejorar'`
- `variante` → `busy === 'variante' ? 'generando…' : 'variante'`
- `guardar` → `savedFlash ? 'guardado ✓' : busy === 'guardar' ? 'guardando…' : 'guardar'`

Disabled while busy.

### Server actions to verify exist

```bash
grep -n "export.*regenerateAsset\|export.*saveAsCampaignAsset\|export.*enqueueImageVariation" src/server/actions/
```

If `enqueueImageVariation` doesn't exist as a standalone action (Step 07 only defined it as an Emma tool callable by the LLM), expose it as a regular server action too. Same handler logic, just a thin wrapper accessible from UI.

---

## Files

Edit:
- `src/components/app/inline-asset-preview.tsx` — apply Option 1 fix (figure → span with role) + wire 3 onClick handlers
- `src/components/app/chat-message.tsx` — optionally also apply Option 2 unwrap fallback
- `src/styles/emma-tokens.css` — add `.emma-inline-asset { display: inline-block }` + child block displays

Create / verify:
- `src/server/actions/emma-asset-actions.ts` (or extend existing actions file) — surface `regenerateAsset`, `enqueueImageVariation`, `saveAsCampaignAsset` as user-callable server actions if not already
- `src/server/config/quickActionHints.ts` — fallback hints when critic issues aren't stored

---

## Verify (in Chrome via dev tools)

```bash
pnpm typecheck && pnpm lint && pnpm build
```

Then in `pnpm dev` at `/app/projects/reachy/chat`:

1. **Hydration**: open Chrome DevTools console → reload → 0 hydration errors. No `<figure> cannot be descendant of <p>` warning.
2. **mejorar button**: click on an asset's `mejorar` → label changes to `mejorando…` → network shows POST to the regenerate action → new variant renders inline ~30-60s later.
3. **variante button**: click `variante` → label `generando…` → POST visible → new image card appears next to the original.
4. **guardar button**: click `guardar` → label `guardado ✓` for 2s → check `/app/projects/reachy/library` → the asset appears in the project library.
5. **Re-click guardar after save**: idempotent, doesn't duplicate the campaign_asset row.
6. **Error path**: temporarily block the action endpoint → click `mejorar` → toast error appears, chip returns to enabled state.

---

## Done

Reply with:
- Chrome DevTools console screenshot showing 0 hydration errors.
- 3 network-tab screenshots — one per button click — showing the server action POST + response.
- 1 screenshot of the library page proving `guardar` actually saves the asset.
- Honest paragraph: are all 3 buttons solid? Any edge cases (rapid double-click, network failure, busy state stuck)?
