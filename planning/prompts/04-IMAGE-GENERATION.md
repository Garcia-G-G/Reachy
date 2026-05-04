# Phase 04 — IMAGE GENERATION (OpenAI + fal.ai + R2)

> **Read `00-CONTEXT.md`. Phases 01–03 complete.**
> **Take your time. Apply §0.10 of `00-CONTEXT.md` (Quality & depth directive). Do NOT deliver in 5 minutes — research, plan, build, verify, refactor, re-read. Garcia values depth over speed.**

## Goal

Garcia writes an idea, picks a format (hero, og, post-ig, reel-cover, email-header, banner-tw) and generates 1–4 variants. Images are stored in Cloudflare R2 and listed in the project's library. Two providers supported: **OpenAI (`gpt-image-1`)** and **fal.ai (FLUX.2 pro, Nano Banana 2, Recraft V3)**.

## Mandatory prior research

WebSearch and WebFetch the official documentation:

1. **OpenAI Images API** (`platform.openai.com/docs/api-reference/images`)
   - Verify `gpt-image-1` is still the main model in May 2026
   - Current endpoint `/v1/images/generations` and parameters: `model`, `prompt`, `n`, `size`, `quality`, `output_format`, `output_compression`, `background`
   - Supported sizes (square 1024, 1024×1536, 1536×1024)
   - How to receive the image (b64_json vs url)

2. **fal.ai SDK** (`@fal-ai/client` or `fal-js` — verify current name)
   - How to invoke `fal-ai/flux-pro/v2`, `fal-ai/nano-banana-2`, `fal-ai/recraft-v3`
   - Streaming vs polling
   - How to handle storage_url vs base64

3. **Cloudflare R2** with `@aws-sdk/client-s3`:
   - Endpoint `https://<account-id>.r2.cloudflarestorage.com`
   - PutObject + signed URLs

Report any deviation.

## Steps

### 1. Dependencies

```bash
pnpm add openai @fal-ai/client @aws-sdk/client-s3 @aws-sdk/s3-request-presigner sharp bullmq ioredis
```

`sharp` for validating/compressing before upload; bullmq + ioredis for the queue.

### 2. AI clients

`src/server/ai/openai.ts`:
```ts
import OpenAI from 'openai';
import { env } from '@/env';
export const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY! });
```

`src/server/ai/fal.ts`:
```ts
import { fal } from '@fal-ai/client';
import { env } from '@/env';
fal.config({ credentials: env.FAL_KEY });
export { fal };
```

### 3. R2 client + upload helper

`src/server/storage/r2.ts`:
```ts
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { env } from '@/env';

export const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: env.R2_ACCESS_KEY_ID!, secretAccessKey: env.R2_SECRET_ACCESS_KEY! },
});

export async function putR2(key: string, body: Buffer, contentType: string) {
  await r2.send(new PutObjectCommand({ Bucket: env.R2_BUCKET, Key: key, Body: body, ContentType: contentType }));
  return `${env.R2_PUBLIC_URL}/${key}`;
}
```

### 4. Format catalog

`src/server/ai/formats.ts`:
```ts
export const IMAGE_FORMATS = {
  'hero':         { w: 1920, h: 1080, label: 'Hero landing 16:9' },
  'og':           { w: 1200, h: 630,  label: 'Open Graph' },
  'post-ig':      { w: 1080, h: 1350, label: 'Instagram post 4:5' },
  'reel-cover':   { w: 1080, h: 1920, label: 'Reel cover 9:16' },
  'email-header': { w: 1200, h: 400,  label: 'Email header' },
  'banner-tw':    { w: 1500, h: 500,  label: 'Twitter banner' },
  'square':       { w: 1080, h: 1080, label: 'Square 1:1' },
} as const;
export type ImageFormat = keyof typeof IMAGE_FORMATS;
```

### 5. Prompt builder with Brand Kit

`src/server/ai/promptBuilder.ts`:
```ts
type Args = { idea: string; format: ImageFormat; brandKit: BrandKitData; lang: 'es'|'en' };

export function buildImagePrompt({ idea, format, brandKit, lang }: Args) {
  const fm = IMAGE_FORMATS[format];
  const palette = [brandKit.primaryColor, brandKit.accentColor, brandKit.bgColor].filter(Boolean).join(', ');
  return [
    idea,
    `Aspect ratio ${fm.w}x${fm.h}.`,
    palette ? `Brand palette: ${palette}.` : '',
    brandKit.tone ? `Visual tone: ${brandKit.tone}.` : '',
    brandKit.fontHeading ? `Typography style reminiscent of ${brandKit.fontHeading}.` : '',
    'High quality, modern SaaS marketing aesthetic. Clean composition. No watermark, no text artifacts unless requested.',
  ].filter(Boolean).join(' ');
}
```

### 6. Per-provider adapter

