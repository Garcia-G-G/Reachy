# 06 — AI Quality Pivot · Last-mile excellence

> Attach `planning/prompts/00-CONTEXT.md`. Apply §0.10. **This is the quality pass.** Steps 1–5 shipped, the system works end-to-end, but outputs are *passable* (avg critic score 7.4 on images) not *excellent*. This prompt closes the gap to "competes with ChatGPT Pro + a senior art director."

---

## 🚨 Directive to CCM — Read this twice

This is the prompt where Garcia is asking you to do your **best work**. Not "ship something functional." Not "follow the spec literally." Your best work.

- **Take time.** Read the audit findings below carefully. Verify the file:line references. Don't re-investigate — they're correct (audited May 19, 2026).
- **No cost shortcuts.** Where this prompt says "use `gpt-5.5` with `reasoning_effort='high'`", that means use it. Don't downgrade to `gpt-4o-mini` or `reasoning='none'` to save cents. Garcia has explicitly accepted ~5-10x higher per-campaign cost in exchange for quality.
- **Few-shot exemplars beat instructions.** Every prompt that today says "write copy that does X, Y, Z" — add 3 ACTUAL examples of GREAT output. The model learns from examples 10x faster than from rules.
- **Self-critique inside each generator.** Don't single-shot. Pattern: generate → score → revise → emit. ChatGPT users get amazing results because they iterate; bake that loop into the code.
- **Pass full context downstream.** Specificity dies at every summarization step. When the planner generates a rich `ProductBrief`, every downstream generator gets the WHOLE brief, not a truncated `idea` string. (This is failure #1 below — the audit traced it exactly.)
- **Defaults must be opinionated.** A monochrome fallback palette is a confession. Pick a brand-derivable palette from text cues when vision can't fire.
- **Verify with real outputs before declaring done.** Run `pnpm smoke:campaign`, then a real browser run on FeedbackMind, then OPEN at least 4 image URLs in your own browser to judge them. Self-critique your work before reporting.

If at any step you're tempted to take a shortcut "because it's faster" — don't. This is the quality pivot. Speed is not the metric here.

---

## Web-verified facts (May 2026 — don't re-research these)

- `gpt-5.5` is the current OpenAI flagship. Pricing: $5 in / $30 out per 1M tokens (cached input $0.50/M).
- `reasoning_effort` accepted values: `none | minimal | low | medium (default) | high | xhigh`. NO codebase use of `'high'` currently (verified).
- **`gpt-image-2` does NOT take a `reasoning_effort` parameter** — it has automatic "Thinking Mode" when active. Don't try to pass `reasoning_effort` to images.generate; it will 400. Quality lever for gpt-image-2 is `quality: 'high'` + prompt craft.
- **Typography best practices for gpt-image-2 (verified from OpenAI cookbook + Apiyi guide):**
  - Put literal text in quotes OR ALL CAPS in the prompt.
  - Specify typography (font style, size, color, placement) as explicit constraints.
  - For tricky words (brand names, uncommon spellings), spell them out letter-by-letter.
  - `quality: 'high'` required for mixed fonts or body text >50 characters.
- **Brand-prompt structure that performs:** name the job → lock the exact text → describe composition → state what must NOT change.

Sources:
- [OpenAI — Reasoning models guide](https://developers.openai.com/api/docs/guides/reasoning)
- [GPT-5.5 model card](https://developers.openai.com/api/docs/models/gpt-5.5)
- [OpenAI — Image generation models prompting guide](https://developers.openai.com/cookbook/examples/multimodal/image-gen-models-prompting-guide)
- [Apiyi — gpt-image-2 typography guide](https://help.apiyi.com/en/gpt-image-2-api-font-prompt-typography-guide-en.html)

---

## Audited current state (file:line precise — verified May 19, 2026)

### Failure #1 — Image copy planner is starved of context

`src/server/ai/copyPlanner.ts`:
- `planCopy()` at **L349**, `planCopySequence()` at **L528**.
- Model: `'gpt-4o-mini'` (L350, L534) at `temperature: 0.7` (L369, L554). **No reasoning path.**
- Input type (L31): only `idea` string, `layout`, `language`, `project: Pick<Project, 'name'|'audience'|'tone'>`, optional `brandKit`.
- **The full `ProductBrief` IS NEVER PASSED.** None of `features[]`, `valueProps[]`, `problem`, `solution`, `oneLiner`, `techStack` reach the planner.
- Callsites confirmed: `src/server/jobs/imageWorker.ts:198` and `:338` pass only `idea ?? ''`.
- System prompt hardcoded in `buildSystemPrompt()` L205-235 and `buildSequenceSystemPrompt()` L482-526. NOT in `config/`.
- **Zero few-shot examples.** Only schema-description hints with phrase examples (L90, L105) like `"LAUNCH NOTES"` / `"Q1 RECAP"` — these double as cliché bait.

**This is THE root cause of "Streamline customer feedback"** — the planner literally cannot see that the product is for PMs drowning in Slack/Jira/surveys feedback, because none of that reaches it.

### Failure #2 — Brand palette has no text-fallback path

`src/server/ingest/extractVisualIdentity.ts`:
- Model `gpt-4o` at L40.
- Skipped entirely when `images.length === 0` — early-returns `identity: null` at **L131-133**.

`src/server/ingest/autoBrandKit.ts:76-80` fallback chain:
```
visionPalette.X ?? brief.paletteHex.X ?? FALLBACK_PALETTE.X
```

`src/server/config/briefExtractionPrompts.ts:29` explicitly tells the gpt-5.5 brief extractor:
> *"When uncertain, leave them as the upstream fallback."*

So for text-only inputs (no embedded images), the chain is: vision skipped → brief returns fallback values verbatim → outputs unbranded palette.

`FALLBACK_PALETTE` at `src/server/config/fallbackPalette.ts:25-29` is actually `ink #14110D / paper #F1EBDF / accent #B6481A` (warm editorial — not B&W). The B&W we saw in testing means brief LLM was returning monochrome values (since prompt told it to defer). **No `tone→palette` mapping table exists** despite `toneToVoice.ts` / `toneToVisualStyle.ts` precedent.

### Failure #3 — Critic plateau (gpt-4o-mini judge, no exemplar anchor)

`src/server/ai/critic.ts`:
- `pickBest` (best-of-K) defaults `gpt-4o-mini` at **L91**.
- Grader `GRADE_MODEL = 'gpt-4o-mini'` HARDCODED at **L214** — used by `gradeImage` (L369), `gradeCopy` (L415), `gradeReel` (L535).
- `temperature: 0.2` (L316). **No gpt-5 path on the grader.**
- `retryHint` field (L231-232, L269-274): ≤30 words, ≤240 chars. Schema has zero shape guidance about what makes a "specific" hint. In practice: generic.

Threshold: `CRITIC_PASS_THRESHOLD = 7.0` at `src/server/config/criticThreshold.ts:17`. Green band ≥ 8.0 (L31). **All images plateaued at 7.0-7.6** because the floor is 7.0 and the judge has no exemplar of what 9+ looks like.

### Failure #4 — Cliché list duplication + "Streamline" uncovered

`src/server/config/cliches.ts`:
- ES blacklist (L15-30): "eleva tu marca", "lleva al siguiente nivel", "transforma", "desbloquea", "potencia tu", etc.
- EN blacklist (L32-47): "unlock", "revolutionize", "transform", "level up", "elevate", "craft your", "designed for", etc.
- **"streamline" NOT on the list.** Also missing: "boost", "empower", "seamless", "leverage", "centralize".
- **Duplicate copy lives at `copyPlanner.ts:180,187`** — the image planner hardcodes its OWN blacklist that has diverged from `config/cliches.ts` (planner has "supercharge", "solutions that scale"; config doesn't).

### Model usage map (currently)

| Where | Model | reasoning_effort |
|---|---|---|
| `extractBrief.ts:48` | `gpt-5.5` | `'none'` (L314) |
| `planCampaign.ts:72` | `gpt-5.5` | `'none'` (L342) |
| `extractVisualIdentity.ts:40` | `gpt-4o` | — |
| `copyPlanner.ts:350,534` | **`gpt-4o-mini`** | none, temp 0.7 |
| `channelCopy.ts:41` | **`gpt-4o-mini`** | none, temp 0.7 |
| `critic.ts:91,214` | **`gpt-4o-mini`** | `'minimal'` (pickBest), temp 0.2 (grader) |
| `audio/elevenlabsMusic.ts:35` | `gpt-4o-mini` | — |
| `videoWorker.ts:441` (TTS fallback) | `gpt-4o-mini-tts` | — |
| `gpt-image-2` | image gen only | (auto thinking) |

**No `reasoning_effort='high'` anywhere in the codebase.** This is the single biggest under-utilization.

---

## Tasks

### 6.1 Image copy planner — fix the context starvation + model upgrade + exemplars + self-critique

`src/server/ai/copyPlanner.ts`:

**a) Expand input type.** `PlanCopyInput` (L31) gains:
```ts
productBrief?: import('./extractBrief').StoredBrief['brief'];
campaignRationale?: string;
```
Caller in `src/server/jobs/imageWorker.ts:198,338` reads `campaign.brief` (the snapshot persisted in Step 3) and `campaign.plan.rationale` and passes them through.

**b) Build prompt with the FULL brief.** `buildSystemPrompt()` (L205-235) and `buildUserPrompt()` (find it) now include:
```
[PRODUCT CONTEXT]
Name: {brief.name}
One-liner: {brief.oneLiner}
Problem: {brief.problem}
Solution: {brief.solution}
Features:
  - {feature.name}: {feature.verb} {feature.value}  [for each, up to 8]
Value props: {brief.valueProps.join(' / ')}
Audience: {brief.audience}
Tone: {brief.tone}
Tech stack: {brief.techStack.join(', ')}

[CAMPAIGN STRATEGY]
{campaignRationale}

[ASSET BRIEF]
{the existing asset brief}
```

The asset brief is now ADDITIONAL context, not the only context. The planner can ground every headline in concrete product specifics from the full brief.

**c) Upgrade model.** Switch `copyPlanner.ts:350,534` from `'gpt-4o-mini'` to `'gpt-5.5'` with `reasoning_effort: 'high'`. Drop `temperature: 0.7` (reasoning models ignore temperature).

Cost impact: ~3-5¢ per image-copy call (from ~0.3¢). For 7 images per campaign = ~25¢ extra per campaign. Acceptable.

**d) Add few-shot exemplars.** Create `src/server/config/exemplars/imageCopy/{layoutId}.ts` — one file per LayoutId (10 layouts). Each exports:
```ts
export interface ImageCopyExemplar {
  scenarioContext: string;      // 1-line brief context for the example
  brandHint: string;            // 1-line brand snapshot
  goodCopy: { eyebrow?: string; headline: string; subheadline?: string; cta?: string; wordmark?: string };
  whyItWorks: string;           // 1-sentence quality signal
}
export const EXEMPLARS: ImageCopyExemplar[] = [/* 3 per layout */];
```

Examples should be **specific, branded, punchy** — patterns like the Linear, Stripe, Notion, Figma marketing posts. NO generic placeholder copy. The `whyItWorks` field is loaded into the prompt as a teaching signal.

Inject 3 exemplars matched to the layout into the planner prompt as `[GOOD EXAMPLES]` ABOVE the brief.

**e) Self-critique loop (internal, separate from Step 5 critic).**

```ts
async function planCopyWithRevision(input) {
  const v1 = await callPlanner(input);
  const critique = await critiqueCopy(v1, input);  // gpt-5.5 reasoning='medium', returns { score, issues, revisionHint }
  if (critique.score >= 8) return v1;
  const v2 = await callPlanner({ ...input, revisionHint: critique.revisionHint });
  return v2;
}
```

`critiqueCopy` prompt: *"Score this image copy 0-10 on: (1) specificity — does it reference brand-named features or generic phrasing? (2) brand-voice match. (3) headline punch — is it forgettable? (4) redundancy — does subheadline restate headline? Return JSON: { score, issues: string[], revisionHint: string }. The revisionHint must be SURGICAL: name the exact line and a concrete change."*

This loop adds 1 extra LLM call per image (~3¢). Worth it.

**f) Remove the duplicate cliché list at `copyPlanner.ts:180,187`.** Import `clichesFor(language)` from `config/cliches.ts` instead. Single source of truth.

