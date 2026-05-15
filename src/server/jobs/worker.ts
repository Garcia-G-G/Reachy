import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

async function main() {
  const { startImageWorker } = await import('./imageWorker');
  const { startVideoWorker } = await import('./videoWorker');
  const { startIngestionWorker } = await import('./ingestionWorker');
  const { startCampaignWorker } = await import('./campaignWorker');

  const imageWorker = startImageWorker();
  console.log('[reachy:worker] image-gen worker started.');

  const videoWorker = startVideoWorker();
  console.log('[reachy:worker] video-gen worker started.');

  const ingestionWorker = startIngestionWorker();
  console.log('[reachy:worker] ingestion worker started.');

  const campaignWorker = startCampaignWorker();
  console.log('[reachy:worker] campaign worker started.');

  const shutdown = async (signal: string) => {
    console.log(`[reachy:worker] ${signal} received — closing workers...`);
    await Promise.all([
      imageWorker.close(),
      videoWorker.close(),
      ingestionWorker.close(),
      campaignWorker.close(),
    ]);
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('[reachy:worker] fatal:', err);
  process.exit(1);
});
