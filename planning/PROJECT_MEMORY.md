# Reachy — Memoria del Proyecto

> Este archivo es la fuente de verdad sobre el proyecto. Actualizar después de cada sesión importante.

## 1. Reglas permanentes (instrucciones del usuario)

1. **Investigación profunda obligatoria.** Antes de responder cualquier pregunta técnica, investigar deep en la web con fuentes oficiales y actualizadas (priorizar docs oficiales, GitHub repos activos, posts del año en curso).
2. **Prompts para Claude Code Max de máxima calidad.** Cualquier prompt que se escriba para Claude Code Max debe:
   - Incluir contexto completo (objetivo, stack, restricciones, criterios de aceptación)
   - **Recordarle explícitamente a Claude Code Max que investigue en la web** antes de implementar (docs oficiales actualizadas, no asumir versiones viejas)
   - Tener pasos de verificación al final (tests, build, smoke tests)
   - Estar en formato copy-paste, sin placeholders ambiguos
3. **Iteración por fases.** Nunca intentar implementar todo de golpe. MVP → v1 → v2.
4. **Idioma de la UI: bilingüe ES/EN.** Idioma de comunicación con Garcia: **español**.

## 2. Owner

- **Garcia** (gilbergarciata@gmail.com)

## 3. Objetivo del producto

Una **web app self-hosted** que genera material de marketing para apps web/SaaS:
- Layers (capas/mockups), imágenes descriptivas, hero images
- Copy para redes sociales, landing pages, email
- Reels/Shorts (video corto 9:16) compuestos con FFmpeg + imágenes generadas
- Multi-proyecto: cada app tiene su brand kit (logo, colores, tono, audiencia)
- Bilingüe ES/EN

## 4. Stack acordado

| Capa | Decisión |
|------|----------|
| Framework | **Next.js 15 (App Router) + TypeScript + Tailwind CSS** |
| UI components | shadcn/ui |
| DB | PostgreSQL (Hetzner) + Drizzle ORM |
| Auth | better-auth (self-hosted, sin vendor lock-in) |
| Queue / jobs | BullMQ + Redis (para generación async de imágenes/videos) |
| Storage de assets | Cloudflare R2 (S3-compatible, sin egress fees) |
| Imágenes — OpenAI | gpt-image-1, DALL-E 3 (vía OPENAI_API_KEY) |
| Imágenes/Video — fal.ai | Flux, Veo, Kling, etc. (vía FAL_KEY) |
| Composición de video | FFmpeg (fluent-ffmpeg en Node) para reels/shorts |
| Texto/copy | GPT-4.1 / GPT-5 (lo más actual disponible) |
| Deploy | **Local primero**, después Hetzner CX22/CPX21 con Coolify o Dokploy + Cloudflare (DNS, Tunnel/Proxy, R2) |
| CI | GitHub Actions |

## 5. Cuentas y secretos disponibles del usuario

- ✅ OpenAI API key
- ✅ fal.ai API key
- ✅ Hetzner (servidores)
- ✅ Cloudflare (DNS, R2, Tunnels)
- ✅ Claude Code Max (ejecutor del código)

## 6. Dirección de diseño — **Editorial / Magazine impreso**

Ver `design-editorial.html` (versión final iterada).

**Concepto.** Cada campaña es una "edición". Cada proyecto es una "cabecera". Cada asset es una "pieza". El producto se siente como el taller de un editor, no como un dashboard SaaS.

**Tokens visuales.**
- `--paper: #f1ebdf` (warm off-white, tipo newsprint)
- `--paper-2: #e8e0cf` (spreads / fondos secundarios)
- `--ink: #14110d` (casi-negro cálido, nunca puro)
- `--ink-2: #4a4338`, `--ink-3: #8b8170`
- `--rule: #c9bfa9` (líneas finas)
- `--accent: #b6481a` (burnt sienna — usado con cuentagotas)

**Tipografía.**
- Display: **Fraunces** variable (opsz 144, weights 400-600) — para H1/H2/grandes
- Italic display: **Instrument Serif Italic** — para énfasis y cursivas reales
- Body: **Inter** 400/500 — solo para párrafos y UI
- Mono: **JetBrains Mono** — eyebrows, metadata, captions técnicos (uppercase, tracking .14em)

