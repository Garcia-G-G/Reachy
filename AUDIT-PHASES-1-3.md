# Reachy — Auditoría fases 1–3
**Fecha:** 2026-05-06
**Alcance:** todo lo que existe en `~/Documents/reachy/` después de Fases 01 (Scaffold), 02 (DB+Auth) y 03 (Headers+Identity).

---

## Veredicto general

**Calidad alta.** Claude Code Max sí siguió la directiva §0.10 — el código tiene índices DB, validación Zod cuidadosa, manejo de errores tipados, rate limiting en magic link, AbortController en autosave, y los componentes editoriales respetan la guía visual. **Por encima de lo que pedí.**

**Pero hay 7 cosas que arreglar antes de la Fase 04.** Las más importantes son del bloque i18n: la infraestructura está montada (next-intl plugin + diccionario `en.json` + provider en layout) pero la landing y el masthead **hardcodean español** en vez de usar `t()`, y `messages/es.json` no existe. La app está funcional, pero el toggle ES/EN no funciona y el diseño bilingüe que prometimos no se cumple.

---

## ✅ Lo que está EXCELENTE (mantener tal cual)

**Schemas Drizzle (`src/server/db/schema/`)**
- Índices bien pensados: `project_user_id_idx`, `project_user_slug_uniq` (compuesto sobre `userId+slug` — protege duplicados por usuario sin bloquear el mismo slug entre usuarios), `session_userId_idx`, `verification_expires_at_idx`. Esto NO estaba en mi prompt, CCM lo agregó por su cuenta.
- `relations()` definidas para todos los modelos (projects → user, brandKit, generations, assets).
- Tipos exportados (`BrandVoice`, `BrandLanguage`).
- `$onUpdate(() => new Date())` para timestamps automáticos.
- `archivedAt` (timestamp nullable) para soft-delete en vez de boolean.

**Auth (`src/server/auth.ts`)**
- `import 'server-only'` (previene leaks al cliente).
- **Rate limiting** en `/sign-in/magic-link`: 5 envíos / 60s. CCM lo agregó por su cuenta — protege contra abuso del email de Resend.
- Conditional Google provider (solo si las creds están).
- Magic link expira en 15 min.
- `isGoogleEnabled` exportado para que la UI sepa si ofrecer ese botón.

**Server Actions (`src/server/actions/projects.ts`, `brandKits.ts`)**
- Tipo `ActionResult<T>` discriminated union (matches §0.4 rule 3).
- Helper `emptyToNull` para normalizar strings vacíos.
- Manejo del error code Postgres `23505` (unique violation) → retorna `'slug-taken'` legible.
- Todas las queries filtran por `session.user.id` ✓ (security correcta — verifiqué).
- `upsertBrandKit` verifica ownership del project antes de escribir.
- Update parcial: solo aplica los campos que vienen definidos.
- `revalidatePath('/app', 'layout')` para invalidar cache de layout completo.

**`src/server/getSession.ts`**
- `cache()` de React envolviendo getSession (memoiza por request — evita N llamadas a la DB).
- `requireSession()` helper que auto-redirige a `/login`.

**Identity form (`src/components/app/identity-form.tsx`)**
- AbortController para cancelar saves en vuelo si el usuario sigue tipeando.
- Save state machine (`idle` / `saving` / `saved` / `error`) con timestamp del último save.
- Toast en error (sonner).
- Color picker + hex text input sincronizados.
- Sticky `<BrandPreview>` en el sidebar derecho (lg:sticky).
- a11y: `htmlFor`, `aria-label`, `accent-ink` en checkboxes.

**globals.css**
- Todos los `--radius-*` forzados a 0.
- `.btn-ink`, `.btn-ghost`, `.field`, `.card-paper`, `.card-hard`, `.shadow-print`, `.rule-thin`, `.rule-double` — utility classes editoriales.
- shadcn token aliases mapeados a la paleta editorial (mantiene shadcn funcionando con el tema).
- `*:focus-visible { outline: 2px solid var(--ink) }` global.
- `::selection` styled.

**`next.config.ts`**
- Security headers: X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy, Permissions-Policy. CCM lo agregó por su cuenta.
- `poweredByHeader: false`.
- `reactStrictMode: true`.
- `next-intl` plugin envuelto correctamente.

---

## 🚨 P0 — Arreglar ANTES de la Fase 04

### 1. **i18n incompleto / roto** (4 problemas relacionados)

