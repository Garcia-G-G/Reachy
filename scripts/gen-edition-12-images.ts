import { mkdir, writeFile } from 'node:fs/promises';
import { config as loadEnv } from 'dotenv';
import OpenAI from 'openai';

loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

const OUT_DIR = 'docs/screenshots/edition-12';

const SHARED_STYLE =
  'Editorial / magazine print aesthetic. Warm cream off-white paper #f1ebdf as the background. Black ink #14110d typography in a Fraunces-style display serif. Burnt sienna #b6481a used sparingly as a single accent. Print quality, fine paper grain, no glossy gradients, no glow, no neon, no 3D, no AI-art look. Light mode only. Hard edges, no rounded corners on graphic elements. Layout densely art-directed, like a single page of The Drift, Aperture, or The New Yorker.';

const PIECES: { name: string; size: '1024x1536'; prompt: string }[] = [
  {
    name: 'cover',
    size: '1024x1536',
    prompt: `An editorial magazine spread for a SaaS analytics product called "SaaS Tracker". Centered on the page: a single large display-serif headline in italic, "Track every metric.", set in roughly 96pt. Below it, a small dashboard mock: thin 1px ink rules forming a tiny line chart and three KPI tiles with mono captions. ${SHARED_STYLE}`,
  },
  {
    name: 'carousel',
    size: '1024x1536',
    prompt: `An editorial Instagram carousel slide for "SaaS Tracker". Top: a small JetBrains Mono uppercase eyebrow that reads "№ 04 — DASHBOARD". Middle: a large display-serif headline that reads "The numbers tell the story." Below, a single elegant data line chart in burnt sienna over a 1px ink baseline. ${SHARED_STYLE}`,
  },
  {
    name: 'reel',
    size: '1024x1536',
    prompt: `A vertical 9:16 poster frame for a 30-second editorial Reel about SaaS analytics. Top third: a large display-serif italic headline reading "30 seconds, 12 metrics." Middle: a small dashboard mock with two KPI numbers in big serif (e.g. "+38%" and "$4.2K") and burnt sienna accent. Bottom: tiny mono caption "REACHY · EDITION № 12". ${SHARED_STYLE}`,
  },
];

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set');
  const openai = new OpenAI({ apiKey });
  await mkdir(OUT_DIR, { recursive: true });

  for (const piece of PIECES) {
    process.stdout.write(`generating ${piece.name}... `);
    const res = await openai.images.generate({
      model: 'gpt-image-1',
      prompt: piece.prompt,
      size: piece.size,
      quality: 'low',
      output_format: 'jpeg',
      output_compression: 80,
    });
    const b64 = res.data?.[0]?.b64_json;
    if (!b64) throw new Error(`no image data for ${piece.name}`);
    const buf = Buffer.from(b64, 'base64');
    await writeFile(`${OUT_DIR}/${piece.name}.jpg`, buf);
    console.log(`done (${(buf.length / 1024).toFixed(0)} KB)`);
  }
  console.log('all 3 saved to', OUT_DIR);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