**Reglas.**
- Light mode SIEMPRE (sin dark mode salvo que se pida explícito)
- Sin gradientes blob ni glass cards
- Sombras duras estilo print (`box-shadow: 14px 14px 0 var(--ink)`) — no shadows blureadas
- Líneas horizontales finas (1px) divididoras
- Densidad editorial: padding 56-96px en secciones, no aire infinito
- Mucha tipografía display grande (clamp 56-128px en hero)
- Cursiva real (Instrument Serif Italic), no `<em>` con misma fuente
- Border-radius: 0 en casi todo (las revistas no tienen esquinas redondeadas)

**Componentes shadcn.** Usaremos shadcn/ui pero **fuertemente customizados** para que pierdan el look "tailwind default":
- Inputs sin border-radius, con border bottom 1px solo
- Buttons rectangulares con uppercase tracking grande
- Cards con border 1px y hard shadow (no soft shadow)
- Dropdowns con tipografía Fraunces

**Referencias que tomé.** Awwwards SOTM "Renaissance Edition" (imaginería editorial generativa), Pitch (tipografía art-directed), revistas tipo The Drift / Aperture / The New Yorker, McMaster-Carr (densidad informacional sin diseño obvio).

## 7. Hallazgos de investigación (mayo 2026)

### OpenAI Images
- Modelo recomendado: **`gpt-image-1`** (también disponible `gpt-image-1-mini` y `gpt-image-1.5`)
- 2 endpoints: `/v1/images/generations` (desde cero) y `/v1/images/edits` (modifica una imagen base)
- Pricing por imagen square: low ~$0.02, medium ~$0.07, high ~$0.19
- Parámetro `n` para batch, `output_compression` (0-100) para jpeg/webp, `partial_images` para streaming (+100 image tokens c/u)

### fal.ai
- 1000+ modelos vía SDK único, pay-per-use sin compromisos
- Imagen top 2026: **Nano Banana 2**, **FLUX.2 [pro]**, **Seedream V4.5**, **Recraft V3** ($0.04 raster / $0.08 vector)
- Video top 2026: **Veo 3.1 Fast** ($0.10/s 720p, $0.30/s 4K), **Sora 2 Pro** ($0.30/s 720p, $0.50/s 1080p), **Kling 2.5 Turbo Pro** ($0.07/s), **Hailuo 2.3 Standard** ($0.28/video 6s)

### Hetzner + deploy
- **Hetzner CX22** (€3.99/mes) suficiente para start. Ubuntu 22.04 mínimo.
- **Dokploy** preferible a Coolify para producción (más directo, mejor UX, Docker Swarm multi-server). Coolify sigue siendo válido si quieres más features visuales.
- Setup ~30 min: install vía curl, conectar GitHub, auto-SSL Let's Encrypt, backups DB integrados.
- ⚠️ Variables `NEXT_PUBLIC_*` se embeben en build, definirlas antes del primer deploy.

### FFmpeg para reels
- Librería: `fluent-ffmpeg` en Node (la API del repo oficial sigue siendo el estándar)
- Workflow: imágenes → frames con framerate → `complexFilter` con `overlay` y `drawtext` → output `libx264` + `yuv420p` (Instagram/TikTok requieren yuv420p)
- Vertical 9:16: usar 1080x1920 (Reels/Shorts/TikTok recomiendan esa resolución)
- Escapar comillas y caracteres especiales en `drawtext`

## 8. Estado actual

- [x] Sesión 0: Discovery y decisiones de stack
- [x] Sesión 1: Investigación profunda + 5 mockups + dirección elegida
- [ ] Sesión 2: Build de prompts .md por fase (en progreso)
- [ ] Sesión 3: Garcia ejecuta Fase 1 con Claude Code Max
- [ ] Sesión N: feedback y siguientes fases

## 9. Cambios de decisiones (changelog)

- 2026-05-04: Proyecto iniciado. Decisiones iniciales tomadas.
- 2026-05-04: Dirección de diseño inicial = Linear refined.
- 2026-05-04: Cambio de dirección a **Editorial / Magazine** (Garcia rechaza el look "AI-generated" genérico). Vocabulario UI editorial (cabecera/edición/pieza). Tokens y reglas estrictas en design-editorial.html.
- 2026-05-04: Nombre confirmado = **Reachy**. Reemplazado en todos los prompts.
