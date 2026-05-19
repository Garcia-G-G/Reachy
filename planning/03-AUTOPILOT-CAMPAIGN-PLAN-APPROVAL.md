# 03 — Autopilot · Campaign planner + approval UI

> Attach `planning/prompts/00-CONTEXT.md` AND `planning/02-AUTOPILOT-BRIEF-AUTOFILL.md`. Apply §0.10. **Step 3 of 5**. Depends on Step 2's `ProductBrief` + auto-created project. Output: a `CampaignPlan` persisted + an approval UI where Garcia edits/skips assets before bulk run.

## Goal

Given a product brief, Reachy proposes a slate of marketing assets across channels (image posts, copy for various platforms, reel scripts). Garcia reviews on a dedicated page, can edit any asset's brief inline, can skip individual assets, sees the cost estimate, and approves the run. Approval kicks off Step 4's bulk worker.

## Anti-hardcode rule

The planner's system prompt is built from runtime context — what formats Reachy supports, what layouts exist, what styles are configured. None of that is a static list in the prompt — it's read from the existing catalogs (`IMAGE_FORMATS`, layout registry, visualStyles) and serialized at call time.

Channel templates (LinkedIn vs X vs IG vs email) live in `src/server/config/channelTemplates.ts` — typed constants with comments. Their FORMAT (sizes, length caps, tone hints) is config; their CONTENT is always derived from the brief.

## Tasks

### 3.1 Campaign planner LLM

`src/server/ingest/planCampaign.ts`:

```ts
type PlannedAsset =
  | { kind: 'image'; format: ImageFormat; layoutId: LayoutId; visualStyle: VisualStyleKey; brief: string; }
  | { kind: 'copy'; channel: ChannelKey; brief: string; targetWordCount?: number; }
  | { kind: 'reel'; durationSec: 8 | 12 | 25; visualStyle: VisualStyleKey; brief: string; }

type CampaignPlan = {
  assets: PlannedAsset[];
  rationale: string;             // 2-3 sentences explaining the slate strategy
  estimatedCostCents: number;
  estimatedDurationMinutes: number;
};
```

Implementation:
- LLM: gpt-4o (or gpt-5 if GA), structured output.
- System prompt is BUILT at runtime by serializing the available catalogs:
  - "Available image formats: [list from IMAGE_FORMATS keys + their dimensions]"
  - "Available image layouts: [list from layout registry]"
  - "Available visual styles: [list from visualStyles]"
  - "Available copy channels: [list from channelTemplates]"
  - "Available reel durations: [list from reel-cost.ts]"
- User prompt includes the full ProductBrief + a target slate size hint from `src/server/config/defaultSlateSize.ts` (default ~15-20 assets, configurable).
- Planner instruction: "Pick assets that COVER the brief's surface — hero, features, social, email. Don't repeat the same format. Match each asset's brief to the brand's tone + audience. Use real product names + features from the brief, not generic placeholder copy."

Cost: ~3¢ per planning call.

### 3.2 Channel templates config

`src/server/config/channelTemplates.ts`:

```ts
export type ChannelKey =
  | 'linkedin-post-long'
  | 'linkedin-post-short'
  | 'x-thread'
  | 'instagram-caption'
  | 'email-pitch-cold'
  | 'email-pitch-warm'
  | 'blog-outline'
  | 'press-release-short';

type ChannelSpec = {
  key: ChannelKey;
  label: string;
  targetWordCount: number;
  toneHints: string[];
  structureHints: string[];
};

export const CHANNEL_TEMPLATES: Record<ChannelKey, ChannelSpec> = { ... };
```

Comments explain why each constant cannot be derived (it IS the spec — the source of truth).

### 3.3 Approval UI

`src/app/app/projects/new-from-upload/[ingestionId]/review/page.tsx`:

Layout (editorial styling, full-width):

```
┌─────────────────────────────────────────────────┐
│ FeedbackMind                              edit  │
│ Multi-Tenant SaaS Platform for...         edit  │
├─────────────────────────────────────────────────┤
│ Brand kit                                       │
│ palette: ●ink ●paper ●accent       edit colors  │
│ tone: technical                    change tone  │
│ languages: en  +  add ES                        │
│ allows humans: ☑                                │
│ quality gate: ☑                                 │
├─────────────────────────────────────────────────┤
│ Campaign plan — 18 assets                       │
│                                                 │
│ ┌─────────────────────────────────────────────┐ │
│ │ ☑ Hero IG post · 1080×1350 · editorial-coll │ │
│ │   "Production SaaS for PMs who drown in fee │ │
│ │   [edit brief] [skip]                       │ │
│ └─────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────┐ │
│ │ ☑ LinkedIn long-form · 600 words            │ │
│ │   "Just shipped FeedbackMind — here's the…" │ │
│ │   [edit brief] [skip]                       │ │
│ └─────────────────────────────────────────────┘ │
│ ... 16 more, scrollable                         │
│                                                 │
│ [+ ADD ASSET]                                   │
│                                                 │
│ Total cost: $4.20 · ~6 minutes                  │
│ [APPROVE & GENERATE ALL]   [SAVE FOR LATER]    │
└─────────────────────────────────────────────────┘
```

