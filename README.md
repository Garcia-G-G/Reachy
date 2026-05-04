# Reachy

Self-hosted web app that turns each indie SaaS launch into a *small edition* — images, copy, reels, OG cards, and email headers, all coherent with your brand. Multi-project, bilingual ES/EN.

> Editorial / magazine workshop, not a SaaS dashboard.
> A **project** is a *cabecera* (masthead). A **campaign** is an *edición*. An **asset** is a *pieza*.

## Stack

- **Next.js 16** (App Router, Server Actions, Turbopack) · **TypeScript** strict
- **Tailwind CSS v4** with a custom Editorial theme (CSS-first via `@theme inline`)
- **shadcn/ui** v4 (aggressively re-skinned: no rounded corners, hard print shadows)
- **PostgreSQL 16** + **Drizzle ORM** *(Phase 02)*
- **better-auth** with email magic-link + Google OAuth *(Phase 02)*
- **BullMQ + Redis 7** for async generation jobs *(Phase 04)*
- **Cloudflare R2** for asset storage *(Phase 04)*
- **OpenAI** (`gpt-image-1`, GPT-5/4.1) and **fal.ai** (FLUX.2, Veo 3.1, Sora 2 Pro)
- **fluent-ffmpeg** for vertical reel composition *(Phase 06)*
- **Biome** linter/formatter · **Vitest** + **Playwright** for tests

## Prerequisites

- Node 22 LTS (or newer)
- pnpm 9+
- Docker Desktop running (for local Postgres + Redis)

## Getting started

```bash
pnpm install
cp .env.example .env.local      # then fill in the values you have
pnpm db:up                       # start Postgres 16 + Redis 7 locally
pnpm dev                         # http://localhost:3000
```

Stop the local DB/queue when you're done:

```bash
pnpm db:down
```

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Next.js dev server (Turbopack) |
| `pnpm build` | Production build |
| `pnpm start` | Run the production build |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | Biome check |
| `pnpm lint:fix` | Biome check with auto-fix |
| `pnpm format` | Biome format-write |
| `pnpm db:up` | Start Postgres + Redis containers |
| `pnpm db:down` | Stop and remove containers |
| `pnpm db:logs` | Tail container logs |

## Folder structure

```
src/
├── app/                         Next.js App Router
│   ├── (marketing)/             Public landing
│   ├── (app)/                   Authenticated app
│   │   ├── projects/            "Cabeceras"
│   │   ├── generate/            "Nueva edición"
│   │   ├── library/             "Archivo"
│   │   └── settings/
│   ├── api/                     Webhooks + auth callbacks
│   ├── layout.tsx               Root layout (loads 4 fonts + globals)
│   └── page.tsx                 Welcome edition
├── components/
│   ├── editorial/               Design-system components
│   │   ├── BtnInk, BtnGhost (button variants)
│   │   ├── BtnInkLink, BtnGhostLink (Link variants)
│   │   ├── Masthead, MonoEyebrow, Rule, RuleDouble
│   │   └── index.ts
│   ├── ui/                      shadcn/ui generated (re-skinned per phase)
│   ├── marketing/               Landing-only components
│   └── app/                     Dashboard-only components
├── server/
│   ├── db/                      Drizzle schema + queries (Phase 02)
│   ├── ai/                      OpenAI + fal.ai clients (Phase 04)
│   ├── jobs/                    BullMQ queues + workers (Phase 04)
│   ├── storage/                 R2 client (Phase 04)
│   └── actions/                 Server Actions grouped by domain
├── lib/                         Pure utils + cn()
├── env.ts                       Zod-validated environment (crashes early)
└── styles/
docker/
└── docker-compose.yml           Postgres 16 + Redis 7 for dev
docs/
├── design-editorial.html        Visual reference — replicate faithfully
└── screenshots/                 End-of-phase reference shots
```

## Editorial design system

Tokens live in `src/app/globals.css` as CSS custom properties under `@theme inline`. Use Tailwind utilities like `bg-paper`, `text-ink`, `text-accent`, `border-rule`, or the named utility classes:

| Class | Use for |
|---|---|
| `.display` | Fraunces, opsz 144, tight tracking. H1/H2/H3 |
| `.it` | Instrument Serif Italic — *real* italics, not `<em>` |
| `.mono-eyebrow` | JetBrains Mono uppercase, .14em tracking |
| `.btn-ink` / `.btn-ghost` | Print-style rectangular buttons |
| `.field` | Single-bottom-line inputs |
| `.card-paper` + `.card-hard` | Print-style cards with `14px 14px 0 ink` shadow |
| `.rule-thin` / `.rule-double` | Editorial dividers |

**Strict rules** (also enforced visually in [`docs/design-editorial.html`](docs/design-editorial.html)):

- Light mode only.
- No blob gradients, no glass cards, no soft blurred shadows.
- `border-radius: 0` everywhere except avatars (`--radius-full`).
- Big display typography (`clamp(56px, 9vw, 128px)` for the cover).
- Burnt sienna `--accent #b6481a` only in tiny doses (one italic word, hover states, section numbers).

## Environment variables

See [`.env.example`](./.env.example). Required at boot:

- `DATABASE_URL` — Postgres connection string
- `REDIS_URL` — Redis connection string
- `BETTER_AUTH_SECRET` — at least 32 chars (generate with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`)
- `BETTER_AUTH_URL` — `http://localhost:3000` in dev

The rest are optional in Phase 01 and become required as features land.
`src/env.ts` validates all of these via Zod and **crashes with a readable error** on first import if anything is off.

## Project memory and prompts

The product's planning documents — design references, phase prompts, decisions log — live in a separate planning repo (`MarKetOL/`), not here. Each phase prompt is fed to the AI agent in a clean session along with `prompts/00-CONTEXT.md` (the source of truth).

This repo is the **product code**. Source of truth for design rules and architecture: [`docs/design-editorial.html`](docs/design-editorial.html) and the project memory.