**g) Extend `config/cliches.ts` with the missing phrasings:**
- EN add: `"streamline"`, `"centralize your"`, `"analyze X efficiently"`, `"empower your"`, `"boost your"`, `"seamless"`, `"leverage"`, `"in one place"`, `"all in one"`, `"organize without"`, `"actionable insights"` (as a copy-paste phrase), `"single source of truth"`, `"end-to-end"`.
- ES add: `"optimiza tu"`, `"centraliza tu"`, `"todo en uno"`, `"sin esfuerzo"`, `"información accionable"`, `"fuente única de verdad"`.

### 6.2 Brand palette — text-based fallback path

Create `src/server/ingest/inferPaletteFromText.ts`:

```ts
export async function inferPaletteFromText(input: {
  brief: { name; oneLiner; problem; tone; audience };
}): Promise<{ ink: string; paper: string; accent: string; reasoning: string }>;
```

LLM: `gpt-5.5` with `reasoning_effort: 'medium'`. Strict JSON schema. Prompt:
> *"You are a brand designer. The product is [brief.name]: [brief.oneLiner]. The tone is [tone]. The audience is [audience]. Suggest a 3-color brand palette as hex values: ink (primary text), paper (background), accent (CTA / highlight). The palette MUST reflect the product's positioning — NOT a monochrome default. Bias toward warm editorial palettes (ink dark brown / paper cream / accent burnt orange) unless the brief explicitly suggests cold/tech/playful/etc. Return JSON: { ink, paper, accent, reasoning }."*

