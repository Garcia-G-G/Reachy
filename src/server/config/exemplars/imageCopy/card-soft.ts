import 'server-only';
import type { ImageCopyExemplarFile } from './_types';

/** Card · soft — eyebrow, headline, subheadline, cta, wordmark. A
 *  self-contained card with its own typography stack and signature. */
const EXEMPLARS: ImageCopyExemplarFile = {
  layoutId: 'card-soft',
  exemplars: [
    {
      scenarioContext:
        'Linear app store card for the iOS / Mac app — the kind of card that sits in a feature drawer.',
      brandHint: 'Linear. Tone: confident, technical, calm. Palette: graphite + electric purple.',
      goodCopy: {
        eyebrow: 'Issue tracking',
        headline: 'Built for Mondays',
        subheadline: 'Triage seventy issues to zero in under five minutes. Inbox, then close.',
        cta: 'Get Linear free',
        wordmark: 'Linear',
      },
      whyItWorks:
        'Two-step subheadline ("Inbox, then close") tells the workflow in three words. The headline plants the moment ("Mondays") without spelling out the benefit; reader fills in the rest.',
    },
    {
      scenarioContext:
        'Reachy launches its autopilot — drop a Notion doc, get back a 12-piece campaign in 90 seconds.',
      brandHint: 'Reachy. Tone: editorial indie. Palette: warm cream paper + ink + burnt sienna.',
      goodCopy: {
        eyebrow: 'Indie launch kit',
        headline: 'Twelve assets, one PDF',
        subheadline:
          'Drop your launch notes. Reachy turns them into a complete campaign in ninety seconds.',
        cta: 'Generate yours',
        wordmark: 'Reachy',
      },
      whyItWorks:
        'Specific output ("twelve assets") and specific input ("one PDF") set up the user\'s mental model in the headline. Subhead names the verb ("Drop your launch notes") as the literal first action.',
    },
    {
      scenarioContext:
        'Pico v0.4 launches schema branching — branched migrations for Postgres, modeled on git.',
      brandHint: 'Pico. Tone: dev-tool, infrastructure-leaning. Palette: white + electric blue + black.',
      goodCopy: {
        eyebrow: 'Pico · v0.4',
        headline: 'PostgreSQL, but you forget about it',
        subheadline:
          'Branched schemas. Zero-downtime migrations. The DX of git, sitting on top of Postgres.',
        cta: 'Sign up',
        wordmark: 'Pico',
      },
      whyItWorks:
        'Headline frames the value as an absence ("you forget about it") rather than a feature list. Subhead delivers the proof points in three short noun phrases — readable in 4 seconds.',
    },
  ],
};

export default EXEMPLARS;
