# 02 — Autopilot · Brief extraction + brand kit autofill

> Attach `planning/prompts/00-CONTEXT.md` AND `planning/01-AUTOPILOT-INGEST-PARSERS.md`. Apply §0.10. **Step 2 of 5**. Depends on Step 1's `IngestedBundle`. Output: a `ProductBrief` + auto-populated `project` + `brandKit`. Approval UI lives in Step 3.

## Goal

Take the parsed bundle and produce a structured `ProductBrief`. Use it to auto-create the project + brand kit so Garcia doesn't have to fill anything out manually. Vision pass over embedded images extracts palette + visual identity hints.

## Anti-hardcode rule

Same as Step 1. Run before + after:
```
rg -n '"[^"]{30,}"' src/server/ingest 2>/dev/null
```

The brief extractor's prompt template is built from the bundle context — NOT hardcoded examples. If you need to give the LLM examples, generate them from the bundle (e.g., "the project name appears in the heading 'PROJECT_NAME'") not literal placeholders ("LAUNCH NOTES").

## Tasks

### 2.1 ProductBrief extractor

`src/server/ingest/extractBrief.ts`:

```ts
type ProductBrief = {
  name: string;
  oneLiner: string;                  // <= 90 chars
  problem: string;                   // 1-3 sentences
  solution: string;                  // 1-3 sentences
  features: { name: string; verb: string; value: string }[];  // 5-10
  audience: { role: string; painPoint: string }[];            // 1-3
  tone: 'editorial' | 'playful' | 'technical' | 'enterprise' | 'indie';
  techStack: string[];
  valueProps: string[];              // 3-5 short statements
  paletteHex: { ink: string; paper: string; accent: string };  // suggested
  languages: ('en' | 'es')[];        // detected from text
  referenceImages: string[];         // R2 keys of bundle.images worth keeping
  confidence: number;                // 0-1
};
```

LLM call:
- Model: `gpt-4o` (web search confirms availability + pricing for May 2026; if `gpt-5` is GA in May 2026 with structured output, prefer it).
- Structured output JSON schema enforces the shape.
- Prompt INCLUDES the bundle's text blocks (truncated to fit context window — 60k tokens max), all detected headings, and table summaries. Image binaries NOT in this call (separate vision pass below).
- Prompt structure (NOT hardcoded — built from bundle + config):
  - Section A: "Source files: [list of filenames + types from bundle.fileTypeMix]"
  - Section B: "All headings detected: [hierarchy from bundle.headings]"
  - Section C: "Text content: [bundle.textBlocks rendered with source tags]"
  - Section D: "Tables: [bundle.tables summarized]"
  - Section E: "Code context: [bundle.codeContext summary]"
  - Instruction: "Extract a ProductBrief. Cite the source filename + heading for each field when possible."
- Cost: ~5-10¢ depending on bundle size. Cap input at 60k tokens.

### 2.2 Vision pass for palette + visual identity

`src/server/ingest/extractVisualIdentity.ts`:

When `bundle.images.length > 0`:
- Pick the top 3 images by size + uniqueness (skip duplicates by perceptual hash).
- Pass to gpt-4o vision with the prompt: *"You're looking at images from a product's marketing. Extract: dominant 3-color palette as hex, visual style descriptor (1 word), whether the brand has a logo (yes/no + R2 key of which image is most logo-like)."* — phrased as a function of the bundle, not generic.
- Return: `{ paletteHex, styleDescriptor, logoR2Key | null }`.

When `bundle.images.length === 0`: skip this pass. ProductBrief's `paletteHex` falls back to `src/server/config/fallbackPalette.ts` (typed constants, single source of truth, with a comment explaining why these specific hexes).

Merge: `extractedPalette` from vision overrides `briefPalette` from text extraction when present (vision is more reliable for color than LLM reading "burnt orange" descriptions).

### 2.3 Brand kit autofill

`src/server/ingest/autoBrandKit.ts`:

Takes `ProductBrief` + `userId` → creates a project + brand kit transactionally:

