import 'server-only';
import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { env } from '@/env';

/**
 * ElevenLabs Sound Effects API — generates short audio stingers from
 * a text prompt. We use it for reel transitions: one intro chime at
 * t=0, one mid-reel transition at the visual midpoint, one outro click.
 *
 * SDK shape (verified against @elevenlabs/elevenlabs-js@2.30.0):
 *   client.textToSoundEffects.convert({
 *     text: string,
 *     durationSeconds?: number,     // 0.5 – 30
 *     promptInfluence?: number,     // 0-1, default 0.3
 *     outputFormat?: 'mp3_44100_128',
 *   }) → ReadableStream<Uint8Array>
 *
 * Cache strategy: SFX descriptions repeat across reels ("soft chime,
 * brief, editorial" is the same for every editorial reel), so we
 * disk-cache by SHA-256 of the description + duration. The cache lives
 * under `<os.tmpdir>/reachy-sfx-cache/` and is shared across worker
 * restarts. First reel pays the API; subsequent reels with the same
 * description hit the cache for free.
 */

let cached: ElevenLabsClient | null = null;
function getClient(): ElevenLabsClient {
  if (!env.ELEVENLABS_API_KEY) throw new Error('ELEVENLABS_API_KEY not set');
  if (!cached) cached = new ElevenLabsClient({ apiKey: env.ELEVENLABS_API_KEY });
  return cached;
}

const CACHE_DIR = join(tmpdir(), 'reachy-sfx-cache');

export interface ElevenLabsSfxArgs {
  /** Plain-English description of the sound effect we want. */
  description: string;
  /** Optional duration hint (0.5 – 30s). When omitted ElevenLabs picks. */
  durationSec?: number;
  /** 0–1 prompt adherence; defaults to 0.5 for short stingers (looser =
   *  more variation, which is fine for one-off transition hits). */
  promptInfluence?: number;
}

export interface ElevenLabsSfxResult {
  /** Local filesystem path to the cached or freshly-generated MP3. */
  path: string;
  bytes: number;
  costCents: number;
  cached: boolean;
}

async function ensureCacheDir(): Promise<void> {
  try {
    await mkdir(CACHE_DIR, { recursive: true });
  } catch {
    // benign — already exists
  }
}

function hashKey(args: ElevenLabsSfxArgs): string {
  const h = createHash('sha256');
  h.update(args.description);
  h.update('|');
  h.update(String(args.durationSec ?? 'auto'));
  h.update('|');
  h.update(String(args.promptInfluence ?? '0.5'));
  return h.digest('hex').slice(0, 24);
}

async function loadFromCache(path: string): Promise<Buffer | null> {
  try {
    const info = await stat(path);
    if (!info.isFile() || info.size === 0) return null;
    return await readFile(path);
  } catch {
    return null;
  }
}

/**
 * Generate (or return cached) sound-effect MP3. Pricing: per-generation
 * (a few cents typical for short stingers). We bill 1¢ per generation
 * as a coarse approximation; cache hits cost 0.
 */
export async function generateSfx(args: ElevenLabsSfxArgs): Promise<ElevenLabsSfxResult> {
  await ensureCacheDir();
  const key = hashKey(args);
  const path = join(CACHE_DIR, `${key}.mp3`);

  const cachedBuf = await loadFromCache(path);
  if (cachedBuf) {
    console.log(
      `[reachy:sfx] cache HIT key=${key} bytes=${cachedBuf.length} description="${args.description.slice(0, 60)}…"`,
    );
    return { path, bytes: cachedBuf.length, costCents: 0, cached: true };
  }

  const client = getClient();
  const startedAt = Date.now();
  console.log(
    `[reachy:sfx] generateSfx cache MISS key=${key} description="${args.description.slice(0, 60)}…" durationSec=${args.durationSec ?? 'auto'}`,
  );

  const stream = await client.textToSoundEffects.convert({
    text: args.description,
    durationSeconds: args.durationSec,
    promptInfluence: args.promptInfluence ?? 0.5,
    outputFormat: 'mp3_44100_128',
  });

  const reader = stream.getReader();
  const chunks: Buffer[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(Buffer.from(value));
  }
  const buffer = Buffer.concat(chunks);
  await writeFile(path, buffer);

  const costCents = 1; // coarse approximation; SFX clips are sub-penny per generation but the floor stays for ledger consistency
  console.log(
    `[reachy:sfx] generateSfx ok key=${key} bytes=${buffer.length} costCents=${costCents} elapsedMs=${Date.now() - startedAt}`,
  );
  return { path, bytes: buffer.length, costCents, cached: false };
}
