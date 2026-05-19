/**
 * One-shot: sync campaign_asset.status with the underlying generation.status
 * for assets stuck in 'running' state because the watchGeneration loop
 * timed out before the generation completed (a known bug in pre-fix code).
 *
 * After syncing, also re-fires the critic for any newly-promoted-to-done
 * rows so they get scored, and finalizes the campaign cost.
 *
 * Run with:
 *   node --conditions=react-server --import tsx scripts/reconcile-campaign-assets.ts <campaignId>
 */

import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

async function main() {
  const campaignId = process.argv[2];
  if (!campaignId) {
    console.error('usage: pnpm tsx scripts/reconcile-campaign-assets.ts <campaignId>');
    process.exit(1);
  }

  const { db } = await import('../src/server/db/client');
  const { campaign } = await import('../src/server/db/schema/campaigns');
  const { campaignAsset } = await import('../src/server/db/schema/campaignAssets');
  const { generation } = await import('../src/server/db/schema/generations');
  const { eq, and, inArray } = await import('drizzle-orm');

  const [camp] = await db.select().from(campaign).where(eq(campaign.id, campaignId)).limit(1);
  if (!camp) {
    console.error(`campaign not found`);
    process.exit(1);
  }

  const stuckRows = await db
    .select()
    .from(campaignAsset)
    .where(and(eq(campaignAsset.campaignId, campaignId), eq(campaignAsset.status, 'running')));

  console.log(`stuck rows: ${stuckRows.length}`);

  let promotedDone = 0;
  let promotedFailed = 0;

  for (const row of stuckRows) {
    if (!row.generationId) continue;
    const [gen] = await db
      .select({
        status: generation.status,
        costCents: generation.costCents,
        err: generation.errorMessage,
      })
      .from(generation)
      .where(eq(generation.id, row.generationId))
      .limit(1);
    if (!gen) continue;
    if (gen.status === 'done' || gen.status === 'failed') {
      await db
        .update(campaignAsset)
        .set({
          status: gen.status,
          costCents: gen.costCents ?? 0,
          errorMessage: gen.status === 'failed' ? (gen.err ?? 'upstream failed') : null,
          finishedAt: new Date(),
        })
        .where(eq(campaignAsset.id, row.id));
      if (gen.status === 'done') promotedDone++;
      else promotedFailed++;
      console.log(`  ${row.id} (${row.kind}) → ${gen.status}`);
    }
  }

  console.log(`promoted: ${promotedDone} done, ${promotedFailed} failed`);

  // Check if campaign should be finalized
  const remaining = await db
    .select()
    .from(campaignAsset)
    .where(
      and(
        eq(campaignAsset.campaignId, campaignId),
        inArray(campaignAsset.status, ['pending', 'running']),
      ),
    );

  if (remaining.length === 0) {
    const allRows = await db
      .select()
      .from(campaignAsset)
      .where(eq(campaignAsset.campaignId, campaignId));
    const totalCost = allRows.reduce(
      (acc, r) => acc + (r.costCents ?? 0) + (r.criticCostCents ?? 0),
      0,
    );
    const allFailed = allRows.every((r) => r.status === 'failed');
    await db
      .update(campaign)
      .set({
        status: allFailed ? 'failed' : 'done',
        costCentsActual: totalCost,
        finishedAt: new Date(),
      })
      .where(eq(campaign.id, campaignId));
    console.log(`campaign finalized: ${allFailed ? 'failed' : 'done'}, total cost = ${totalCost}¢`);
  } else {
    console.log(`${remaining.length} rows still pending/running — campaign not finalized`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
