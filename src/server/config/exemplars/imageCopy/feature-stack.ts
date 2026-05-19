import 'server-only';
import type { ImageCopyExemplarFile } from './_types';

/** Feature · stack — eyebrow, headline, subheadline, cta. Vertical
 *  composition that reads top-to-bottom; each zone has its own job. */
const EXEMPLARS: ImageCopyExemplarFile = {
  layoutId: 'feature-stack',
  exemplars: [
    {
      scenarioContext:
        'Linear launches their mobile app — triage from the phone, offline-first sync.',
      brandHint: 'Linear. Tone: confident, technical, calm. Palette: graphite + electric purple.',
      goodCopy: {
        eyebrow: 'Mobile · finally',
        headline: 'Linear on the phone, on a plane, on the bus',
        subheadline:
          'Triage your inbox without opening a laptop. Offline first. Syncs when you land.',
        cta: 'Get the app',
      },
      whyItWorks:
        'The triplet "on the phone, on a plane, on the bus" names three concrete situations the user lives — beats "anywhere" by being unfakeable. Eyebrow ("finally") winks at the long-awaited release.',
    },
    {
      scenarioContext:
        'Mercury introduces a solo-founder tier of the IO programmable banking API — no seat math, no annual minimum.',
      brandHint: 'Mercury. Tone: confident-finance, precise, dry humour. Palette: charcoal + amber.',
      goodCopy: {
        eyebrow: 'New plan · indie',
        headline: 'Mercury IO for solo founders',
        subheadline:
          'Programmable banking at one tenth the team plan. No seat math, no annual minimum.',
        cta: 'See the plan',
      },
      whyItWorks:
        'Headline names the exact audience ("solo founders") so the right reader self-identifies. Subhead\'s "no X, no Y" pattern removes objections by naming them; the comparison ("one tenth") is concrete.',
    },
    {
      scenarioContext:
        'Cal.com Atoms 1.4 ships auto-rescheduling when two attendees swap calendars mid-week.',
      brandHint: 'Cal.com. Tone: dev-tool, sharp, dry. Palette: ink black + lime green.',
      goodCopy: {
        eyebrow: 'Atoms · 1.4',
        headline: 'Schedules that fix themselves',
        subheadline:
          'When two attendees swap calendars mid-week, Atoms re-finds the slot. No new emails.',
        cta: 'See it work',
      },
      whyItWorks:
        'Headline is a property statement ("fix themselves") that names the differentiated behaviour. Subhead spells out the precise scenario — the reader can mentally simulate the value before clicking.',
    },
  ],
};

export default EXEMPLARS;