a. **`messages/es.json` no existe.** Solo hay `en.json`. Reachy es ES-primary y la landing está en español, pero no hay diccionario español.

b. **`src/i18n/request.ts` declara `SUPPORTED_LOCALES = ['en']`.** Spanish ni siquiera está registrado. Aunque exista `es.json`, no se cargaría.

c. **La landing (`src/app/page.tsx`) hardcodea español** en vez de usar `useTranslations`. El masthead también (`Producto`, `Suscripción`, `Acceder →` están en defaults). Resultado: cualquier intento de cambiar idioma no hace nada en la landing.

d. **Falta `src/middleware.ts` con `next-intl` middleware** para detectar idioma y rutear `/en` vs `/es`.

**Fix:** crear `messages/es.json`, agregar `'es'` a `SUPPORTED_LOCALES`, refactorizar `page.tsx` y `Masthead.tsx` para usar `useTranslations`, y crear el middleware.

### 2. **Botón principal apunta a `/signup` que NO existe.**

`src/app/page.tsx` línea 72: `<BtnInkLink href="/signup">Empezar la primera edición</BtnInkLink>` → 404.

**Fix:** apuntar a `/login` (donde el magic link funciona como signup también, gracias a `disableSignUp: false` que ya está configurado).

### 3. **Typo en EN translation: usa "cabecera" en español.**

`messages/en.json` → `"AppShell": { "noHeaders": "No headers yet — create your first cabecera." }` ← debería ser "header".

**Fix:** cambiar a `"... create your first header."`

### 4. **Carpetas `(app)/` y `(marketing)/` vacías y dead code.**

Tienen solo `.gitkeep` (`src/app/(app)/projects/.gitkeep`, etc.). Las páginas reales están en `src/app/app/...` y `src/app/page.tsx`. Los route groups vacíos no rompen nada, pero confunden la mental model.

**Fix (elegir una):**
- (a) Eliminar las carpetas `(app)/` y `(marketing)/` con sus `.gitkeep`. Más limpio.
- (b) Mover los archivos reales DENTRO de los route groups (mejor para Phase 07 cuando metamos más rutas marketing). Esta es la convención Next.js correcta y la que pidió el prompt 07.

Recomiendo **(b)** porque cuando hagamos la landing pública con `/en` y `/es` y agreguemos `/precios`, `/blog`, etc., el route group `(marketing)` los mantiene separados visualmente del `(app)` autenticado.

---

## 🟡 P1 — Mejoras de calidad / práctica

### 5. **Inline `style={{...}}` en lugar de utility classes**

`src/app/page.tsx` tiene varios `style={{ fontSize: 'clamp(56px, 9vw, 128px)', letterSpacing: '-0.035em', ... }}` para el H1 y la lede. Mismo patrón en otras páginas. Funciona, pero:
- No se reusa entre páginas (cuando hagamos Fase 07, vas a copiar/pegar)
- Tailwind no puede purgar estos valores
- Inconsistente con el resto del codebase que usa Tailwind

**Fix:** crear utility classes en `globals.css` (`@layer components`):
```css
.h1-display  { font-size: clamp(56px, 9vw, 128px); letter-spacing: -0.035em; line-height: 0.95; max-width: 14ch; margin-inline: auto; }
.h1-section  { font-size: clamp(40px, 5vw, 64px); line-height: 1.0; }
.lede-large  { font-family: var(--font-fraunces); font-weight: 300; font-size: 21px; line-height: 1.45; max-width: 44ch; font-variation-settings: 'opsz' 36; }
.lede-medium { font-family: var(--font-fraunces); font-weight: 300; font-size: 19px; line-height: 1.45; max-width: 40ch; }
```
Y usar `<h1 className="display h1-display">`. Mismo resultado, reutilizable.

### 6. **`Masthead` defaults hardcodea ES en vez de usar i18n**

`src/components/editorial/Masthead.tsx` líneas 11-15: `defaultLinks` tiene labels en ES hardcodeados. Si la prop `links` no se pasa, sale Spanish siempre.

**Fix:** que el componente NO tenga defaults — que reciba siempre los props del consumer, que a su vez usa `useTranslations('Masthead')`. O que adentro use `useTranslations('Masthead')` directamente con keys `navProduct`, `navPricing`, `navLogin` (que YA existen en `messages/en.json`).

### 7. **`identity-form.tsx`: el ref de save se actualiza fuera de useEffect**

