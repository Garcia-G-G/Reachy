# Prompts for Claude Code Max — Reachy

This folder contains step-by-step prompts to build the app. **Garcia copies the contents of the current phase file and pastes it in a new Claude Code Max session.**

## How to use them

1. **Always include `00-CONTEXT.md` in every session.** It's the master file: stack, rules, design system, folder structure, quality criteria. Paste its contents at the start of every Claude Code Max conversation.
2. Then paste the file for the current phase (`01-SCAFFOLD.md`, `02-...`, etc.).
3. End with: *"Proceed. Before implementing, research current APIs and versions with WebSearch."*
4. When done, Claude Code Max returns a §0.8-style report. Save it in this folder as `XX-REPORT.md` for history.

## Phase order

| # | File | What it builds |
|---|------|---------------|
| 00 | `00-CONTEXT.md` | Master context — read first always |
| 01 | `01-SCAFFOLD.md` | Next.js 15 + Tailwind v4 + shadcn + Drizzle + Biome |
| 02 | `02-DATABASE-AUTH.md` | DB schema + better-auth (magic + Google) |
| 03 | `03-PROJECTS-BRAND-KITS.md` | Multi-project with rich brand kits |
| 04 | `04-IMAGE-GENERATION.md` | OpenAI gpt-image-1 + fal.ai (FLUX, Recraft) + R2 + BullMQ |
| 05 | `05-COPY-GENERATION.md` | Bilingual ES/EN copy with structured outputs |
| 06 | `06-VIDEO-FFMPEG.md` | 9:16 reels with FFmpeg + optional Veo 3.1 |
| 07 | `07-LANDING.md` | Public landing + onboarding |
| 08 | `08-DEPLOY-HETZNER.md` | Production on Hetzner + Cloudflare + R2 |

## Before starting

- Product name: **Reachy** (already replaced in all files).
- Fill the necessary API keys in a `.env.local` before Phase 02 (`OPENAI_API_KEY`, `FAL_KEY`, `RESEND_API_KEY`, `GOOGLE_CLIENT_ID/SECRET`).
- Have Docker Desktop, Node 22 LTS, and pnpm 9+ installed.

## Note on language

- **Prompts are in English** (Claude Code Max performs better with English instructions).
- **The product UI is bilingual ES/EN** — Spanish is the default and primary market. UI labels (Cabecera, Identidad, Edición, Pieza) stay in Spanish.
- **Garcia speaks Spanish** with the Cowork agent helping coordinate. The LAUNCH.md guide and PROJECT_MEMORY.md are in Spanish for him.

## Golden rules for Claude Code Max

These rules live inside `00-CONTEXT.md` but they're worth repeating:

1. **Research the web before coding.** May 2026 versions win, not the model's memory.
2. **Don't invent APIs.** If a library changed, adapt. If unsure, ask.
3. **Small and verified** > big and broken. After every change: `pnpm build` + `pnpm test`.
4. **Report what you did and what you assumed.** Total transparency.

## Stack changes

If you ever decide to swap a 00 decision (e.g. switch BullMQ to Inngest), update it there and commit with `chore(context): switch X to Y`. Never let the 00 lie.
