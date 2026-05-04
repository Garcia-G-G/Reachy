# Phase 05 — COPY GENERATION (bilingual ES/EN)

> **Read `00-CONTEXT.md`. Phases 01–04 complete.**
> **Take your time. Apply §0.10 of `00-CONTEXT.md` (Quality & depth directive). Do NOT deliver in 5 minutes — research, plan, build, verify, refactor, re-read. Garcia values depth over speed.**

## Goal

Garcia generates marketing copy in Spanish and English simultaneously, with tone consistent with the project's Brand Kit. Formats: tweet/X, thread, LinkedIn post, Instagram post (caption + 5 hashtags), email subject + preview + body, landing headline, feature bullets, "How it works" section.

## Prior research

WebSearch:
- Latest OpenAI text model available (GPT-5, GPT-4.1, or whatever is top in May 2026). Check context windows and pricing.
- Best practices for `response_format: { type: 'json_schema' }` as of May 2026 (formerly "structured outputs")
- Whether it's worth using Anthropic Claude for Spanish copy (sometimes better for non-English). If Garcia says OpenAI only, skip.

## Steps

### 1. Copy format catalog

`src/server/ai/copyFormats.ts` — labels here are i18n keys, the actual label resolves through `next-intl`. For brevity show English defaults:

```ts
export const COPY_FORMATS = {
  'tweet':         { labelKey: 'copy.tweet',        label: 'Tweet / X (≤280)',                    maxChars: 280 },
  'thread':        { labelKey: 'copy.thread',       label: 'X thread (5-7 tweets)',               maxItems: 7 },
  'linkedin':      { labelKey: 'copy.linkedin',     label: 'LinkedIn post (≤1500)',               maxChars: 1500 },
  'ig-caption':    { labelKey: 'copy.igCaption',    label: 'Instagram caption + hashtags',        maxChars: 2200 },
  'email-subject': { labelKey: 'copy.emailSubject', label: 'Email subject + preview',             maxChars: 60 },
  'email-body':    { labelKey: 'copy.emailBody',    label: 'Email body (campaign)',               maxChars: 1500 },
  'headline':      { labelKey: 'copy.headline',     label: 'Landing headline + subheadline',      maxChars: 120 },
  'features':      { labelKey: 'copy.features',     label: '3 feature bullets',                   maxItems: 3 },
  'how-it-works':  { labelKey: 'copy.howItWorks',   label: '3 "How it works" steps',              maxItems: 3 },
} as const;
```

### 2. JSON schema per format

Each format expects a specific shape. Example `tweet`:
```ts
{ type: 'object', properties: { es: { type: 'string' }, en: { type: 'string' } }, required: ['es','en'] }
```

`thread`:
```ts
{ type: 'object', properties: {
    es: { type:'array', items:{ type:'string' }, minItems:5, maxItems:7 },
    en: { type:'array', items:{ type:'string' }, minItems:5, maxItems:7 }
  }, required: ['es','en']
}
```

`headline`:
```ts
{ type: 'object', properties: {
    es: { type:'object', properties:{ headline:{type:'string'}, sub:{type:'string'}}, required:['headline','sub']},
    en: { type:'object', properties:{ headline:{type:'string'}, sub:{type:'string'}}, required:['headline','sub']}
  }, required:['es','en']
}
```

Encode them all in `src/server/ai/copySchemas.ts`.

### 3. System prompt + builder (English, with bilingual output)

`src/server/ai/copyPrompts.ts`:
```ts
export function buildSystemPrompt(brandKit: BrandKitData) {
  return `You are a marketing copywriter for SaaS apps. You write in NATIVE SPANISH and NATIVE ENGLISH.

RULES:
- Every output includes both "es" and "en" versions, always
- Tone: ${brandKit.voice?.tone ?? 'direct, clear, no jargon'}
- DO NOT use: ${(brandKit.voice?.doNot ?? []).join(', ') || 'generic clichés, "revolutionary", "the best"'}
- Product keywords: ${(brandKit.keywords ?? []).join(', ')}
- Audience: ${brandKit.audience ?? 'indie hackers and technical founders'}
- No emojis unless the format is ig-caption
- No excessive exclamation marks
- Concrete > abstract. Benefit > feature.
- Spanish is the primary market — make the ES version sound native, not translated.`;
}

export function buildUserPrompt({ format, idea, project }: Args) {
  return `Product: ${project.name}. ${project.description ?? ''}
Site: ${project.websiteUrl ?? '(no site yet)'}

Idea or angle: ${idea}

Requested format: ${format} (${COPY_FORMATS[format].label})

Return JSON matching the provided schema.`;
}
```

> Note: the system prompt is now in English. We rely on the model (GPT-5/4.1) handling Spanish output natively. If you observe the ES output reading translated rather than native, switch the system prompt to Spanish (it primes ES output better). Make the prompt language a configurable parameter so we can A/B test.

### 4. Generation function

`src/server/ai/copyGen.ts`:
```ts
import { openai } from './openai';
import { copySchemas } from './copySchemas';

export async function generateCopy({ format, idea, project, brandKit }: Args) {
  const completion = await openai.chat.completions.create({
    model: 'gpt-5', // or current top model
    messages: [
      { role: 'system', content: buildSystemPrompt(brandKit) },
      { role: 'user', content: buildUserPrompt({ format, idea, project }) },
    ],
    response_format: { type: 'json_schema', json_schema: { name: format, schema: copySchemas[format], strict: true } },
    temperature: 0.7,
  });
  const content = completion.choices[0].message.content!;
  const parsed = JSON.parse(content);
  return { parsed, usage: completion.usage };
}
```

Cost: use `usage.total_tokens * pricing` to store in `costCents`.

### 5. Server Actions and persistence

- `generateCopyAction({ projectId, format, idea })` — sync (no need for queue, LLMs respond fast).
- Creates `generation` row with status='running' → calls → on receipt, creates `asset` rows one per language (text), `kind='copy'`.

### 6. UI — Copy generator (editorial)

`/app/projects/[slug]/generate/copy`:
- Editorial form (no rounded fields, border-bottom inputs):
  - Select Format
  - Textarea Idea / angle
  - `<BtnInk>` "Generate"
- Result: two columns side by side (ES | EN), each one styled like a magazine column. Each has a "Copy" button. If format is array (thread, features), render as a numbered list with Fraunces numbers.

### 7. Variants

"Regenerate variant" button — repeats with `temperature: 0.9` and saves another `generation`. Garcia sees the history to choose.

### 8. Copy archive

`/app/projects/[slug]/library?tab=copy` — editorial table: date, format, language, snippet (50 chars), "View/Copy" button. Use Fraunces for headers, mono for dates, no borders except thin horizontal rules.

## Acceptance criteria

- [ ] I generate a tweet, get ES and EN consistent with the brand
- [ ] I generate a 7-tweet thread, comes as array
- [ ] I generate email subject+preview, comes as object with both fields
- [ ] The tone reflects what's configured in Brand Kit
- [ ] If keywords are in the brand, they appear naturally
- [ ] Approximate cost recorded
- [ ] Variants work and are saved separately

## Verification

Generate 3 copies with different tones (calm, technical, playful) — manually compare that the output changes noticeably.

## Expected output

Report §0.8 + next phase: **06-VIDEO-FFMPEG.md**
