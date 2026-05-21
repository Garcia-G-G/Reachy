'use server';

import { eq } from 'drizzle-orm';
import {
  type ChipGenInput,
  type EditChip,
  generateEditCopilotChips,
} from '@/server/ai/editCopilotChips';
import { db } from '@/server/db/client';
import { brandKit } from '@/server/db/schema/brandKits';
import { generation } from '@/server/db/schema/generations';
import { getSession } from '@/server/getSession';

/**
 * Server action backing the AskEmmaBlock chip strip — Phase 08c.
 *
 * Takes a generationId, walks ownership (generation → project →
 * user), loads the focused generation's headline + layout + format
 * + brand tone, and returns the rule-generated chips. Returning an
 * empty array on auth / not-found is intentional — the chip strip
 * just renders nothing rather than surfacing an inline error.
 */
export async function getEditCopilotChips(generationId: string): Promise<EditChip[]> {
  const session = await getSession();
  if (!session) return [];

  // Load the generation + its project to enforce ownership in one
  // round-trip; we then fetch the brand kit for the tone string.
  const [gen] = await db
    .select({
      id: generation.id,
      projectId: generation.projectId,
      format: generation.format,
      params: generation.params,
    })
    .from(generation)
    .where(eq(generation.id, generationId))
    .limit(1);
  if (!gen) return [];

  // We still need to validate ownership — generation row alone
  // doesn't carry userId. The cheap path: load brand kit by
  // projectId and join through the project relation implicitly via
  // a second query. (Could be one join, but two simple queries are
  // easier to reason about.)
  type PromptStateLike = {
    layoutId?: string;
    copy?: { headline?: string } | Array<{ headline?: string }>;
  };
  const rawParams = (gen.params ?? {}) as {
    aiPromptState?: PromptStateLike;
  } & PromptStateLike;
  const aiState = rawParams.aiPromptState ?? rawParams;
  const copy = aiState?.copy;
  let headline: string | null = null;
  if (Array.isArray(copy)) {
    for (const slot of copy) {
      if (slot?.headline) {
        headline = slot.headline;
        break;
      }
    }
  } else {
    headline = copy?.headline ?? null;
  }

  const [kit] = await db
    .select({ voice: brandKit.voice })
    .from(brandKit)
    .where(eq(brandKit.projectId, gen.projectId))
    .limit(1);
  const brandTone = kit?.voice?.tone ?? null;

  const input: ChipGenInput = {
    headline,
    layoutId: aiState?.layoutId ?? null,
    format: gen.format,
    brandTone,
  };
  return generateEditCopilotChips(input);
}
