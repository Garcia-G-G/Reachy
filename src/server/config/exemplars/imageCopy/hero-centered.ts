import 'server-only';
import type { ImageCopyExemplarFile } from './_types';

/** Hero · centered — eyebrow, headline, cta. The headline is the
 *  hero; eyebrow is a small editorial tag; cta is the close. */
const EXEMPLARS: ImageCopyExemplarFile = {
  layoutId: 'hero-centered',
  exemplars: [
    {
      scenarioContext:
        'Linear ships their new Triage view — built to clear a 70-issue inbox in under 5 minutes on a Monday morning.',
      brandHint: 'Linear. Tone: confident, technical, calm. Palette: graphite + electric purple.',
      goodCopy: {
        eyebrow: 'Linear 2026.5',
        headline: 'Mondays end at 9:15',
        cta: 'Open Triage',
      },
      whyItWorks:
        'Names the specific painful moment (Monday 9:15) instead of a benefit category like "productivity". The CTA verb is the literal UI action — "Open Triage" not "Get started".',
    },
    {
      scenarioContext:
        'Mercury launches a new business banking card targeted at founders who keep their expense category clean.',
      brandHint:
        'Mercury. Tone: confident-finance, precise, dry humour. Palette: charcoal + amber.',
      goodCopy: {
        eyebrow: 'New from Mercury',
        headline: 'Banking that compounds',
        cta: 'Open an account',
      },
      whyItWorks:
        'A finance metaphor delivered as a single concrete verb ("compounds") that names the actual product value. CTA is the literal financial-product action — not "Learn more".',
    },
    {
      scenarioContext:
        'Cal.com releases Atoms v3 — programmable scheduling primitives for developers building inside other apps.',
      brandHint: 'Cal.com. Tone: dev-tool, sharp, dry. Palette: ink black + lime green.',
      goodCopy: {
        eyebrow: 'Atoms · v3',
        headline: 'Scheduling becomes a primitive',
        cta: 'Read the changelog',
      },
      whyItWorks:
        'Reframes the product as infrastructure ("a primitive") which is the user\'s vocabulary, not marketing\'s. CTA matches dev-tool culture — devs read changelogs, not landing pages.',
    },
  ],
};

export default EXEMPLARS;
