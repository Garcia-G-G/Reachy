import 'server-only';
import type { ChannelCopyExemplarFile } from './_types';

/** Email · cold pitch — respectful, specific, no flattery, ~110 words. */
const EXEMPLARS: ChannelCopyExemplarFile = {
  channel: 'email-pitch-cold',
  exemplars: [
    {
      scenarioContext:
        'Linear cold-pitching a head of engineering whose company has been publicly outgrowing Jira.',
      brandHint: 'Linear. Tone: confident, technical, calm.',
      goodCopy: `Subject: Three teams at [Their Company] are already on Linear

Hi [Name],

Saw your eng-team post last week about Jira load — the 1,800-issue rotation is a number we recognize.

We work with three teams inside [Their Company] already (Frontend Platform, Mobile, Data Infra). The pattern is: ICs onboard themselves, the rotation cleans up in the first cycle, and the lead asks for a company-wide license a quarter later.

If you'd like to see how the three teams ended up using it (the rollout doc + actual Cycle metrics from one of them), I can share. No pitch deck.

— [Founder name], Linear`,
      whyItWorks:
        'Opens with specific evidence (the post they wrote, the issue number) instead of "I hope this finds you well". Names the existing internal footprint as proof. Smallest useful next step ("share the doc") instead of "book a call".',
    },
    {
      scenarioContext:
        'Mercury IO pitching a fintech-adjacent founder who tweets about banking API frustrations.',
      brandHint: 'Mercury. Tone: confident-finance, precise, dry humour.',
      goodCopy: `Subject: The Plaid + Increase glue you tweeted about

Hi [Name],

You posted about stitching Plaid auth + Increase ACH + your own ledger and called it "the seven-vendor hello world." We hear that a lot.

Mercury IO ships a single TypeScript SDK for accounts, cards, wires, and reconciliation under one bank charter. Founders building on it have replaced 3-5 vendors with one provider.

I can send the SDK reference + a 12-line account-opening example. If it isn't a fit you'll know in under five minutes of reading.

— [Founder name], Mercury`,
      whyItWorks:
        'References a specific tweet phrasing ("seven-vendor hello world") — names the moment that made them a real prospect. Smallest useful next step (5 minutes of reading) costs the reader almost nothing.',
    },
    {
      scenarioContext: 'Cal.com Atoms pitching a calendar-heavy SaaS founder.',
      brandHint: 'Cal.com. Tone: dev-tool, sharp, dry.',
      goodCopy: `Subject: Calendar integration without the maintenance tax

Hi [Name],

I noticed [Their Company] has a "Schedule a Demo" button that opens a Calendly. That works fine — until your engineers want to put booking inside the app itself.

Atoms is a Cal.com API that does exactly that. One npm package, a few React components, native to your stack. Stripe is using it for their support flow; Linear is using it for customer kick-offs.

If you'd like to see a minimal repo (under 200 lines) that integrates a scheduling primitive into a Next.js app, I'm happy to share the link.

— [Founder name], Cal.com`,
      whyItWorks:
        "Names the prospect's actual current state (a Calendly button) as the conversational opening. Social proof is concrete (Stripe, Linear, specific use cases). The 'under 200 lines' detail is the kind of number an engineer will click on.",
    },
  ],
};

export default EXEMPLARS;