```ts
saveRef.current = save;
```
Esa línea se ejecuta en cada render. Funciona, pero técnicamente debería estar en un `useEffect` o `useCallback`:
```ts
useEffect(() => { saveRef.current = save; });
```

### 8. **Falta onboarding del usuario nuevo**

El prompt 07 §9 pide un wizard de 3 pasos en `/app/welcome`. **No está implementado.** No es urgente — es trabajo de Fase 07. Solo anótalo para que no se olvide.

### 9. **Confirmar que `src/app/app/page.tsx` no duplica el fetch de proyectos**

El layout (`src/app/app/layout.tsx`) ya hace `listProjectsForCurrentUser`. Si `page.tsx` también lo lee, se duplica el query. Verificar que use el `cache()` de `getSession` y la prop del layout, no su propio query.

---

## 🟢 P2 — Polish (cuando haya tiempo)

### 10. **Eliminar `suppressHydrationWarning` en `<html>`** si no hay dark mode.

`src/app/layout.tsx` línea 54. Esa prop solo es útil con `next-themes` haciendo light/dark switch. Como decidimos light-only, no se necesita y oculta otros warnings legítimos.

### 11. **Considerar mover los console.log a un logger estructurado**

Los console.log en `migrate.ts` y `sendMagicLinkEmail.ts` son legítimos (logging de migration y dev fallback de magic link). No son debug stale. Pero a futuro, un logger estructurado (pino, consola) ayuda en producción.

### 12. **Audit completo de strings ES leakeadas en archivos EN**

El typo "cabecera" en `noHeaders` sugiere que pueden haber más. Sugerencia: `grep -rni 'cabecera\|edición\|pieza' messages/en.json` antes del próximo build.

### 13. **El BrandPreview no se inserta en la landing aún**

No es queja — es trabajo de Fase 04 cuando empecemos a generar imágenes de verdad y queremos enseñar el preview en la landing como social proof.

### 14. **Falta favicon.ico custom**

El default de Next está. Cuando termines Fase 07 con la landing pulida, actualízalo con un cuadrado `#14110d` con la "R" en Fraunces.

---

## 🎯 Plan de acción recomendado (en este orden)

```
1. P0 #1: Crear messages/es.json + agregar 'es' a SUPPORTED_LOCALES + middleware  → 30 min
2. P0 #1c: Refactorizar src/app/page.tsx para usar useTranslations               → 30 min
3. P0 #1c: Refactorizar src/components/editorial/Masthead.tsx                    → 15 min
4. P0 #2: Cambiar /signup → /login en el botón de la landing                     → 1 min
5. P0 #3: Fix typo "cabecera" → "header" en messages/en.json                     → 1 min
6. P0 #4: Mover páginas dentro de (app)/ y (marketing)/ route groups             → 30 min
7. P1 #5: Mover inline styles a utility classes                                  → 30 min
8. P1 #6, #7, #9: Pequeños fixes                                                 → 30 min
```

**Total estimado: ~2.5 horas** antes de empezar Fase 04.

---

## Prompt sugerido para Claude Code Max

Cuando estés listo para los fixes, pega esto en una sesión nueva:

```
Apply the audit fixes from AUDIT-PHASES-1-3.md (at the repo root).

Read 00-CONTEXT.md §0.10 — quality directive applies. Take your time, verify after each P0 fix with pnpm build, pnpm typecheck, and a manual smoke test (start dev, click through the landing, switch language, sign in, visit /app).

Order:
1. P0 items (1, 2, 3, 4) — bilingual i18n, broken /signup link, typo, route groups
2. P1 items (5, 6, 7, 9) — quality
3. Skip P2 for now

Report each fix as you go. Stop and ask if a fix breaks something. After all P0 are done, run `pnpm build` and confirm zero errors before declaring complete.
```

---

## Conclusión honesta

**El código que CCM produjo en Fases 1-3 es objetivamente sólido** — al nivel de un mid-senior dev con buen criterio. Las ganancias inesperadas (índices DB, rate limit, security headers, AbortController en autosave, sidebar layout con Suspense) muestran que la directiva §0.10 funciona.

**Los gaps que encontré son los típicos del último 10%:** i18n declarado pero no aplicado en la landing, link roto a /signup, route groups con dead code. Son arreglos de 30 min cada uno.

Si arreglamos los P0 antes de Fase 04, llegamos al MVP con una base que aguanta producción real.
