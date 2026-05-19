# 05 — Autopilot · Quality critic loop + results gallery

> Attach `planning/prompts/00-CONTEXT.md` AND `planning/04-AUTOPILOT-BULK-GEN-REEL-RELAX.md`. Apply §0.10. **Step 5 of 5** — final step. Depends on Step 4's `campaignAsset` rows. Output: every asset has a critic score, low-quality ones auto-retry, gallery surfaces results with scoring + per-asset interactivity.

## Goal

"Todo se vea bien" — Garcia's words. Every generated asset gets scored by an LLM critic against a per-kind rubric. Below threshold → auto-retry up to 2x with a hint. Final gallery shows score badges so Garcia trusts the output.

## Anti-hardcode rule

Critic rubrics are NOT inline in the LLM call. They live in `src/server/config/criticRubrics.ts` — typed constants per kind, with comments explaining each weight. The LLM prompt is built from the rubric + the asset context at runtime.

Final grep audit:
```
rg -n '"[^"]{30,}"' src/server/ai/critic.ts src/server/jobs/campaignWorker.ts src/components/app/campaign-gallery.tsx
```

## Tasks

### 5.1 Critic module

`src/server/ai/critic.ts`:

```ts
type AssetCriticResult = {
  score: number;             // 0-10
  passes: boolean;           // score >= threshold
  issues: string[];          // specific complaints
  retryHint?: string;        // injected into next attempt prompt
  rubricBreakdown: Record<string, number>;  // sub-scores
};

export const critic = {
  async image(input: { buffer: Buffer; brief: string; layout: Layout; brandKit: BrandKit }): Promise<AssetCriticResult>;
  async copy(input: { text: string; channel: ChannelKey; brief: string; brandKit: BrandKit }): Promise<AssetCriticResult>;
  async reel(input: { videoR2Key: string; brief: string; brandKit: BrandKit }): Promise<AssetCriticResult>;
};
```

Implementation:
- `critic.image` — gpt-4o vision call with the buffer + the rubric from `criticRubrics.IMAGE`. Returns scored breakdown.
- `critic.copy` — gpt-4o text. Rubric from `criticRubrics.COPY`. Includes language correctness check + cliché blacklist scan from `cliches.ts`.
- `critic.reel` — extract 3 keyframes (existing ffmpeg) + audio waveform stats (peak/rms/clipping). Pass keyframes to gpt-4o vision + audio metadata included in the text prompt. Rubric from `criticRubrics.REEL`.

Threshold from `src/server/config/criticThreshold.ts` (default 7.0/10).

Cost: ~3¢ per critic call. Logged in `campaignAsset.criticCostCents`.

### 5.2 Critic rubrics

`src/server/config/criticRubrics.ts`:

```ts
type RubricCriterion = {
  key: string;
  weight: number;            // sums to 10 across all criteria for the rubric
  description: string;       // sent to the LLM as scoring guidance
};

export const CRITIC_RUBRICS = {
  IMAGE: [
    { key: 'composition', weight: 3, description: '...' },
    { key: 'brand_fidelity', weight: 2, description: '...' },
    { key: 'copy_legibility', weight: 2, description: '...' },
    { key: 'creativity', weight: 2, description: '...' },
    { key: 'language_correctness', weight: 1, description: '...' },
  ],
  COPY: [
    { key: 'on_brief', weight: 3, description: '...' },
    { key: 'tone_match', weight: 2, description: '...' },
    { key: 'no_cliches', weight: 2, description: '...' },
    { key: 'language_correctness', weight: 2, description: '...' },
    { key: 'readable_length', weight: 1, description: '...' },
  ],
  REEL: [
    { key: 'visual_cohesion', weight: 3, description: '...' },
    { key: 'motion_presence', weight: 2, description: '...' },
    { key: 'audio_mix_balance', weight: 2, description: '...' },
    { key: 'brand_fidelity', weight: 2, description: '...' },
    { key: 'no_broken_text', weight: 1, description: '...' },
  ],
};
```

Each `description` is the actual scoring guidance sent to the critic LLM — long but config-justified (THIS is the rubric, the source of truth).

### 5.3 Critic loop in campaign worker

`src/server/jobs/campaignWorker.ts` (extends Step 4):

