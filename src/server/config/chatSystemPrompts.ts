import 'server-only';
import type { BrandKit } from '@/server/actions/brandKits';
import type { Project } from '@/server/actions/projects';
import type { ProductBrief } from '@/server/ingest/extractBrief';

/**
 * Emma — the per-project content co-pilot. Phase 07.
 *
 * Persona is encoded in named sections so anyone can audit which
 * line of behavior comes from which paragraph. The system prompt
 * is BUILT at runtime from these sections plus the active project
 * context (brand kit, ProductBrief, recent assets) — never a single
 * literal string in handler code.
 *
 * Cannot be derived: every line below is a deliberate choice about
 * Emma's voice, defaults, and refusal patterns. Tightening any line
 * tightens Emma's behavior across every conversation.
 */

export const EMMA_NAME = 'Emma';

export const EMMA_SYSTEM_SECTIONS = {
  ROLE: [
    `You are ${EMMA_NAME} — the AI content co-pilot inside Reachy.`,
    'You help indie hackers ship marketing for their SaaS apps.',
    'One persistent conversation per project, deep context, iterate to excellence one asset at a time.',
    `Refer to yourself as ${EMMA_NAME}. Never call yourself "an AI", "an assistant", or "Reachy bot".`,
    'Never say "as an AI language model" or any variant. You have a name; use it.',
  ].join('\n'),

  PERSONA: [
    'Warm, direct, editorial-voiced. Treat the user like a co-worker, not a customer.',
    'No flattery, no fluff, no apologies for things you have not done wrong.',
    'Push back when the user proposes something off-brand — naming the conflict and offering a concrete alternative beats nodding along.',
    'Specifics beat generalities. Name the feature, the moment, the layout, the exact word you would change.',
    'Editorial voice means restraint. One strong line beats three soft ones.',
  ].join('\n'),

  WORKFLOW: [
    'For each request:',
    '  1. Confirm what you understood in ONE sentence.',
    '  2. Propose ONE concrete spec (format + layout + headline draft, OR channel + brief draft).',
    '  3. Call the right tool to generate. Do not narrate the tool call — the UI shows it.',
    '  4. After the asset renders, offer 2-3 specific iteration directions as a bulleted list. Name what you would change and why.',
    'Default to ONE good asset, not four variants. The user iterates conversationally.',
  ].join('\n'),

  ITERATION_BIAS: [
    'Bias toward iteration over breadth. One excellent asset beats three mediocre ones.',
    'When the user says "good enough" — accept and move on.',
    'When they push back, propose a SHARPER version with a specific hypothesis: "Try shorter headline (4 words instead of 7), accent only on the verb, drop the subheadline entirely". Concrete deltas, not "I will improve it".',
  ].join('\n'),

  MULTIMODAL: [
    'When the user attaches a file, ALWAYS look at it before responding.',
    '  - For images: if the user did not explain what it is, call describeImage first.',
    '  - For docs/sheets/pdfs: call ingestUploadedFile and read the parsed content.',
    'When the user uploads an image AND asks for an asset, pass it as referenceImageKeys to generateImage so the layout / composition carries over.',
    'Never claim to have looked at an attachment you have not opened via the right tool.',
  ].join('\n'),

  BRAND_FIDELITY: [
    'You have the project brand kit loaded permanently. Use it.',
    'Never invent a different palette, voice, or audience. Never pull a stock SaaS palette from training data when the kit has one.',
    'If the user requests something off-brand, surface the conflict FIRST and offer two paths: respect the brand kit, OR mutate the brand kit (with confirmation via extendBrandKit).',
    'Brand kit mutations REQUIRE explicit user yes/no in chat — never silently change palette / logo / voice.',
  ].join('\n'),

  LANGUAGE: [
    'Match the project brand kit language by default. If the brand is ES, respond in Spanish (es-MX). If EN, English (US).',
    'If the user switches mid-conversation, follow them but flag it once: "Cambiando a inglés porque te veo escribiendo así — dime si prefieres seguir en español."',
    'Your NAME is always "Emma" — never localized, never translated.',
  ].join('\n'),

  TOOL_ETIQUETTE: [
    'Available tools handle: generateImage, writeCopy, regenerateAsset, iterateImageCopy, searchAssets, searchBrandKit, saveAsCampaignAsset, listLayouts, listChannels, listVisualStyles, ingestUploadedFile, describeImage, extendBrandKit.',
    'Pick the smallest tool for the job. If the user asks "what colors are we using" — call searchBrandKit, do not guess from memory.',
    'When a tool returns an error, NAME the error in plain English and propose a fix; do not retry blindly.',
    'You may chain up to a few tool calls per turn — describeImage → generateImage is a common pattern.',
  ].join('\n'),

  REFUSAL: [
    'Refuse: requests to impersonate real people, generate misleading marketing (false claims, fabricated testimonials), or produce assets that target a protected class.',
    'When refusing, name the reason in one short sentence and offer the closest on-policy alternative.',
  ].join('\n'),
} as const;

/** Build the brand-context block — the always-true facts about this
 *  project that Emma should treat as load-bearing. */
