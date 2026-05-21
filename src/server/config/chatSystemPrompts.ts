import 'server-only';
import type { BrandKit } from '@/server/actions/brandKits';
import type { Project } from '@/server/actions/projects';
import type { ProductBrief } from '@/server/ingest/extractBrief';
import { EMMA_CONCIERGE_SECTIONS } from './emmaConcierge';
import {
  EMMA_CRITICAL_RESPONSE_PATTERN_VAGUE_CREATE,
  EMMA_QUESTION_BANK,
  EMMA_VOICE,
  EMMA_WORKED_EXAMPLES,
  EMMA_WRAPUP_POSTURE,
} from './emmaPersona';

/**
 * Emma system-prompt builder. Phase 07j slim pass.
 *
 * The Phase 07i prompt was ~3.5KB of behavioral rules. gpt-5.5
 * shipped malformed tool calls on every "creame una" turn and
 * OpenAI returned server_error mid-stream. 07j pulls the verbose
 * rules into the per-tool descriptions (cookbook pattern), keeps
 * the system prompt to identity + persona + worked examples +
 * project context + session snapshot. Target: <1500 tokens of
 * persona prose, plus the per-turn context blocks.
 *
 * Sections are still named so anyone can audit which line of
 * behavior comes from which paragraph.
 */

export const EMMA_NAME = 'Emma';

export const EMMA_FALLBACK_GREETING_NAME = 'amigo';

export const EMMA_GREETING_TEMPLATES = {
  es: 'El usuario se llama {name}. Salúdalo por su nombre cuando sea natural.',
  en: "The user's name is {name}. Greet them by name when natural.",
} as const;

/** Voice-adjacent lines kept here for the worker-era multimodal /
 *  brand-fidelity behaviors that survived the concierge pivot. */
export const EMMA_SYSTEM_SECTIONS = {
  MULTIMODAL: [
    'When the user attaches a file, ALWAYS look at it before responding.',
    '  - Images without context: call describeImage first.',
    '  - Docs / sheets / pdfs: call ingestUploadedFile and read the parsed content.',
    'Never claim to have looked at an attachment you have not opened via the right tool.',
  ].join('\n'),

  BRAND_FIDELITY: [
    'The project brand kit is loaded permanently. Use it.',
    'Never invent a different palette, voice, or audience. Never pull a stock SaaS palette from training data when the kit has one.',
    'If the user requests something off-brand, surface the conflict and offer two paths: respect the kit, OR mutate it via extendBrandKit (with confirmation).',
  ].join('\n'),
} as const;

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

/** Phase 07j — compact "what's true right now" snapshot Emma can
 *  pull from when forming her next question. Keeps her grounded in
 *  the user's actual context instead of asking generic questions
 *  ("¿qué necesitás?"). The fields are all derived from data the
 *  handler already has — no extra DB hits. */
export interface EmmaSessionSnapshot {
  userFirstName: string;
  currentRoute: string | null;
  /** Last successful generation, when present — Emma can reference
   *  it in her question ("¿seguimos la línea de la última imagen
   *  de LinkedIn o cambiamos de ángulo?"). */
  lastGeneration: {
    kind: string;
    idea: string;
  } | null;
}

/** Phase 08c — when Emma is mounted inside the asset editor, the
 *  handler threads in the focused generation's current state. This
 *  unlocks edit-mode behavior: Emma can call changeHeadline /
 *  changeLayout / changePalette / addVariant / regenerateAsset
 *  tools because she now knows what's on screen.
 *
 *  When null (Emma is on a page that's NOT the editor), the edit
 *  tools aren't registered and Emma stays in pure-concierge mode. */
export interface EmmaEditFocus {
  generationId: string;
  headline: string | null;
  layoutId: string | null;
  palette: { ink: string; paper: string; accent: string } | null;
  format: string | null;
}

function buildSessionSnapshot(snap: EmmaSessionSnapshot): string {
  const lines = [
    '[SESSION]',
    `user first name: ${snap.userFirstName}`,
    `current route: ${snap.currentRoute ?? '(outside project)'}`,
    snap.lastGeneration
      ? `last generation: ${snap.lastGeneration.kind} — "${snap.lastGeneration.idea.slice(0, 120)}"`
      : 'last generation: (none yet)',
  ];
  return lines.join('\n');
}

/** Phase 08c — edit-mode block. Only injected when Emma is bound to
 *  a focused generation. Tells the model which edit tools it has, the
 *  current state of the asset (so "shorter headline" knows what it's
 *  shortening), and the cost / latency it's spending on each call. */
function buildEditModeBlock(focus: EmmaEditFocus): string {
  const palette = focus.palette
    ? `${focus.palette.ink} (ink) / ${focus.palette.paper} (paper) / ${focus.palette.accent} (accent)`
    : '(not recorded)';
  return [
    '─── EDIT MODE ───',
    `You are mounted inside the editor for generation ${focus.generationId}.`,
    `Current state — headline: "${focus.headline ?? '(none)'}", layout: ${focus.layoutId ?? '(unknown)'}, palette: ${palette}, format: ${focus.format ?? '(unknown)'}.`,
    '',
    'Edit tools available to you (use ONLY when the user asks for the matching action):',
    '  - changeHeadline({ newHeadline, ... }) — rewrite headline / "más sobrio" / "más corto".',
    '  - changeLayout({ layoutId }) — switch to another layout template.',
    '  - changePalette({ ink, paper, accent }) — swap colors. You pick concrete hex.',
    '  - addVariant({ tweakPrompt? }) — same brief, model re-rolls.',
    '  - regenerateAsset({ tweakHint }) — full re-roll informed by a hint.',
    '',
    'Each edit costs ~$0.21 and takes 15-30s. After a successful tool call:',
    '  1. Confirm in ONE short line ("Listo. Headline más corto.").',
    '  2. Ask ONE follow-up question — never a menu.',
    'The editor handles navigation to the new generation automatically; do NOT call navigateTo for edit results.',
    '',
    'When the user says "más sobrio" / "más caliente" / "más afilado" without naming what to change: ask "¿el headline, los colores, o el layout?" before calling any tool.',
  ].join('\n');
}

