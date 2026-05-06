import 'server-only';
import { and, count, eq, gte, sql } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { generation } from '@/server/db/schema/generations';
import { project } from '@/server/db/schema/projects';

/**
 * Per-user-per-day caps to bound LLM/image cost in a private beta. The first
 * indie hacker who fat-fingers a loop should not be able to drain Garcia's
 * card. Tune these once we ship pricing tiers.
 */
export const USAGE_CAPS_PER_DAY = {
  image: 50,
  copy: 100,
  video: 10,
} as const;

export type CappedType = keyof typeof USAGE_CAPS_PER_DAY;

export interface UsageCheck {
  ok: boolean;
  used: number;
  cap: number;
}

/**
 * Count how many `type` generations the user has triggered in the last 24h
 * across all their projects. Both successful and failed runs count — failures
 * still hit the upstream provider (and our wallet) for a few cents.
 */
export async function checkDailyUsage(userId: string, type: CappedType): Promise<UsageCheck> {
  const cap = USAGE_CAPS_PER_DAY[type];
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [row] = await db
    .select({ n: count() })
    .from(generation)
    .innerJoin(project, eq(project.id, generation.projectId))
    .where(
      and(eq(project.userId, userId), eq(generation.type, type), gte(generation.createdAt, since)),
    );

  const used = Number(row?.n ?? 0);
  return { ok: used < cap, used, cap };
}

/**
 * Same query, but reports the total cost in cents over the window — useful for
 * future spending dashboards.
 */
export async function dailySpendCents(userId: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [row] = await db
    .select({ total: sql<number>`COALESCE(SUM(${generation.costCents}), 0)` })
    .from(generation)
    .innerJoin(project, eq(project.id, generation.projectId))
    .where(and(eq(project.userId, userId), gte(generation.createdAt, since)));
  return Number(row?.total ?? 0);
}
