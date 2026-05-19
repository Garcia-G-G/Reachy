import 'server-only';
import type { ImageCopyExemplarFile } from './_types';

/** Hero · split left — eyebrow, headline, subheadline, cta. Two-zone
 *  composition: one side type, one side visual. */
const EXEMPLARS: ImageCopyExemplarFile = {
  layoutId: 'hero-split-left',
  exemplars: [
    {
      scenarioContext:
        'Linear launches Insights — automatic cycle reports built from real activity instead of weekly status meetings.',
      brandHint: 'Linear. Tone: confident, technical, calm. Palette: graphite + electric purple.',
      goodCopy: {
        eyebrow: 'Linear Insights',
        headline: 'See where the work actually went',
        subheadline:
          'Cycle reports built from real activity. Not status update meetings, not retros, not stand-ups.',
        cta: 'See a sample report',
      },
      whyItWorks:
        'Sets the headline against an implicit accusation (your status meetings are lying to you) and the subheadline lists the specific rituals it replaces. CTA promises a real artifact, not a demo call.',
    },
    {
      scenarioContext:
        'Mercury releases the IO API — a TypeScript SDK that makes business banking programmable for fintech-adjacent builders.',
      brandHint: 'Mercury. Tone: confident-finance, precise, dry humour. Palette: charcoal + amber.',
      goodCopy: {
        eyebrow: 'IO · public beta',
        headline: 'Programmable banking for builders',
        subheadline:
          'One TypeScript SDK for accounts, cards, wires, and reconciliation. Built by your fintech, not a bank.',
        cta: 'Read the SDK docs',
      },
      whyItWorks:
        'Enumerates the concrete primitives covered (accounts, cards, wires, reconciliation) instead of saying "everything you need". The subheadline\'s second clause throws shade at bank-built APIs without naming them.',
    },
    {
      scenarioContext:
        'Tigris launches multi-region S3-compatible object storage that follows the request region automatically.',
      brandHint: 'Tigris. Tone: infra-grade, no-nonsense. Palette: deep navy + bright orange.',
      goodCopy: {
        eyebrow: 'Globally available · today',
        headline: 'Object storage that follows the request',
        subheadline:
          'S3-compatible. Reads from the region closest to the user. No replication config, no rules engine.',
        cta: 'Spin up a bucket',
      },
      whyItWorks:
        'Headline names the mechanism in one sentence ("follows the request") so the reader knows what they\'re getting. The subheadline\'s "no X, no Y" pattern is a specificity device — names the burdens the product removes.',
    },
  ],
};

export default EXEMPLARS;
