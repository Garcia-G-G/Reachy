# 01 — Autopilot · Ingest + parsers (multi-format file support)

> Attach `planning/prompts/00-CONTEXT.md`. Apply §0.10. **Step 1 of 5** in the Autopilot rebuild. Output of this step feeds Step 2 (brief extraction). Do not implement steps 2-5 here.

## Goal

Build the upload pipeline. Garcia drops a file or folder → Reachy parses every supported type into a normalized `IngestedBundle`. No LLM extraction yet — that's Step 2. This step ends when the upload zone works and the bundle JSON is correctly populated for any of the supported file types.

## Anti-hardcode rule (mandatory across all 5 steps)

No string literal longer than 30 characters may appear in new code unless it is a TYPED CONSTANT exported from `src/server/config/<domain>.ts` with a comment explaining why it cannot be derived from data. Before writing code, run:

```
rg -n '"[^"]{30,}"' src/server/ingest 2>/dev/null
```

Report matches at the END of implementation. Target: 0 outside `src/server/config/`.

## Tasks

### 1.1 Upload zone

New page `src/app/app/projects/new-from-upload/page.tsx`:
- Big drop zone, full-width, editorial styling.
- Accepts: single file, folder (via `<input webkitdirectory>`), zip.
- Allowlist (config-driven, NOT inline): read from `src/server/config/acceptedFileTypes.ts`.
- Below the zone: textarea fallback "Or paste text" — same downstream pipeline.
- Submit → upload to R2 under `uploads/{userId}/{ingestionId}/...`, enqueue an `ingestion` job.
- Redirect to `/app/projects/new-from-upload/[ingestionId]/parsing` (a simple polling page that shows parser progress; the review UI lands in Step 3).

### 1.2 Parser modules

`src/server/ingest/parsers/` — one file per format. Each exports `parse(buffer: Buffer, filename: string): Promise<ParsedFile>`:

```ts
type ParsedFile = {
  filename: string;
  textBlocks: { source: string; heading?: string; content: string }[];
  images: { source: string; r2Key: string; mime: string; bytes: number }[];
  tables?: { source: string; rows: string[][] }[];
  codeContext?: { language: string; symbols: string[]; topComments: string[] };
};
```

Implementations:
- `docx.ts` — `mammoth` (web search latest stable). Extract paragraphs + headings + embedded images.
- `pdf.ts` — `pdf-parse` for text. `pdfjs-dist` (optional) for embedded images.
- `markdown.ts` — `gray-matter` for frontmatter + `marked` AST → flatten with heading hierarchy.
- `html.ts` — `cheerio`, strip tags → text + `<img src>` refs.
- `text.ts` — pass-through utf-8 read.
- `pptx.ts` — `jszip` to unzip, parse `<a:t>` text nodes per slide. Return slide-by-slide.
- `xlsx.ts` — SheetJS `xlsx`. Per-sheet rows as `string[][]`.
- `csv.ts` — `papaparse`. Single-sheet rows.
- `json.ts` — `JSON.parse` + recursive flatten to `key: value` lines.
- `yaml.ts` — `js-yaml`. Same flattening.
- `code.ts` — generic source ingestor. Extracts: language (extension-based map in `src/server/config/codeLanguages.ts`), exported symbols (regex patterns in `src/server/config/symbolPatterns.ts`), top-of-file doc comments. SKIPS lockfiles, node_modules, .git, .next, dist, build, .env*.
- `repo.ts` — folder containing `package.json` / `Gemfile` / `pyproject.toml` / `Cargo.toml`. Ingest README + manifest + first 200 LOC of top 5 source files (by import frequency).
- `image.ts` — read width/height + dominant 3 hex via `sharp().stats()`. NO LLM call here (Step 2 handles vision).
- `mp4.ts` — extract 6-8 keyframes via ffmpeg (use existing `src/server/video/ffprobe.ts` + ffmpeg wrapper). Each keyframe goes through `image.ts`. Caption deferred to Step 2.
- `zip.ts` — `adm-zip`. Recursively dispatch contents through the right parsers.

### 1.3 Aggregator

`src/server/ingest/aggregate.ts` exports `aggregate(parsedFiles: ParsedFile[]): IngestedBundle`:

```ts
type IngestedBundle = {
  ingestionId: string;
  textBlocks: TextBlock[];        // flattened, source-tagged
  headings: Heading[];            // hierarchy preserved across files
  images: ImageRef[];             // R2 keys + extracted dims+palette
  tables: TableData[];            // from xlsx/csv
  codeContext: CodeSummary[];     // from code/repo
  totalSizeBytes: number;
  fileTypeMix: Record<string, number>;  // { 'docx': 1, 'png': 3, ... }
};
```

