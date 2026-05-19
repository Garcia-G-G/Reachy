import 'server-only';

/**
 * Per-language marketing-cliché blacklist for downstream copy
 * generators (Step 4's channelCopy.ts in particular). The lists are
 * curated, not derivable — each phrase has been hit at least once by
 * Reachy's output and explicitly added here.
 *
 * Mirrors src/server/ai/copyPlanner.ts's defaultVoiceRules — when a
 * cliché lands here, the planner already knows about it via that
 * module. This file is the shared source the channel-copy generator
 * uses so we don't duplicate the list per call site.
 */

export const ES_CLICHES: readonly string[] = [
  'eleva tu marca',
  'lleva al siguiente nivel',
  'transforma tu negocio',
  'desbloquea tu potencial',
  'potencia tu',
  'el futuro del',
  'la solución definitiva',
  'revoluciona',
  'impulsa tu',
  'domina el',
  'el secreto de',
  'todo lo que necesitas',
  'descubre cómo',
  'soluciones que',
  // 2026-05-19 — Phase 06 quality pivot. Reachy outputs at scale hit
  // these phrases as "safe" SaaS-speak. Banning them forces the model
  // to reach for concrete nouns / outcomes / brand-specific verbs.
  'optimiza tu',
  'centraliza tu',
  'todo en uno',
  'sin esfuerzo',
  'información accionable',
  'fuente única de verdad',
];

export const EN_CLICHES: readonly string[] = [
  'unlock',
  'revolutionize',
  'transform',
  'level up',
  'elevate',
  'take it to the next level',
  'craft your',
  'your brand story',
  'designed for',
  'supercharge',
  'game-changing',
  'the secret to',
  'everything you need',
  'discover how',
  // 2026-05-19 — Phase 06 quality pivot. May 19 test surfaced
  // "Streamline customer feedback", "Centralize your feedback",
  // "Analyze feedback efficiently" — the entire blanket of generic
  // SaaS phrasings that the model defaults to when starved of brand
  // specificity. Ban them; the planner must work harder.
  'streamline',
  'centralize your',
  'efficiently', // catches the "analyze X efficiently" SaaS-speak hedge
  'empower your',
  'boost your',
  'seamless',
  'leverage',
  'in one place',
  'all in one',
  'organize without',
  'actionable insights',
  'single source of truth',
  'end-to-end',
];

export function clichesFor(language: 'en' | 'es'): readonly string[] {
  return language === 'es' ? ES_CLICHES : EN_CLICHES;
}
