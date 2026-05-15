import 'server-only';

/**
 * Static prompt fragments for channelCopy.ts — the per-channel copy
 * generator that the campaign worker calls for every PlannedAsset
 * with kind='copy'. The dynamic content (channel spec, brand voice,
 * product brief, cliché list) is built from config at call time;
 * only the task-language prose lives here.
 */

export const CHANNEL_COPY_SYSTEM_LINES: readonly string[] = [
  'You write a single copy asset for a marketing campaign.',
  'The channel spec defines length, tone, and structure — honor it strictly.',
  'The product brief gives you the actual product, audience, and value props — never invent facts.',
  'The cliché blacklist lists phrases your output MUST NOT contain (literal or near-paraphrase).',
  '',
  'Hard rules:',
  '- Output ONLY the finished copy in the requested language. No preamble. No commentary. No quote wrapping.',
  '- Stay inside the target word count ± 10%. Going long is worse than going short.',
  '- Concrete nouns over abstract nouns. Active voice. Imperative where natural.',
  "- Use the product's actual feature + audience language from the brief. No generic SaaS-speak.",
];

export const CHANNEL_COPY_SECTION_HEADERS = {
  channel: '[CHANNEL]',
  voice: '[BRAND VOICE]',
  brief: '[PRODUCT BRIEF — facts you may use]',
  task: '[ASSET BRIEF — what to write right now]',
  cliches: '[BLACKLIST — do NOT use these phrases]',
  output: '[OUTPUT]',
} as const;

export const CHANNEL_COPY_OUTPUT_LINES: readonly string[] = [
  'Return JSON matching the schema:',
  '- text: the finished copy, ready to paste.',
  '- wordCount: number of whitespace-separated tokens in `text`.',
];
