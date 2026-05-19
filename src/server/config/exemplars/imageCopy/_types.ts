import 'server-only';
import type { LayoutId, PromptCopy } from '@/server/ai/layoutTemplates';

/**
 * Shared exemplar shape for image-copy planning. Each layout has its
 * own file exporting `EXEMPLARS: ImageCopyExemplar[]` with 3 entries.
 *
 * The planner prompt injects exemplars matched to the active layout
 * as [GOOD EXAMPLES]. The teaching signal that moves quality the most
 * is `whyItWorks` — the model reads it as a quality criterion.
 *
 * Rules for new exemplars:
 *   1. Specific scenario (a real product moment, not "a marketing
 *      campaign"). Name the feature, the user, the moment.
 *   2. Brand hint with concrete palette + tone descriptor.
 *   3. `goodCopy` keys MUST match the layout's slots exactly. Extra
 *      keys waste tokens; missing keys produce empty layout zones.
 *   4. `whyItWorks` names a specific technique that GENERALIZES — what
 *      the model should learn from this example, not just what's good
 *      about this copy.
 */

export interface ImageCopyExemplar {
  scenarioContext: string;
  brandHint: string;
  goodCopy: PromptCopy;
  whyItWorks: string;
}

export interface ImageCopyExemplarFile {
  layoutId: LayoutId;
  exemplars: readonly ImageCopyExemplar[];
}