Update the fallback chain in `src/server/ingest/autoBrandKit.ts:76-80`:
```
visionPalette.X ?? textInferredPalette.X ?? brief.paletteHex.X ?? FALLBACK_PALETTE.X
```

`extractBrief.ts` system prompt at `briefExtractionPrompts.ts:29` — change instruction from "defer to upstream fallback" to "if you cannot confidently infer hex values from the text, set each color to the empty string and the text-inference step will fill them." So the brief LLM doesn't hallucinate B&W.

Cost: ~1¢ per ingestion. Run only when `bundle.images.length === 0`.

### 6.3 Image gen prompt craft (no model change for gpt-image-2 — it has no reasoning_effort)

`src/server/ai/imageGen.ts` / `promptBuilder.ts` — verify the actual prompt sent to `images.generate`. Apply the typography best practices from web research:

- **Wrap every literal text in quotes.** The exact eyebrow, headline, subheadline, CTA, wordmark — all in `"..."`. Example: `"Headline reads exactly: 'Stop triaging Slack and Jira manually.'"`
- **For brand wordmark, spell it out letter-by-letter once.** Example: `"The brand wordmark FeedbackMind (F-E-E-D-B-A-C-K-M-I-N-D) appears bottom-right."`
- **State typography constraints explicitly.** Example: `"Headline in editorial serif (Fraunces-style), 80pt, ink color #2A1810, left-aligned. Subheadline in Inter, 24pt, ink at 80% opacity."`
- **State what must NOT change.** Example: `"DO NOT add additional decorative elements. DO NOT use stock photo people. DO NOT center-align — left-align everything."`
- **Confirm `quality: 'high'` is set** when copy has >50 chars total. Audit `campaignWorker.ts:372,397`.

