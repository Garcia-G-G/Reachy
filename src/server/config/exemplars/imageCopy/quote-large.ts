import 'server-only';
import type { ImageCopyExemplarFile } from './_types';

/** Quote · large — headline, subheadline. Typography-led poster
 *  where the quote IS the composition. No card, no slab, no chrome. */
const EXEMPLARS: ImageCopyExemplarFile = {
  layoutId: 'quote-large',
  exemplars: [
    {
      scenarioContext:
        'Founder testimonial used as a poster for Mercury — the indie banking choice as a Friday ritual.',
      brandHint:
        'Mercury. Tone: confident-finance, precise, dry humour. Palette: charcoal + amber.',
      goodCopy: {
        headline: '"Every Friday I open Mercury before I open Slack."',
        subheadline: '— Tomás, founder at Bunny',
      },
      whyItWorks:
        'Quote names a specific habit ("Friday before Slack") that signals devotion without ever saying "I love Mercury". Reader imports the meaning from the implied ritual.',
    },
    {
      scenarioContext:
        'Linear publishes a manifesto-style poster ahead of their summer release event.',
      brandHint: 'Linear. Tone: confident, technical, calm. Palette: graphite + electric purple.',
      goodCopy: {
        headline: '"Software should hold the shape of the team using it."',
        subheadline: "— Notes on Linear's next chapter",
      },
      whyItWorks:
        'A position statement, not a benefit pitch. Reader is invited to agree or disagree — both reactions deepen the brand relationship. Subhead frames the quote as company writing, not marketing copy.',
    },
    {
      scenarioContext:
        'Pico runs a counterpoint poster — pushing back on dashboard-first product orthodoxy.',
      brandHint: 'Pico. Tone: dev-tool, infrastructure-leaning. Palette: white + electric blue.',
      goodCopy: {
        headline: '"The dashboard wasn\'t the product. The decision was."',
        subheadline: '— On building Pico',
      },
      whyItWorks:
        'Argues against a common industry assumption (more UI = more value) by naming what it should be replaced with ("the decision"). Headline reads like a sentence the reader wishes they\'d written.',
    },
  ],
};

export default EXEMPLARS;
