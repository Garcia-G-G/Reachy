# Reachy — Autopilot mode (drop a file/folder, get a full campaign)

> Attach `planning/prompts/00-CONTEXT.md`. Apply §0.10. This is a NEW feature, not a fix. Major surface: ingestion → extraction → planning → bulk generation. Approve scope before refactoring existing flows.

## The user story

Garcia drops `FeedbackMind_Portfolio_Garcia.docx` (or a folder with README + screenshots + landing copy + code-tree dump) into Reachy. He doesn't fill out a brand kit, doesn't write idea briefs, doesn't pick layouts. Reachy:

1. Parses the input.
2. Extracts a structured ProductBrief (name, problem, solution, features, audience, tone, tech, value props, palette suggestion from any embedded images).
3. Auto-populates the project + brand kit.
4. Generates a "campaign plan" — a recommended slate of assets per channel (IG posts, LinkedIn long-form, X thread, email pitch, OG cards, reel script, blog post outline).
5. Garcia approves/tweaks the plan.
6. Reachy bulk-generates everything and shows a gallery organized by channel.

End state: 5 minutes from drop to ~20 ready-to-post assets that are on-brand and product-specific.

A sample input is at `/Users/go/Documents/reachy/planning/sample-inputs/FeedbackMind_Portfolio_Garcia.docx` (Garcia uploaded it — copy it there for testing). Use it as the canonical first test case.

## Architecture overview

```
[Upload zone] → [Parser]      → ProductBrief (LLM extraction)
                                       ↓
                             [Brand kit autofill] (palette + voice from doc)
                                       ↓
                             [Campaign planner LLM] → CampaignPlan[]
                                       ↓
                             [Approval UI]  ← user edits / removes assets
                                       ↓
                             [Bulk generator] → fan-out to existing pipelines
                                       ↓
                             [Results gallery] (grouped by channel)
```

## Tasks

### 1. Upload zone

New page `src/app/app/projects/new-from-upload/page.tsx`:
- Big drop zone (full-width, centered, editorial). Accepts:
  - Single file: `.docx`, `.pdf`, `.md`, `.txt`, `.html`
  - Folder: via `<input webkitdirectory>` — recursively reads supported types
  - Zip: extracted server-side
  - Images: `.png/.jpg/.webp` — passed to gpt-4o vision for visual context
- Below the zone: "Or paste text" textarea (when no doc available).
- Submit → uploads to R2 under `uploads/{userId}/{uploadId}/...`, then enqueues an `ingestion` job.
- Redirect to `/app/projects/new-from-upload/[ingestionId]/review` (the approval page).

### 2. Parsers

`src/server/ingest/parsers/`:
- `docx.ts` — use `mammoth` (already noted in artifact deps; install for server-side: `pnpm add mammoth`). Returns plain text + a list of embedded image buffers + headings hierarchy.
- `pdf.ts` — `pdf-parse` (Node-friendly). Returns plain text + per-page text + embedded image extraction via `pdfjs-dist` (optional).
- `markdown.ts` — `gray-matter` for frontmatter + `marked` AST → flatten to text + headings.
- `html.ts` — `cheerio` strip tags → text + img srcs.
- `text.ts` — pass-through.
- `image.ts` — pass to vision LLM, returns descriptive caption + dominant palette (sharp `.stats()` per channel → 3 dominant hex values).
- `zip.ts` — `adm-zip` extract → recurse on contents.

Aggregated output: `IngestedBundle = { textBlocks: TextBlock[], images: ImageRef[], headings: Heading[] }` where each TextBlock retains source filename + position so the LLM can cite.

### 3. ProductBrief extractor

`src/server/ingest/extractBrief.ts`:
- Input: `IngestedBundle`.
- LLM call: gpt-4o (structured output, JSON schema):
  ```ts
  {
    name: string,
    oneLiner: string,                  // <= 90 chars
    problem: string,                   // 1-3 sentences
    solution: string,                  // 1-3 sentences
    features: { name: string, verb: string, value: string }[],  // 5-10
    audience: { role: string, painPoint: string },              // 1-3
    tone: 'editorial' | 'playful' | 'technical' | 'enterprise' | 'indie',
    techStack: string[],               // when applicable
    valueProps: string[],              // 3-5 short statements
    paletteHex: { ink: string, paper: string, accent: string },  // suggested
    languages: ('en' | 'es')[],        // detected
    referenceImages: string[],         // R2 keys of embedded images worth using as visual ref
    confidence: number,                // 0-1, how confident the extractor is in the brief
  }
  ```
