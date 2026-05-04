# Reachy — Cómo lanzar con Claude Code Max

> Tu copy-paste guide para empezar a construir. Sigue el orden, no te saltes pasos.

## Antes del primer prompt

1. **Crea una carpeta vacía** para el repo. Ejemplo: `~/code/reachy/` (no dentro de `MarKetOL/`).
2. Inicia git: `cd ~/code/reachy && git init`.
3. Abre Claude Code Max en esa carpeta (`claude` desde la terminal, o como acostumbres).
4. Verifica que tienes:
   - Node 22 LTS (`node -v`)
   - pnpm 9+ (`pnpm -v`)
   - Docker Desktop corriendo
5. Ten a mano tus API keys (no las pegues en el prompt — solo las pondremos en `.env.local` después):
   - `OPENAI_API_KEY`
   - `FAL_KEY`
   - `RESEND_API_KEY`
   - Google OAuth Client ID + Secret (créalos en Google Cloud Console)

## Sesión 1 — Fase 01 (Scaffold)

> Los prompts están **en inglés** (Claude Code Max trabaja mejor así). El producto resultante sigue siendo bilingüe ES/EN.

En Claude Code Max, pega **esto exacto**:

```
You're going to build Phase 01 of the "Reachy" project.

I'll give you two context files. The first is 00-CONTEXT.md (the project's permanent source of truth). The second is 01-SCAFFOLD.md (the current phase). Read both fully before doing anything.

Critical rules (also in 00):
1. BEFORE writing code, use WebSearch to verify current versions (May 2026) of every package you'll install. Don't assume APIs.
2. After every significant change, run pnpm build / pnpm typecheck.
3. When done, give me the §0.8-style report from 00-CONTEXT.

Confirm you understood before proceeding. Then I'll paste the contents of both files.
```

Cuando responda, pégale **el contenido completo** de los dos archivos (uno tras otro):
- `MarKetOL/prompts/00-CONTEXT.md`
- `MarKetOL/prompts/01-SCAFFOLD.md`

Después dile: **"Proceed. Research the current versions with WebSearch first."**

## Qué esperar de la Fase 01

Claude Code Max debería:
1. Investigar Next.js 15, Tailwind v4, shadcn, Drizzle, Biome (mayo 2026)
2. Reportar brevemente qué encontró diferente de lo que dice el prompt
3. Crear el repo con `create-next-app`
4. Configurar Tailwind v4 con los tokens editoriales
5. Instalar shadcn y refactorizar para que pierda el look default
6. Crear estructura de carpetas, `src/env.ts`, docker-compose
7. Página de bienvenida que se ve estilo editorial (paper, Fraunces, ink)
8. Reportar con: archivos creados, build OK, smoke test, decisiones tomadas

**Tiempo estimado:** 30-60 min de Claude Code Max trabajando.

## Si algo sale mal o tienes dudas

Vuelve aquí (a Cowork) y cuéntame:
- "Salió este error: [pega el error]"
- "Claude Code Max preguntó X, ¿qué le digo?"
- "El resultado no se parece a `design-editorial.html`, ¿qué le pido que ajuste?"

Yo te ayudo a darle el siguiente prompt o a refinar el actual.

## Cuando Fase 01 esté lista

Vuelve y dime: **"Fase 01 completa, sigue 02"**.

Yo te entrego:
- El siguiente bloque copy-paste (00-CONTEXT + 02-DATABASE-AUTH)
- Las API keys que necesitas tener listas para Fase 02
- Cualquier ajuste al 00 si algo cambió en Fase 01

## Orden completo de fases (con la directiva §0.10 de calidad y profundidad)

> **Importante:** los prompts ahora incluyen una directiva explícita (§0.10 del 00-CONTEXT) que le exige a Claude Code Max **tomarse el tiempo necesario** — investigar a fondo, planear, construir, verificar, refactorizar y releer. **Si entrega en 5 minutos algo está mal.** Estos tiempos son los esperados con calidad real:

| Fase | Archivo | Tiempo aprox. CCM |
|------|---------|-------------------|
| 01 | SCAFFOLD | 1-2 h |
| 02 | DATABASE-AUTH | 1.5-3 h |
| 03 | PROJECTS-BRAND-KITS | 2-3 h |
| 04 | IMAGE-GENERATION | 2-3 h |
| 05 | COPY-GENERATION | 1.5-2.5 h |
| 06 | VIDEO-FFMPEG | 3-5 h (FFmpeg complexFilter es delicado) |
| 07 | LANDING | 2-3 h |
| 08 | DEPLOY-HETZNER | 2-4 h (más si es tu primera vez en Hetzner) |

**Total estimado:** ~16-25 horas de trabajo de Claude Code Max distribuido en 8 sesiones.

**No hagas más de 1 fase por sesión** de Claude Code Max — el contexto se llena rápido si quieres calidad real. Mejor sesiones limpias por fase. Si una fase se va a más de 4 horas o el contexto se acerca al límite, pídele que pare y haga un commit intermedio.

**Si CCM intenta entregar muy rápido**, le respondes: *"Re-read §0.10 of 00-CONTEXT.md. Did you actually verify with pnpm build, exercise the feature in a browser, and re-read every file you wrote? If not, do it now and report back."*

## Tips finales

- **Cada nueva sesión de Claude Code Max debe empezar pegando el 00-CONTEXT.md.** Es la memoria del proyecto.
- Si Claude Code Max sugiere cambiar el stack o agregar una librería que no está en el 00, pregúntame antes de aceptar.
- Si algo en el código se ve "AI-generated default" (gradientes blob, glass cards, soft shadows, dark mode azul-violeta) — refactoriza con las reglas del 00 §0.6.
- Commit pequeños después de cada bloque funcional. Así el rollback es trivial si algo se rompe.

---

**¿Listo? Empieza con Fase 01. Yo aquí cuando vuelvas.**