`src/server/ai/imageGen.ts`:
```ts
type GenInput = { prompt: string; format: ImageFormat; provider: 'openai'|'fal'; model: string; n: number };

export async function generateImage(input: GenInput): Promise<{ buffers: Buffer[]; costCents: number }> {
  if (input.provider === 'openai') return openaiImage(input);
  if (input.provider === 'fal')    return falImage(input);
  throw new Error('unknown provider');
}
```

Implementations:

**openaiImage** — use `openai.images.generate({ model:'gpt-image-1', prompt, n, size: '1024x1024' or 'auto', quality:'medium' })`. Choose size based on format.w/h (OpenAI has fixed sizes; if format doesn't match, generate the closest size and then resize/crop with `sharp` to exact).

**falImage** — `fal.subscribe('fal-ai/flux-pro/v2', { input: { prompt, image_size: { width, height }, num_images: n }})`. Receive url, download to Buffer with `fetch`.

Compute approximate `costCents` per the pricing in 00-CONTEXT (OpenAI: ~$0.07 per medium image → 7 cents; fal varies by model).

### 7. BullMQ — queue and worker

`src/server/jobs/queue.ts`:
```ts
import { Queue } from 'bullmq';
import { env } from '@/env';
const connection = { url: env.REDIS_URL };
export const imageQueue = new Queue('image-gen', { connection });
```

`src/server/jobs/workers/imageWorker.ts`:
```ts
import { Worker } from 'bullmq';
import { generateImage } from '@/server/ai/imageGen';
import { putR2 } from '@/server/storage/r2';
import { db } from '@/server/db/client';
import { generation, asset } from '@/server/db/schema';
import { eq } from 'drizzle-orm';

new Worker('image-gen', async (job) => {
  const { generationId, prompt, format, provider, model, n, projectId } = job.data;
  await db.update(generation).set({ status: 'running' }).where(eq(generation.id, generationId));
  try {
    const { buffers, costCents } = await generateImage({ prompt, format, provider, model, n });
    for (const [i, buf] of buffers.entries()) {
      const key = `${projectId}/${generationId}/${i}.png`;
      const url = await putR2(key, buf, 'image/png');
      await db.insert(asset).values({
        generationId, projectId, kind: 'image', format,
        width: IMAGE_FORMATS[format].w, height: IMAGE_FORMATS[format].h,
        storageKey: key, publicUrl: url, bytes: buf.length,
      });
    }
    await db.update(generation).set({ status: 'done', finishedAt: new Date(), costCents: String(costCents) }).where(eq(generation.id, generationId));
  } catch (e: any) {
    await db.update(generation).set({ status: 'failed', errorMessage: e.message, finishedAt: new Date() }).where(eq(generation.id, generationId));
  }
}, { connection });
```

Run the worker: add a `pnpm worker` script that runs a separate process (`tsx src/server/jobs/worker-runner.ts`). In prod it runs as another container.

### 8. Server Actions

`src/server/actions/images.ts`:
- `enqueueImageGeneration({ projectId, idea, format, provider, model, n, lang })` — creates a row in `generation` with status queued, adds job to the queue, returns `generationId`
- `listGenerations(projectId)` and `listAssets(projectId)`

### 9. UI — Generator (editorial)

`/app/projects/[slug]/generate/image`:

- Form (editorial style — fields with bottom border, no card wrapper):
  - Textarea placeholder "What do you want to generate?" (idea, multiline, max 600 chars)
  - Select Format (from the catalog) — custom shadcn override, no rounded corners
  - Select Provider/Model (group by provider)
  - Radio: 1, 2, 4 variants
  - `<BtnInk>` "Generate piece"

- On submit:
  - Server Action enqueue
  - Immediately show a "Generating…" card with editorial skeleton (a single dot pulsing, NOT shadcn skeleton blurred) and poll every 2s on `/api/generations/[id]/status`
  - When `status=done`, show images in a 2x2 grid with editorial captions (Fraunces piece title + mono px)

`/app/projects/[slug]/library` — grid of all assets (style: like a magazine archive — pieces with hard 1px border, captions below in Fraunces). Filters by format/type, "Download" button (signed URL R2) and "Copy public URL".

### 10. Status endpoint

`src/app/api/generations/[id]/status/route.ts` — GET that returns `{ status, assets: [...] }`. Verify the user owns the project.

## Acceptance criteria

- [ ] I can enqueue a generation with OpenAI and it shows as "queued" immediately
- [ ] The worker processes it and it shows as "done" with images in R2
- [ ] The library shows assets with thumbnails
- [ ] I can switch provider to fal.ai (FLUX.2 pro) and it works the same
- [ ] If it fails (invalid API key, etc), status=failed with readable `errorMessage`
- [ ] The project's brand kit is applied to the prompt automatically
- [ ] Approximate cost is recorded in the generation

## Verification

1. One generation with OpenAI → check the recorded cost vs. real pricing
2. One generation with fal.ai (FLUX.2) → same
3. Stop/kill the worker container, queue a job, restart it → job processes when back

## Expected output

Report §0.8 + next phase: **05-COPY-GENERATION.md**