These four directives go into the prompt builder. Re-test on 4 image positions and verify the headline lands without typos.

### 6.4 Channel copy generator — exemplars + model upgrade + self-critique

`src/server/ai/channelCopy.ts`:

**a) Upgrade model** — currently `gpt-4o-mini` at L41. Switch to `gpt-5.5` with `reasoning_effort: 'medium'` (drop `temperature`). Cost: ~5¢ per copy asset, ~$0.50 per campaign. Worth it.

**b) Few-shot exemplars per channel.** Create `src/server/config/exemplars/channels/{channelKey}.ts` — one per channel. Each exports 3 REAL excellent examples in the relevant tech-founder genre:
- `linkedin-post-long.ts` — 3 founder-voice posts in the Patrick McKenzie / Arvid Kahl style.
- `x-thread.ts` — 3 actual high-engagement threads from indie-hacker / tech-product accounts.
- `email-pitch-cold.ts` — 3 cold pitches that actually worked (sanitize identifying details).
- etc.

Inject 3 exemplars into the channel-copy prompt as `[GOOD EXAMPLES]` ABOVE the brief.

**c) Self-critique loop** — same pattern as 6.1e. Generate → critique → revise once if score < 8. Internal.

### 6.5 Critic — model upgrade + surgical retry hints + exemplar anchoring

`src/server/ai/critic.ts`:

**a) Upgrade grader model** — `GRADE_MODEL` at L214 from `'gpt-4o-mini'` to `'gpt-5.5'` with `reasoning_effort: 'high'`. The critic IS a senior art director — it needs reasoning. Cost: ~10¢ per critic call (from ~3¢). Worth it because the critic's `retryHint` drives the next attempt's quality.

**b) Make `retryHint` surgical via schema + examples in the system prompt.**

Add to the grader system prompt: *"Your `retryHint` must be a SURGICAL CHANGE RECOMMENDATION. NOT 'make it better'. Name the exact element (eyebrow / headline / subheadline / overall composition) and a concrete replacement direction grounded in the brief. Example: 'Replace headline `Streamline customer feedback` with a specific outcome that names one of the feedback sources mentioned in the brief (Slack, Jira, surveys). Try: \"Stop reading Slack threads on Monday morning.\"'"*

Add 2 worked retryHint examples directly in the system prompt (so the model has anchors).