- Cost surfaced: ~5-10¢ per call depending on doc size.

### 4. Brand kit autofill

`src/server/ingest/autoBrandKit.ts`:
- Takes `ProductBrief` + the project the user is creating.
- Creates the project (name, audience as `JSON.stringify(brief.audience)`, tone).
- Creates the brand kit (paletteHex, languages, voice from `tone`).
- Stores reference images in `brandKit.referenceAssetKeys` (new column — JSON array of R2 keys).
- All defaults applied — user can edit on the next step if they want.

Add a `brandKit.referenceAssetKeys: jsonb DEFAULT '[]'` migration.

### 5. Campaign planner

`src/server/ingest/planCampaign.ts`:
- Input: `ProductBrief`.
- LLM call: returns a structured `CampaignPlan = { assets: PlannedAsset[] }`:
  ```ts
  type PlannedAsset =
    | { kind: 'image'; format: ImageFormat; layoutId: LayoutId; brief: string; visualStyle: VisualStyleKey }
    | { kind: 'copy'; channel: 'linkedin-post'|'x-thread'|'instagram-caption'|'email-pitch'|'blog-outline'; brief: string }
    | { kind: 'reel'; durationSec: 8 | 12 | 25; brief: string; visualStyle: VisualStyleKey }
  ```
- Default plan for a SaaS portfolio (like FeedbackMind): ~20 assets — 8 images (hero IG, 4 feature carousels, OG, email header, X header), 6 copy (LinkedIn announcement, X launch thread, IG caption × 2, email pitch, blog outline), 1 reel (25s feature walkthrough).
- LLM has a system prompt that explains Reachy's existing pipeline — what formats/layouts/styles are available, what's good for which channel — so it picks intelligently per the brief's tone + audience.
- Output cost: ~3¢.

### 6. Approval UI

`src/app/app/projects/new-from-upload/[ingestionId]/review/page.tsx`:

```
┌─────────────────────────────────────────────────┐
│ FeedbackMind                              edit  │  ← extracted name, click to edit
│ Multi-Tenant SaaS Platform for...         edit  │  ← oneLiner
├─────────────────────────────────────────────────┤
│ Brand kit                                       │
│ palette: ●ink ●paper ●accent       edit colors  │
│ tone: editorial                    change tone  │
│ languages: en                      add language │
├─────────────────────────────────────────────────┤
│ Campaign plan — 20 assets                       │
│                                                 │
│ ☑ Hero IG post · 1080×1350 · editorial-collage  │
│   "Production SaaS for PMs who drown in..."     │
│   [edit brief] [skip]                           │
│                                                 │
│ ☑ LinkedIn announcement · 600 words             │
│   "Just shipped FeedbackMind — here's what..."  │
│   [edit brief] [skip]                           │
│                                                 │
│ ... (18 more, scrollable)                       │
│                                                 │
│ Total cost estimate: $4.20 · ~6 minutes         │
│ [APPROVE & GENERATE ALL] [skip a few]           │
└─────────────────────────────────────────────────┘
```

Inline edits hot-update the plan in memory. Skipping removes from the bulk job.

### 7. Bulk generator

`src/server/jobs/campaignWorker.ts` — new BullMQ worker:
- Receives `{ ingestionId, projectId, plan: PlannedAsset[] }`.
- For each `PlannedAsset`:
  - `image` → enqueue an existing image-gen job with the brief, format, layout, style. Pass brand kit ref images for coherence.
  - `copy` → call gpt-4o with a channel-specific copy planner (new file `src/server/ai/channelCopy.ts` — handles LinkedIn vs X vs email vs blog format).
  - `reel` → enqueue an existing reel job with the brief.
- Persists each output in a new `campaignAsset` table linking back to the campaign.
- Streams progress to the results page via the existing polling mechanism.

Concurrency: cap at 3 in-flight image jobs to keep OpenAI rate limits happy. Reels go serial (Sora is slow).

### 8. Results gallery

