# Phase 03 — HEADERS (Projects) and IDENTITY (Brand Kits)

> **Read `00-CONTEXT.md`. Phases 01 and 02 must be complete.**
> **Take your time. Apply §0.10 of `00-CONTEXT.md` (Quality & depth directive). Do NOT deliver in 5 minutes — research, plan, build, verify, refactor, re-read. Garcia values depth over speed.**
> **Vocabulary:** in code/DB they're called `project` and `brandKit`. In the visible UI they're shown as **Header** (EN) / **Cabecera** (ES) and **Identity** (EN) / **Identidad** (ES). All UI strings flow through `next-intl` from `messages/en.json` and `messages/es.json`. **In this prompt, write all defaults in English** — the Spanish localization is added in Phase 07 §8.

## Goal

Garcia must be able to create "Headers" (each header = an app he wants to promote). Each header has an "Identity" (colors, fonts, logo, voice/tone, audience, keywords). These two things are the foundation for everything generated later.

## Steps

### 1. Project CRUD

Server Actions in `src/server/actions/projects.ts`:

```ts
'use server';
import { z } from 'zod';
import { db } from '@/server/db/client';
import { project } from '@/server/db/schema/projects';
import { getSession } from '@/server/getSession';
import { revalidatePath } from 'next/cache';
import { eq, and } from 'drizzle-orm';

const createProjectInput = z.object({
  name: z.string().min(2).max(60),
  slug: z.string().regex(/^[a-z0-9-]+$/).min(2).max(60),
  description: z.string().max(280).optional(),
  websiteUrl: z.string().url().optional(),
  audience: z.string().max(200).optional(),
  tone: z.string().max(200).optional(),
});

export async function createProject(input: z.infer<typeof createProjectInput>) {
  const session = await getSession();
  if (!session) return { ok: false as const, error: 'unauthenticated' };
  const parsed = createProjectInput.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.format() };
  const [row] = await db.insert(project).values({ ...parsed.data, userId: session.user.id }).returning();
  revalidatePath('/app');
  return { ok: true as const, data: row };
}
// + updateProject, archiveProject, listProjects, getProjectBySlug
```

All queries MUST filter by session `userId` — never trust the id sent from the client.

### 2. UI — list and creation (editorial style)

**`/app` ("Editor's desk" / "Mesa de edición" via i18n)** — layout with editorial sidebar.

Persistent sidebar in `src/components/app/sidebar.tsx` (keep the look from the landing's editor mock):
- Small masthead at top with `reachy` in Fraunces
- Section `— HEADERS` (mono-eyebrow) with numbered list (`01 SaaS Tracker`, `02 HabitForge`, …) in Fraunces 14px. Active header in accent color.
- Ghost button `+ NEW HEADER` (mono-eyebrow uppercase, no radius)
- Section `— THIS EDITION` with pieces like `› Cover`, `› Carousel`, etc.
- Sections `— ARCHIVE`, `— CALENDAR`, `— SETTINGS`
- Avatar at the bottom with dropdown (logout, settings; **no theme toggle**, no dark mode)

**No radius on any sidebar element. 1px ink border as divider between sections.**

**`/app/projects/new`** — editorial form:
- Each field is a `<label class="mono-eyebrow">` on top + input with border-bottom 1px ink (using the `.field` style from 00-CONTEXT)
- Fields: Name, Slug (auto-generated), Description (max 280), URL, Audience, Tone
- Submit: `<BtnInk>` "Create header"
- No bordered cards wrapping the form — just whitespace and rules

**`/app/projects/[slug]`** — header view, "magazine issue" style:
- Header: header name in large Fraunces, with eyebrow "CURRENT EDITION · MAY 2026"
- Editorial tabs (not shadcn default — refactor): `Overview · Identity · Archive`
- Overview: 3 columns with large display numbers ("38 pieces · 3 queued · $4.21 month")

### 3. Identity (Brand Kit) — editorial UI

`/app/projects/[slug]/identity` must allow:

**Colors** — color pickers (use `react-colorful` or `<input type="color">`). Fields:
- Primary, Secondary, Accent, Background

**Fonts** — selector from Google Fonts. Load list via API or hardcode the 50 most popular. Live preview.

**Logo** — uploader. Uploads directly to R2 (we finish this in Phase 04; for now to local `/public/uploads/`). Preview.

**Voice & tone** — fields:
- General tone (tags: friendly, technical, direct, playful…)
- "Do say" — examples
- "Don't say" — banned words
- Keywords — product keywords

**Audience** — textarea placeholder example: "Latin American indie hackers shipping their first SaaS, technical but not obsessed with code…"

**Active languages** — checkboxes ES / EN (Spanish on by default — Reachy's primary market).

Everything saves via autosave (600ms debounce) using a Server Action `updateBrandKit`.

### 4. Reusable component: BrandPreview

`src/components/app/brand-preview.tsx` that, given a brandKit, renders:
- A "post-style card" with the logo, colors, and font applied
- A mini-mockup of how an Instagram post would look

This gives Garcia visual feedback while editing.

### 5. Beautiful empty states

If no projects: simple SVG illustration + CTA "Create your first header". Same pattern if no brand kit configured in a project.

### 6. Toasts and errors

Use `sonner` (already installed via shadcn). Each successful Server Action → green toast. Error → destructive toast with clear message.

## Acceptance criteria

- [ ] I can create a header from `/app/projects/new`
- [ ] It appears in the sidebar instantly (revalidatePath works)
- [ ] I can edit the Identity and it saves automatically (autosave)
- [ ] BrandPreview updates live as I edit
- [ ] Validation: I can't create 2 headers with the same slug
- [ ] Another user can NOT see my headers (verify with 2 accounts)
- [ ] `pnpm build` and `pnpm typecheck` ✅

## Verification

Create 2 test headers with different brand kits. Take a screenshot of the sidebar showing both, and a screenshot of a complete brand kit.

## Expected output

Report §0.8 + next phase: **04-IMAGE-GENERATION.md**