**c) Raise the implicit ceiling.** Add to the rubric prompts: *"A score of 7 means 'acceptable but unremarkable'. A score of 9 means 'this is the kind of asset a senior designer / editor at a top brand would ship.' Anchor your scoring to that ceiling."*

### 6.6 Wire upgrades, re-test, compare

After 6.1–6.5:

```
pnpm typecheck && pnpm lint && pnpm build
pnpm smoke:campaign            # dry-run through plan
```

Then real browser run:
1. Drop the FeedbackMind brief at `localhost:3000/app/projects/new-from-upload`.
2. Approve campaign.
3. Wait for completion.
4. Open ALL image URLs.
5. **Side-by-side compare with the test baseline** (from the May 19 test):
   - https://pub-5fb864b41a4e4282a88d3434f25efecc.r2.dev/.../974bb107.../1.png (was 7.4, headline "Streamline customer feedback")
   - https://pub-5fb864b41a4e4282a88d3434f25efecc.r2.dev/.../3c8d4a2f.../1.png (was 7.3, headline "Analyze feedback efficiently")
   - https://pub-5fb864b41a4e4282a88d3434f25efecc.r2.dev/.../371c0e9e.../1.png (was 7.2, headline "Centralize your feedback")
   - https://pub-5fb864b41a4e4282a88d3434f25efecc.r2.dev/.../99401eae.../1.png (was 7.6)

**Targets:**
- Avg image critic score ≥ **8.2** (was 7.4).
- At least 1 image ≥ **9.0**.
- ZERO headlines containing the extended cliché blacklist ("streamline", "centralize your", "analyze X efficiently", "transform", etc.).
- Palette visibly non-monochrome (text-inferred when no images).

---

## Files

Create:
- `src/server/ingest/inferPaletteFromText.ts`
- `src/server/config/exemplars/imageCopy/{hero-centered,hero-split-left,quote-slab,announcement-banner,card-soft,feature-stack,editorial-collage,editorial-margin,text-mask-cutout,badge-stamp}.ts` (10 files)
- `src/server/config/exemplars/channels/{linkedin-post-long,linkedin-post-short,x-thread,instagram-caption,email-pitch-cold,email-pitch-warm,blog-outline,press-release-short}.ts` (8 files)

Edit:
- `src/server/ai/copyPlanner.ts` (expand input, full brief, gpt-5.5 high, exemplars, self-critique, drop duplicate clichés)
- `src/server/jobs/imageWorker.ts` (pass productBrief + campaignRationale to planCopy at L198, L338)
- `src/server/ai/channelCopy.ts` (gpt-5.5 medium, exemplars, self-critique)
- `src/server/ai/critic.ts` (gpt-5.5 high, surgical retryHint, ceiling-anchor)
- `src/server/ai/imageGen.ts` + `promptBuilder.ts` (typography craft: quotes, ALL CAPS, letter-spelling, what-must-NOT-change)
- `src/server/ingest/autoBrandKit.ts` (extended fallback chain through inferPaletteFromText)
- `src/server/config/briefExtractionPrompts.ts` (don't defer palette — return empty for text-fallback to fill)
- `src/server/config/cliches.ts` (extend EN + ES blacklists)

## Anti-hardcode rule (still active)

Final grep:
```
rg -n '"[^"]{30,}"' src/server/ai src/server/ingest src/server/jobs/{ingestionWorker,campaignWorker}.ts
```

The few-shot exemplars introduced ARE long strings — they belong in `src/server/config/exemplars/...ts` as typed constants with the `whyItWorks` comment serving as justification. 0 violations outside `src/server/config/`.

## Done

Reply with:
- **Before/after table** — same 4 image positions, old scores vs new scores, old headlines vs new headlines, old palette vs new palette.
- Average critic score (target ≥ 8.2).
- At least 1 image score ≥ 9.0.
- Total cost (will be higher than the previous $3.91 — expected ~$5-8).
- Final grep audit (0 hardcodes outside `config/`).
- 1 short paragraph honestly describing what you noticed about the output quality vs the May 19 baseline. If something STILL feels generic or off, name it — don't hide it.

Sources:
- [OpenAI — Reasoning models guide](https://developers.openai.com/api/docs/guides/reasoning)
- [GPT-5.5 model card](https://developers.openai.com/api/docs/models/gpt-5.5)
- [OpenAI Cookbook — Image generation models prompting guide](https://developers.openai.com/cookbook/examples/multimodal/image-gen-models-prompting-guide)
- [Apiyi — gpt-image-2 typography best practices](https://help.apiyi.com/en/gpt-image-2-api-font-prompt-typography-guide-en.html)