`src/app/app/projects/[slug]/campaigns/[campaignId]/page.tsx`:
- Grouped by channel: Images (subgroup by format), Copy (subgroup by channel), Reels.
- Each asset has the same per-asset toolbar as the editor (regenerate, edit copy, more like this, download).
- Bulk download as ZIP (one folder per channel).
- "Run again with same plan" button.

### 9. Project list integration

The project list page surfaces the latest campaign per project. Click → opens that campaign's gallery.

## Schema changes

```sql
-- New table
campaign (
  id uuid pk,
  projectId uuid fk,
  ingestionId uuid,
  status text,            -- 'planning' | 'awaiting_approval' | 'running' | 'done' | 'failed'
  brief jsonb,            -- the ProductBrief
  plan jsonb,             -- the CampaignPlan
  costCentsActual int,
  createdAt timestamptz
)

campaignAsset (
  id uuid pk,
  campaignId uuid fk,
  kind text,              -- 'image' | 'copy' | 'reel'
  channel text,           -- 'linkedin-post' | 'x-thread' | etc.
  generationId uuid,      -- when an existing pipeline ran (image/reel)
  copyOutput text,        -- when kind=copy, the rendered text
  status text,
  costCents int,
  createdAt timestamptz
)

-- Brand kit additions
ALTER TABLE brand_kit ADD COLUMN reference_asset_keys jsonb DEFAULT '[]'::jsonb;
```

Drizzle migrations + types updated.

## Files

Create:
- `src/app/app/projects/new-from-upload/page.tsx`
- `src/app/app/projects/new-from-upload/[ingestionId]/review/page.tsx`
- `src/app/app/projects/[slug]/campaigns/[campaignId]/page.tsx`
- `src/server/ingest/parsers/{docx,pdf,markdown,html,text,image,zip}.ts`
- `src/server/ingest/extractBrief.ts`
- `src/server/ingest/autoBrandKit.ts`
- `src/server/ingest/planCampaign.ts`
- `src/server/jobs/campaignWorker.ts`
- `src/server/ai/channelCopy.ts`
- `src/server/db/schema/campaigns.ts`
- `src/server/actions/campaigns.ts`
- `planning/sample-inputs/FeedbackMind_Portfolio_Garcia.docx` (copy from uploads)

Edit:
- `src/server/db/schema/brandKits.ts` (referenceAssetKeys column)
- `src/app/app/projects/page.tsx` (surface latest campaign)
- `src/server/jobs/worker.ts` (register campaignWorker)

## Dependencies to add

- `mammoth` — docx parsing
- `pdf-parse` — pdf parsing
- `cheerio` — html parsing
- `gray-matter` + `marked` — markdown
- `adm-zip` — zip extraction

Web search latest stable versions before installing.

## Research before implementation

WebSearch:
1. `OpenAI structured output JSON schema gpt-4o May 2026` — confirm the exact API shape for ProductBrief extraction.
2. `mammoth pdf-parse Next.js server side compatibility` — confirm both work with Next 15 server actions.
3. `BullMQ fan-out parent job tracking child job completion` — for the campaign worker progress aggregation.

## Verify

```
pnpm typecheck && pnpm lint && pnpm build
```

Then in `pnpm dev`:
1. Upload `FeedbackMind_Portfolio_Garcia.docx` → review page loads in <30s with extracted brief filled in.
2. Brief shows: name="FeedbackMind", oneLiner mentions multi-tenant SaaS for PMs, features list includes RAG chat / pipeline / loop tracker, palette suggested, tone="technical" or "indie".
3. Campaign plan has ~15-20 assets across image/copy/reel kinds.
4. Approve → bulk generation kicks off, progress streams in.
5. After ~6min, results gallery shows all generated assets organized by channel. Image outputs reference FeedbackMind specifically (not generic). Copy mentions actual features (RAG, pgvector, multi-tenant) where relevant per channel tone.
6. Edit one asset's brief → regenerate just that one without rerunning the whole campaign.

## Done

Reply with:
- Walk-through of the FeedbackMind ingestion: extracted brief JSON + the generated plan + 4 screenshots from the results gallery (1 image, 1 LinkedIn copy, 1 IG caption, 1 reel thumbnail).
- Total cost actual.
- A short note on extraction confidence — did the LLM get the brief right or was it generic?
