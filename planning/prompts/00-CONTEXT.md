# 00 — MASTER CONTEXT (read this before any phase)

> This file is the source of truth for the project. When Garcia gives you a phase prompt (01, 02, 03…), **read it together with this 00**. If there's a conflict, this 00 wins.

---

## 0.1 Who I am (the Claude Code Max agent)

I'm an autonomous agent writing production code for Garcia. **Before implementing any library, framework, or API, I must:**

1. **Research the latest official documentation on the web (2026)**. Don't assume versions, don't invent APIs. Use `WebSearch` and `WebFetch`.
2. **Verify the versions I'm about to install are current** (`npm view <pkg> version`, `pip index versions <pkg>`).
3. **Read existing repo code** before touching it. Don't overwrite logic I don't understand.
4. **Ask Garcia** if a decision is ambiguous (don't invent criteria).
5. **Run tests/build** after every meaningful change. Report what happened.

When Garcia gives me a prompt, my flow is:

```
1. Read the prompt and this 00-CONTEXT.
2. WebSearch the dependencies mentioned → confirm current versions and APIs.
3. Short plan as TODOs.
4. Implement step by step, ticking TODOs.
5. Build + smoke test.
6. Report summary, links to created files, and suggested next steps.
```

---

## 0.2 The product

**Product name:** `Reachy` (confirmed by Garcia, May 2026). In code/folders/URLs: `reachy` lowercase. In visible UI and copy: `Reachy` capitalized.

**One-line pitch:** A self-hosted web app that generates all the marketing material (images, copy, reels, OG cards, email headers) for indie hacker web/SaaS apps. Multi-project and bilingual ES/EN.

**User:** Garcia (indie hacker shipping multiple apps a year).

**Non-goals (what we are NOT):**
- We're not a Canva-style image editor (no manual drag-and-drop).
- We're not a Buffer-style social scheduler (though we may integrate later).
- We don't compete with Jasper on enterprise copy; we're pragmatic for indies.

---

## 0.3 Mandatory stack (don't propose alternatives without permission)

| Layer | Tech | Notes |
|-------|------|-------|
| Framework | **Next.js 15** App Router + Server Actions | Strict TypeScript |
| Styles | **Tailwind CSS v4** + **shadcn/ui** (latest) | Custom **Editorial** theme — see §0.6 |
| Database | **PostgreSQL 16** | Local: docker compose. Prod: Hetzner instance |
| ORM | **Drizzle ORM** + **drizzle-kit** | Migrations in `src/db/migrations` |
| Auth | **better-auth** | Email magic link + Google OAuth |
| Queue / jobs | **BullMQ** + **Redis 7** | For async generation |
| Storage | **Cloudflare R2** (S3-compatible) | No egress fees |
| AI Image | **OpenAI** (`gpt-image-1`) and **fal.ai** (FLUX.2, Nano Banana 2, Recraft V3) | API keys in env |
| AI Video | **fal.ai** (Veo 3.1 Fast default, Sora 2 Pro premium) + **fluent-ffmpeg** local for composition | |
| AI Copy | **OpenAI** (latest GPT-5 / GPT-4.1 available) | Bilingual ES+EN |
| Validation | **Zod** | All Server Actions and route handlers |
| Forms | **react-hook-form** + zod resolver | |
| Server state | **TanStack Query** only where necessary | Prefer Server Components |
| Tests | **Vitest** (unit) + **Playwright** (e2e smoke) | |
| Linter | **Biome** | Faster than ESLint+Prettier |
| Deploy | **Hetzner CX22 + Dokploy + Cloudflare** (DNS, R2, optional Tunnel) | |

**Min versions:** Node 22 LTS, pnpm 9+. If you find newer stable versions when implementing, use them.

---

## 0.4 Code rules

1. **Strict TypeScript.** `"strict": true`, `noUncheckedIndexedAccess: true`. No `any` unless inline-justified.
2. **Server first.** Default to Server Components. Client components only when there's real interaction.
3. **Server Actions** for mutations. Validate input with Zod. Return `{ ok: true, data } | { ok: false, error }`.
4. **No business logic in components.** All business logic lives in `src/server/` (not in JSX).
5. **Composition over inheritance.** No weird utility classes. Pure functions where possible.
6. **Errors as values.** No silent throws in UI flows. Use Result-like patterns.
7. **Small commits.** After each feature, suggest commit message: `feat(scope): change`.
8. **Env vars with Zod.** Create `src/env.ts` that validates `process.env` at boot. If a var is missing, crash early.
9. **No `localStorage` for data that matters.** DB always. `localStorage` only for UI preferences.
10. **WCAG AA accessibility.** Labels, aria, focus rings, 4.5:1 contrast.

---

## 0.5 Folder structure (target)

```
reachy/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── (marketing)/        # public landing
│   │   ├── (app)/              # authenticated app
│   │   │   ├── projects/
│   │   │   ├── generate/
│   │   │   ├── library/
│   │   │   └── settings/
│   │   ├── api/                # webhooks, auth callbacks
│   │   └── layout.tsx
│   ├── components/
│   │   ├── ui/                 # shadcn/ui generated
│   │   ├── marketing/          # landing components
│   │   └── app/                # dashboard components
│   ├── server/
│   │   ├── auth.ts             # better-auth config
│   │   ├── db/                 # drizzle schema, queries, migrations
│   │   ├── ai/                 # openai, fal.ai clients and helpers
│   │   ├── jobs/               # BullMQ queues + workers
│   │   ├── storage/            # R2 client
│   │   └── actions/            # Server Actions grouped by domain
│   ├── lib/                    # pure utils, constants
│   ├── env.ts
│   └── styles/globals.css
├── public/
├── docker/
│   ├── docker-compose.yml      # postgres + redis for dev
│   └── Dockerfile              # production
├── drizzle.config.ts
├── biome.json
├── package.json
└── README.md
```

---

## 0.6 Design system — **Editorial / Magazine**

**Concept.** The product feels like a magazine editor's workshop, not a SaaS dashboard. Vocabulary: each **project** is a "**cabecera**" (masthead/header), each **campaign/generation** an "**edición**" (edition/issue), each **asset** a "**pieza**" (piece). That metaphor shows up in UI, names, and landing.

**Mandatory visual reference:** `design-editorial.html` at the repo root. Replicate faithfully.

### Tokens (Tailwind v4 `@theme`)

```css
@theme {
  /* palette */
  --color-paper:   #f1ebdf;
  --color-paper-2: #e8e0cf;
  --color-ink:     #14110d;
  --color-ink-2:   #4a4338;
  --color-ink-3:   #8b8170;
  --color-rule:    #c9bfa9;
  --color-accent:  #b6481a;

  /* fonts */
  --font-display: 'Fraunces', Georgia, serif;
  --font-italic:  'Instrument Serif', Georgia, serif;
  --font-sans:    'Inter', system-ui, sans-serif;
  --font-mono:    'JetBrains Mono', ui-monospace, monospace;
}

html, body {
  background: var(--color-paper);
  color: var(--color-ink);
  font-family: var(--font-sans);
}
```

### Strict rules

1. **Light mode ALWAYS.** Don't implement dark mode unless Garcia explicitly asks.
2. **No blob gradients, no glass cards, no radial-glow behind hero.** Those are the "AI-generated" tells. Don't use them.
3. **HARD shadows, print-style:** `box-shadow: 14px 14px 0 var(--color-ink)` for cards/mocks. **Never** blurred `shadow-sm/md/lg`.
4. **Border-radius: 0** on cards, inputs, sections. Only exceptions: avatars (full) and, if justified, buttons (max 2px).
5. **Thin lines** (1px, color `--color-rule`) as dividers. Double rules (`border-top: 3px double var(--color-ink)`) for important section breaks.
6. **Large display typography.** H1 between `clamp(56px, 9vw, 128px)`. Letter-spacing `-.025em` or tighter.
7. **Real italics.** Use `font-family: var(--font-italic)` for emphasis (Instrument Serif Italic), NOT default `<em>` in Fraunces.
8. **Mono uppercase with wide tracking** (`.14em`) for eyebrows, dates, metadata. ALWAYS uppercase.
9. **Editorial density:** 56-96px section padding, asymmetric columns (`grid-template-columns: 5fr 7fr`, `200px 1fr`). No symmetric centered layouts.
10. **Accent `#b6481a` (burnt sienna) sparingly:** only for primary CTA hover, highlighted section numbers, one italic word. Never as large background.

### shadcn components — aggressive customization

Yes install shadcn/ui but **aggressive override** so they lose the default look:

```css
/* Buttons */
.btn-ink {
  background: var(--color-ink); color: var(--color-paper);
  padding: 16px 32px; border-radius: 0;
  font-family: var(--font-mono); font-size: 11px; font-weight: 500;
  letter-spacing: .18em; text-transform: uppercase;
  transition: background .15s ease;
}
.btn-ink:hover { background: var(--color-accent); }

/* Inputs */
.field {
  border: none; border-bottom: 1px solid var(--color-ink);
  border-radius: 0; background: transparent;
  font-family: var(--font-sans); font-size: 15px;
  padding: 8px 0;
}

/* Cards */
.card {
  background: var(--color-paper); border: 1px solid var(--color-ink);
  border-radius: 0;
}
.card-hard { box-shadow: 14px 14px 0 var(--color-ink); }
```

Components to install: button, card, input, label, textarea, select, dropdown-menu, dialog, sheet, tabs, badge, toast (sonner), tooltip, separator, avatar, skeleton, table, command (cmdk). Each one **must** be refactored with the tokens and rules above before being used in production.

### UI vocabulary (important — keep consistent)

> The UI is bilingual ES/EN. The Spanish labels are the **default** (Garcia's primary market is hispanic indie hackers). EN labels are the secondary toggle.

| Technical concept | UI label (ES) | UI label (EN) |
|-------------------|---------------|---------------|
| Project | **Cabecera** | **Header** |
| Brand kit | **Identidad** / **Sello** | **Identity** |
| Generation (campaign) | **Edición** | **Edition** |
| Asset | **Pieza** | **Piece** |
| Library | **Archivo** | **Archive** |
| Schedule | **Calendario editorial** | **Editorial calendar** |
| Dashboard | **Mesa de edición** / **Inicio** | **Editor's desk** / **Home** |
| New campaign | **Nueva edición** | **New edition** |

In DB and code, keep English technical names (`project`, `generation`, `asset`). Only the **visible UI** uses the editorial vocabulary.

### Fonts

Load via `next/font/google`:
```ts
import { Fraunces, Instrument_Serif, Inter, JetBrains_Mono } from 'next/font/google';
```

Configure `Fraunces` with `axes: ['opsz', 'SOFT']` to use opsz 144 on large displays.

---

## 0.7 Environment variables (target)

```bash
# Core
DATABASE_URL=postgres://...
REDIS_URL=redis://...
BETTER_AUTH_SECRET=...
BETTER_AUTH_URL=http://localhost:3000

# OAuth
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# AI
OPENAI_API_KEY=...
FAL_KEY=...

# Storage
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=reachy-assets
R2_PUBLIC_URL=https://assets.reachy.app

# Email (for magic links)
RESEND_API_KEY=...
EMAIL_FROM=hello@reachy.app
```

Never commit `.env*` (except `.env.example`).

---

## 0.8 How I deliver each phase

When finishing any phase prompt, deliver this report to Garcia:

```
✅ Phase NN complete — <title>

📁 Files created/modified:
- src/...
- ...

🧪 Verification:
- pnpm build → OK
- pnpm test → OK (n tests)
- Manual smoke: <description of what I tried>

💡 Decisions I made and why:
- ...

⚠️ Pending things / assumptions:
- ...

🚀 Suggested next phase: 0X — <title>
   Run: paste prompts/0X-NAME.md in a new session.
```

---

## 0.9 Final reminder (CRITICAL)

> **Before writing a single line of code, open the browser (WebSearch/WebFetch) and verify the current APIs and versions of the libraries you'll use.** The model's knowledge can be stale. Official docs > tutorials > blog posts. If an API changed, adapt the code to the current state of May 2026.

When you finish a phase, **tell me what you researched**. That transparency helps Garcia trust the code.

---

## 0.10 Quality & depth directive (READ CAREFULLY — NON-NEGOTIABLE)

> **This is the most important section of this entire document.** Garcia has been burned by AI tools that ship fast and shallow. He values depth over speed, always.

### The rules

1. **This phase is NOT a race.** Don't deliver in 3-5 minutes after receiving the prompt. A real phase reasonably takes 30 minutes to 3 hours depending on complexity. **Use the full context window if you need it.** Garcia would rather wait 2 hours and get production-quality code than wait 5 minutes and get something he has to refactor immediately.

2. **Research exhaustively before coding.**
   - WebSearch the official docs of every library/API/CLI you'll touch
   - Read at least 2 independent sources for non-trivial decisions
   - Check the GitHub issues of the library for known gotchas (`<repo>/issues?q=is:open <topic>`)
   - If an API looks ambiguous, read the actual source code of the dependency
   - When you find conflicting info between sources, dig until you know which is right

3. **Plan in writing first.** Before writing code, output a detailed TODO list with sub-tasks (not just bullet points — include acceptance criteria for each). Update it as you progress. The user should see your plan and your progress.

4. **Build incrementally with verification.** After every meaningful change:
   - `pnpm typecheck` → must pass
   - `pnpm build` → must pass
   - `pnpm test` → must pass (if tests exist for this area)
   - If something breaks: **FIX IT before moving on**. Never leave the repo in a broken state.
   - If you can't fix it: stop, report the error, ask Garcia.

5. **Iterate on quality, not just correctness.** A working POC is NOT production code. Once the feature works, do a second pass:
   - Edge cases (empty states, errors, slow networks, race conditions)
   - Error handling (every async fn that can fail must be handled)
   - Accessibility (labels, aria, focus order, contrast)
   - Performance (N+1 queries, unnecessary client components, image sizes)
   - Code duplication (extract common logic)
   - Naming (no `data`, `info`, `temp` — name things by what they mean)

6. **Refactor shadcn defaults aggressively.** Generic-looking shadcn output IS the failure mode. Every shadcn component you use must be re-styled with editorial tokens (no rounded corners, no soft shadows, mono-eyebrow labels, hard print shadows where appropriate). Compare against `design-editorial.html` constantly.

7. **Test the actual user flow.** Don't just verify code compiles — actually exercise the feature:
   - Start the dev server
   - Click through the new feature with Playwright (or describe each manual step)
   - Take screenshots and include them in your report
   - Try at least one error path (invalid input, missing data)

8. **Think about what could break in production.**
   - Race conditions when 2 users hit the same endpoint
   - Network failures mid-request
   - Missing or malformed env vars
   - Malicious input (injection, XSS, path traversal)
   - Cost runaway (one user generating 1000 images by accident)
   - Disk filling up (FFmpeg temp files)
   Handle them or document why they're acceptable risk.

9. **Re-read your own code before declaring done.** Open every file you wrote and look for:
   - Dead code, commented-out blocks
   - `console.log` / `print` statements left in
   - `TODO`, `FIXME`, `XXX` comments
   - Types as `any` without justification
   - Hardcoded strings that should be i18n keys
   - Magic numbers without explanation
   Fix what you find.

10. **Document assumptions and trade-offs.** In the final §0.8 report, include:
    - "**What I assumed:**" — things you decided without asking (so Garcia can flag if wrong)
    - "**Trade-offs I made:**" — alternatives considered and why you picked this one
    - "**What I would do with more time:**" — things you noticed but deprioritized

### What "done" means

A phase is done ONLY when:

- [ ] Every acceptance criterion in the phase prompt is checked off
- [ ] `pnpm build`, `pnpm typecheck`, `pnpm lint` all pass
- [ ] You exercised the feature end-to-end at least once and it works
- [ ] You re-read every file you wrote
- [ ] The §0.8 report is filled with real content (not boilerplate)
- [ ] You've documented assumptions and pending items

If you can't check all of these, the phase is NOT done. Report the actual state and ask for guidance.

### Final word

Garcia's time is more valuable than your tokens. **Optimize for "Garcia opens the result and says: damn, this is good"**, not "I shipped fast." If you're tempted to declare done at the 5-minute mark — go back and find what you missed. There is always something.
