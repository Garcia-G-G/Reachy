import 'server-only';
import { Queue } from 'bullmq';
import { createBullConnection, QUEUE_NAMES } from './connection';

export interface IngestionJobData {
  ingestionId: string;
  userId: string;
  fileRefs: Array<{
    r2Key: string;
    mime: string | null;
    originalName: string;
    bytes: number;
  }>;
}

let cached: Queue<IngestionJobData> | null = null;

export function getIngestionQueue(): Queue<IngestionJobData> {
  if (cached) return cached;
  cached = new Queue<IngestionJobData>(QUEUE_NAMES.ingestion, {
    connection: createBullConnection(),
  });
  return cached;
}
