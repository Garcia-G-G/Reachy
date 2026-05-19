import 'server-only';
import type { ChannelCopyExemplarFile } from './_types';

/** Instagram · caption — warm, in voice, ~60 words. */
const EXEMPLARS: ChannelCopyExemplarFile = {
  channel: 'instagram-caption',
  exemplars: [
    {
      scenarioContext:
        'Linear shares the design process behind their new Cycle view via a carousel of figma frames.',
      brandHint: 'Linear. Tone: confident, technical, calm.',
      goodCopy: `Six rejected directions before we landed on this Cycle view.

We kept the rejects in the file. Sometimes you only see why the right answer is right when the wrong ones are still sitting next to it.

Swipe through. The keepers are 5 and 6.`,
      whyItWorks:
        'Three short paragraphs, no emoji, no hashtags. Names the process detail (kept the rejects) that signals craft. CTA is the literal Instagram action (swipe), not "Learn more".',
    },
    {
      scenarioContext:
        'Mercury showing the back of their new business card design — quiet IG launch.',
      brandHint: 'Mercury. Tone: confident-finance, precise.',
      goodCopy: `The back of the card is the part nobody sees.

We spent two weeks getting it right anyway. Letterpress emboss, ink-on-ink, the founder's favorite serif.

Out next month. Probably.`,
      whyItWorks:
        'Self-deprecating "probably" at the end lands as voice, not marketing hedge. The detail (letterpress emboss, ink-on-ink) is specific and earned — readers either love this kind of thing or move on; both reactions are fine.',
    },
    {
      scenarioContext:
        'Cal.com posting a single sketch from their team retreat — humble milestone.',
      brandHint: 'Cal.com. Tone: dev-tool, sharp, dry.',
      goodCopy: `Day two of the team retreat. The whiteboard says "what if scheduling was actually fun" with two question marks and one underline.

We don't know yet. We're working on it.

Atoms 1.5 ships in June.`,
      whyItWorks:
        'A specific artifact (whiteboard with two question marks and one underline) anchors the post in a real moment. Honest "we don\'t know yet" reads as voice; product mention is informational, not promotional.',
    },
  ],
};

export default EXEMPLARS;
