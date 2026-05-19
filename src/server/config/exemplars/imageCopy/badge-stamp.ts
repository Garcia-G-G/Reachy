import 'server-only';
import type { ImageCopyExemplarFile } from './_types';

/** Badge · stamp — eyebrow, headline, subheadline. A printed-stamp
 *  element anchors the frame; eyebrow lives INSIDE the stamp. */
const EXEMPLARS: ImageCopyExemplarFile = {
  layoutId: 'badge-stamp',
  exemplars: [
    {
      scenarioContext:
        'Linear publishes a seven-year retrospective with an anniversary badge as the focal motif.',
      brandHint: 'Linear. Tone: confident, technical, calm. Palette: graphite + electric purple.',
      goodCopy: {
        eyebrow: 'FOUNDED · 2019 · 7 YEARS',
        headline: "Linear's first seven years, in one report",
        subheadline:
          'Cycles shipped, customers acquired, and the three product directions we killed.',
      },
      whyItWorks:
        'Eyebrow is the stamp\'s own text — reads as a postmark, not a tagline. Subhead\'s last clause ("the three product directions we killed") signals the report has real content, not promotional fluff.',
    },
    {
      scenarioContext:
        'Cal.com Atoms launches as a "first edition" — the developer API treated as a printed object.',
      brandHint: 'Cal.com. Tone: dev-tool, sharp, dry. Palette: ink black + lime green.',
      goodCopy: {
        eyebrow: 'FIRST EDITION · MAY 2026',
        headline: 'Atoms · the scheduling primitive',
        subheadline: "Cal.com's new API, built so calendars can finally talk to other software.",
      },
      whyItWorks:
        'The first-edition framing collapses the launch into a physical object the reader can imagine handling. Subhead\'s "finally" carries the implicit critique of legacy calendar tools without naming them.',
    },
    {
      scenarioContext:
        'Mercury wraps a quarterly founder letter with a "read by 28K builders" social-proof badge.',
      brandHint:
        'Mercury. Tone: confident-finance, precise, dry humour. Palette: charcoal + amber.',
      goodCopy: {
        eyebrow: 'READ BY 28K BUILDERS',
        headline: 'The Mercury Q2 letter',
        subheadline:
          "Six pages on what changed in indie banking, lightly edited from the founder's keyboard.",
      },
      whyItWorks:
        'Eyebrow uses a specific number as the badge — quietly social-proofs without claiming "trusted by". Subhead\'s "lightly edited" detail signals the letter is closer to a Slack message than a press release.',
    },
  ],
};

export default EXEMPLARS;
