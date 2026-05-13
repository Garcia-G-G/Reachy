# Reel visual style fix — CCM prompt to finish the job

> **Paste this entire file into a new Claude Code Max session, then attach `planning/prompts/00-CONTEXT.md` and start.**
> Apply §0.10 of 00-CONTEXT (Quality & depth directive) — take your time, verify after every step, do NOT declare done in 5 minutes.

---

## Context: what Garcia asked for

> "Quiero mantener la calidad de los videos (animaciones, textos, calidad AI) pero sin tantas personas reales."

The May 12 reel test produced a stock-photo-style stressed woman with sticky notes. Root cause: `src/server/ai/reelPlanner.ts` told Veo `"Modern editorial style: warm palette, natural light, mid depth-of-field. Medium or full-body shot."` — Veo correctly interpreted that as photographic real humans.

We're now driving Veo with a **per-brand-kit `visualStyle` field** and a catalog of 6 explicitly anti-photorealistic styles. Default is `'editorial'` (matches the Reachy landing). All styles forbid real people; subjects are typography, paper shapes, animated icons, charts, isometric figures, or abstract blobs.

**Quality bar: same as before. No regressions on production value — only the subject changes.**

---

## ✅ What is already done (do NOT redo, just verify it builds)

1. **NEW** `src/server/ai/visualStyles.ts` — catalog of 6 styles with prompt fragments. Exports `VISUAL_STYLE_KEYS`, `VISUAL_STYLES`, `DEFAULT_VISUAL_STYLE`, `resolveVisualStyle()`.
2. **EDIT** `src/server/db/schema/brandKits.ts` — added `visualStyle` text column with `$type<BrandVisualStyle>().default('editorial').notNull()`. Exported `BrandVisualStyle` type.
3. **EDIT** `src/server/actions/brandKits.ts` — `upsertBrandKitInput` now accepts optional `visualStyle` (z.enum), and `upsertBrandKit` writes it through to insert + update.
4. **EDIT** `src/server/ai/reelPlanner.ts` — `buildSystemPrompt` now imports `resolveVisualStyle` and uses the style's prompt fragment in BOTH the Spanish and English prompt branches. The old "Modern editorial style: warm palette, natural light…" lines are gone.
5. **EDIT** `messages/en.json` — Reels section: rewrote `metaTitle`, `eyebrow`, `title`, `subtitle`, `fieldTemplate`, `fieldIdea`, `fieldIdeaPlaceholder`, `plan`, `planning`, `compose`. Reordered `types` putting teaching shapes first (`informative-25s`, `tutorial-30s`, `feature-15s`, `pitch-30s`, `launch-20s`, `visual-12s`, `testimonial-20s`) and rewrote every `label` and `description`. Added Identity i18n keys: `sectionVisualStyle`, `visualStyleHint`, `styleEditorial`, `stylePaperCutout`, `styleFlat2d`, `styleInfographic`, `styleIsometric`, `styleAbstract`, plus `*Tagline` siblings.
6. **EDIT** `src/lib/reel-templates.ts` — same reorder as en.json (informative first), all `label` and `description` rewritten teaching-first. The shape of `REEL_TEMPLATES` and types is unchanged.

**Run this first to confirm clean state:**
```bash
git status
git diff --stat
pnpm typecheck   # MUST pass before you proceed
```

If typecheck fails, the most likely culprit is a missing `visualStyle` field in some place that destructures the brand kit. Find and fix.

---

## 🚧 What you (CCM) need to do — in this order

### Step 1 — Drizzle migration

The schema changed but no migration exists yet.

```bash
pnpm db:up                # ensure local Postgres is up
pnpm db:generate          # generate the migration SQL + snapshot
# Review the generated migration in src/server/db/migrations/0003_*.sql
# It should be: ALTER TABLE "brand_kit" ADD COLUMN "visual_style" text DEFAULT 'editorial' NOT NULL;
pnpm db:migrate           # apply
pnpm db:studio            # eyeball: confirm brand_kit table now has visual_style column
```

If the generated SQL is anything other than that one ALTER, stop and report.

### Step 2 — Pass `visualStyle` through to the Identity form

The action `getBrandKitForProject` returns the row, but the page that consumes it (`src/app/app/projects/[slug]/identity/page.tsx`) builds an `initial` prop for `IdentityForm`. That `initial` shape was missing `visualStyle`.

**File: `src/app/app/projects/[slug]/identity/page.tsx`**

Find the spot where it builds `initial` for `IdentityForm` and add:
```ts
visualStyle: bundle?.brandKit?.visualStyle ?? 'editorial',
```

### Step 3 — Add the UI selector to `IdentityForm`

**File: `src/components/app/identity-form.tsx`**

