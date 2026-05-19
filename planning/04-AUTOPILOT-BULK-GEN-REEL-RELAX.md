# 04 — Autopilot · Bulk generator + reel pipeline relaxation

> Attach `planning/prompts/00-CONTEXT.md` AND `planning/03-AUTOPILOT-CAMPAIGN-PLAN-APPROVAL.md`. Apply §0.10. **Step 4 of 5**. Depends on Step 3's approved CampaignPlan. Output: every asset in the plan generated, persisted, ready for the gallery in Step 5.

## Goal

Two simultaneous deliverables:

A) **Bulk generator** — a fan-out worker that runs every approved plan asset through the right existing pipeline (image-gen, reel, channel-copy), tracks progress, persists results.

B) **Reel pipeline relaxation** — let humans appear in Sora output (Garcia greenlit), unhardcode music + SFX + voice, surface human-toggle in brand kit.

These ship together because the bulk generator's reel branch needs the relaxation done.

## Anti-hardcode rule

Audit BEFORE coding:
```
rg -n '"[^"]{30,}"' src/server/jobs/videoWorker.ts src/server/audio/
```

Report each existing hardcode in the response. The fix list:
- `videoWorker.ts:758` — `"NO real people, NO faces"` → derive from `brandKit.allowsHumans` toggle.
- `videoWorker.ts:1053` — same.
- `videoWorker.ts:1178` — `"no people, no recognizable items"` → softer, derived.
- `videoWorker.ts:1075-1094` — SFX descriptions → LLM-derived per reel.
- `videoWorker.ts:293` — image-gen "no faces" guard → derived.
- `audio/elevenlabsMusic.ts:27-42` — `STYLE_TO_MUSIC_PROMPT` static map → LLM-derived per reel.
- `audio/elevenlabs.ts` — single env-pinned voice → catalog + auto-pick by tone.
- `messages/en.json:295` + `messages/es.json` mirror — UI text reflects new rule.

## Tasks

### 4.1 Campaign worker (the fan-out)

`src/server/jobs/campaignWorker.ts`:

```ts
type CampaignJobData = {
  campaignId: string;
  projectId: string;
};
```

