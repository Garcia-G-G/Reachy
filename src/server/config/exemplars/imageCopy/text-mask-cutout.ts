import 'server-only';
import type { ImageCopyExemplarFile } from './_types';

/** Text · mask cutout — headline, subheadline, wordmark. Typography
 *  AS image-mask; one dominant word's letterforms become cutouts. */
const EXEMPLARS: ImageCopyExemplarFile = {
  layoutId: 'text-mask-cutout',
  exemplars: [
    {
      scenarioContext:
        'Linear runs a single-word focus campaign for their Cycle view, with the letterforms revealing a softly-lit workspace photograph.',
      brandHint: 'Linear. Tone: confident, technical, calm. Palette: graphite + electric purple.',
      goodCopy: {
        headline: 'FOCUS',
        subheadline: "Linear's new Cycle view, opened only on the work that still needs you.",
        wordmark: 'Linear',
      },
      whyItWorks:
        'One word as the entire mark — the reader has to look longer, which is the visual point of a cutout layout. Subhead carries the actual product info; headline carries the mood.',
    },
    {
      scenarioContext:
        'Vercel announces a faster build pipeline with a verb-cutout poster, the cutout showing a green CI run.',
      brandHint: 'Vercel. Tone: infra-grade, builder-warm. Palette: white + black + neon green.',
      goodCopy: {
        headline: 'SHIP',
        subheadline: 'From PR to production in twelve minutes, on the new Vercel build pipeline.',
        wordmark: 'Vercel',
      },
      whyItWorks:
        'A verb cutout sells action — the subhead delivers the concrete proof ("twelve minutes") so the headline\'s confidence is paid off. The word matches the user\'s actual goal.',
    },
    {
      scenarioContext:
        'Mercury runs a noun-cutout campaign around the invisible parts of running a company, with letterforms revealing a hand-drawn ledger background.',
      brandHint:
        'Mercury. Tone: confident-finance, precise, dry humour. Palette: charcoal + amber.',
      goodCopy: {
        headline: 'MONEY',
        subheadline: 'Mercury, but for the part of running a company nobody sees on the dashboard.',
        wordmark: 'Mercury',
      },
      whyItWorks:
        'A flat one-word noun against a sub that immediately complicates it ("the part nobody sees"). The cutout reveals the texture the headline is gesturing at — visual and verbal layers reinforce each other.',
    },
  ],
};

export default EXEMPLARS;
