import 'server-only';
import type { ImageCopyExemplarFile } from './_types';

/** Announcement · banner — eyebrow, headline, cta. Wide-format, the
 *  eye reads left-to-right; the typography lands in a settled zone. */
const EXEMPLARS: ImageCopyExemplarFile = {
  layoutId: 'announcement-banner',
  exemplars: [
    {
      scenarioContext:
        'Stripe Atlas launches a refresh that cuts incorporation time to under ten minutes for solo founders.',
      brandHint: 'Stripe. Tone: confident-infrastructure, calm. Palette: deep indigo + white.',
      goodCopy: {
        eyebrow: 'Stripe Atlas · 2026',
        headline: 'Start a Delaware C-Corp in 9 minutes',
        cta: 'Open Atlas',
      },
      whyItWorks:
        'Concrete number ("9 minutes") and concrete artifact ("Delaware C-Corp") instead of "the easiest way to incorporate". The reader knows exactly what they get in exactly how long.',
    },
    {
      scenarioContext:
        'Replicate adds FLUX.2 [pro] to their inference grid — first SOTA image model for indie devs.',
      brandHint: 'Replicate. Tone: infra-grade, builder-warm. Palette: white + lavender + black.',
      goodCopy: {
        eyebrow: 'New on Replicate',
        headline: 'FLUX.2 [pro] lands on the inference grid',
        cta: 'Try it free',
      },
      whyItWorks:
        'Uses the model name verbatim (FLUX.2 [pro]) — the audience already wants this specific model. "Lands on the inference grid" is the company\'s own internal language; sounds insider rather than marketing.',
    },
    {
      scenarioContext:
        'Cal.com Atoms wins #1 Product of the Day on Product Hunt and runs a banner thanking the community.',
      brandHint: 'Cal.com. Tone: dev-tool, sharp, dry. Palette: ink black + lime green.',
      goodCopy: {
        eyebrow: '#1 Product of the Day',
        headline: 'Atoms is live on Product Hunt',
        cta: 'Cast a vote',
      },
      whyItWorks:
        'The eyebrow is a specific accolade with social proof baked in. CTA is the exact verb of the next required action — not "Support us", not "Learn more". One line, one ask.',
    },
  ],
};

export default EXEMPLARS;
