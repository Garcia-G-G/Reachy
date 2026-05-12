/**
 * One-off: create the R2 bucket configured in .env.local.
 *
 * Run with:
 *   node --env-file=.env.local --import tsx ./scripts/r2-create-bucket.ts
 *
 * Idempotent — if the bucket already exists (or is owned by this account)
 * the script reports success and exits 0.
 */
import {
  BucketAlreadyExists,
  BucketAlreadyOwnedByYou,
  CreateBucketCommand,
  HeadBucketCommand,
  S3Client,
} from '@aws-sdk/client-s3';

function need(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing env: ${key}`);
  return v;
}

const accountId = need('R2_ACCOUNT_ID');
const bucket = need('R2_BUCKET');

const client = new S3Client({
  region: 'auto',
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: need('R2_ACCESS_KEY_ID'),
    secretAccessKey: need('R2_SECRET_ACCESS_KEY'),
  },
});

async function main() {
  console.log(`[r2] target bucket: ${bucket} (account ${accountId})`);

  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    console.log(`[r2] bucket "${bucket}" already exists — nothing to do.`);
    return;
  } catch (err) {
    const name = (err as { name?: string }).name;
    if (name !== 'NotFound' && name !== 'NoSuchBucket') {
      // Anything other than "doesn't exist" is real (auth, network, etc.)
      throw err;
    }
  }

  try {
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
    console.log(`[r2] created bucket "${bucket}".`);
  } catch (err) {
    if (err instanceof BucketAlreadyOwnedByYou) {
      console.log(`[r2] bucket "${bucket}" already owned — ok.`);
      return;
    }
    if (err instanceof BucketAlreadyExists) {
      throw new Error(
        `Bucket name "${bucket}" is taken by another account — pick a different R2_BUCKET.`,
      );
    }
    throw err;
  }
}

main().catch((err) => {
  console.error('[r2] failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
