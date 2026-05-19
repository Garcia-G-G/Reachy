/**
 * One-shot bypass: take a campaign that's stuck in 'awaiting_approval'
 * and force it to 'running' + enqueue the bulk worker.
 *
 * Run with:
 *   pnpm tsx scripts/force-approve-campaign.ts <campaignId>
 *
 * Use when the /review page UI is broken but the campaign + plan
 * are persisted correctly and you just want to fire the bulk gen.
 */

import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

async function main() {
  const campaignId = process.argv[2];
  if (!campaignId) {
    console.error('usage: pnpm tsx scripts/force-approve-campaign.ts <campaignId>');
    process.exit(1);
  }

  const { db } = await import('../src/server/db/client');
  const { campaign } = await import('../src/server/db/schema/campaigns');
  const { eq } = await import('drizzle-orm');
  const { getCampaignQueue } = await import('../src/server/jobs/campaignQueue');

  const [row] = await db.select().from(campaign).where(eq(campaign.id, campaignId)).limit(1);
  if (!row) {
    console.error(`campaign not found: ${campaignId}`);
    process.exit(1);
  }

  console.log(`campaign ${campaignId} — status=${row.status}, projectId=${row.projectId}`);

  if (row.status !== 'awaiting_approval') {
    console.error(`expected status=awaiting_approval, got ${row.status} — refusing`);
    process.exit(1);
  }

  await db
    .update(campaign)
    .set({ status: 'running', approvedAt: new Date() })
    .where(eq(campaign.id, campaignId));

  const queue = getCampaignQueue();
  await queue.add('fan-out', { campaignId, projectId: row.projectId }, { jobId: campaignId });
  console.log(`enqueued bulk fan-out for ${campaignId}. tail worker log for progress.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
