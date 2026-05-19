import 'server-only';
import type { ChannelCopyExemplarFile } from './_types';

/** Blog · outline — structural, each section name is a claim. ~180 words. */
const EXEMPLARS: ChannelCopyExemplarFile = {
  channel: 'blog-outline',
  exemplars: [
    {
      scenarioContext: 'Linear engineering blog about rebuilding the editor surface in the open.',
      brandHint: 'Linear. Tone: confident, technical, calm.',
      goodCopy: `Working title: Rebuilding the Linear editor in the open

1. The starting position
   The original editor was three years old, written before Linear had a mobile app or real-time collaboration. It held the surface together but couldn't grow.

2. What we built in the first eight weeks (and threw out)
   A Slate-based implementation that worked locally but produced unrecoverable divergence under network partition. We could have shipped it; we didn't.

3. The decision to make the rebuild public
   Why we open-sourced the PRs, the design docs, and the dead branches. The cost was reputation if we shipped late. The payoff was hiring.

4. The second attempt — and what carried over
   A Yjs CRDT under the hood, a custom serialization layer for offline edits, a per-document operation log that survives reconnects.

5. The metric that decided we were done
   Two thousand documents edited simultaneously in the staging environment, zero merge conflicts, sub-50ms latency on the slowest user's connection.

6. What we learned about doing infrastructure work in public
   Public rewrites don't slow you down — they slow down the people watching you, which is a different problem.`,
      whyItWorks:
        'Each section header is a claim that makes the reader want to read that section. Sections 2 and 5 are the ones that signal honesty (a thrown-out attempt, a specific shipping metric). The closing-section title reframes the lesson.',
    },
    {
      scenarioContext:
        'Mercury blog about why they built Vault (sub-account experiments) the way they did.',
      brandHint: 'Mercury. Tone: confident-finance, precise.',
      goodCopy: `Working title: Vault — sub-accounts, without the second tax return

1. The user who asked, six different ways
   Twelve months of feature requests for "multi-entity accounts" — and what 388 of 400 founders actually meant.

2. Why second-entity is the wrong default
   A second LLC is a real legal artifact with real costs. Most experiments aren't ready for one. We were making them feel official before they earned it.

3. What we shipped instead: sub-accounts under a single tax footprint
   How Vault works on the back end (no new EIN, no new compliance review), and what changes for the user (one tax form at year-end, separate balances any time of year).

4. The case we still send people to multi-entity for
   When you genuinely have multiple businesses. Vault is not a replacement; it's the smaller-scoped thing 95% of users actually wanted.

5. What this changes about how we listen to feature requests
   The misuse pattern is louder than the request itself. We're rebuilding our intake form around watching the workflow, not transcribing the ask.`,
      whyItWorks:
        'Five sections that map to a single thesis (listening for misuse beats transcribing the request). Section 3 names what was built; the others build the case for why it was the right thing.',
    },
    {
      scenarioContext:
        'Cal.com blog post on the calendar API patterns developers keep getting wrong.',
      brandHint: 'Cal.com. Tone: dev-tool, sharp, dry.',
      goodCopy: `Working title: The four calendar-API patterns you'll regret in 90 days

1. The CRUD assumption
   Calendar APIs aren't request/response — they're eventual-consistency surfaces. Why write-through caches don't survive contact with Outlook.

2. The event-ID trap
   Google rotates event IDs on certain edits; so does Microsoft Graph. Stable identifiers come from your side, not theirs.

3. The timezone problem nobody warns you about
   The user's calendar timezone, the user's device timezone, and the user's actual location are three different facts, and they disagree in production.

4. The polling tax
   Why webhooks pay for themselves in six weeks of API quota — and the one case where polling is still right.

5. What we did differently in Atoms
   A small infra summary: how we abstracted these four patterns into a single SDK so you can build the feature, not the calendar.

6. Code-only appendix
   Six minimal Next.js + TypeScript snippets that cover the four patterns above, plus the Atoms one-liner that replaces each.`,
      whyItWorks:
        "Each section is a regret-shaped claim — readers click because they suspect they've made the mistake. The appendix section pre-commits the post to delivering code, not just argument; that pre-commitment is the click.",
    },
  ],
};

export default EXEMPLARS;
