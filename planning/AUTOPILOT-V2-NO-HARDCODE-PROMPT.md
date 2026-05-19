# Autopilot v2 — wider file support + reel relaxation + ZERO hardcoding

> Attach `planning/prompts/00-CONTEXT.md` AND `planning/AUTOPILOT-MODE-PROMPT.md`. Apply §0.10. Addendum to v1: expands file types, relaxes reel constraints, adds quality critic loop, and enforces a HARD anti-hardcode rule across the new code.

## Context from audit (already done — don't redo)

The reel pipeline is in working shape: Sora 2 base/pro/720p/1024p engines, ElevenLabs TTS+Music+SFX in parallel, ffmpeg one-shot compose with normalize=0 amix + dynaudnorm, multi-segment chain via `videos.extend`, $20/reel cap, dup-`-map` bug fixed, SAR mismatch fixed. Last working commit: `af5dfae`.

Three hardcoded constraints currently block humans in Sora output:
- `src/server/jobs/videoWorker.ts:758` (`"NO real people, NO faces"`)
- `src/server/jobs/videoWorker.ts:1053` (`"NO real people, NO faces."`)
- `src/server/jobs/videoWorker.ts:1178` (`"no people, no recognizable items"` in safe-fallback)

Plus user-facing helper text:
- `src/server/jobs/videoWorker.ts:293` (image-gen guard `"no faces"`)
- `messages/en.json:295` (UI helper text)
- `messages/es.json` (mirror)

