# Image gen — diversity tuning + language fix

> Attach `planning/prompts/00-CONTEXT.md`. Apply §0.10. Fork 2 (full AI pivot) is in and working — text renders inside the image now. This is a tuning pass to fix three flaws Garcia hit immediately:
> 1. All outputs look like "moody product photography + italic serif headline" — same aesthetic regardless of style choice.
> 2. Layout `promptDirective` strings are too prescriptive — AI follows the recipe and loses compositional risk.
> 3. Copy planner defaults to English clichés ("Craft your brand story", "A tool designed for indie marketers and creators") even when the brief is in Spanish.

## Why

Pivot is working — text is integrated into the AI image, no more overlay bugs. But the AI is being told the same thing every time, so it produces the same kind of thing every time. Three levers to crack open the variety:

## Tasks

### 1. Rebuild visual styles for genuine diversity

`src/server/ai/visualStyles.ts` — current entries (`abstract`, `editorial`, `paper-cutout`, `flat-2d`, `infographic`, `isometric`) all produce variants of the same moody-photo aesthetic because they share most of the prompt language. Replace with categories that produce DRAMATICALLY different outputs:

- `editorial-photo` — moody product photography (current default behavior)
- `typographic-poster` — typography IS the composition, big sans-serif, dramatic scale shifts, color blocks, no photo at all. Inspired by Swiss Style, Wim Crouwel, Massimo Vignelli.
- `collage-zine` — overlapping torn paper, halftone dots, mixed media, photo cutouts on color backgrounds, Xerox texture. Inspired by riso prints, 90s zines.
- `brutalist-grid` — hard-edged, monospaced, raw geometric forms, black/white/single-accent palette, exposed grid lines.
- `illustrated-vector` — clean vector illustration, strong character shapes, flat color, no photographic elements.
- `memphis-pattern` — playful 80s Memphis design, geometric shapes (squiggles, dots, triangles), bright contrasting colors, asymmetric composition.
- `editorial-collage` — tight magazine layout with photo + typographic overlays + color blocks (combines photo with strong type without being either-or).

Each style's prompt is ~100 words MAX, focused on what makes IT distinct, NOT shared editorial boilerplate. The differences should be visible at a glance — if Garcia generates the same idea across all 7 styles, no two should look alike.

Drop the `promptStatic` vs `promptMotion` split if it exists for image gen — Reachy's image pipeline doesn't need motion variant.

Remove every duplicated `"NO text, NO letters..."` constraint — Fork 2 wants text. The constraint moved to `text rendering directive` per layout, not per style.

`DEFAULT_VISUAL_STYLE` change `'abstract'` → `'editorial-collage'` (most balanced and broadly useful for marketing).

### 2. Loosen layout directives — give AI compositional freedom

`src/server/ai/layoutTemplates.ts` — the new `promptDirective` strings (post-pivot) are too prescriptive. They tell the AI exactly where to place each text and at what size/style. Result: AI follows the recipe and produces the same composition every time.

Rewrite each directive in two parts:
- **Strict** — text content + brand colors + wordmark spelling. These are NON-NEGOTIABLE.
- **Loose** — composition direction. Phrased as creative brief, not a recipe. E.g.:
  - DON'T: *"Top-left corner: small mono uppercase label '[eyebrow]' in #14110D, ~3% of frame height."*
  - DO: *"The eyebrow '[eyebrow]' should appear somewhere as small editorial metadata — corner, margin, or integrated into the composition. Treat it like a publication detail, not a UI element."*

Same for headline placement, subhead, wordmark. The layout still defines a sensibility (editorial-collage = magazine spread; brutalist-grid = exposed structure; quote-slab = single huge quote dominates) but doesn't dictate exact coordinates.

Add at the end of EVERY directive: *"Take a creative position. Make a composition decision the user wouldn't have made themselves. This is a designed piece, not a template fill."*

### 3. Fix Copy Planner language defaulting

`src/server/ai/copyPlanner.ts` — Garcia's brief in Spanish came back with English copy. Three checks:

a) Confirm `language` is being passed all the way through from form → action → job → planner. Garcia's previous bug was a hardcoded `language: 'en'` in `generate-image-form.tsx`. Re-verify nothing else hardcodes it (worker default, planner default, etc.).

