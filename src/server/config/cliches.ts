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
];

export function clichesFor(language: 'en' | 'es'): readonly string[] {
  return language === 'es' ? ES_CLICHES : EN_CLICHES;
}
