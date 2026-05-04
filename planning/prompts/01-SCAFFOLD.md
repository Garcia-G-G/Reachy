# Phase 01 — Project SCAFFOLD

> **Read `00-CONTEXT.md` first.** All stack and design decisions come from there.
> **Take your time. Apply §0.10 of `00-CONTEXT.md` (Quality & depth directive). Do NOT deliver in 5 minutes — research, plan, build, verify, refactor, re-read. Garcia values depth over speed.**

## Goal

Create the repo from scratch with Next.js 15, TypeScript, Tailwind v4, shadcn/ui (custom **Editorial** theme — see §0.6 of 00-CONTEXT), Drizzle ORM, Biome, and the folder structure from §0.5. Make `pnpm dev` work and show a welcome page using the editorial typography and colors.

## Environment prerequisites

- Node 22 LTS, pnpm 9+
- Docker Desktop running (for local Postgres + Redis)
- Git initialized

## Steps

### 1. Prior research (mandatory)
WebSearch the most current versions and init commands as of May 2026 for:
- `create-next-app` — current flags and recommended options
- `tailwindcss` v4 setup in Next 15
- `shadcn` CLI (now called `shadcn` without `-ui`)
- `drizzle-kit` init in Next.js
- `biome` init

Briefly report what you found if anything changed vs. what this prompt assumes.

### 2. Init the project

```bash
pnpm dlx create-next-app@latest reachy \
  --typescript --tailwind --app --src-dir --turbopack \
  --import-alias "@/*" --use-pnpm --eslint=false
cd reachy
```

If `create-next-app` no longer supports a flag, adjust and document the change.

### 3. Replace ESLint with Biome

```bash
pnpm add -D @biomejs/biome
pnpm biome init
```

`biome.json`:
```json
{
  "$schema": "https://biomejs.dev/schemas/2.0.0/schema.json",
  "vcs": { "enabled": true, "clientKind": "git", "useIgnoreFile": true },
  "files": { "ignoreUnknown": false },
  "formatter": { "enabled": true, "indentStyle": "space", "indentWidth": 2, "lineWidth": 100 },
  "linter": { "enabled": true, "rules": { "recommended": true, "style": { "useImportType": "error" } } },
  "javascript": { "formatter": { "quoteStyle": "single", "trailingCommas": "all", "semicolons": "always" } }
}
```

Scripts in `package.json`:
```json
{
  "scripts": {
    "dev": "next dev --turbopack",
    "build": "next build",
    "start": "next start",
    "lint": "biome check .",
    "format": "biome format --write .",
    "typecheck": "tsc --noEmit"
  }
}
```

`tsconfig.json` strict:
```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

### 4. Tailwind v4 with EDITORIAL theme

> See §0.6 of 00-CONTEXT for full rules. This is the minimal scaffold setup.

`src/styles/globals.css`:
```css
@import "tailwindcss";

@theme {
  /* editorial palette */
  --color-paper:   #f1ebdf;
  --color-paper-2: #e8e0cf;
  --color-ink:     #14110d;
  --color-ink-2:   #4a4338;
  --color-ink-3:   #8b8170;
  --color-rule:    #c9bfa9;
  --color-accent:  #b6481a;

  /* fonts (loaded with next/font/google in layout.tsx) */
  --font-display: var(--font-fraunces), Georgia, serif;
  --font-italic:  var(--font-instrument), Georgia, serif;
  --font-sans:    var(--font-inter), system-ui, sans-serif;
  --font-mono:    var(--font-mono-jetbrains), ui-monospace, monospace;

  /* radius — 0 by default, this is only for special cases */
  --radius-pill: 9999px;
}

html, body {
  background: var(--color-paper);
  color: var(--color-ink);
  font-family: var(--font-sans);
  font-size: 15px;
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
}

::selection { background: var(--color-ink); color: var(--color-paper); }

/* editorial utility classes — use without prefix */
.display      { font-family: var(--font-display); font-weight: 400; letter-spacing: -.025em; line-height: .94; font-variation-settings: 'opsz' 144; }
.it           { font-family: var(--font-italic); font-style: italic; font-weight: 400; }
.mono-eyebrow { font-family: var(--font-mono); font-size: 11px; letter-spacing: .14em; text-transform: uppercase; color: var(--color-ink-3); }
.rule-double  { border-top: 3px double var(--color-ink); }
.shadow-print { box-shadow: 14px 14px 0 var(--color-ink); }
```

`src/app/layout.tsx` — load Google fonts:
```ts
import { Fraunces, Instrument_Serif, Inter, JetBrains_Mono } from 'next/font/google';

