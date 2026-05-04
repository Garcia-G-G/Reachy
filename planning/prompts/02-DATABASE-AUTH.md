# Phase 02 — DATABASE + AUTH

> **Read `00-CONTEXT.md` first and verify Phase 01 is complete.**
> **Take your time. Apply §0.10 of `00-CONTEXT.md` (Quality & depth directive). Do NOT deliver in 5 minutes — research, plan, build, verify, refactor, re-read. Garcia values depth over speed.**

## Goal

Set up Drizzle ORM with PostgreSQL, define the base schema (users, sessions, projects, brand_kits, generations, assets), and wire up authentication with `better-auth` (email magic link + Google OAuth). At the end, you should be able to:
- Sign up via magic link
- Log in with Google
- Visit a protected `/app` page that shows the user's email

## Prior research (mandatory)
WebSearch:
- Official **better-auth** docs (May 2026) — current version, Next.js App Router init, server-side `auth()` helpers
- Drizzle ORM with Postgres — current `drizzle-kit` commands (push vs migrate)
- **Resend** node SDK current version for sending magic links

Report any difference vs. what this prompt assumes.

## Steps

### 1. Install dependencies

```bash
pnpm add drizzle-orm postgres better-auth resend
pnpm add -D drizzle-kit
```

### 2. DB connection

`src/server/db/client.ts`:
```ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '@/env';

const queryClient = postgres(env.DATABASE_URL);
export const db = drizzle(queryClient);
```

`drizzle.config.ts`:
```ts
import { defineConfig } from 'drizzle-kit';
import { env } from './src/env';

export default defineConfig({
  schema: './src/server/db/schema/*',
  out: './src/server/db/migrations',
  dialect: 'postgresql',
  dbCredentials: { url: env.DATABASE_URL },
});
```

Scripts:
```json
"db:generate": "drizzle-kit generate",
"db:migrate": "drizzle-kit migrate",
"db:studio": "drizzle-kit studio"
```

### 3. Schema (Drizzle)

Create separate files in `src/server/db/schema/`:

**`auth.ts`** — tables better-auth needs (check its docs for the exact shape, may have changed):
- `user` (id, name, email, emailVerified, image, createdAt, updatedAt)
- `session` (id, userId, token, expiresAt, ...)
- `account` (OAuth providers)
- `verification` (magic link tokens)

**`projects.ts`**:
```ts
import { pgTable, text, timestamp, uuid, jsonb } from 'drizzle-orm/pg-core';
import { user } from './auth';

export const project = pgTable('project', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  description: text('description'),
  websiteUrl: text('website_url'),
  audience: text('audience'),
  tone: text('tone'),
  archived: timestamp('archived'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
```

**`brandKits.ts`**:
```ts
export const brandKit = pgTable('brand_kit', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => project.id, { onDelete: 'cascade' }),
  primaryColor: text('primary_color'),
  secondaryColor: text('secondary_color'),
  accentColor: text('accent_color'),
  bgColor: text('bg_color'),
  fontHeading: text('font_heading'),
  fontBody: text('font_body'),
  logoUrl: text('logo_url'),
  voice: jsonb('voice').$type<{ tone: string; doNot: string[]; examples: string[] }>(),
  keywords: jsonb('keywords').$type<string[]>().default([]),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
```

**`generations.ts`** (records of each AI generation):
```ts
export const generation = pgTable('generation', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => project.id, { onDelete: 'cascade' }),
  type: text('type', { enum: ['image','copy','video'] }).notNull(),
  format: text('format').notNull(), // 'hero', 'og', 'reel', 'post-ig', ...
  status: text('status', { enum: ['queued','running','done','failed'] }).notNull().default('queued'),
  provider: text('provider'),       // 'openai' | 'fal' | 'ffmpeg'
  model: text('model'),             // 'gpt-image-1' | 'fal-ai/flux-pro' | ...
  prompt: text('prompt'),
  params: jsonb('params'),
  costCents: text('cost_cents'),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  finishedAt: timestamp('finished_at'),
});
```