I started this edit but the file got auto-linted between my passes. Apply these changes cleanly:

a. **Imports** — add `BrandVisualStyle` to the existing brandKits schema import:
```ts
import type { BrandLanguage, BrandVisualStyle, BrandVoice } from '@/server/db/schema/brandKits';
```

b. **Constant** — at module scope (just above `IdentityForm`), add:
```ts
const VISUAL_STYLE_OPTIONS: ReadonlyArray<{
  value: BrandVisualStyle;
  labelKey: 'styleEditorial' | 'stylePaperCutout' | 'styleFlat2d' | 'styleInfographic' | 'styleIsometric' | 'styleAbstract';
  taglineKey:
    | 'styleEditorialTagline'
    | 'stylePaperCutoutTagline'
    | 'styleFlat2dTagline'
    | 'styleInfographicTagline'
    | 'styleIsometricTagline'
    | 'styleAbstractTagline';
}> = [
  { value: 'editorial',    labelKey: 'styleEditorial',    taglineKey: 'styleEditorialTagline' },
  { value: 'paper-cutout', labelKey: 'stylePaperCutout',  taglineKey: 'stylePaperCutoutTagline' },
  { value: 'flat-2d',      labelKey: 'styleFlat2d',       taglineKey: 'styleFlat2dTagline' },
  { value: 'infographic',  labelKey: 'styleInfographic',  taglineKey: 'styleInfographicTagline' },
  { value: 'isometric',    labelKey: 'styleIsometric',    taglineKey: 'styleIsometricTagline' },
  { value: 'abstract',     labelKey: 'styleAbstract',     taglineKey: 'styleAbstractTagline' },
];
```

c. **Props** — extend the `IdentityFormProps.initial` to include `visualStyle: BrandVisualStyle;`.

d. **State** — alongside `languages`, add:
```ts
const [visualStyle, setVisualStyle] = useState<BrandVisualStyle>(initial.visualStyle);
```

e. **Effect deps** — add `visualStyle` to the autosave `useEffect` deps array (alongside `languages`). The existing `biome-ignore` comment stays.

f. **`save()` body** — pass `visualStyle` in the `upsertBrandKit({...})` call.

g. **Render** — add a new `<Section>` between `sectionLanguages` and the closing `</div>` of the left column. It must render as a 2-column grid of bordered cards (no radius, editorial style — same look as the existing form):

```tsx
{/* Visual style */}
<Section title={t('sectionVisualStyle')}>
  <p className="mono-eyebrow text-ink-3 mb-6">{t('visualStyleHint')}</p>
  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
    {VISUAL_STYLE_OPTIONS.map((opt) => {
      const checked = visualStyle === opt.value;
      return (
        <label
          key={opt.value}
          className={`flex cursor-pointer gap-3 border p-4 transition-colors ${
            checked ? 'border-ink bg-paper-2' : 'border-rule hover:border-ink'
          }`}
        >
          <input
            type="radio"
            name="visualStyle"
            value={opt.value}
            checked={checked}
            onChange={() => setVisualStyle(opt.value)}
            className="mt-1 accent-ink"
          />
          <span className="block">
            <span
              className="block"
              style={{ fontFamily: 'var(--font-fraunces), Georgia, serif', fontSize: 18 }}
            >
              {t(opt.labelKey)}
            </span>
            <span className="mono-eyebrow text-ink-3 mt-1 block">{t(opt.taglineKey)}</span>
          </span>
        </label>
      );
    })}
  </div>
</Section>
```

After this edit, run `pnpm typecheck` and `pnpm lint`. Both MUST pass.

### Step 4 — Spanish translations (`messages/es.json`)

If `messages/es.json` does not exist yet, create it from `en.json` first (mirror structure, translate values). Then add Spanish for the keys I added/changed:

**Reels:**
- `metaTitle`: "Diseña una lección de 30 segundos"
- `eyebrow`: "№ 06 — Una nueva edición"
- `title`: "Diseña una lección de 30 segundos."
- `subtitle`: "Elige una forma, escribe el ángulo. Reachy redacta las escenas — tú editas las líneas, nosotros renderizamos en 9:16. Los reels aquí enseñan un insight; no venden."
- `fieldTemplate`: "Forma"
- `fieldIdea`: "Ángulo"
- `fieldIdeaPlaceholder`: "¿Cuál es el único insight que esta lección deja claro? (ej. por qué la mayoría del feedback de producto es ruido, y la única señal que vale la pena perseguir)"
- `plan`: "Bocetar escenas"
- `planning`: "Bocetando…"
- `compose`: "Renderizar reel"

