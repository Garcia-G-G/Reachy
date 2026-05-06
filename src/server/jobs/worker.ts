import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

async function main() {
  const { startImageWorker } = await import('./imageWorker');
  const worker = startImageWorker();
  console.log('[reachy:worker] image-gen worker started.');

  const shutdown = async (signal: string) => {
    console.log(`[reachy:worker] ${signal} received — closing worker...`);
    await worker.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('[reachy:worker] fatal:', err);
  process.exit(1);
});
