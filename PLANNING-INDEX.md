# Reachy — Index de planeación

Todo el material de planeación, prompts y auditoría vive dentro de la carpeta **`planning/`**. Esto reemplaza la antigua carpeta `~/Documents/MarKetOL/` (ya borrada).

## Estructura

```
reachy/
├── planning/                          ← TODO el material de planeación
│   ├── AUDIT-PHASES-1-3.md           ← 🔥 LÉEME PRIMERO — auditoría del código actual
│   ├── PROJECT_MEMORY.md             ← memoria del proyecto (decisiones, stack, hallazgos)
│   ├── LAUNCH.md                     ← cómo arrancar Claude Code Max para cada fase
│   ├── SESSION_LOG.md                ← bitácora de sesiones de CCM
│   ├── design-editorial.html         ← referencia visual obligada (la landing definitiva)
│   ├── design-options.html           ← histórico (5 propuestas iniciales descartadas)
│   └── prompts/
│       ├── README.md                 ← instrucciones de cómo usar los prompts
│       ├── 00-CONTEXT.md             ← contexto maestro (paste en cada sesión de CCM)
│       ├── 01-SCAFFOLD.md            ← ✅ ejecutado
│       ├── 02-DATABASE-AUTH.md       ← ✅ ejecutado
│       ├── 03-PROJECTS-BRAND-KITS.md ← ✅ ejecutado
│       ├── 04-IMAGE-GENERATION.md    ← siguiente
│       ├── 05-COPY-GENERATION.md
│       ├── 06-VIDEO-FFMPEG.md
│       ├── 07-LANDING.md
│       └── 08-DEPLOY-HETZNER.md
│
├── src/                               ← código de la app (Next.js, Drizzle, etc.)
├── messages/                          ← i18n dictionaries
├── docker/                            ← postgres + redis para dev
└── docs/                              ← copia de design-editorial.html para CCM
```

## Estado actual

- **Fases ejecutadas:** 01, 02, 03 ✅
- **Auditoría:** completada — ver `planning/AUDIT-PHASES-1-3.md`
- **Antes de Fase 04:** aplicar los P0 del audit (~2.5h)
- **Siguiente:** Fase 04 — Image Generation (OpenAI + fal.ai + R2 + BullMQ)

## Cómo arrancar la próxima sesión

1. Abre `planning/AUDIT-PHASES-1-3.md` y revisa el bloque "🚨 P0".
2. Sigue el "Prompt sugerido para Claude Code Max" del final del audit.
3. Cuando los P0 estén arreglados y `pnpm build` pase, sigue con `planning/LAUNCH.md` para Fase 04.