**`assets.ts`** (outputs stored in R2):
```ts
export const asset = pgTable('asset', {
  id: uuid('id').primaryKey().defaultRandom(),
  generationId: uuid('generation_id').references(() => generation.id, { onDelete: 'set null' }),
  projectId: uuid('project_id').notNull().references(() => project.id, { onDelete: 'cascade' }),
  kind: text('kind', { enum: ['image','video','copy'] }).notNull(),
  format: text('format'),
  width: integer('width'),
  height: integer('height'),
  durationSec: integer('duration_sec'),
  language: text('language'),       // 'es' | 'en'
  text: text('text'),                // for copy
  storageKey: text('storage_key'),   // path in R2
  publicUrl: text('public_url'),
  bytes: integer('bytes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

Generate and apply migrations:
```bash
pnpm db:generate
pnpm db:migrate
```

### 4. Configure better-auth

`src/server/auth.ts`:
```ts
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from './db/client';
import { env } from '@/env';
import * as schema from './db/schema/auth';

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'pg', schema }),
  emailAndPassword: { enabled: false }, // magic + OAuth only
  socialProviders: {
    google: {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    },
  },
  // magic link plugin — verify current name in docs
});
```

Route handler `src/app/api/auth/[...all]/route.ts`:
```ts
import { auth } from '@/server/auth';
import { toNextJsHandler } from 'better-auth/next-js';
export const { POST, GET } = toNextJsHandler(auth);
```

### 5. Magic link via Resend

Configure the sender in better-auth to use Resend (`resend.emails.send`). The template must include:
- Reachy logo (text mark in Fraunces is fine for now)
- One-line greeting: "Sign in to Reachy" (English default). Spanish key: "Accede a Reachy". Pick language from user's `Accept-Language` or stored preference.
- Button with the magic link
- Editorial tone — no SaaS marketing fluff. Plain text first, HTML optional.

### 6. Protection middleware

`src/middleware.ts`:
```ts
import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/server/auth';

export async function middleware(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  const isAppRoute = req.nextUrl.pathname.startsWith('/app');
  if (isAppRoute && !session) {
    const url = new URL('/login', req.url);
    url.searchParams.set('next', req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ['/app/:path*'] };
```

### 7. Minimum pages

- `/login` — editorial design: masthead at top, content centered max-w-sm, no bordered card (just whitespace + rules). Eyebrow `№ 01 — Sign in`, H2 in Fraunces "Step into your editor's desk.", email input with border-bottom 1px ink (no border-radius), `<BtnInk>` "Send magic link", divider with mono `or`, ghost button "Continue with Google". (All strings via `next-intl`.)
- `/app` — protected layout with editorial sidebar (mock-style from the landing — see `design-editorial.html`). Empty main saying "Welcome, {email}" in large Fraunces.
- `/app/layout.tsx` — persistent sidebar with border-right 1px ink, sections `— HEADERS` and `— THIS EDITION` with mono-eyebrow uppercase. Mobile: shadcn Sheet with override (no radius).

### 8. Server-side session helper

`src/server/getSession.ts`:
```ts
import { headers } from 'next/headers';
import { auth } from './auth';
export async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}
```

## Acceptance criteria

- [ ] `pnpm db:generate` creates migrations without warnings
- [ ] `pnpm db:migrate` applies all
- [ ] `pnpm db:studio` opens Drizzle Studio and shows all tables
- [ ] I can sign up with magic link (check Resend dashboard if in sandbox)
- [ ] I can log in with Google
- [ ] Hitting `/app` without session redirects to `/login?next=/app`
- [ ] Hitting `/app` with session shows my email
- [ ] `pnpm build` ✅

## Verification

Smoke test with Playwright or curl:
1. GET /login → 200
2. GET /app → 302 to /login
3. Create session, GET /app → 200 + contains email

## Expected output

Report §0.8 + next phase: **03-PROJECTS-BRAND-KITS.md**