Cross-file deduplication: identical textBlocks (same content) collapsed; near-duplicates flagged but kept.

### 1.4 Ingest worker

`src/server/jobs/ingestionWorker.ts` — new BullMQ worker:
- Receives `{ ingestionId, userId, fileRefs: { r2Key, mime, originalName }[] }`.
- Routes each file to the right parser based on mime + extension (lookup in `src/server/config/parserRouting.ts`).
- Aggregates → persists `IngestedBundle` JSON to `ingestion.bundle` column.
- Status: `parsing | ready | failed`.
- Progress streamed via the parsing page's polling endpoint.

### 1.5 Schema

```sql
CREATE TABLE ingestion (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES "user"(id) ON DELETE CASCADE,
  status text NOT NULL,           -- 'parsing' | 'ready' | 'failed'
  bundle jsonb,                   -- IngestedBundle, null until ready
  error_message text,
  created_at timestamptz DEFAULT now(),
  finished_at timestamptz
);
```

Drizzle migration + types.

### 1.6 Config files (typed constants only)

Create:
- `src/server/config/acceptedFileTypes.ts` — `{ extension, mime, parser }[]`.
- `src/server/config/parserRouting.ts` — mime → parser-module mapping.
- `src/server/config/codeLanguages.ts` — extension → language label.
- `src/server/config/symbolPatterns.ts` — regex per language for exported symbols.
- `src/server/config/parserLimits.ts` — per-parser caps (max bytes per file, max files per upload, max ingestion total bytes).

Each constant has a header comment explaining why it can't be derived.

## Dependencies to install

WebSearch latest stable versions THIS WEEK before installing:
- `mammoth`
- `pdf-parse` (or `pdf2json` if pdf-parse is abandoned)
- `cheerio`
- `gray-matter`
- `marked`
- `jszip`
- `xlsx` (SheetJS)
- `papaparse`
- `js-yaml`
- `adm-zip`

Add via `pnpm add`. Note any version pins required for Next 15 server-side compat.

## Files

Create:
- `src/app/app/projects/new-from-upload/page.tsx`
- `src/app/app/projects/new-from-upload/[ingestionId]/parsing/page.tsx`
- `src/server/ingest/parsers/{docx,pdf,markdown,html,text,pptx,xlsx,csv,json,yaml,code,repo,image,mp4,zip}.ts` (15 files)
- `src/server/ingest/aggregate.ts`
- `src/server/jobs/ingestionWorker.ts`
- `src/server/db/schema/ingestion.ts`
- `src/server/actions/ingest.ts`
- `src/server/config/{acceptedFileTypes,parserRouting,codeLanguages,symbolPatterns,parserLimits}.ts` (5 config files)

Edit:
- `src/server/jobs/worker.ts` (register ingestionWorker)
- `src/server/db/migrations/...` (ingestion table)

## Sample inputs for testing

`planning/sample-inputs/` already has `FeedbackMind_Portfolio_Garcia.docx`. Add 3 more for parser coverage testing:
- A `.pptx` slide deck (3-5 slides, mixed text + image)
- A small `.xlsx` (2 sheets, 20 rows total)
- A folder representing a small repo (README.md + package.json + 2-3 source files)

CCM creates these synthetic samples if Garcia hasn't supplied them.

## Verify

```
pnpm typecheck && pnpm lint && pnpm build
```

Then in `pnpm dev`:
1. Upload `FeedbackMind_Portfolio_Garcia.docx` → parsing page polls → after <30s shows "ready" with `bundle.fileTypeMix === { docx: 1 }`, textBlocks populated, images extracted.
2. Upload a `.pptx` → bundle has slide-by-slide text + slide-image refs.
3. Upload a `.xlsx` → bundle has `tables` populated.
4. Upload a folder containing `package.json` + `README.md` + `src/index.ts` → bundle has `codeContext` populated.
5. Upload a `.zip` containing mixed types → all parsed correctly, recursion works.
6. Drop a single `.png` → bundle has 1 image with palette + dims.
7. Run `rg -n '"[^"]{30,}"' src/server/ingest src/server/jobs/ingestionWorker.ts` → 0 matches outside `src/server/config/`.

## Done

Reply with:
- Versions installed for the 10 deps.
- Grep audit count (must be 0).
- Bundle JSON for the FeedbackMind upload (truncate text, show shape).
- Parsing-page screenshot (ready state).
