import 'server-only';
import type { ImageCopyExemplarFile } from './_types';

/** Editorial · margin — eyebrow, headline, subheadline, wordmark.
 *  Magazine-page geometry with a marginalia column. */
const EXEMPLARS: ImageCopyExemplarFile = {
  layoutId: 'editorial-margin',
  exemplars: [
    {
      scenarioContext:
        'Mercury publishes a quarterly report styled as a magazine cover — "How we underwrote the indie wave."',
      brandHint: 'Mercury. Tone: confident-finance, precise, dry humour. Palette: charcoal + amber.',
      goodCopy: {
        eyebrow: 'ISSUE №14 · Q2 2026',
        headline: 'How Mercury underwrote the indie wave',
        subheadline:
          'Two years after launch, the bank built for software people is funding the software.',
        wordmark: 'Mercury Quarterly',
      },
      whyItWorks:
        'Eyebrow uses real magazine numbering (ISSUE №14) — sells the editorial conceit. Headline is a thesis statement; subhead reframes it as a one-line argument. Reads as journalism, not promo.',
    },
    {
      scenarioContext:
        "Linear publishes a 'field notes' essay about their open-rebuild of the editor surface.",
      brandHint: 'Linear. Tone: confident, technical, calm. Palette: graphite + electric purple.',
      goodCopy: {
        eyebrow: 'FIELD NOTE 03',
        headline: 'We rebuilt the editor in the open',
        subheadline:
          'Every PR, every revert, every dead branch. Twelve weeks. Three full rewrites. One shipped.',
        wordmark: 'Linear',
      },
      whyItWorks:
        'Subheadline\'s rhythm (three short sentences with progressively fewer words) builds momentum and lands the result ("One shipped") as a punchline. Eyebrow as field-research vocabulary.',
    },
    {
      scenarioContext:
        'Reachy publishes a product essay defending an opinionated default — capping autopilot at 24 assets per campaign.',
      brandHint: 'Reachy. Tone: editorial indie. Palette: warm cream paper + ink + burnt sienna.',
      goodCopy: {
        eyebrow: 'POSTING · MAY 2026',
        headline: 'Why our autopilot stops at twenty-four assets',
        subheadline:
          'Twenty-four covers a launch week. Past that, you\'re not running a campaign — you\'re farming the algorithm.',
        wordmark: 'Reachy',
      },
      whyItWorks:
        'Headline poses a why-question that defends a specific number; subhead delivers the argument with a "not X, but Y" reframe. The number (twenty-four) appears in both places — anchors the reader.',
    },
  ],
};

export default EXEMPLARS;
