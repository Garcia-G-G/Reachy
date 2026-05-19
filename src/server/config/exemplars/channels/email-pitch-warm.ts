import 'server-only';
import type { ChannelCopyExemplarFile } from './_types';

/** Email · warm follow-up — short, continuity from prior touch, ~90 words. */
const EXEMPLARS: ChannelCopyExemplarFile = {
  channel: 'email-pitch-warm',
  exemplars: [
    {
      scenarioContext:
        'Linear following up with a head of eng who tried Linear during a hackathon two weeks ago.',
      brandHint: 'Linear. Tone: confident, technical, calm.',
      goodCopy: `Subject: Re: the hackathon weekend

Hi [Name],

You spun up a Linear workspace during the hackathon two weeks ago. I noticed it still has activity from your team.

We shipped Insights this morning — it pulls per-cycle reports out of real activity instead of status meetings. Might be the next thing worth testing with the same workspace.

If you'd like me to flip Insights on for that workspace, just reply yes.

— [Founder name]`,
      whyItWorks:
        'References the specific prior interaction (the hackathon weekend) without re-explaining it. The follow-up is a useful update, not a "checking in" — there\'s a real reason to re-engage now.',
    },
    {
      scenarioContext:
        'Mercury following up with a founder who joined the IO waitlist three months ago.',
      brandHint: 'Mercury. Tone: confident-finance, precise.',
      goodCopy: `Subject: Re: IO waitlist

Hi [Name],

You signed up for the IO waitlist three months ago. We're opening it to solo founders this week (the team-plan-or-nothing era is over).

If you want in, reply "yes" and I'll send the SDK key on Friday.

— [Founder name]`,
      whyItWorks:
        'Three sentences, one ask. Parenthetical aside ("the team-plan-or-nothing era is over") signals a real product change rather than a generic "we have updates" reach-out.',
    },
    {
      scenarioContext:
        'Cal.com following up after a developer starred the Atoms repo and forked it but never integrated.',
      brandHint: 'Cal.com. Tone: dev-tool, sharp, dry.',
      goodCopy: `Subject: Saw your fork

Hi [Name],

You forked the Atoms repo about a month ago and starred it but I don't see a deploy yet — totally possible you just bookmarked it.

If you ran into a blocker, send me a screenshot of where it broke and I'll send back working code by tomorrow. Fastest support I can offer.

— [Founder name]`,
      whyItWorks:
        'Names the specific signal (forked + starred + no deploy) without making the reader feel surveilled. The "screenshot for working code" offer is the smallest useful thing AND signals real engineering support availability.',
    },
  ],
};

export default EXEMPLARS;
