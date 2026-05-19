import 'server-only';
import type { ChannelKey } from '@/server/config/channelTemplates';

/**
 * Channel-copy exemplars. One file per ChannelKey exports 3 entries.
 * Injected into generateChannelCopy's prompt as [GOOD EXAMPLES] above
 * the brief — the teaching signal does more than the rules.
 *
 * Quality bar: each `goodCopy` reads like a real post a founder would
 * be happy to publish. NOT marketing copy in disguise — voice-first,
 * specific moments, concrete nouns, no SaaS-speak.
 */

export interface ChannelCopyExemplar {
  scenarioContext: string;
  brandHint: string;
  goodCopy: string;
  whyItWorks: string;
}

export interface ChannelCopyExemplarFile {
  channel: ChannelKey;
  exemplars: readonly ChannelCopyExemplar[];
}