```ts
async function autoCreateProjectFromBrief(input: {
  brief: ProductBrief;
  userId: string;
  ingestionId: string;
}): Promise<{ projectId: string; brandKitId: string }>
```

Logic:
- Project: name = brief.name, slug = slugify(brief.name), audience = JSON.stringify(brief.audience), tone = brief.tone.
- BrandKit: primaryColor = paletteHex.ink, bgColor = paletteHex.paper, accentColor = paletteHex.accent, languages = brief.languages, voice = brief.tone (mapped via `src/server/config/toneToVoice.ts`), referenceAssetKeys = brief.referenceImages.
- Visual style: pick from existing visualStyles catalog by best match to brief.tone (mapping in `src/server/config/toneToVisualStyle.ts`).
- Link to ingestion: `project.sourceIngestionId = ingestionId` (new column on project).

### 2.4 Schema

```sql
ALTER TABLE brand_kit ADD COLUMN reference_asset_keys jsonb DEFAULT '[]'::jsonb;
ALTER TABLE brand_kit ADD COLUMN allows_humans boolean DEFAULT true;
ALTER TABLE brand_kit ADD COLUMN quality_gate_enabled boolean DEFAULT true;
ALTER TABLE project ADD COLUMN source_ingestion_id uuid REFERENCES ingestion(id);
```

Drizzle migration + types updated. `allowsHumans` + `qualityGateEnabled` are added now (used in Steps 4 + 5) so we don't need a second migration.

### 2.5 Server actions

`src/server/actions/ingest.ts` extends with:
- `runBriefExtraction(ingestionId)` — orchestrates 2.1 + 2.2 + 2.3, returns `{ projectId, brandKitId, briefId }`.
- `getBrief(ingestionId)` — for the approval page in Step 3.

### 2.6 Config files

Create:
- `src/server/config/fallbackPalette.ts` — single source of truth for `{ ink, paper, accent }` defaults.
- `src/server/config/toneToVoice.ts` — tone → voice mapping (used in Step 4 reel pipeline too).
- `src/server/config/toneToVisualStyle.ts` — tone → visualStyle key.

## Files

Create:
- `src/server/ingest/extractBrief.ts`
- `src/server/ingest/extractVisualIdentity.ts`
- `src/server/ingest/autoBrandKit.ts`
- `src/server/db/schema/briefs.ts` (if storing brief separately; otherwise persist in ingestion.bundle)
- `src/server/config/{fallbackPalette,toneToVoice,toneToVisualStyle}.ts`

Edit:
- `src/server/db/schema/brandKits.ts` (3 new columns)
- `src/server/db/schema/projects.ts` (sourceIngestionId)
- `src/server/actions/ingest.ts` (new actions)
- `src/server/jobs/ingestionWorker.ts` (after parsing → call runBriefExtraction)

## Verify

```
pnpm typecheck && pnpm lint && pnpm build
```

Then in `pnpm dev`:
1. After Step 1 parses FeedbackMind, brief extraction runs automatically. Result has: name="FeedbackMind", oneLiner mentions multi-tenant SaaS for PMs, features list includes RAG/pipeline/loop tracker, paletteHex extracted from any embedded images (or fallback if none), languages=['en'].
2. Project + brandKit auto-created. Visit `/app/projects/feedbackmind` → settings show extracted brand kit values.
3. Upload an input WITHOUT images (pure text) → palette uses fallback config, no error.
4. Upload an input with a logo image → vision pass identifies it, brandKit.referenceAssetKeys includes the logo's R2 key.
5. `rg -n '"[^"]{30,}"' src/server/ingest/extractBrief.ts src/server/ingest/extractVisualIdentity.ts src/server/ingest/autoBrandKit.ts` → 0 matches outside `src/server/config/`.
6. Brief extractor LLM cost surfaced in `ingestion.params.costCents` (~5-10¢).

## Done

Reply with:
- Extracted ProductBrief JSON for FeedbackMind (full).
- Brand kit row (column values) post-autofill.
- Cost of brief extraction + vision pass.
- Grep audit (must be 0 outside config/).