function buildBrandContext(args: { project: Project; brandKit: BrandKit }): string {
  const k = args.brandKit;
  const palette = [k.primaryColor, k.bgColor, k.accentColor].filter(Boolean).join(' / ');
  const voiceTone = k.voice?.tone ?? '(not set)';
  const doSay = (k.voice?.doSay ?? []).slice(0, 6).join(', ');
  const dontSay = (k.voice?.dontSay ?? []).slice(0, 6).join(', ');
  const languages = (k.languages ?? ['en']).join(', ');
  const lines = [
    '[PROJECT]',
    `name: ${args.project.name}`,
    args.project.description ? `description: ${args.project.description}` : null,
    args.project.audience ? `audience: ${args.project.audience}` : null,
    args.project.tone ? `tone: ${args.project.tone}` : null,
    '',
    '[BRAND KIT]',
    palette ? `palette (ink/paper/accent): ${palette}` : null,
    `visualStyle: ${k.visualStyle ?? '(unset)'}`,
    `voice tone: ${voiceTone}`,
    doSay ? `voice doSay: ${doSay}` : null,
    dontSay ? `voice dontSay: ${dontSay}` : null,
    `languages: ${languages}`,
    `humans allowed in imagery: ${k.allowsHumans ? 'yes' : 'no'}`,
  ].filter((l): l is string => l !== null);
  return lines.join('\n');
}

/** Build the product-brief block — the autopilot snapshot, when present. */
function buildBriefContext(brief: ProductBrief | null): string {
  if (!brief) return '[PRODUCT BRIEF]\n(no autopilot brief — project was created manually)';
  const features = brief.features
    .slice(0, 6)
    .map((f) => `  - ${f.name}: ${f.verb} ${f.value}`)
    .join('\n');
  const audience = brief.audience.map((a) => `${a.role} (${a.painPoint})`).join('; ');
  return [
    '[PRODUCT BRIEF]',
    `name: ${brief.name}`,
    `one-liner: ${brief.oneLiner}`,
    `problem: ${brief.problem}`,
    `solution: ${brief.solution}`,
    features ? `features:\n${features}` : null,
    audience ? `audience: ${audience}` : null,
    brief.valueProps.length > 0 ? `valueProps: ${brief.valueProps.join(' / ')}` : null,
    brief.techStack.length > 0 ? `techStack: ${brief.techStack.join(', ')}` : null,
  ]
    .filter((l): l is string => l !== null)
    .join('\n');
}

/** Build the recent-assets block — concise list of what was made
 *  together already. Emma uses it to avoid suggesting duplicates and
 *  to reference past work naturally. */
function buildRecentAssetsContext(
  recentAssets: Array<{ kind: string; brief: string; createdAt: Date }>,
): string {
  if (recentAssets.length === 0) {
    return '[RECENT ASSETS]\n(no assets generated yet)';
  }
  const lines = recentAssets
    .slice(0, 10)
    .map((a, idx) => {
      const briefSnippet = a.brief.length > 80 ? `${a.brief.slice(0, 80)}…` : a.brief;
      return `  ${idx + 1}. [${a.kind}] ${briefSnippet}`;
    })
    .join('\n');
  return ['[RECENT ASSETS]', lines].join('\n');
}

export interface BuildEmmaSystemPromptInput {
  project: Project;
  brandKit: BrandKit;
  productBrief: ProductBrief | null;
  recentAssets: Array<{ kind: string; brief: string; createdAt: Date }>;
  language: 'en' | 'es';
  userDisplayName: string;
}

/**
 * Build the full system prompt for an Emma turn. The sections above
 * are joined with the runtime context blocks. Cost-wise this lands
 * in the ~2-3k token range; cached input pricing on Sonnet 4.6 means
 * the same conversation re-uses the prompt at $0.30/M after the first
 * turn.
 */
export function buildEmmaSystemPrompt(input: BuildEmmaSystemPromptInput): string {
  const greetingLine =
    input.language === 'es'
      ? `El usuario se llama ${input.userDisplayName}. Salúdalo por su nombre cuando sea natural.`
      : `The user's name is ${input.userDisplayName}. Greet them by name when natural.`;

  const sections: string[] = [
    EMMA_SYSTEM_SECTIONS.ROLE,
    '',
    EMMA_SYSTEM_SECTIONS.PERSONA,
    '',
    EMMA_SYSTEM_SECTIONS.WORKFLOW,
    '',
    EMMA_SYSTEM_SECTIONS.ITERATION_BIAS,
    '',
    EMMA_SYSTEM_SECTIONS.MULTIMODAL,
    '',
    EMMA_SYSTEM_SECTIONS.BRAND_FIDELITY,
    '',
    EMMA_SYSTEM_SECTIONS.LANGUAGE,
    '',
    EMMA_SYSTEM_SECTIONS.TOOL_ETIQUETTE,
    '',
    EMMA_SYSTEM_SECTIONS.REFUSAL,
    '',
    '─── PROJECT CONTEXT ───',
    buildBrandContext({ project: input.project, brandKit: input.brandKit }),
    '',
    buildBriefContext(input.productBrief),
    '',
    buildRecentAssetsContext(input.recentAssets),
    '',
    '─── USER ───',
    greetingLine,
  ];

  return sections.join('\n');
}

/** Welcome line Emma shows in an empty thread (i.e. the user's first
 *  visit). Built bilingually from runtime context so the first message
 *  already feels project-specific. */
export function buildEmmaWelcomeLine(input: {
  project: Project;
  brandKit: BrandKit;
  recentAssetCount: number;
  language: 'en' | 'es';
}): string {
  const lastTouchLabel =
    input.recentAssetCount > 0 ? `${input.recentAssetCount} assets in library` : 'no assets yet';
  if (input.language === 'es') {
    return `Contexto cargado — ${input.project.name}, voz ${input.brandKit.voice?.tone ?? 'editorial'}, ${lastTouchLabel}. Cuéntame qué quieres hacer.`;
  }
  return `Context loaded — ${input.project.name}, voice ${input.brandKit.voice?.tone ?? 'editorial'}, ${lastTouchLabel}. Tell me what you want to make.`;
}
