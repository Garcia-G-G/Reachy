# Phase 07 — PUBLIC LANDING (editorial) + onboarding

> **Read `00-CONTEXT.md` (especially §0.6 editorial design system). Phases 01–06 complete (minimum 01–04).**
> **Take your time. Apply §0.10 of `00-CONTEXT.md` (Quality & depth directive). Do NOT deliver in 5 minutes — research, plan, build, verify, refactor, re-read. Garcia values depth over speed.**

## Goal

Build the public landing in the `(marketing)` route group, faithfully replicating `design-editorial.html` (at the repo root or `/docs/design-editorial.html`). Same editorial metaphor: masthead + cover + index + spread + colophon. New-user onboarding in 3 editorial steps.

## Mandatory reference

Before coding: open `design-editorial.html` and look at it in full. Every visual decision in the landing must match. If you have doubts about a value, **the reference HTML is the source of truth** (CSS variables, margins, font sizes).

## Steps

### 1. Marketing layout

`src/app/(marketing)/layout.tsx`:
- Masthead pinned to top with bottom border 1px ink
- Children
- Colophon at the end with top border 1px ink
- Background `var(--color-paper)` inherited from global

> **Note on copy:** All landing strings come through `next-intl`. Keys live in `messages/en.json` and `messages/es.json`. **Defaults shown below are English.** The Spanish localization (Reachy's primary market) is added in §8 of this phase. The reference HTML `design-editorial.html` happens to render the Spanish version because it was built first — same structure, just translated keys.

### 2. Masthead

Reuse the `<Masthead>` component created in Phase 01. Structure:

```tsx
<header className="masthead">
  <div className="max-w-[1200px] mx-auto px-10 py-4 grid grid-cols-[1fr_auto_1fr] items-center gap-6">
    <div className="mono-eyebrow">{t('masthead.volume', { issue })}</div>
    <div className="display text-[28px] font-semibold tracking-[-.02em]">reachy</div>
    <nav className="mono-eyebrow flex justify-end gap-6">
      <Link href="#product">{t('nav.product')}</Link>
      <Link href="#subscription">{t('nav.subscription')}</Link>
      <Link href="/login">{t('nav.signIn')} →</Link>
    </nav>
  </div>
</header>
```

`messages/en.json`:
```json
{
  "masthead": { "volume": "Vol. 01 · No. {issue} · 2026" },
  "nav": { "product": "Product", "subscription": "Subscription", "signIn": "Sign in" }
}
```

### 3. Cover (hero)

Single column, centered, ~140px padding top/bottom:
- Eyebrow: `№ 01 — Welcome edition` (with `—` in accent color)
- H1 display: **"Your app deserves more than a _3 a.m._ post."** (with _3 a.m._ in italic + accent)
- Lede in Fraunces 21px weight 300 max-w-44ch:
  > "Reachy turns every launch into a _small edition_ — images, copy and reels with the coherence of a well-edited magazine. Multi-project, bilingual ES/EN, with your brand."
- `<BtnInk>`: **"Start your first edition"**
- Meta below: `Open beta · no card · from $0/mo`

### 4. Index — what's included

Section with top + bottom border 1px ink. Padding 56px. Grid `grid-cols-[200px_1fr]`. Three items each with top border 1px ink:

| № 01 — Images | № 02 — Copy | № 03 — Reels |
|---|---|---|
| Hero, OG, posts, _covers._ | Tweets, threads, _captions._ | Vertical 9:16, _ready._ |
| Generated with OpenAI gpt-image-1 and fal.ai (FLUX, Recraft). Every format in the exact size you need. | Each piece in Spanish and English, side by side, with your brand kit's tone. No generic clichés. | Composed with FFmpeg from your images and text, or generated with Veo 3.1 when the moment calls for it. |

H3 in Fraunces 28px weight 500, highlighted words in Instrument Italic.

### 5. Spread — workshop preview

Section with `background: var(--color-paper-2)`, padding 96px top / 112px bottom. H2 left ("The _workshop_."), meta right ("— spread 02"), and below the editor mock.

**Editor mock** (replicate exact from reference HTML):
- Border 1px ink + hard shadow `box-shadow: 14px 14px 0 var(--color-ink)`
- Top bar with `№ 12`, project name, piece count
- Body grid `[220px_1fr]`:
  - **Sidebar** with two sections: `— Headers` (numbered project list in Fraunces) and `— This edition` (piece list with `›`)
  - **Canvas** with `Edition № 12` + date + grid `[1.3fr_1fr_1fr]` of 3 pieces
- Each **piece** is: image (warm/forest/sienna gradient) + caption with Fraunces title and px in mono

> Idea: if you already have real user data via session, show THEIR real pieces in the preview. Otherwise, show placeholders.

### 6. Colophon

Minimal footer, single row:
- `© Reachy 2026`
- `Made with Inter, Fraunces, Instrument Serif`
- `Contact · Self-hosting`

mono-eyebrow typography.

### 7. SEO

- `generateMetadata` per page with title/description/OG
- OG image generated with `next/og` using the same tokens (paper background, ink text, Fraunces via font assets, no gradients). The OG is the first style test: it must look editorial, not template.
- `sitemap.ts` and `robots.ts` automatic
- JSON-LD Schema.org `SoftwareApplication`

### 8. ES/EN internationalization

`next-intl` (verify current May 2026 version in docs):
- `/es` (default for Reachy's primary market) and `/en`
- The root `/` redirects to `/es` based on Accept-Language; user can override
- Toggle in masthead (ES · EN as mono-eyebrow links separated by `·`)
- Dictionaries in `messages/es.json` and `messages/en.json` with ALL the landing copy

**Spanish (`es.json`) translations** for the cover/index/spread (matching `design-editorial.html`):

| EN key | Spanish |
|--------|---------|
| `cover.eyebrow` → "Welcome edition" | "Edición de bienvenida" |
| `cover.h1` → "Your app deserves more than a _3 a.m._ post." | "Tu app merece más que un post a las _3 a.m._" |
| `cover.lede` → "Reachy turns every launch…" | "Reachy convierte cada lanzamiento en una _pequeña edición_ — imágenes, copy y reels con la coherencia de una revista bien editada. Multi-proyecto, en español e inglés, con tu marca." |
| `cover.cta` → "Start your first edition" | "Empezar la primera edición" |
| `cover.meta` → "Open beta · no card · from $0/mo" | "Beta abierta · sin tarjeta · desde $0/mes" |
| `index.imagesTitle` → "Hero, OG, posts, _covers._" | "Hero, OG, posts, _covers._" |
| `index.copyTitle` → "Tweets, threads, _captions._" | "Tweets, hilos, _captions._" |
| `index.reelsTitle` → "Vertical 9:16, _ready._" | "Verticales 9:16, _listos._" |
| `spread.h2` → "The _workshop_." | "El _taller_." |
| `nav.product` | "Producto" |
| `nav.subscription` | "Suscripción" |
| `nav.signIn` | "Acceder" |
| `colophon.made` → "Made with Inter, Fraunces, Instrument Serif" | "Hecho con Inter, Fraunces, Instrument Serif" |

### 9. New-user onboarding

After the first login (no projects yet), redirect to `/app/welcome`:

**Step 1: The header.** "What's your app called?" — Fraunces input, no border-radius, border-bottom 1px ink. Auto-extract description and colors from the URL if pasted.

**Step 2: The identity.** 3 color pickers (primary, accent, alternate paper), logo upload, textarea for "Voice" (how you write).

**Step 3: Your first edition.** Pre-selects "Hero", proposes an idea generated from name+description, single button "Generate piece" → editorial spinner (a single dot pulsing, NOT a blurred skeleton) → shows the result.

Visual: each step is an "edition" in the masthead, number on top (`01/03 · The header`). No shadcn progress bar — use 3 dots `· · ·` with one filled. Spanish translations follow the same key pattern as §8.

## Acceptance criteria

- [ ] Landing at `/` looks **identical** to `design-editorial.html` (compare side by side)
- [ ] Lighthouse: Perf ≥ 95, A11y ≥ 95, SEO ≥ 100
- [ ] ES/EN toggle works and persists preference
- [ ] OG image generates correctly and looks editorial when shared
- [ ] Responsive: doesn't break at 360px mobile
- [ ] Onboarding completes in 3 steps with no friction

## Verification

- `pnpm build` and check bundle size (Fraunces variable is heavy — confirm `next/font` subsets it well)
- Lighthouse desktop + mobile
- Share the link on X and verify OG card

## Expected output

Report §0.8 + screenshot of full landing + next phase: **08-DEPLOY-HETZNER.md**
