import 'server-only';
import OpenAI from 'openai';
import { env } from '@/env';

let cached: OpenAI | null = null;

export function getOpenAI(): OpenAI {
  if (cached) return cached;
  if (!env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set. Add it to .env.local.');
  }
  cached = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  return cached;
}

export function isOpenAIConfigured(): boolean {
  return Boolean(env.OPENAI_API_KEY);
}
