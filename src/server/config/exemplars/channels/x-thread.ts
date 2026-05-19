import 'server-only';
import type { ChannelCopyExemplarFile } from './_types';

/** X · thread — conversational, each tweet stands alone, ~220 words. */
const EXEMPLARS: ChannelCopyExemplarFile = {
  channel: 'x-thread',
  exemplars: [
    {
      scenarioContext:
        'Linear engineer narrating a debugging session that revealed an architectural bug.',
      brandHint: 'Linear. Tone: confident, technical, calm. Audience: tech twitter.',
      goodCopy: `Two weeks ago a customer reported that Linear was deleting their issue descriptions on save.

It was happening to 0.2% of saves. We could not reproduce it.

Here's what we found.

The bug was in the WebSocket reconnect logic. When a client lost connection mid-save, the reconnect handler would replay the queued operation. Fine — except the operation was being replayed AGAINST the new server-side state, which now had a partial edit.

Our merge algorithm did the right thing: it kept whichever version arrived last. Last-write-wins.

The reconnect arrived 14ms after the save. The "delete" was an empty body, because the client was about to send the real content next. The merge dutifully accepted the empty body.

We fixed it in eight lines. We're shipping a much bigger fix in three weeks: the queued operation now carries the FULL pre-edit state, not just the diff. Concurrent edits stop being a race against the connection.

If you've ever shipped optimistic UI on top of unreliable network and assumed last-write-wins was fine, this is your reminder that "fine" depends on what an empty payload means in your domain.

Real fix: hash the body before replay, refuse zero-byte replays.`,
      whyItWorks:
        "A specific bug narrative with real numbers (0.2%, 14ms, 8 lines). Reads as engineering shop talk, not a brand thread. Final tweet is a takeaway other engineers can apply tomorrow — that's what drives a thread to spread.",
    },
    {
      scenarioContext: 'Mercury founder thread on why they refuse to add a fee-based premium plan.',
      brandHint: 'Mercury. Tone: confident-finance, precise, dry humour.',
      goodCopy: `Every quarter, someone at Mercury proposes a $99/month "Premium" plan that adds white-glove support, faster wires, and a bigger card limit.

Every quarter, we kill it.

Here's the math.

A $99/month plan brings in $1,200/year per customer. Our average team plan customer is already worth more than that to us — they're banking real volume, and the interest revenue is the business.

Charging the same customers $99/month on top would be doubling down on the customers we already win. It wouldn't bring new ones.

What it WOULD do is segment our product. Solo founders who can't afford $99/month would feel like the second-class tier. The first thing they'd see on our pricing page would be the thing they're missing.

We started Mercury for the people building things. Charging them a SaaS tax to feel premium betrays that.

What we DO charge for is software — IO (programmable banking), Vault (sub-account experiments), and the cards / wires / treasury features that have real backend cost.

That math works. The "feels premium" math doesn't.

The Premium plan is dead. Long may it stay dead.`,
      whyItWorks:
        'Argument shape ("every quarter someone proposes X / every quarter we kill it") sets up a rhythm and a position. Ends with a sentence that reads like a slogan but earned it across 200 words of reasoning.',
    },
    {
      scenarioContext: 'Cal.com CTO thread about the right and wrong ways to embed calendar APIs.',
      brandHint: 'Cal.com. Tone: dev-tool, sharp, dry.',
      goodCopy: `If you're integrating Google Calendar into your product, here are the four mistakes you'll make in the first six weeks.

Mistake 1: Treating it as a CRUD API.

Calendar APIs return what was true ten seconds ago, not what's true now. You need a reconciliation loop, not a write-through cache. Skipping this is why your meeting-create feature works in dev and double-books in prod.

Mistake 2: Storing the event ID as your primary key.

Google rotates event IDs on certain edits. Outlook does too. Your foreign key explodes the first time a power user moves a recurring meeting.

Mistake 3: Trusting time zones.

The user's calendar timezone, the user's device timezone, and the user's "actual" timezone are three different things, all wrong in different ways. Always store UTC + a separate tz string. Always.

Mistake 4: Polling.

You will start with polling. Six months later your bill is unmanageable and your data is stale. Push-based subscriptions (Google Calendar Push, Microsoft Graph webhooks) are the only sustainable answer.

We learned each of these the slow way. Atoms exists so you don't have to.`,
      whyItWorks:
        'A numbered list that reads as practical engineering knowledge first, product pitch second. Each item names a specific failure mode the reader has probably experienced. Product mention is one line at the end, framed as time-saving rather than promotional.',
    },
  ],
};

export default EXEMPLARS;
