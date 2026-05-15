import 'server-only';
import { Queue } from 'bullmq';
import { createBullConnection, QUEUE_NAMES } from './connection';

export interface CampaignJobData {
  campaignId: string;
  projectId: string;
}

let cached: Queue<CampaignJobData> | null = null;

export function getCampaignQueue(): Queue<CampaignJobData> {
  if (cached) return cached;
  cached = new Queue<CampaignJobData>(QUEUE_NAMES.campaign, {
    connection: createBullConnection(),
    defaultJobOptions: {
      attempts: 1,
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 50 },
    },
  });
  cached.on('error', (err) => {
    console.error('[reachy:queue] campaign error:', err.message);
  });
  return cached;
}
