# Image gen — marketing-grade rebuild

> Adjunta `planning/prompts/00-CONTEXT.md`. Aplica §0.10. Stop fixing reels — esto es image gen.

## Contexto (5 líneas)

AI hace fondo + texto = se ve AI. Marketing-grade tools separan: AI = fondo, código determinístico = tipografía con brand kit. Eso vamos a hacer. Stack ya tiene sharp 0.34 + brandKit + visualStyles. NO HAY fonts en `public/fonts/`.

## Tareas (en orden)

### 1. Brand fonts en server
- Crear `public/fonts/`
- Bajar de Google Fonts: `Fraunces-Variable.ttf`, `Inter-Variable.ttf`, `InstrumentSerif-Italic.ttf`, `JetBrainsMono-Variable.ttf`
- Subset a Latin (pyftsubset opcional si pesa >300kb cada uno)
- Crear `src/server/typography/fonts.ts` que exporta `fontPath(role: 'display'|'italic'|'body'|'mono')`

### 2. Layouts
Crear `src/server/ai/layoutTemplates.ts`. 4 layouts mínimo:
- `hero-centered` (eyebrow + headline + cta, todo center)
- `hero-split-left` (headline left 50%, fondo right 50%)
- `quote-slab` (headline italic enorme, center, sobre color block)
- `announcement-banner` (eyebrow + headline + sub, todo left-aligned)

Cada layout exporta:
```ts
{ slots: ['eyebrow','headline','cta',...], negativeSpaceHint: string, blocks: TextBlock[] }
```
Donde `TextBlock = { role, x, y, widthFrac, sizeFrac, color, align, weight?, italic?, textSource }` con coordenadas normalizadas 0-1.

Mapping default por formato (`hero` → `hero-centered`, `og` → `hero-split-left`, `square` → `quote-slab`, `email-header` → `announcement-banner`, etc.).

### 3. AI = solo fondo
Refactor `src/server/ai/promptBuilder.ts`:
- Quitar instrucciones de typography
- Inyectar `layout.negativeSpaceHint` en el prompt
- Reforzar "NO text, NO words, NO numbers"

### 4. Compositing layer
Crear `src/server/ai/composeImage.ts`:
- Input: `{background: Buffer, width, height, layout: Layout, copy: PlannedCopy, colors}`
- Build SVG overlay con `<text>` por cada block del layout, usando font path real con `@font-face` base64 embed
- `sharp(background).resize(w,h).composite([{input: Buffer.from(svg)}]).png().toBuffer()`
- Return final Buffer

### 5. Copy planner estructurado
Crear `src/server/ai/copyPlanner.ts`:
- Input: idea + brandKit + layout
- LLM call (gpt-4o o gpt-5) con structured output JSON schema
- Output: `PlannedCopy = { eyebrow?, headline?, subheadline?, cta?, wordmark? }`
- Solo llena los slots que el layout pide

### 6. Wire en `imageGen.ts`
- Cambiar `quality: 'medium'` → `quality: 'high'` para OpenAI
- Aceptar `quality` opcional en `GenerateImageInput`
- Después de obtener buffer del AI: llamar `composeImage` con la layout + copy planeada
- Retornar el resultado compuesto

### 7. UI: regenerate single + edit copy
En `src/components/app/generate-image-form.tsx`:
- Botón "↻" por thumbnail → regenera SOLO ese variant
- Botón "Edit copy" → modal con los slots editables del layout
- Botón "Re-render overlay" en el modal → llama Server Action que solo recompone (sin AI), retorna nuevo PNG en <1s
- Cobrar $0 por re-render overlay (no API call)

## Files target

| Crear | Editar |
|-------|--------|
| `public/fonts/*.ttf` (4) | `src/server/ai/promptBuilder.ts` |
| `src/server/typography/fonts.ts` | `src/server/ai/imageGen.ts` |
| `src/server/ai/layoutTemplates.ts` | `src/components/app/generate-image-form.tsx` |
| `src/server/ai/composeImage.ts` | `src/server/actions/images.ts` (action para re-render) |
| `src/server/ai/copyPlanner.ts` | |

## Verify

```
pnpm typecheck && pnpm lint && pnpm build
```
Generar 1 asset cada layout. Inspeccionar:
- Colors EXACT al brand kit hex (color picker)
- Fonts son los TTF (no fallback)
- Texto crisp, kerned
- Edit copy → re-render overlay <1s sin cobrar

## Done

Cuando funcione: pega 4 R2 URLs (uno por layout) + costo por asset + un caso del re-render-overlay loop. Reporta breve. Listo.
