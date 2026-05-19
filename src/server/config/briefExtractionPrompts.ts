import 'server-only';

/**
 * Static prompt fragments for the autopilot brief extractor.
 *
 * Lives in config/ to satisfy the anti-hardcode rule: no string
 * literal longer than 30 chars may appear in src/server/ingest/.
 * Pure descriptive task language only — the few-shot / per-bundle
 * examples are generated from IngestedBundle inside extractBrief.ts.
 *
 * Cannot be derived: this is the editor's framing for what a
 * ProductBrief *is*. Tightening the wording here improves output
 * quality across every brand; it's a piece of product copy, not a
 * runtime computation.
 */

export const BRIEF_SYSTEM_LINES: readonly string[] = [
  'You are the analyst inside Reachy autopilot.',
  'Job: extract a single ProductBrief from a parsed upload.',
  'The upload may be a doc, a deck, a sheet, a code repo, or a mix.',
  'Read every section carefully. Cite the source filename for each field when possible.',
  '',
  'Hard rules:',
  '- No marketing fluff in your output. Concrete nouns over abstract nouns.',
  '- One-liner stays under 90 characters. No exclamation marks.',
  '- features[].verb is a single action verb in present tense.',
  '- audience[].role is a job title or persona, not a generic noun.',
  '- tone: pick exactly one of editorial / playful / technical / enterprise / indie.',
  '- paletteHex values are real 6-digit hex (#rrggbb). When uncertain, return "#000000" for each slot as a sentinel — a downstream text-inference step will fill it. Do NOT return a monochrome guess; the sentinel is preferred over a confident-looking but generic choice.',
  '- languages: only en / es. Pick what the upload is written in.',
  '- confidence: 0..1. Drop it when sources contradict each other or the bundle is thin.',
  '- referenceImages: copy R2 keys from the images section verbatim. Pick the 3 most brand-relevant. Pick zero if none look like brand references.',
  '',
  'When the bundle is thin or contradictory, prefer SHORTER claims at LOWER confidence over confident guesses.',
];

export const BRIEF_SECTION_HEADERS = {
  fileTypeMix: '[FILE TYPE MIX]',
  headings: '[HEADINGS]',
  textBlocks: '[TEXT BLOCKS]',
  tables: '[TABLES]',
  code: '[CODE CONTEXT]',
  images: '[IMAGE REFERENCES]',
  instruction: '[YOUR TASK]',
} as const;

export const BRIEF_INSTRUCTION_LINES: readonly string[] = [
  'Read every section.',
  'Produce a JSON object that matches the schema. Strict mode is on — do not add fields.',
  'For each field, prefer evidence from the upload over assumptions.',
  'When you have to assume, write a SHORTER value and lower the confidence score.',
];

/**
 * Anchor-phrases shown to the model to help it interpret each section
 * label. These are READ-ONLY hints, not examples — they don't tell the
 * model what to write, only what each upstream section means.
 */
export const BRIEF_SECTION_HINTS: Record<keyof typeof BRIEF_SECTION_HEADERS, string> = {
  fileTypeMix: 'How many files of each extension landed in this upload.',
  headings: 'The full heading hierarchy across every source file, in order.',
  textBlocks: 'Source-tagged paragraphs from every parsed file.',
  tables: 'Tabular data (xlsx / csv). Header row first.',
  code: 'Code files we ingested. Symbols + top comments only — body text omitted to save tokens.',
  images:
    'Image refs Step 1 extracted — R2 keys, dimensions, palettes. Use these when populating referenceImages.',
  instruction: 'What to do.',
};

/** Vision-pass prompt fragments (Block D). Same anti-hardcode logic. */
export const VISION_SYSTEM_LINES: readonly string[] = [
  'You are looking at images from a product brand kit / marketing upload.',
  'Your job: extract a brand-identity summary from what you see across them.',
  '',
  'Hard rules:',
  '- paletteHex is 3 entries: ink (text + dominant tones), paper (background / light tones), accent (one highlight).',
  '- Hex values must be 6-digit (#rrggbb).',
  '- styleDescriptor is ONE word — pick what the images visually suggest.',
  '- logoR2Key is the R2 key of the most logo-like image in the input, or null if none look like a logo (photo, screenshot, etc.).',
  '- confidence: 0..1 — drop it when images disagree or are off-brand stock.',
];

export const VISION_INSTRUCTION_LINES: readonly string[] = [
  'Look at every image.',
  'Return a JSON object matching the schema. Strict mode is on.',
  'When images disagree on palette, return the palette of the image that reads most like a brand reference.',
];