Behavior:
- Inline edit on any field: brief textarea, format dropdown (from IMAGE_FORMATS), layout (from layout registry), style (from visualStyles), channel (from CHANNEL_TEMPLATES), reel duration. All driven by catalogs, NOT hardcoded options.
- Skip: removes the asset from the approved set (visual greyed-out, kept in plan for future tweaks).
- "+ Add asset" opens a small modal with the same shape as a plan entry — Garcia can manually add anything the planner missed.
- Cost recomputes on every change.
- "Approve & Generate All" → Step 4's `campaignWorker` enqueue.
- "Save for Later" → persists plan in `campaign.status = 'awaiting_approval'`, can resume later.

### 3.4 Schema

```sql
CREATE TABLE campaign (
  id uuid PRIMARY KEY,
  project_id uuid REFERENCES project(id) ON DELETE CASCADE,
  ingestion_id uuid REFERENCES ingestion(id),
  status text NOT NULL,           -- 'planning' | 'awaiting_approval' | 'running' | 'done' | 'failed'
  brief jsonb,                    -- snapshot of ProductBrief at plan time
  plan jsonb,                     -- CampaignPlan (post-edits)
  cost_cents_estimated int,
  cost_cents_actual int,
  created_at timestamptz DEFAULT now(),
  approved_at timestamptz,
  finished_at timestamptz
);
```

Drizzle migration + types.

### 3.5 Server actions

`src/server/actions/campaigns.ts`:
- `createCampaignFromBrief({ ingestionId, projectId })` — runs the planner, persists campaign in `awaiting_approval` status, returns `campaignId`.
- `updateCampaignPlan({ campaignId, plan })` — saves edits.
- `approveCampaign(campaignId)` — flips status to `running`, enqueues Step 4 worker.

### 3.6 Wiring

After Step 2's `runBriefExtraction` finishes, automatically call `createCampaignFromBrief`. The redirect from the parsing page lands on `/projects/new-from-upload/[ingestionId]/review` once `campaign.status === 'awaiting_approval'`.

## Files

Create:
- `src/server/ingest/planCampaign.ts`
- `src/server/db/schema/campaigns.ts`
- `src/server/actions/campaigns.ts`
- `src/app/app/projects/new-from-upload/[ingestionId]/review/page.tsx`
- `src/components/app/campaign-review.tsx` (the approval UI client component)
- `src/components/app/asset-edit-modal.tsx` (inline edit)
- `src/components/app/asset-add-modal.tsx` (manual add)
- `src/server/config/channelTemplates.ts`
- `src/server/config/defaultSlateSize.ts`

Edit:
- `src/server/jobs/ingestionWorker.ts` (chain into createCampaignFromBrief)

## Verify

```
pnpm typecheck && pnpm lint && pnpm build
```

Then in `pnpm dev`:
1. Upload FeedbackMind doc end-to-end → after parsing + brief extraction, lands on review page automatically. Plan has 15-20 assets covering: 6-8 images, 5-7 copy assets across LinkedIn/X/IG/email, 1-2 reels.
2. Each plan asset's brief mentions FeedbackMind specifics (RAG, multi-tenant, pgvector) where relevant — not generic.
3. Edit one asset's brief inline → save → cost preview updates if format/style changed.
4. Skip 3 assets → cost decreases.
5. Add a new asset manually via "+ Add" → modal lets you pick any format/layout/style from the catalogs.
6. Click "Save for Later" → campaign persists, navigate away and back → review page loads with edits intact.
7. `rg -n '"[^"]{30,}"' src/server/ingest/planCampaign.ts src/server/actions/campaigns.ts` → 0 matches outside `src/server/config/`.

## Done

Reply with:
- The planner's first plan for FeedbackMind (full PlannedAsset[]).
- Cost preview for the unedited plan vs after skipping 3 assets.
- Approval UI screenshot.
- Grep audit (must be 0 outside config/).