Hardcoded prompts in audio chain (must be unhardcoded per Garcia's mandate):
- `src/server/audio/elevenlabsMusic.ts:27-42` `STYLE_TO_MUSIC_PROMPT` — static map style→prompt
- `src/server/jobs/videoWorker.ts:1075-1094` SFX descriptions ("punchy modern intro stinger" / "transition whoosh" / "outro snap")
- `src/server/audio/elevenlabs.ts` — single env-pinned voice per language, no randomization

## Tasks

### 1. Expand file type support in the parser pipeline

Add to `src/server/ingest/parsers/`:

- `pptx.ts` — `pptx2json` or parse via `jszip` + extract `<a:t>` text nodes from each slide's XML. Returns slide-by-slide text + per-slide image refs.
- `xlsx.ts` — `xlsx` package (SheetJS). Returns sheet-by-sheet rows as flat text + table summaries.
- `csv.ts` — papaparse. Same row-flatten output as xlsx for single-sheet cases.
- `json.ts` — `JSON.parse` + recursive flatten to `key: value` text lines. Useful for product spec dumps, package.json, etc.
- `yaml.ts` — `js-yaml`. Same as JSON.
- `code.ts` — generic source-file ingestor. Extracts: file path, language (from extension), exported symbols (regex for `export`/`fn`/`class`), top-of-file doc comments, README-style headers in adjacent files. Languages: `.ts/.tsx/.js/.jsx/.py/.rb/.go/.rs/.java/.swift/.kt/.php`. SKIPS heavy binaries / lockfiles / node_modules.
- `repo.ts` — when the upload is a folder containing `package.json` / `Gemfile` / `pyproject.toml` / `Cargo.toml`, treat as a code repo: ingest README + package metadata + first 200 LOC of top 5 source files (by import frequency). Compresses repo into a "what this codebase does" summary worth feeding the brief extractor.
- `mp4-frames.ts` — when user drops a short video, extract 6-8 keyframes via ffmpeg, pass each to vision parser. Useful when their existing demo reel is the input.

Update `acceptedFileTypes` allowlist in the upload zone client to include all of the above MIME types + extensions.

Aggregator `IngestedBundle` extends to include `tables: TableData[]` (from xlsx/csv) and `codeContext: { language: string, summary: string, exportedSymbols: string[] }[]` (from code/repo).

The brief extractor's prompt is updated to factor in these new structured inputs — tables become "data points the product mentions", code context becomes "tech reality of the product, not aspirational".

### 2. Relax "no real people" constraint — humans OK in reels

Three direct edits in `src/server/jobs/videoWorker.ts`:

- Line 758: change `"NO real people, NO faces"` → `"Humans, faces, and human animations are OK when they fit the brief. Avoid real, named, recognizable public figures."` (model-level: leaves room for stock-style people while still blocking impersonation).
- Line 1053: same replacement.
- Line 1178 (safe-fallback): change `"no people, no recognizable items"` → `"avoid named public figures and brand-trademarked items"`.
- Line 293 (image guard for non-Sora path): same softer rule.

UI helper text:
- `messages/en.json:295` — change to `"Humans and figures are allowed; avoid impersonating named public figures."`
- `messages/es.json` — Spanish equivalent.

NEW per-project toggle in brand kit settings: `allowsHumans: boolean DEFAULT true`. When false, the old strict constraint applies for that project. Migration: `ALTER TABLE brand_kit ADD COLUMN allows_humans boolean DEFAULT true;`.

The reel planner respects this — when `allowsHumans` is false, injects the strict directive; when true, omits it (default).

### 3. Unhardcode the audio chain

Audio prompts must be DERIVED from context (brief + style + scene), not literal strings.

`src/server/audio/elevenlabsMusic.ts`:
- Drop `STYLE_TO_MUSIC_PROMPT` static map.
- Replace with `planMusicPrompt({ brief, style, durationSec, mood })` — calls gpt-4o-mini with the brief excerpt, style key, and duration → returns a music description JSON `{ prompt, instrumental, tempoBpm, mood }`.
- The LLM uses the brief + style as context to generate a unique music prompt per reel. No two reels with the same style get the same prompt unless their briefs are identical.

`src/server/jobs/videoWorker.ts:1075-1094`:
- Drop the literal SFX descriptions.
- Replace with `planSfxStingers({ brief, scenes, style })` — single LLM call returns `{ intro: string, midpoint: string, outro: string }` SFX descriptions tailored to the reel's energy.

`src/server/audio/elevenlabs.ts`:
- Voice selection becomes a function of `{ brief.tone, brief.audience, language }` not a single env var.
- Add a curated voice catalog (5-7 voices per language, each tagged with `tone: 'editorial'|'energetic'|'warm'|'authoritative'|'playful'`).
- `pickVoice({ tone, language, seed })` returns the best match for the brief, with `seed` (generationId) ensuring reproducibility.
- Keep the env var as override (named voice id wins over auto-selection).

### 4. ZERO hardcoding rule (mandatory)

NEW directive for this and all future image/reel/copy code in Reachy:

> **No design value, copy fragment, prompt boilerplate, color hex, voice id, layout coordinate, music description, SFX description, or example string may appear as a literal in code unless it is a TYPED CONSTANT exported from a config file with a comment explaining why it cannot be derived from data.**

Audit step BEFORE writing the v2 code:
- Grep all of `src/server/ai/`, `src/server/audio/`, `src/server/video/`, `src/server/ingest/`, `src/server/jobs/` for string literals longer than 30 characters.
- For each one, decide: (a) move to `src/server/config/<domain>.ts` with a justifying comment, (b) derive from brief/brand kit/LLM call, (c) keep but document why it must be literal.
- Report the audit table in the response (path:line | string preview | disposition: config|derive|keep+justify).

Implementation rule for the new ingest/autopilot/critic code:
- Every prompt template is a function `(input) => string`, not a constant.
- Every default value reads from a config object that's typed.
- Every "example" inside a system prompt is generated from the brief context (e.g., the planner's example eyebrow uses the project's actual name, not "LAUNCH NOTES").
- Color hexes never appear inline; always `brandKit.primaryColor` / `brandKit.bgColor` / `brandKit.accentColor` (with FALLBACK_COLORS only at the boundary, exported from one place).
- Cliché blacklists live in `src/server/config/cliches.ts` keyed by language, NOT inline in the planner.

Reject any patch that introduces new hardcoded literals matching the above. Garcia will pushback if he sees them.

### 5. Quality critic loop — "todo se vea bien"

Every generated asset (image, copy, reel) runs through a critic BEFORE being marked done.

`src/server/ai/critic.ts`:

```ts
type AssetCriticResult = {
  score: number,         // 0-10
  passes: boolean,       // score >= threshold
  issues: string[],      // specific complaints
  retryHint?: string,    // suggestion for the next attempt if !passes
}

critic.image({ buffer, brief, layout, brandKit }) -> AssetCriticResult
critic.copy({ text, channel, brief, brandKit }) -> AssetCriticResult
critic.reel({ videoBuffer, brief, brandKit }) -> AssetCriticResult
```

Implementation:
- `critic.image` — gpt-4o vision call. Prompt includes the brief, the layout's intent, brand kit colors+voice. Returns score on a 10-point rubric: composition (3), brand fidelity (2), copy legibility (2), creativity vs template (2), language correctness (1).
- `critic.copy` — gpt-4o text. Rubric: on-brief (3), tone match (2), no clichés (2), language correctness (2), readable length (1).
- `critic.reel` — extract 3 keyframes via ffmpeg + audio waveform metadata, pass to gpt-4o vision + audio metadata. Rubric: visual cohesion (3), motion presence (2), audio mix balance (2), brand fidelity (2), no broken text (1).

Threshold: 7/10 for `passes`. Below threshold → automatic regeneration with `retryHint` injected into the prompt. Cap at 2 retries per asset. After 2 fails, mark as `quality_warning` and surface in the gallery with a yellow badge.

Cost: ~3¢ per critic call. Surfaced in the campaign cost preview.

Per-project toggle `qualityGateEnabled: boolean DEFAULT true`. User can disable for cheap exploration.

### 6. Quality critic in Autopilot bulk run

`src/server/jobs/campaignWorker.ts` (from v1) wraps each asset's pipeline in:

```
generate → critic → if !passes && retries < 2 → regenerate with hint → critic → ...
                  → if passes OR retries==2 → persist → next asset
```

The campaign progress UI shows: `12/20 assets · 3 retried · 1 quality warning`. Garcia sees what the critic caught.

### 7. Smarter campaign planner uses critic feedback

When the critic flags multiple assets in a single channel as failing the same way (e.g., "copy too generic" across 4 LinkedIn posts), the planner is re-invoked once with the feedback to regenerate that channel's plan with a fixed brief. Avoids regenerating-the-same-bad-thing 2x.

### 8. Surface critic results in the gallery

Each asset card in the campaign gallery shows:
- Critic score badge (small numeral, color-coded: green ≥8, yellow 7, red <7).
- Hover reveals the critic's issue list.
- "Why?" link → opens a modal with the full critic JSON + retry history.

Builds trust: Garcia sees WHY an asset is good or warned, not just a green check.

## Files

Create:
- `src/server/ingest/parsers/{pptx,xlsx,csv,json,yaml,code,repo,mp4-frames}.ts` (8 new parsers)
- `src/server/config/{cliches,fallbacks,voiceCatalog,musicSeeds,sfxSeeds}.ts` (config exports — typed constants only)
- `src/server/ai/critic.ts`

Edit:
- `src/server/jobs/videoWorker.ts` (relax 3 hardcoded constraints, unhardcode SFX, integrate critic)
- `src/server/audio/elevenlabsMusic.ts` (LLM-derived music prompt)
- `src/server/audio/elevenlabs.ts` (voice catalog + auto-pick)
- `src/server/db/schema/brandKits.ts` (allowsHumans, qualityGateEnabled columns)
- `src/server/jobs/campaignWorker.ts` (critic loop wrapping)
- `src/components/app/...` (gallery cards show critic badges)
- `messages/en.json`, `messages/es.json` (UI strings updated)

## Mandatory pre-implementation audit

Before writing ANY code:

1. WebSearch latest stable versions of: `mammoth`, `pdf-parse`, `pptx2json`, `xlsx` (SheetJS), `papaparse`, `js-yaml`, `adm-zip`, `cheerio`, `gray-matter`, `marked`. Note any breaking changes in the last 90 days.

2. Grep audit (report results in your reply BEFORE writing code):
   ```
   rg -n "\"[^\"]{30,}\"" src/server/ai src/server/audio src/server/video src/server/ingest src/server/jobs
   ```
   For each match: report file:line | string preview | disposition.

3. Confirm by reading the PR description back to Garcia: "I will not introduce any string literal longer than 30 chars in new code unless moved to a config file with justification."

## Verify

```
pnpm typecheck && pnpm lint && pnpm build
```

Then in `pnpm dev`:
1. Drop a `.pptx` (slide deck) → brief extracted from slides + their images. Drop `.xlsx` → tables surfaced as data points. Drop a folder with `package.json` → `repo.ts` runs, summary feeds the brief.
2. Generate a reel from FeedbackMind brief → reel features stylized human animations (PMs at desks, customers giving feedback). Music + SFX prompts visibly different from the previous reel even though both used the same style.
3. Set `brandKit.allowsHumans = false` → next reel generation enforces the strict constraint, no people in output.
4. Run a campaign → gallery shows critic score badges. Click "Why?" on a 7-score asset → see the critic's issue list (e.g., "copy uses 'unlock' which is in the EN cliché blacklist").
5. Force a low-quality output (e.g., garbage brief) → critic auto-retries with hint. Final asset has `quality_warning` badge after 2 retries.
6. Run the grep audit `rg -n "\"[^\"]{30,}\"" src/server/ai src/server/audio src/server/video src/server/ingest src/server/jobs` → report the count of matches in new code (should be 0 outside of `src/server/config/`).

## Done

Reply with:
- Pre-implementation audit table (string literals > 30 chars + disposition).
- Versions of new dependencies installed.
- 1 reel rendered with humans visible (R2 URL).
- 1 campaign run on the FeedbackMind sample input → gallery screenshot showing critic badges + retried-count.
- Final grep audit count (must be 0 hardcoded literals in new code outside config/).
- Cost breakdown: critic adds ~3¢/asset × N assets vs base campaign cost.
