import 'server-only';
import type { ImageCopyExemplarFile } from './_types';

/** Editorial · collage — eyebrow, headline, subheadline, wordmark.
 *  Asymmetric magazine-spread; no center card, no balanced grid. */
const EXEMPLARS: ImageCopyExemplarFile = {
  layoutId: 'editorial-collage',
  exemplars: [
    {
      scenarioContext:
        'Mercury publishes an open letter to founders — campaign cover for a quarterly retrospective.',
      brandHint: 'Mercury. Tone: confident-finance, precise, dry humour. Palette: charcoal + amber.',
      goodCopy: {
        eyebrow: 'DEAR FOUNDERS',
        headline: 'An open letter from the Mercury team',
        subheadline:
          'Two years ago we promised banking built for the people building. Here\'s what we shipped this quarter, signed by the people who built it.',
        wordmark: 'Mercury',
      },
      whyItWorks:
        'Eyebrow ("DEAR FOUNDERS") is the salutation of an actual letter — sets up the editorial conceit. Subhead\'s last clause ("signed by the people who built it") promises accountability and personality without saying "transparent" or "human".',
    },
    {
      scenarioContext:
        "Cal.com publishes a long-form essay by their CTO on scheduling as next-layer infra.",
      brandHint: 'Cal.com. Tone: dev-tool, sharp, dry. Palette: ink black + lime green.',
      goodCopy: {
        eyebrow: 'REPORTAJE · ISSUE 04',
        headline: 'The 4 a.m. founder problem',
        subheadline:
          'Why product-grade scheduling tools are the next infra layer, written by Cal.com\'s CTO over two flights and a layover in Reykjavík.',
        wordmark: 'Cal.com',
      },
      whyItWorks:
        'Headline plants a specific time ("4 a.m.") that names a felt founder moment. Subhead\'s byline detail (flights, Reykjavík) sells the essay as a real artifact written by a real person — not a content-mill SEO post.',
    },
    {
      scenarioContext:
        'Linear runs a roadmap-cut announcement framed as an editor\'s note: doing fewer things, shipping them farther.',
      brandHint: 'Linear. Tone: confident, technical, calm. Palette: graphite + electric purple.',
      goodCopy: {
        eyebrow: 'FROM THE EDITORS',
        headline: 'We made fewer things this year',
        subheadline:
          'And we shipped the ones we did farther. Notes on the Linear roadmap, two cuts and a closer.',
        wordmark: 'Linear',
      },
      whyItWorks:
        'Headline\'s admission ("fewer things") would be a confession from another company but is a flex here. Subhead delivers the editorial vocabulary ("two cuts and a closer") that signals craft.',
    },
  ],
};

export default EXEMPLARS;
