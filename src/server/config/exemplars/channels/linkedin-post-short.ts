import 'server-only';
import type { ChannelCopyExemplarFile } from './_types';

/** LinkedIn · short — punchy, one idea, ~90 words. */
const EXEMPLARS: ChannelCopyExemplarFile = {
  channel: 'linkedin-post-short',
  exemplars: [
    {
      scenarioContext: 'Linear announcing the macOS app — a single-sentence punchline post.',
      brandHint: 'Linear. Tone: confident, technical, calm.',
      goodCopy: `The Linear Mac app is in beta. Native window chrome, ⌘K everywhere, two new keyboard shortcuts that broke our muscle memory by lunch.

It opens in 180ms. The web app opens in 1.4 seconds.

That difference adds up to about an hour per week per teammate. That hour is what we built it for.

Beta link in comments.`,
      whyItWorks:
        'Concrete numbers (180ms vs 1.4s, an hour per week) replace any benefit claim. Reads in 8 seconds. The comments-link convention is native LinkedIn culture, not marketing-imported.',
    },
    {
      scenarioContext: 'Mercury launching the indie founder pricing tier — single-claim post.',
      brandHint: 'Mercury. Tone: confident-finance, precise.',
      goodCopy: `We just shipped a Mercury plan for solo founders.

No seat math. No annual minimum. Cards, wires, and the IO API at one tenth what the team plan costs.

If you've been waiting for us to make the math work for one person, the math works now.`,
      whyItWorks:
        'Doesn\'t open with "we\'re excited to announce". The "no X, no Y" pattern names exactly what changed; the final line is a direct address to a specific reader (the one who was waiting), not a generic CTA.',
    },
    {
      scenarioContext: 'Cal.com Atoms reaching 10K developers — milestone post in dev-tool voice.',
      brandHint: 'Cal.com. Tone: dev-tool, sharp, dry.',
      goodCopy: `Atoms passed 10,000 developers using it in production this week.

We didn't build Atoms to be a sales surface. We built it because every scheduling integration we did for customers was the same three API calls, written wrong, six times.

Now everyone writes them once. We get to go back to building the calendar.`,
      whyItWorks:
        'Frames the milestone in terms of what it freed the team to do, not how impressive the number is. The "written wrong, six times" detail signals lived engineering pain in five words.',
    },
  ],
};

export default EXEMPLARS;
