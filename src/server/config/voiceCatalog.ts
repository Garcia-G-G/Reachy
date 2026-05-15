import 'server-only';
import type { ProductBriefTone } from './toneToVoice';

/**
 * Curated ElevenLabs voice catalog for reel narration.
 *
 * Voice IDs are DATA (each is a specific ElevenLabs voice asset), but
 * the curation — which voices Reachy considers in-brand for each tone
 * — is editorial policy and lives in config. ENV vars
 * ELEVENLABS_VOICE_ID / ELEVENLABS_VOICE_ID_EN / _ES still win as
 * overrides; the catalog is what we use when no override is set.
 *
 * Layout: per language, a small set per tone. The picker deterministically
 * selects one entry by hashing the generationId — same reel on retry
 * gets the same voice, but different reels with the same tone pick
 * different voices so a single brand kit doesn't sound monotone
 * across a campaign.
 *
 * To curate Reachy's voices: ElevenLabs Voice Library. Each entry's
 * `id` is the V2 / V3 voice id, `name` is the human label, `notes` is
 * a one-line tone descriptor (memory aid for future curation).
 */

export interface VoiceEntry {
  id: string;
  name: string;
  notes: string;
}

/** ES + EN catalogs. The ids below are PLACEHOLDERS using the same
 *  shape ElevenLabs uses (21 hex chars). Garcia replaces these with
 *  curated voice ids from the Voice Library; the resolver falls back
 *  to ENV var overrides + then to the catch-all if the catalog hasn't
 *  been populated yet, so the autopilot still works in placeholder
 *  state — it just uses one voice per language until curation. */
export const VOICE_CATALOG: Record<
  'en' | 'es',
  Partial<Record<ProductBriefTone, readonly VoiceEntry[]>> & {
    /** Always-available defaults pulled when a tone-specific entry
     *  isn't curated yet. */
    default: readonly VoiceEntry[];
  }
> = {
  en: {
    default: [
      {
        id: 'voiceCatalogEnDefault00',
        name: 'Default EN A',
        notes: 'placeholder — replace from ElevenLabs Voice Library',
      },
    ],
    editorial: [
      {
        id: 'voiceCatalogEnEdit00',
        name: 'Editorial EN A',
        notes: 'placeholder — considered, measured',
      },
      {
        id: 'voiceCatalogEnEdit01',
        name: 'Editorial EN B',
        notes: 'placeholder — magazine-grade narrator',
      },
    ],
    technical: [
      {
        id: 'voiceCatalogEnTech00',
        name: 'Technical EN A',
        notes: 'placeholder — precise, builder-voice',
      },
      { id: 'voiceCatalogEnTech01', name: 'Technical EN B', notes: 'placeholder — engineer demo' },
    ],
    playful: [
      { id: 'voiceCatalogEnPlay00', name: 'Playful EN A', notes: 'placeholder — warm, irreverent' },
    ],
    enterprise: [
      {
        id: 'voiceCatalogEnEntr00',
        name: 'Enterprise EN A',
        notes: 'placeholder — restrained, credible',
      },
    ],
    indie: [
      {
        id: 'voiceCatalogEnIndi00',
        name: 'Indie EN A',
        notes: 'placeholder — first-person founder voice',
      },
    ],
  },
  es: {
    default: [
      {
        id: 'voiceCatalogEsDefault00',
        name: 'Default ES A',
        notes: 'placeholder — neutral Latin American',
      },
    ],
    editorial: [
      {
        id: 'voiceCatalogEsEdit00',
        name: 'Editorial ES A',
        notes: 'placeholder — locutor de revista',
      },
      {
        id: 'voiceCatalogEsEdit01',
        name: 'Editorial ES B',
        notes: 'placeholder — considerado, pausado',
      },
    ],
    technical: [
      {
        id: 'voiceCatalogEsTech00',
        name: 'Technical ES A',
        notes: 'placeholder — preciso, voz de developer',
      },
    ],
    playful: [
      { id: 'voiceCatalogEsPlay00', name: 'Playful ES A', notes: 'placeholder — cálido, juguetón' },
    ],
    enterprise: [
      {
        id: 'voiceCatalogEsEntr00',
        name: 'Enterprise ES A',
        notes: 'placeholder — corporativo creíble',
      },
    ],
    indie: [
      {
        id: 'voiceCatalogEsIndi00',
        name: 'Indie ES A',
        notes: 'placeholder — primera persona, voz fundador',
      },
    ],
  },
};

/** Resolve the voice entries available for a given (language, tone)
 *  pair. Falls back to language default when the tone slot is empty. */
export function entriesFor(
  language: 'en' | 'es',
  tone: ProductBriefTone | null,
): readonly VoiceEntry[] {
  const langCatalog = VOICE_CATALOG[language];
  if (tone) {
    const toneEntries = langCatalog[tone];
    if (toneEntries && toneEntries.length > 0) return toneEntries;
  }
  return langCatalog.default;
}

/** Fast cyrb53-style hash for the deterministic voice picker. */
function hashSeed(s: string): number {
  let h1 = 0xdeadbeef ^ s.length;
  let h2 = 0x41c6ce57 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0) ^ ((h1 >>> 0) << 1);
}

/** Deterministic voice picker. Same `seed` (typically a generationId)
 *  yields the same voice across retries; different seeds with the same
 *  (language, tone) get different voices to avoid catalog mono-tone. */
export function pickVoiceFromCatalog(args: {
  language: 'en' | 'es';
  tone: ProductBriefTone | null;
  seed: string;
}): VoiceEntry {
  const entries = entriesFor(args.language, args.tone);
  const idx = hashSeed(args.seed) % entries.length;
  const picked = entries[idx];
  // entries.length is always >= 1 per the catalog shape — the
  // language default slot is always populated.
  if (!picked) throw new Error('voiceCatalog: empty entries — catalog misconfigured');
  return picked;
}