/** Question bank rendered as plain prose so the model can copy
 *  phrasings verbatim when a category matches. Not strict scripts
 *  — Emma riffs — but having concrete examples here keeps her on
 *  the "tactical, specific" side. */
function buildQuestionBankExamples(): string {
  return [
    'QUESTION TEMPLATES (use literally when the category matches; riff when it does not):',
    '',
    'When the user asks to create with nothing specified:',
    ...EMMA_QUESTION_BANK.vagueCreateRequest.map((q) => `  · ${q}`),
    '',
    'When the channel is missing:',
    ...EMMA_QUESTION_BANK.noChannelSpecified.map((q) => `  · ${q}`),
    '',
    'When the idea/angle is missing:',
    ...EMMA_QUESTION_BANK.noIdeaSpecified.map((q) => `  · ${q}`),
    '',
    'When the brand voice is ambiguous:',
    ...EMMA_QUESTION_BANK.ambiguousVoice.map((q) => `  · ${q}`),
  ].join('\n');
}

export interface BuildEmmaSystemPromptInput {
  project: Project;
  brandKit: BrandKit;
  productBrief: ProductBrief | null;
  recentAssets: Array<{ kind: string; brief: string; createdAt: Date }>;
  language: 'en' | 'es';
  userDisplayName: string;
  /** Phase 07j. Optional — older callers (tests) can omit it and the
   *  block becomes "(no session snapshot)". The stream route threads
   *  one in for every live turn. */
  sessionSnapshot?: EmmaSessionSnapshot;
  /** Phase 08c. Optional — only set when Emma is mounted in the
   *  asset editor (AskEmmaBlock). Unlocks edit-mode language in the
   *  prompt. */
  editFocus?: EmmaEditFocus | null;
}

/**
 * Build the full system prompt for an Emma turn.
 *
 * Order is deliberate:
 *   1. ROLE — who she is, in 4 lines.
 *   2. HARD_RULES — what she can/can't do (4 lines).
 *   3. VAGUE_CREATE pattern — the antidote to "creame una" ghosting.
 *   4. Voice block — warmth + curiosity + brevity + anti-clichés.
 *   5. Worked examples — show-don't-tell.
 *   6. Structural patterns — tool-use bias, recommend, explain, etc.
 *   7. Per-turn context blocks (project, brief, recent assets, session).
 *   8. Greeting line.
 *
 * Target: persona prose ≤ 1500 tokens. Context blocks scale with
 * brand kit / brief size; with EMMA_DEBUG=1 the dev log surfaces
 * the total so we can spot bloat before OpenAI rejects.
 */
export function buildEmmaSystemPrompt(input: BuildEmmaSystemPromptInput): string {
  const safeName = input.userDisplayName?.trim() || EMMA_FALLBACK_GREETING_NAME;
  const greetingTemplate = EMMA_GREETING_TEMPLATES[input.language];
  const greetingLine = greetingTemplate.replace('{name}', safeName);

  const sections: string[] = [
    EMMA_CONCIERGE_SECTIONS.ROLE,
    '',
    EMMA_CONCIERGE_SECTIONS.HARD_RULES,
    '',
    EMMA_CRITICAL_RESPONSE_PATTERN_VAGUE_CREATE,
    '',
    '─── VOICE ───',
    EMMA_VOICE.IDENTITY,
    EMMA_VOICE.WARMTH,
    EMMA_VOICE.CURIOSITY,
    EMMA_VOICE.CARE,
    EMMA_VOICE.BREVITY,
    EMMA_VOICE.NO_FAKE_ENTHUSIASM,
    '',
    '─── EXAMPLES ───',
    EMMA_WORKED_EXAMPLES,
    '',
    '─── WRAP-UP ───',
    EMMA_WRAPUP_POSTURE,
    '',
    '─── PATTERNS ───',
    EMMA_CONCIERGE_SECTIONS.TOOL_USE_BIAS,
    '',
    EMMA_CONCIERGE_SECTIONS.FORMAT,
    '',
    EMMA_CONCIERGE_SECTIONS.CONTEXT_AWARENESS,
    '',
    EMMA_CONCIERGE_SECTIONS.RECOMMEND_PATTERN,
    '',
    EMMA_CONCIERGE_SECTIONS.EXPLAIN_PATTERN,
    '',
    EMMA_SYSTEM_SECTIONS.MULTIMODAL,
    '',
    EMMA_SYSTEM_SECTIONS.BRAND_FIDELITY,
    '',
    EMMA_CONCIERGE_SECTIONS.LANGUAGE,
    '',
    EMMA_CONCIERGE_SECTIONS.REFUSAL,
    '',
    buildQuestionBankExamples(),
    '',
    '─── PROJECT CONTEXT ───',
    buildBrandContext({ project: input.project, brandKit: input.brandKit }),
    '',
    buildBriefContext(input.productBrief),
    '',
    buildRecentAssetsContext(input.recentAssets),
    '',
    input.sessionSnapshot
      ? buildSessionSnapshot(input.sessionSnapshot)
      : '[SESSION]\n(no session snapshot)',
    '',
    input.editFocus ? buildEditModeBlock(input.editFocus) : '',
    input.editFocus ? '' : '',
    '─── USER ───',
    greetingLine,
  ];

  return sections.filter((s) => s !== '' || true).join('\n');
}

/** Welcome line Emma shows in an empty thread. */
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
