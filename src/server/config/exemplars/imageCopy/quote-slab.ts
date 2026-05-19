import 'server-only';
import type { ImageCopyExemplarFile } from './_types';

/** Quote · slab — headline, subheadline, wordmark. A pull-quote
 *  presented like a printed broadside; headline is the quote, sub is
 *  the attribution, wordmark stamps it. */
const EXEMPLARS: ImageCopyExemplarFile = {
  layoutId: 'quote-slab',
  exemplars: [
    {
      scenarioContext:
        'Customer testimonial card for Linear, from an engineering lead at a mid-stage gamedev studio.',
      brandHint: 'Linear. Tone: confident, technical, calm. Palette: graphite + electric purple.',
      goodCopy: {
        headline: '"We moved four quarters of bug debt in one cycle."',
        subheadline: '— Adam Conrad, eng lead at Pixelmind',
        wordmark: 'Linear',
      },
      whyItWorks:
        'The quote names a specific measurable outcome ("four quarters of bug debt") instead of a vague feeling like "We love Linear". Attribution is a real-shaped role at a believably-sized company.',
    },
    {
      scenarioContext:
        "Founder note used as a campaign card for Reachy — the indie hacker's own confession about what they'd undo.",
      brandHint: 'Reachy. Tone: editorial indie. Palette: warm cream paper + ink + burnt sienna.',
      goodCopy: {
        headline: '"The first hire I\'d undo is the project manager."',
        subheadline: '— Garcia, on building Reachy',
        wordmark: 'Reachy',
      },
      whyItWorks:
        "First-person and uncomfortable — the founder takes a side instead of stating a benefit. Doesn't try to sell the product; the product is implicit in the position.",
    },
    {
      scenarioContext:
        'Engineer testimonial for Plain, a customer-support tool built for product-led teams.',
      brandHint: 'Plain. Tone: dev-tool, dry, infrastructure-leaning. Palette: white + electric blue.',
      goodCopy: {
        headline: '"You can tell when a tool was made by people who actually triage."',
        subheadline: '— Yann F., senior engineer at Hugging Face',
        wordmark: 'Plain',
      },
      whyItWorks:
        'Names the product\'s differentiator from the user\'s point of view ("made by people who triage") rather than the brand\'s. Quote functions as gatekeeping signal — readers either nod or don\'t.',
    },
  ],
};

export default EXEMPLARS;