After each asset's pipeline finishes:
- Call `critic.image/copy/reel(...)` based on kind.
- If `result.passes` → mark `campaignAsset.status = 'done'`, persist `criticScore` + `criticIssues`.
- If `!result.passes && retries < 2` → re-enqueue the same asset with `retryHint` injected into the prompt builder, increment `retries`.
- If `!result.passes && retries === 2` → mark `campaignAsset.status = 'quality_warning'` but keep the asset (don't fail the campaign).
- Skip critic when `brandKit.qualityGateEnabled === false` (cheap exploration mode).

`campaignAsset` schema additions:
```sql
ALTER TABLE campaign_asset ADD COLUMN critic_score numeric(3,1);
ALTER TABLE campaign_asset ADD COLUMN critic_issues jsonb DEFAULT '[]'::jsonb;
ALTER TABLE campaign_asset ADD COLUMN retries_count int DEFAULT 0;
ALTER TABLE campaign_asset ADD COLUMN critic_cost_cents int DEFAULT 0;
ALTER TABLE campaign_asset ADD COLUMN status_detail text;  -- 'quality_warning' | null
```

### 5.4 Smarter planner re-invoke (optional but recommended)

When critic flags ≥3 assets in the same channel as failing the same way (e.g., "copy too generic" across 4 LinkedIn posts), the campaign worker calls `planCampaign` ONCE more for just that channel with the critic feedback as input. Avoids 4× regenerating the same bad recipe.

Capped at 1 re-plan per campaign. Logged in `campaign.params.replanLog`.

### 5.5 Results gallery

`src/app/app/projects/[slug]/campaigns/[campaignId]/page.tsx`:

```
┌──────────────────────────────────────────────────┐
│ FeedbackMind · Campaign #abc123          [back]  │
│ 18/18 assets · 3 retried · 1 quality warning     │
│ Total cost: $4.78 · 6m 14s                       │
│ [↓ DOWNLOAD ALL AS ZIP]  [↻ RUN AGAIN]           │
├──────────────────────────────────────────────────┤
│ IMAGES (8)                                       │
│ ┌────┐ ┌────┐ ┌────┐ ┌────┐                      │
│ │ 9.2│ │ 8.1│ │ 7.8│ │ 6.5│ ← yellow             │
│ └────┘ └────┘ └────┘ └────┘                      │
│ [edit] [more like this] [↻] [↓]                  │
├──────────────────────────────────────────────────┤
│ COPY (7)                                         │
│ • LinkedIn long-form  · score 8.4  [copy] [edit] │
│ • X thread 6 tweets   · score 7.6  [copy] [edit] │
│ • IG caption #1       · score 6.8  ⚠ [edit]      │
│ ...                                              │
├──────────────────────────────────────────────────┤
│ REELS (1)                                        │
│ ┌─────────────────┐                              │
│ │ [video player]  │  score 7.9                   │
│ │ 25s · 1024p     │  [↓] [↻] [more like this]    │
│ └─────────────────┘                              │
└──────────────────────────────────────────────────┘
```

Per-asset card:
- Score badge color-coded (green ≥8, yellow 7–7.9, red <7 = `quality_warning`).
- Hover reveals `criticIssues` list.
- "Why?" link → opens modal with full rubric breakdown + retry history.
- Per-asset toolbar: edit copy (image/copy), more-like-this (image/reel), regenerate (all kinds), download.
- Bulk download as ZIP (folder per channel: `images/`, `copy/`, `reels/`).
- "Run again with same plan" → new campaign with same plan, fresh outputs.

Group sections collapsible. Filter chips: "Show only warnings", "Show only LinkedIn", etc.

### 5.6 Project list integration

The project list page surfaces the latest campaign per project (status + score average). Click → campaign gallery. Existing `library` page becomes the "all campaigns" view.

### 5.7 Brand kit toggle for quality gate

Brand kit settings page exposes `qualityGateEnabled` toggle (default on). When off:
- Critic skipped on every asset.
- Cost preview drops by ~3¢/asset.
- Gallery cards show no score badges.
- Useful for cheap exploration runs.

## Files

Create:
- `src/server/ai/critic.ts`
- `src/app/app/projects/[slug]/campaigns/[campaignId]/page.tsx`
- `src/components/app/campaign-gallery.tsx` (the main gallery client component)
- `src/components/app/campaign-asset-card.tsx`
- `src/components/app/critic-why-modal.tsx`
- `src/server/config/{criticRubrics,criticThreshold}.ts`

Edit:
- `src/server/jobs/campaignWorker.ts` (critic loop wrapping)
- `src/server/db/schema/campaignAssets.ts` (5 new columns from §5.3)
- `src/components/app/...` (brand kit settings exposes qualityGateEnabled)
- `src/app/app/projects/page.tsx` (latest campaign surfaced per project)

## Verify

```
pnpm typecheck && pnpm lint && pnpm build
```

Then in `pnpm dev`:
1. Run a full campaign on FeedbackMind → all 18 assets pass through critic. Worker log shows scores + retry attempts.
2. Force a low-quality output (truncate the brief to "test" or pass garbage) → critic auto-retries with hint, final asset marked `quality_warning`.
3. Gallery shows score badges, color-coded correctly. Hover reveals issues. "Why?" modal shows full rubric breakdown.
4. Toggle `brandKit.qualityGateEnabled = false` → next campaign skips critic, cost preview drops.
5. Bulk download as ZIP → file structure: `images/01-hero-ig.png ... copy/linkedin-long.txt ... reels/feature-walkthrough.mp4`.
6. Re-plan trigger: artificially fail 3 LinkedIn posts → see `campaign.params.replanLog` populated, regenerated LinkedIn copy passes critic.
7. Final audit:
   ```
   rg -n '"[^"]{30,}"' src/server/ai/critic.ts src/server/jobs/campaignWorker.ts src/components/app/campaign-gallery.tsx src/components/app/campaign-asset-card.tsx
   ```
   → 0 matches outside `src/server/config/`.

## Done

Reply with:
- 1 campaign gallery screenshot (FeedbackMind, all assets done).
- 1 "Why?" modal screenshot showing critic breakdown.
- 1 example of an auto-retry: the failed first attempt + the passing second attempt + the retryHint that drove the difference.
- Final grep audit (0 outside config/).
- End-to-end cost: parsing + brief + plan + 18 assets + critics = total cents.
- Total wall-clock time from upload to gallery-ready.
