import 'server-only';

/**
 * Per-asset-kind rubrics for the autopilot critic (Step 5).
 *
 * Weights sum to 10 across all criteria in a rubric — the final
 * score is a weighted sum of per-criterion 0..10 sub-scores divided
 * by 10. Long `description` strings are the actual scoring guidance
 * the LLM sees; they live here (not inline in critic.ts) because
 * THIS IS the rubric — the editorial source of truth for what
 * "good" means in Reachy.
 *
 * Cannot be derived: each weight + description was tuned against
 * Garcia's "todo se vea bien" bar, not against a runtime fact.
 */

export interface RubricCriterion {
  key: string;
  weight: number;
  description: string;
}

export const CRITIC_RUBRICS = {
  IMAGE: [
    {
      key: 'composition',
      weight: 3,
      description:
        'Is the image well-composed? One clear focal element, intentional negative space, no center-card cliche, no awkward cropping. Penalize: cluttered grids, faces / products jammed against the frame edge, dead center symmetry when the layout calls for asymmetric editorial composition.',
    },
    {
      key: 'brand_fidelity',
      weight: 2,
      description:
        'Does the image read as ON-BRAND for the supplied palette? ink / paper / accent hex values dominate; no off-brand hues. Penalize: any color drift past ~20% from the brand palette, color pollution from stock photography.',
    },
    {
      key: 'copy_legibility',
      weight: 2,
      description:
        'Is every piece of typography in the image crisp, correctly kerned, and SPELLED right? Penalize: cropped letters, missing accents (é/ñ/á in Spanish), font wobble, partial words, text bleeding into a busy background.',
    },
    {
      key: 'creativity',
      weight: 2,
      description:
        "Did the image MAKE a compositional decision the user wouldn't have? Penalize generic stock-photo energy, AI-default symmetric blob compositions, hero with no point of view. Reward: a real editorial position.",
    },
    {
      key: 'language_correctness',
      weight: 1,
      description:
        'If any visible text is in Spanish, are accents (á/é/í/ó/ú/ñ/¿/¡) preserved and word breaks correct? If English, no mojibake or rendered placeholder glyphs. Penalize: any AI-typography misrender.',
    },
  ] as readonly RubricCriterion[],
  COPY: [
    {
      key: 'on_brief',
      weight: 3,
      description:
        "Does the copy address the SPECIFIC product brief, naming the actual feature / audience / value prop? Penalize: generic SaaS-speak, copy that could be about any startup, missing the asset's planned angle.",
    },
    {
      key: 'tone_match',
      weight: 2,
      description:
        'Does the copy match the brand voice tone field? Editorial reads considered; technical reads precise; playful reads warm; enterprise reads restrained; indie reads founder-voice first-person. Penalize: tone drift, register mismatch (enterprise prose for an indie brand).',
    },
    {
      key: 'no_cliches',
      weight: 2,
      description:
        "Does the copy avoid the cliché blacklist for its language (ES + EN lists in src/server/config/cliches.ts)? Penalize any literal match OR near-paraphrase. A near-paraphrase example: 'unlock' → 'discover', 'eleva tu marca' → 'transforma tu marca'.",
    },
    {
      key: 'language_correctness',
      weight: 2,
      description:
        "Is every sentence grammatically correct in the requested language? Spanish accents preserved? No EN/ES leakage mid-copy? Penalize any word in the wrong language unless it's a brand proper noun.",
    },
    {
      key: 'readable_length',
      weight: 1,
      description:
        "Does the copy stay within ±10% of the channel template's target word count? LinkedIn long-form ~320w, IG caption ~60w, etc. Penalize copy that's <80% or >130% of target.",
    },
  ] as readonly RubricCriterion[],
  REEL: [
    {
      key: 'visual_cohesion',
      weight: 3,
      description:
        'Do the keyframes belong to the SAME visual world? Same palette, same camera character, same level of motion. Penalize: hard cuts mid-shot, style drift between segments, segments that look like different reels.',
    },
    {
      key: 'motion_presence',
      weight: 2,
      description:
        'Is the reel ACTIVE motion or a frozen-frame Sora glitch? Penalize keyframes that are visually identical (Sora produced a still). Reward genuine continuous motion across the timeline.',
    },
    {
      key: 'audio_mix_balance',
      weight: 2,
      description:
        'Is the audio mix balanced — narration audible, music supportive (not louder than voice), SFX present but not jarring? Use the audio peak/RMS/clipping stats included in the prompt. Penalize: clipping (peak > -1 dBTP), voice buried (voice channel RMS < -28 dB vs music > -22 dB), missing audio entirely.',
    },
    {
      key: 'brand_fidelity',
      weight: 2,
      description:
        "Do the keyframes carry the brand palette (ink / paper / accent dominate)? Penalize stock-color drift, off-brand background hues, generic motion-graphics gradients instead of the brand's actual colors.",
    },
    {
      key: 'no_broken_text',
      weight: 1,
      description:
        'Any visible text in the keyframes — is it crisp, spelled correctly, with accents preserved? Penalize: misrendered AI typography, partial words, cropped letters, mojibake.',
    },
  ] as readonly RubricCriterion[],
} as const;

export type AssetCriticKind = keyof typeof CRITIC_RUBRICS;

export function rubricFor(kind: AssetCriticKind): readonly RubricCriterion[] {
  return CRITIC_RUBRICS[kind];
}

/** Sum of weights — sanity-check that each rubric still totals 10. */
export function rubricWeightSum(kind: AssetCriticKind): number {
  return CRITIC_RUBRICS[kind].reduce((sum, c) => sum + c.weight, 0);
}
