import 'server-only';
import type { ChannelCopyExemplarFile } from './_types';

/** LinkedIn · long-form — founder-voice posts, 300+ words. */
const EXEMPLARS: ChannelCopyExemplarFile = {
  channel: 'linkedin-post-long',
  exemplars: [
    {
      scenarioContext:
        'Linear engineering lead announcing a 2-quarter refactor that reduced incident response time by 60%.',
      brandHint:
        'Linear. Tone: confident, technical, calm. Audience: eng leaders, staff engineers.',
      goodCopy: `Two quarters ago, the on-call rotation at Linear was an actual conversation we had every Monday. "Who got paged?" "How many times?" "What broke?"

This week the same conversation took 90 seconds.

The thing nobody tells you about reducing alert fatigue is that you can't do it by tuning thresholds. We tried that for six months. The alerts got quieter; the incidents got worse because the team had learned to ignore the channel.

What worked was the boring thing. We rebuilt our incident tracking inside Linear (yes — we use our own product), made every incident an Issue with a real owner, and made the on-call's Monday job to look at last week's Issues and ask one question: "Did the alert tell us what to do?"

Eighty percent of the time, the answer was no. We rewrote those alerts. The remaining 20% were real, and we fixed them.

Two quarters, no big rewrite, just one ritual repeated 50 times.

If you're in the middle of trying to fix on-call by tuning Datadog rules, stop. Build a ritual instead.`,
      whyItWorks:
        'Opens with a specific Monday-morning conversation instead of "in this post I will share". Names the wrong-answer path the writer tried first (tuning thresholds) before naming what worked. Ends with a specific imperative the reader can act on tomorrow.',
    },
    {
      scenarioContext:
        'Mercury founder posting about why they killed a much-requested feature (multi-entity accounts) for solo founders.',
      brandHint:
        'Mercury. Tone: confident-finance, precise, dry humour. Audience: founders, fintech-adjacent builders.',
      goodCopy: `Two weeks ago we killed multi-entity accounts for solo founders. It was our most-requested feature for eleven months.

Here's why.

A solo founder asks for multi-entity when they're about to do something more complicated than running one company. Sometimes that's a holding LLC for tax purposes. Sometimes it's an experiment they want to keep separate. Sometimes it's a side project they think might become a real thing.

We watched 400 founders use the closed beta. Twelve of them ran multiple real businesses. The other 388 were running side experiments — and Mercury was making those experiments feel official before they earned it.

A second Mercury account is not the right answer to "should this thing exist." A second Mercury account is the right answer to "this thing exists and the IRS is going to ask about it."

So we built the wrong product for the right reason — the feature did what users asked for, and that was the problem.

Next month we ship "Vault" — a way to hold money sub-accounts under one company for experiments, with a single tax footprint. Same value, no premature incorporation theater.

If you're shipping a feature that 388 out of 400 users are using slightly wrong, the feature is the wrong feature. Listen for the misuse, not the request.`,
      whyItWorks:
        "A founder admitting a wrong call with specific numbers (12 / 388 / 400) and pivoting to the principle. Doesn't pitch the next product as a triumph — names what was wrong about the old one. Concrete IRS reference grounds the abstract argument in lived founder pain.",
    },
    {
      scenarioContext:
        'Cal.com CTO announcing Atoms 1.4 — the auto-reschedule feature — framed as a lesson about API design.',
      brandHint: 'Cal.com. Tone: dev-tool, sharp, dry. Audience: developers, product engineers.',
      goodCopy: `The first version of Atoms shipped with a "reschedule" endpoint. It worked. It was also the wrong endpoint.

Atoms is Cal.com's API for putting scheduling inside other software. We thought our users wanted a way to move a meeting once a calendar conflict landed. So we shipped a reschedule call. Beta partners loved it for two weeks. Then we started getting bug reports.

The reports weren't about the API. They were about the API call being too late.

When two attendees swap calendars mid-week, the conflict already happened. The meeting is on the wrong day for someone. By the time you can call reschedule, the apology email is already drafted.

So this week's Atoms 1.4 ships a different shape. Schedules are now reactive — calendars push, Atoms re-finds the slot before either attendee opens their inbox. The reschedule endpoint is still there for the manual case. The auto path is the one that matters.

Lesson I keep relearning: when a feature works exactly as designed but the bug reports keep coming, the feature is the bug.

Docs: cal.com/atoms/1.4`,
      whyItWorks:
        "Engineer-to-engineer voice from the first sentence. The post is about an API design lesson with the product launch as evidence, not the other way around. The 'feature is the bug' line is the kind of sentence engineers screenshot.",
    },
  ],
};

export default EXEMPLARS;