const fraunces   = Fraunces({   subsets: ['latin'], variable: '--font-fraunces', axes: ['opsz', 'SOFT'] });
const instrument = Instrument_Serif({ subsets: ['latin'], style: ['italic','normal'], weight: '400', variable: '--font-instrument' });
const inter      = Inter({      subsets: ['latin'], variable: '--font-inter' });
const jetbrains  = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono-jetbrains' });

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${fraunces.variable} ${instrument.variable} ${inter.variable} ${jetbrains.variable}`}>
      <body>{children}</body>
    </html>
  );
}
```

> ⚠️ **Do NOT** implement dark mode. **Do NOT** use blob gradients, glass, or soft shadows. If shadcn applies them by default in generated components, refactor them out.

### 5. shadcn/ui — install and configure theme

```bash
pnpm dlx shadcn@latest init
```

When prompted:
- Style: **default**
- Base color: **zinc**
- CSS variables: **yes**

Then install base components:
```bash
pnpm dlx shadcn@latest add button card input label textarea select \
  dropdown-menu dialog sheet tabs badge tooltip separator avatar \
  skeleton table command sonner
```

**Aggressive override** of the shadcn theme to use editorial tokens from 00-CONTEXT §0.6:
- `--primary` → `--color-ink` (not the accent — ink is the product's "primary" color)
- `--accent` → `--color-accent` (#b6481a — use sparingly)
- `--background` → `--color-paper`
- `--foreground` → `--color-ink`
- `--muted` → `--color-paper-2`
- `--muted-foreground` → `--color-ink-3`
- `--border` → `--color-rule`
- **`--radius: 0`** (no border-radius on cards/inputs/buttons)

If shadcn uses HSL CSS variables, calculate equivalent HSL. If it uses OKLCH (Tailwind v4 default), use OKLCH.

> ⚠️ **Refactor generated components** after installing them: many shadcn defaults ship with `rounded-md`, `shadow-sm`, etc. Strip them so they respect editorial rules (no radius, hard print-style shadow).

### 6. Folder structure

Create all the folders from 00-CONTEXT §0.5 empty with a `.gitkeep` where needed.

### 7. `src/env.ts` with Zod

```ts
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development','test','production']).default('development'),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url(),
  OPENAI_API_KEY: z.string().min(1).optional(),
  FAL_KEY: z.string().min(1).optional(),
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().optional(),
  R2_PUBLIC_URL: z.string().url().optional(),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().email().optional(),
});
export const env = schema.parse(process.env);
```

`.env.example` with empty keys. `.env.local` for development (in .gitignore).

### 8. Docker compose for dev

`docker/docker-compose.yml`:
```yaml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_PASSWORD: dev
      POSTGRES_USER: dev
      POSTGRES_DB: reachy_dev
    ports: ["5432:5432"]
    volumes: ["pgdata:/var/lib/postgresql/data"]
  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
volumes:
  pgdata:
```

Script in package.json:
```json
"db:up": "docker compose -f docker/docker-compose.yml up -d",
"db:down": "docker compose -f docker/docker-compose.yml down"
```

### 9. Temporary welcome page (editorial style)

`src/app/page.tsx` must replicate the minimal structure from `design-editorial.html` (at the repo root — copy it to `/docs/`):
- Masthead with 3-column grid (Vol. 01 · Reachy · nav)
- Cover with H1 in Fraunces (clamp 56-128px, max-w-14ch, italic on one word)
- Button with `mono-eyebrow` style (uppercase, wide tracking, no radius)
- No glass, no gradient, no blurred shadow. Just paper + ink.

Use the CSS classes and `next/font` props correctly. If Fraunces doesn't render as "variable" (it should have visible weight/optical size variation), check `axes`.

### 9b. Base editorial components

Create `src/components/editorial/`:
- `Masthead.tsx` — header with vol/name/nav
- `BtnInk.tsx` — primary button (black · uppercase · no radius)
- `BtnGhost.tsx` — secondary button (black border · uppercase)
- `MonoEyebrow.tsx` — `<span>` with `mono-eyebrow` class
- `Rule.tsx` — `<hr>` 1px line color `--color-rule`
- `RuleDouble.tsx` — 3px double divider

These will be used across the WHOLE app (marketing and dashboard) for consistency.

### 10. Initial README.md

How to start:
```
pnpm install
cp .env.example .env.local   # fill minimum values
pnpm db:up
pnpm dev
```

## Acceptance criteria

- [ ] `pnpm install` no errors
- [ ] `pnpm db:up` brings up Postgres and Redis
- [ ] `pnpm dev` opens `localhost:3000` and shows the hero with Inter + editorial palette
- [ ] `pnpm typecheck` ✅
- [ ] `pnpm lint` ✅ (Biome no critical warnings)
- [ ] `pnpm build` ✅
- [ ] `src/env.ts` crashes if a required var is missing
- [ ] Folders created per §0.5

## Final verification

Take a screenshot with Playwright (or describe what's visible) of `localhost:3000` to confirm the visual matches `design-editorial.html`.

## Expected output

Standard report §0.8 + suggest next phase: **02-DATABASE-AUTH.md**.
