import { config as loadEnv } from 'dotenv';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required to run migrations.');
  console.log('[reachy:db] connecting to', url.replace(/:\/\/[^@]+@/, '://***@'));

  const client = postgres(url, { max: 1, prepare: false });
  const db = drizzle(client);
  console.log('[reachy:db] applying migrations...');
  await migrate(db, { migrationsFolder: './src/server/db/migrations' });
  console.log('[reachy:db] migrations applied.');
  await client.end();
}

main().catch((err) => {
  console.error('[reachy:db] migration failed:', err);
  process.exit(1);
});