b) The planner system prompt currently mixes language instructions with examples. Restructure:
- LINE 1 of the system prompt: `"You write in ${language}. NEVER use any other language. Every output token must be in ${language}."`
- Examples in the system prompt MUST also be in the requested language. If they're hardcoded English, the model leaks English. Translate the example copy ("LAUNCH NOTES", "Read the deep dive", etc.) into ES when language=es.

c) Add a final validator: after the LLM returns the structured copy, run a quick language detection (cheap heuristic — look for distinctive ES tokens like `de`, `que`, `para`, `tu`, vs EN `the`, `your`, `with`). If mismatch, retry once with even more explicit language directive. If second attempt also fails, log a warning but return what we got.

d) Strip the cliché blacklist from English-only and add ES equivalents:
- ES blacklist: `"eleva tu marca", "lleva al siguiente nivel", "transforma tu negocio", "desbloquea tu potencial", "potencia tu", "el futuro del", "la solución definitiva"`
- EN blacklist (keep): `"unlock", "revolutionize", "transform", "level up", "elevate", "craft your", "your brand story", "designed for"`

The current output "Craft your brand story / A tool designed for indie marketers" hits both "craft your" and "designed for" — those need to be in the EN blacklist.

### 4. Per-variant boldness modifiers

`src/server/ai/promptBuilder.ts` — when generating N variants in exploration mode, inject a different "boldness modifier" per variant so the AI takes different creative directions:

```ts
const BOLDNESS_MODIFIERS = [
  '', // variant 1: respect the layout directive as-written, baseline
  'Be bold with typography scale — let one element dominate at 2x normal size.',
  'Use strong color blocking — divide the frame into 2-3 color zones.',
  'Embrace asymmetry — break the implied grid, let elements bleed off edges.',
  'Add a single unexpected element — a torn paper edge, a halftone overlay, a hand-drawn mark.',
  'Push the palette — use the accent color at 50% of the frame, not just as detail.',
  'Treat the typography as the focal subject — image elements support it, not the other way around.',
];
```

Pick deterministic-by-generationId index per variant slot so regenerations vary across runs but a single generation is reproducible.

This means n=4 produces 4 outputs that took 4 different creative bets, not 4 attempts at the same recipe.

### 5. Style-aware prompt validation log

`src/server/jobs/imageWorker.ts` — at the audit log line, also log the resolved style + boldness modifier + first 200 chars of the final prompt:
```
[reachy:image] gen <id> style=typographic-poster modifier="Be bold with typography scale" prompt="ART DIRECTOR BRIEF: Render an editorial typographic poster at 1080×1350..."
```

Garcia can then `tail -f` the worker log and verify what's actually getting sent. If outputs look similar, he'll see in the log whether the prompts were similar (style/modifier didn't change) or different (style/modifier changed but model collapsed anyway → model issue).

## Files

Edit:
- `src/server/ai/visualStyles.ts` (rewrite for diversity)
- `src/lib/visual-styles-meta.ts` (sync the new style ids + labels for the form picker)
- `src/server/ai/layoutTemplates.ts` (loosen directives)
- `src/server/ai/copyPlanner.ts` (language enforcement, ES blacklist, retry validator)
- `src/server/ai/promptBuilder.ts` (boldness modifiers)
- `src/server/jobs/imageWorker.ts` (audit log enhancement)

## Verify

```
pnpm typecheck && pnpm lint && pnpm build
```

Then in `pnpm dev`:
1. Generate the same idea (Gerardo brief in Spanish) across all 7 visual styles → outputs are visibly DIFFERENT in composition, color use, and typography treatment. No two look like "moody product photo with italic serif".
2. Same idea, n=4 with default style → 4 outputs took 4 different creative bets. Confirm in worker log that 4 different boldness modifiers were used.
3. Brief in Spanish → headline + sub + eyebrow + cta all in Spanish. NO English clichés. NO "Craft your" or "designed for".
4. Brief explicitly says "in English" → English copy. Validator doesn't trip.
5. `typographic-poster` style → output has NO photo, just bold typography + color blocks. `editorial-photo` style → output IS a photo with text integrated. They look like different products.

## Done

Reply with:
- 7 generations of the same Spanish brief, one per visual style. R2 URLs. Confirm visual diversity at a glance.
- 4 generations from a single n=4 run with the worker log showing the 4 distinct boldness modifiers.
- 1 ES brief generation with Spanish copy verified (no English leak, no cliché in the blacklist).
- Cost summary.
