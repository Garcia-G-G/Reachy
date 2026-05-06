import 'server-only';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '@/env';

let cached: S3Client | null = null;

function getR2(): S3Client {
  if (cached) return cached;
  if (!env.R2_ACCOUNT_ID || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY) {
    throw new Error(
      'R2 is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY.',
    );
  }
  cached = new S3Client({
    region: 'auto',
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
  });
  return cached;
}

export function isR2Configured(): boolean {
  return Boolean(
    env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_BUCKET,
  );
}

export interface PutR2Result {
  key: string;
  publicUrl: string | null;
  bytes: number;
}

export async function putR2(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<PutR2Result> {
  if (!env.R2_BUCKET) throw new Error('R2_BUCKET is not set.');
  const r2 = getR2();
  await r2.send(
    new PutObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
  const publicUrl = env.R2_PUBLIC_URL ? `${env.R2_PUBLIC_URL.replace(/\/$/, '')}/${key}` : null;
  return { key, publicUrl, bytes: body.length };
}

export async function signedDownloadUrl(key: string, expiresInSec = 60 * 5): Promise<string> {
  if (!env.R2_BUCKET) throw new Error('R2_BUCKET is not set.');
  const r2 = getR2();
  return getSignedUrl(
    r2,
    new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: key }),
    { expiresIn: expiresInSec },
  );
}
