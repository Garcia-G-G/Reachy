# Session log

A chronological record of what each working session produced. Read this from the bottom up to see how the project got to its current state. New sessions append at the top.

---

## 2026-05-04 — Session 01 · Phase 01 SCAFFOLD

**Outcome:** Phase 01 complete. Repo bootstrapped, builds clean, design-editorial.html replicated as the welcome page.

### Decisions locked this session

- **Next.js 16.2.4** chosen over Next.js 15.5.15 ("use the latest stable"). 00-CONTEXT.md still says Next 15 in §0.3 — leave it; the in-repo lockfile is the truth.
- **Single repo at `~/Documents/reachy/`** (not split between `MarKetOL/` planning and `~/code/reachy/` code). Planning artifacts moved into `planning/` subdirectory.
- **Tailwind v4 pinned to 4.2.x** (avoid 4.1.18 — Turbopack build break, GitHub vercel/next.js#88443).
- **shadcn CLI v4** — uses `@base-ui/react` (post-Radix), OKLCH by default. Editorial palette (`--paper`, `--ink`, `--accent`, etc.) is the source of truth in `:root`; shadcn vars (`--background`, `--primary`, etc.) alias to it. All radii forced to 0; `.dark` block removed.
- **No AI attribution** in any commit or PR going forward.
- **Conversation language is English**, even though some planning docs say Spanish.

### Commits (newest first)

```
2fff438  docs(planning): import phase prompts and project memory
d730321  feat(welcome): editorial home page replicating the design reference
c801c13  feat(design): editorial theme tokens, four-font stack, design-system primitives
3091ec8  feat(ui): install shadcn v4 component primitives
e4e80e8  feat(env): boot-time env validation and local Postgres + Redis stack
145807c  chore: scaffold Next 16 + Tailwind v4 + Biome with strict TypeScript
894f5dc  Initial commit from Create Next App
```

### Verification at session end

- `pnpm typecheck`, `pnpm lint`, `pnpm build` — all green
- `pnpm db:up` — Postgres 16 + Redis 7 healthy
- `src/env.ts` confirmed to crash with readable error on missing required vars
- Playwright screenshots captured at `docs/screenshots/welcome-{desktop,mobile}.png`

### Pinned versions

`next@16.2.4` · `react@19.2.4` · `tailwindcss@4.2.4` · `@biomejs/biome@2.4.14` · `shadcn@4.6.0` · `zod@4.4.3` · `@base-ui/react@1.4.1`

### Carry-over for next session (Phase 02 — DATABASE-AUTH)

**API keys to have ready before pasting the Phase 02 prompt:**

- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` — create at <https://console.cloud.google.com/apis/credentials>. Authorized redirect URI: `http://localhost:3000/api/auth/callback/google`
- `RESEND_API_KEY` — get at <https://resend.com/api-keys>
- `EMAIL_FROM` — an address you control (e.g. `hello@yourdomain.com`)

The keys go into `.env.local` (already has placeholder lines marked with `TODO:`).

**Pending tech debt to address as we go (not blockers):**

- shadcn UI components in `src/components/ui/` still ship default styles (rounded corners, soft shadows). Refactor each one in the phase that first uses it.
- `@types/node` is `^20`; Node 25 is installed locally. Bump to `^22`/`^24` in Phase 02 cleanup.
- `sharp` and `unrs-resolver` build scripts blocked by pnpm 10. Run `pnpm approve-builds` and approve `sharp` if image-pipeline speed becomes relevant in Phase 04.

### How to resume

1. Open `~/Documents/reachy/` in your editor.
2. Confirm containers are still up: `docker ps --filter "name=reachy"`. If not: `pnpm db:up`.
3. Open Claude Code in the repo root.
4. Paste `planning/prompts/00-CONTEXT.md` + `planning/prompts/02-DATABASE-AUTH.md`.
5. The in-Claude memory will auto-load this session's context (project status, version pins, decisions, your preferences). You shouldn't need to re-explain anything.
