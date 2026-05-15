import 'server-only';
import type { BrandVoice } from '@/server/db/schema/brandKits';

/**
 * Map a brief.tone ('editorial' | 'playful' | 'technical' | 'enterprise'
 * | 'indie') to a BrandVoice shape ({ tone, doSay, dontSay }) the rest
 * of the pipeline already consumes.
 *
 * Cannot be derived: each tone needs a human-curated doSay/dontSay
 * list, anchored to a register the planner can write to consistently.
 * The lists are short on purpose — the copy planner already has
 * language-specific cliché blacklists; this just primes the register.
 *
 * Reused by Step 4's reel pipeline so updates land everywhere at once.
 */

export type ProductBriefTone = 'editorial' | 'playful' | 'technical' | 'enterprise' | 'indie';

export const TONE_TO_VOICE: Record<ProductBriefTone, BrandVoice> = {
  editorial: {
    tone: 'editorial, considered, magazine-grade — slight bite, no slogans',
    doSay: ['considered', 'crafted', 'measured', 'specific'],
    dontSay: ['game-changing', 'next-gen', 'cutting-edge'],
  },
  playful: {
    tone: 'playful, warm, irreverent without being unprofessional',
    doSay: ['try it', 'see what happens', 'why not'],
    dontSay: ['unlock', 'level up', 'supercharge'],
  },
  technical: {
    tone: 'technical, precise, concrete; assumes the reader is a builder',
    doSay: ['ships', 'measures', 'integrates', 'returns'],
    dontSay: ['transform your', 'reimagine', 'paradigm'],
  },
  enterprise: {
    tone: 'enterprise-credible, restrained, outcome-focused',
    doSay: ['reduces', 'consolidates', 'governs', 'audits'],
    dontSay: ['craft your', 'your brand story', 'designed for'],
  },
  indie: {
    tone: 'indie-builder, direct, founder-voice; first-person where natural',
    doSay: ['built this', 'shipped today', 'works for me'],
    dontSay: ['revolutionize', 'disrupt', 'next-gen'],
  },
};

export function voiceForTone(tone: ProductBriefTone): BrandVoice {
  return TONE_TO_VOICE[tone];
}