**Reels.types** — same order as en.json (`informative-25s` first), translate label and description for each shape. Examples:
- `informative-25s.label`: "Explainer · 25s — Gancho / Insight / Insight / Cierre"
- `informative-25s.description`: "Ritmo calmado de enseñanza. Un insight por escena, un cierre tranquilo al final. El default cuando dudes."
- `tutorial-30s.label`: "Cómo hacer · 30s — Intro / Paso / Paso / Paso / Resultado"
- … etc.

**Identity:**
- `sectionVisualStyle`: "Estilo visual"
- `visualStyleHint`: "Cómo se ven los reels y las imágenes. Sin personas reales en ningún estilo — solo gráficos, tipografía y movimiento."
- `styleEditorial`: "Movimiento editorial"
- `styleEditorialTagline`: "Tipografía serif grande, líneas finas, papel-y-tinta. Coincide 1:1 con la landing de Reachy."
- `stylePaperCutout`: "Recorte de papel"
- `stylePaperCutoutTagline`: "Formas de papel cortado superpuestas con sombras duras. Estilo Headway / Fable."
- `styleFlat2d`: "Explainer plano 2D"
- `styleFlat2dTagline`: "Personajes geométricos con bordes gruesos. Duolingo / Mailchimp."
- `styleInfographic`: "Infografía animada"
- `styleInfographicTagline`: "Números contando, barras creciendo, líneas dibujándose. Los datos lideran."
- `styleIsometric`: "Isométrico mini"
- `styleIsometricTagline`: "Bloques 3D flotantes, figuras pequeñas, gradientes pastel. Notion / Linear."
- `styleAbstract`: "Formas abstractas"
- `styleAbstractTagline`: "Blobs de color suaves morfeando. Premium y ambient. Apple / Stripe."

### Step 5 — Smoke test (manual, in dev)

```bash
pnpm dev
```

1. Sign in (magic link).
2. Open an existing header (or create one).
3. Go to `/app/projects/<slug>/identity`. **Verify:** the new "Visual style" section appears with 6 cards, "Editorial motion" is selected by default. Pick "Paper cutout" — the autosave indicator should flash and confirm.
4. Reload the page. **Verify:** "Paper cutout" remains selected (proves DB write + read works).
5. Go to `/app/projects/<slug>/generate/reel`. **Verify:** the page header reads "Plan a 30-second lesson." and the first template card is "Explainer · 25s" (not "Pitch · 30s").
6. Type an idea and click "Draft scenes". When the plan returns, **inspect** the generated `imagePrompt` of any scene — it should mention paper / cutout / shapes / shadows and explicitly NOT mention people / faces / portraits.
7. Optional (costs ~$1.20 on Veo): render the reel. The output should NOT have a real person in it.

### Step 6 — Quality pass (§0.10)

After everything above passes, do the §0.10 re-read on every file you touched:
- Dead code? Stale comments? Console logs you added for debug?
- Types still strict (no `any`)?
- Did you handle the case where `messages/es.json` exists vs doesn't exist?
- Did you regenerate the `tsconfig.tsbuildinfo` cleanly? (`rm tsconfig.tsbuildinfo && pnpm typecheck` to confirm)
- Run `pnpm build` — must pass with 0 errors and 0 warnings.

---

## ✅ Acceptance criteria

- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm build` all pass
- [ ] `pnpm db:migrate` ran cleanly and `brand_kit.visual_style` exists in the DB
- [ ] Identity form shows the new "Visual style" section with 6 cards, defaulting to "Editorial motion"
- [ ] Changing the visual style and reloading persists the choice
- [ ] Reel generator page header says "Plan a 30-second lesson." (not "Compose a vertical reel.")
- [ ] First template card is "Explainer · 25s" (not "Pitch · 30s")
- [ ] A planned reel's `imagePrompt` for any scene does NOT contain "person", "people", "face", "portrait", "natural light", "depth of field", "stock", "photo"
- [ ] A planned reel's `imagePrompt` DOES contain language consistent with the chosen visualStyle (e.g. "paper cutout shapes" if paper-cutout is selected, "serif typography animating" if editorial)
- [ ] `messages/es.json` exists with the new keys translated
- [ ] No regression: existing brand kits without an explicit visualStyle work fine (DB default kicks in)

## 📤 Final report (per §0.8 of 00-CONTEXT)

When done, report:
- ✅ All steps completed
- 📁 Files created/modified (paste git diff --stat)
- 🧪 Verification: typecheck/lint/build OK, smoke test result, sample of a planned reel imagePrompt showing the new style
- 💡 Decisions you made (e.g. how you handled missing es.json, anything that diverged from this prompt and why)
- ⚠️ Anything pending (e.g. per-reel override selector in `generate-reel-form.tsx` — this was descoped, OK to leave for later)
- 🚀 Next: per-reel override selector in `generate-reel-form.tsx`, OR Phase 04 image generation (apply same visualStyle there).
