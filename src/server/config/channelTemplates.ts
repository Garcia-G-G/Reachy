import 'server-only';

/**
 * Copy-channel templates for the autopilot campaign planner.
 *
 * Each entry is a SPEC, not a derived fact — these formats (LinkedIn
 * post sizes, X-thread tweet count, IG caption length, email
 * structure) are platform conventions Reachy commits to. Tightening
 * any single channel here updates the planner's catalog AND any
 * downstream copy-generation worker reading the same map, so there's
 * a single source of truth.
 *
 * targetWordCount is the planner's North Star for the asset's brief.
 * toneHints + structureHints prime the copy planner per channel.
 */

export type ChannelKey =
  | 'linkedin-post-long'
  | 'linkedin-post-short'
  | 'x-thread'
  | 'instagram-caption'
  | 'email-pitch-cold'
  | 'email-pitch-warm'
  | 'blog-outline'
  | 'press-release-short';

export interface ChannelSpec {
  key: ChannelKey;
  label: string;
  /** Target words for the final copy. The planner uses this on each
   *  PlannedAsset; the copy-gen worker (Step 4) honors it as a soft cap. */
  targetWordCount: number;
  toneHints: readonly string[];
  structureHints: readonly string[];
}

export const CHANNEL_TEMPLATES: Record<ChannelKey, ChannelSpec> = {
  'linkedin-post-long': {
    key: 'linkedin-post-long',
    label: 'LinkedIn · long-form',
    targetWordCount: 320,
    toneHints: ['founder-voice', 'specific over abstract', 'no humble-brag'],
    structureHints: [
      'open with a concrete moment, not a thesis',
      'two short paragraphs of context',
      'one paragraph naming the product + what it changed',
      'close with a single line that invites a reply',
    ],
  },
  'linkedin-post-short': {
    key: 'linkedin-post-short',
    label: 'LinkedIn · short',
    targetWordCount: 90,
    toneHints: ['punchy', 'one idea', 'no preamble'],
    structureHints: [
      'first line is the hook — read in 2 seconds',
      'two or three short sentences of substance',
      'no CTA — let the post breathe',
    ],
  },
  'x-thread': {
    key: 'x-thread',
    label: 'X / Twitter · thread',
    targetWordCount: 220,
    toneHints: ['conversational', 'momentum', 'each tweet stands alone'],
    structureHints: [
      'tweet 1 is the bait — claim or hook',
      'tweets 2-6 each carry one specific point',
      'final tweet closes the loop with the product mention',
    ],
  },
  'instagram-caption': {
    key: 'instagram-caption',
    label: 'Instagram · caption',
    targetWordCount: 60,
    toneHints: ['warm', 'in voice', 'no hashtag spam'],
    structureHints: [
      'one short line that hooks',
      'one short line of substance',
      'optional one-line CTA',
      'no emoji wall',
    ],
  },
  'email-pitch-cold': {
    key: 'email-pitch-cold',
    label: 'Email · cold pitch',
    targetWordCount: 110,
    toneHints: ['respectful', 'specific about why this person', 'no flattery'],
    structureHints: [
      'subject line in first words (you write the email body, planner generates a separate subject hint)',
      'one paragraph naming who + why this product helps them',
      'one paragraph with the smallest useful next step',
      'sign-off in voice',
    ],
  },
  'email-pitch-warm': {
    key: 'email-pitch-warm',
    label: 'Email · warm follow-up',
    targetWordCount: 90,
    toneHints: ['friendly', 'continuity from a prior touch', 'short'],
    structureHints: [
      'reference the prior context in one short line',
      'name the change since then',
      'invite a low-friction action',
    ],
  },
  'blog-outline': {
    key: 'blog-outline',
    label: 'Blog · outline',
    targetWordCount: 180,
    toneHints: ['structural', 'each section name is a claim'],
    structureHints: [
      'working title',
      'three to six section headers with one-line gloss each',
      'closing-section header that names the takeaway',
    ],
  },
  'press-release-short': {
    key: 'press-release-short',
    label: 'Press release · short',
    targetWordCount: 180,
    toneHints: ['third-person', 'factual', 'no marketing fluff'],
    structureHints: [
      'headline (no period)',
      'dateline + lede in one paragraph',
      'one paragraph of context + a single quote from the founder',
      'one closing line on the company in one sentence',
    ],
  },
};

export const CHANNEL_KEYS = Object.keys(CHANNEL_TEMPLATES) as ChannelKey[];

export function channelSpec(key: ChannelKey): ChannelSpec {
  return CHANNEL_TEMPLATES[key];
}
