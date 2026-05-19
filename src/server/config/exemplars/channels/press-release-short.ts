import 'server-only';
import type { ChannelCopyExemplarFile } from './_types';

/** Press release · short — third-person, factual, ~180 words. */
const EXEMPLARS: ChannelCopyExemplarFile = {
  channel: 'press-release-short',
  exemplars: [
    {
      scenarioContext: 'Linear announces Insights as a paid feature for the Business tier.',
      brandHint: 'Linear. Tone: confident, technical, calm.',
      goodCopy: `Linear launches Insights — automatic cycle reports built from real activity

San Francisco, May 21, 2026 — Linear, the issue tracker used by 8,000 engineering teams, today launched Insights, a feature that generates per-cycle delivery reports directly from team activity. Insights is available to all Business-tier customers as of today and replaces the manual status meetings most teams still run on top of issue trackers.

Insights pulls from real Linear data (issue movement, cycle completion rate, time-to-close) and produces a one-page weekly summary suitable for engineering leadership review. The feature is designed to eliminate the "what did we ship" meeting, not augment it.

"Most engineering teams already have the data; what they lack is a useful read of it," said Karri Saarinen, CEO of Linear. "Insights gives leaders an honest answer to 'where did the week go' without taking another hour out of the engineers' calendars."

Insights is rolling out to Business-tier accounts today and is included at no additional cost.

Linear was founded in 2019 and is headquartered in San Francisco.`,
      whyItWorks:
        'Real press-release rhythm — dateline, third-person, one founder quote in the middle. The quote does work (names the specific meeting being eliminated). The "no additional cost" closer is informative, not promotional.',
    },
    {
      scenarioContext: 'Mercury announces the public launch of the IO API for solo founders.',
      brandHint: 'Mercury. Tone: confident-finance, precise.',
      goodCopy: `Mercury opens IO — programmable banking — to solo founders

New York, May 21, 2026 — Mercury, the banking platform for builders, today opened its IO API to solo founders, removing the prior seat-based pricing that had restricted access to multi-employee teams. The launch makes Mercury's programmable banking primitives — accounts, cards, wires, reconciliation — available via TypeScript SDK at one tenth the previous team-plan rate.

IO had been in closed beta for ten months and is in production at over 3,200 startups. The solo-founder tier launches today with the same API surface; no feature is gated by team size.

"The team-plan-or-nothing version of IO was the wrong product for the people we built Mercury for," said Immad Akhund, co-founder and CEO of Mercury. "The math finally works for one person."

Mercury IO for solo founders is generally available as of today. Existing Mercury customers can enable IO on any account through the Mercury dashboard.

Mercury is a financial technology company headquartered in New York and San Francisco.`,
      whyItWorks:
        'Press-release shape with a founder quote that admits the prior pricing was wrong — that\'s the headline-grade detail. "The math finally works" is the quote that lands.',
    },
    {
      scenarioContext:
        'Cal.com announces a partnership with Stripe to add Atoms to Stripe Support.',
      brandHint: 'Cal.com. Tone: dev-tool, sharp, dry.',
      goodCopy: `Cal.com Atoms now powers Stripe Support scheduling

Berlin, May 21, 2026 — Cal.com today announced that its Atoms API has been integrated into Stripe Support's customer-call scheduling flow, becoming the underlying infrastructure for support meeting booking across Stripe's product surface.

The integration replaces Stripe's internal scheduling tooling and is the first deployment of Atoms inside a top-tier fintech operations stack. Atoms is a developer-first calendar API built on Cal.com's open-source scheduling platform.

"We needed scheduling primitives, not a calendar UI bolted on top of ours," said a Stripe engineering lead familiar with the integration. "Atoms gave us the booking logic in three files; we wrote the rest of the experience ourselves."

Atoms is generally available to all Cal.com developer-tier customers. Documentation and SDK references are at cal.com/atoms.

Cal.com is the open-source scheduling platform headquartered in Berlin.`,
      whyItWorks:
        'The customer quote describes the integration in implementation terms ("three files") rather than business outcomes — a credible engineering-voice quote in a press-release context. The "first top-tier fintech deployment" detail is the news hook.',
    },
  ],
};

export default EXEMPLARS;