Loop:
- Read `campaign.plan.assets`.
- For each asset, dispatch to the correct pipeline:
  - `kind === 'image'` → enqueue an image-gen job (existing `imageGenQueue`). Pass brandKit ref images for coherence (logo + previous best assets).
  - `kind === 'copy'` → call `channelCopy.generate(asset)` directly (it's a single LLM call, no need for a separate queue).
  - `kind === 'reel'` → enqueue a video job (existing `videoQueue`).
- Persist each result row in `campaignAsset` (new table) linking `campaignId` + the underlying `generationId` (for image/reel) or inline `copyOutput` (for copy).
- Concurrency cap from `src/server/config/campaignConcurrency.ts`: 3 image jobs in flight, reels serial, copy serial-but-fast.
- Stream progress to the campaign status page (Step 5) via the existing polling mechanism.

```sql
CREATE TABLE campaign_asset (
  id uuid PRIMARY KEY,
  campaign_id uuid REFERENCES campaign(id) ON DELETE CASCADE,
  kind text NOT NULL,             -- 'image' | 'copy' | 'reel'
  channel text,                   -- when copy
  generation_id uuid,             -- when image/reel
  copy_output text,               -- when copy
  status text NOT NULL,           -- 'pending' | 'running' | 'done' | 'failed'
  cost_cents int,
  error_message text,
  created_at timestamptz DEFAULT now(),
  finished_at timestamptz
);
```

### 4.2 Channel copy generator

`src/server/ai/channelCopy.ts`:

```ts
async function generateChannelCopy(input: {
  brief: string;
  channel: ChannelKey;
  brandKit: BrandKit;
  productBrief: ProductBrief;
}): Promise<{ text: string; costCents: number }>;
```

LLM call uses:
- Channel spec from `CHANNEL_TEMPLATES[channel]` for length + tone + structure hints.
- Brand voice from `brandKit.voice`.
- Product specifics from `productBrief.features`, `productBrief.valueProps`.
- ES/EN cliché blacklists from `src/server/config/cliches.ts`.

Output stored in `campaignAsset.copyOutput`. Cost: ~1¢ per call.

### 4.3 Reel pipeline relaxation — humans OK

Three changes in `src/server/jobs/videoWorker.ts`:

`videoWorker.ts:758` — current `"NO real people, NO faces"` becomes derived from a helper:

```ts
function humanConstraint(brandKit: BrandKit): string {
  return brandKit.allowsHumans
    ? HUMAN_PERMIT_TEXT  // from src/server/config/reelDirectives.ts
    : HUMAN_FORBID_TEXT;
}
```

`reelDirectives.ts` exports the two constants with comments explaining they're config (the actual sentences sent to Sora). When `allowsHumans=true`, the permit text says: *"Humans, faces, and human animations are OK when they fit the brief. Avoid impersonating named, recognizable public figures."* When false: *"No real people. No human faces. Abstract, graphic, and typographic elements only."*

`videoWorker.ts:1053` (extension prompt) — same helper.

`videoWorker.ts:1178` (safe-fallback) — same helper, soft variant.

`videoWorker.ts:293` (image-gen guard) — derived from same toggle.

UI:
- `messages/en.json:295` + `messages/es.json` — replace with derived helper text that reflects the toggle state (use a translation function that takes `allowsHumans` as a param).
- Brand kit settings page: add a toggle for `allowsHumans` (defaults to `true` post-migration, see Step 2's schema).

### 4.4 Reel music — unhardcode

`src/server/audio/elevenlabsMusic.ts`:
- Drop `STYLE_TO_MUSIC_PROMPT` static map.
- Replace with `planMusicPrompt({ brief, style, durationSec, brandKit })` — single gpt-4o-mini call returns a unique music description JSON `{ prompt, instrumental, tempoBpm, mood }` derived from the reel's brief + style + brand voice.
- Music seed defaults (e.g., the "instrumental" baseline, BPM ranges per energy level) live in `src/server/config/musicSeeds.ts` — typed constants with comments.

### 4.5 Reel SFX — unhardcode

`src/server/jobs/videoWorker.ts:1075-1094`:
- Drop the literal SFX descriptions ("punchy modern intro stinger" etc.).
- Replace with `planSfxStingers({ brief, scenes, style, brandKit })` — single LLM call returns `{ intro, midpoint, outro }` SFX descriptions tailored to this reel's energy.
- SFX timing constants (when to fire each stinger, default volumes) in `src/server/config/sfxSeeds.ts`.

### 4.6 Reel voice — unhardcode

`src/server/audio/elevenlabs.ts`:
- Add a curated voice catalog in `src/server/config/voiceCatalog.ts`: 5-7 voices per language, each tagged with `tone`.
- `pickVoice({ tone, language, seed })` — deterministic pick by `seed = generationId` so same reel gets same voice on retry, but different reels get different voices.
- ENV var `ELEVENLABS_VOICE_ID_*` becomes optional override (named voice id wins if set).
- The catalog is config (typed constants with comments — voice IDs ARE data, but they're a catalog, justifying their place in config).

### 4.7 Plumb `brandKit` to the audio chain

Music/SFX/voice currently take `style`. They now need `brandKit` too (for `voice` mapping + `allowsHumans` for tone). Pass through in `videoWorker.ts` dispatch.

## Files

Create:
- `src/server/jobs/campaignWorker.ts`
- `src/server/ai/channelCopy.ts`
- `src/server/db/schema/campaignAssets.ts`
- `src/server/config/{campaignConcurrency,cliches,reelDirectives,musicSeeds,sfxSeeds,voiceCatalog}.ts` (6 config files)

Edit:
- `src/server/jobs/videoWorker.ts` (use helper, plumb brandKit, drop hardcoded prompts)
- `src/server/audio/elevenlabsMusic.ts` (LLM-derived prompt)
- `src/server/audio/elevenlabs.ts` (catalog-driven voice)
- `messages/en.json` + `messages/es.json` (UI text reflects toggle)
- `src/server/jobs/worker.ts` (register campaignWorker)
- `src/components/app/...` (brand kit settings page exposes allowsHumans toggle)

## Verify

```
pnpm typecheck && pnpm lint && pnpm build
```

Then in `pnpm dev`:
1. Approve a campaign on FeedbackMind → campaign worker fans out, image jobs run 3-at-a-time, copy generates inline, reel goes serial.
2. After ~6min, all `campaignAsset` rows are `status='done'`, copy outputs populated, image/reel `generationId` linked.
3. Generate a reel with `brandKit.allowsHumans=true` → output features stylized human animations (PMs at desks, customers giving feedback). Music + SFX prompts in worker log are visibly different from any previous reel even if same style.
4. Toggle `brandKit.allowsHumans=false` → next reel respects strict no-human directive (verify in worker log).
5. Generate two reels with same brief + same style → music + SFX prompts differ (LLM derived), voices differ (catalog-picked deterministically by generationId).
6. Audit:
   ```
   rg -n '"[^"]{30,}"' src/server/jobs/videoWorker.ts src/server/audio/ src/server/jobs/campaignWorker.ts src/server/ai/channelCopy.ts
   ```
   → 0 matches outside `src/server/config/`.

## Done

Reply with:
- Audit table (BEFORE → AFTER for the 6 hardcode locations).
- 1 reel R2 URL with humans visible.
- 1 reel R2 URL with allowsHumans=false (no humans).
- Music + SFX prompts logged for 2 same-style reels (verify they differ).
- Voice IDs picked for 2 same-tone reels with different seeds (verify they differ).
- Final grep audit count.
- Cost breakdown for the FeedbackMind campaign run.
