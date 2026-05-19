# Reel quality fixes — diagnóstico (pase 2)

> Diagnóstico y plan después del primer render del demo Gerardo (May 12).
> El prompt copy-paste para Claude Code Max vive aparte: **`planning/REEL-FIX-PASE-2-PROMPT.md`**.

---

## Problemas confirmados con causa exacta

### P0-1 · Texto gibberish dentro de las imágenes
**Síntoma:** "NNST INGBIL", "Autoradel defisoing, hine of dhitnidser Baeid apg", "Automnated Editorial Layout system rats itving" — el modelo de imagen intenta renderizar palabras y sale jeringa.

**Causa:** `src/server/ai/visualStyles.ts` describe los estilos así:
```
editorial: "Subject: large serif display typography (Fraunces-style) animating
            in line by line, italic accents, thin horizontal rules drawing
            themselves, oversized display numbers counting up."
```
El planner copia esto al `imagePrompt`. El modelo de imagen (Flux/Recraft/gpt-image-1) trata de DIBUJAR tipografía y números — y falla en el 90% de los casos porque los modelos de imagen son malísimos en texto largo.

**Fix:** reescribir TODOS los estilos en `visualStyles.ts` para que describan **composición visual SIN texto**. Las palabras se renderizan después con `drawtext` (FFmpeg) o como overlay box.

**Regla de oro:** la imagen es solo el fondo y los elementos visuales abstractos. TODO el texto sale por overlay, deterministicamente.

### P0-2 · Composición caótica con elementos sobrepuestos
**Síntoma:** screen 1 tiene iPhones + tipografía + folder + flechas en el mismo frame, todos sobrepuestos sin jerarquía.

**Causa:** los prompts piden 4-6 elementos visuales en una sola escena ("paper background AND typography AND rules AND numbers AND accent AND iconography"). El modelo dump-loads todo al frame.

**Fix:** cada estilo en `visualStyles.ts` debe describir UN solo subject visual + el fondo. Máximo 2 elementos. Más simple = se ve mejor.

### P0-3 · Voz con acento inglés en video español
**Síntoma:** la TTS lee el script español pero suena gringo.

**Causa:** `src/server/jobs/videoWorker.ts` línea ~277 usa `model: 'tts-1'` con `voice: 'nova'`. `tts-1` es modelo de nov 2023, English-trained, español superficial.

**Fix:** cambiar a `gpt-4o-mini-tts` (lanzado 2025, multilingüe nativo) con `voice: 'sage'` + parámetro `instructions` para guiar el tono editorial.

### P0-4 · Voz sin vida, sin tono profesional pero buena onda
**Síntoma:** monótona, robótica, sin pausas naturales.

**Causa:** misma — `tts-1` no soporta prompting de tono ni ajuste de expresividad.

**Fix:** junto con P0-3.

### P1-5 · Solo zoompan, sin animación real
**Síntoma:** el video se siente como "fotos con efecto Ken Burns" — porque eso es exactamente lo que es.

**Causa:** `src/server/video/compose.ts` solo aplica `zoompan` + `drawtext` + `xfade`. No hay texto palabra por palabra, no hay reglas dibujándose, no hay color blocks moviéndose, no hay número counting up.

**Fix lite (P1):** mantener zoompan pero hacer el `drawtext` overlay aparecer palabra por palabra con `enable='between(t,start,end)'`. Da sensación de animación sin reescribir compose.ts.

**Fix full (P2, 1-2 días):** rediseñar compose.ts con pipelines de motion graphics por visualStyle.

**Fix premium (alternativa):** mover demo Gerardo a Veo 3.1 Standard (4 escenas × $3.20 = $12.80). Verdaderamente animado. Solo para flagship demos.

---

## Plan recomendado (en este orden)

| # | Fix | Esfuerzo | Impacto |
|---|-----|----------|---------|
| 1 | P0-1 + P0-2: reescribir `visualStyles.ts` | 30 min | 🔥 Inmediato |
| 2 | P0-3 + P0-4: cambiar TTS a `gpt-4o-mini-tts` + voz `sage` + instructions | 30 min | 🔥 Inmediato |
| 3 | P1-5 lite: drawtext animado palabra por palabra | 2 h | Notable |
| 4 | Re-render demo Gerardo en FFmpeg con 1+2+3 aplicados | 2 min | Validación |
| 5 | (Opcional) Re-render Gerardo en Veo Standard si FFmpeg sigue mediocre | 8 min, $12.80 | 🔥 Premium |
| 6 | P1-5 full: pipelines de motion por style (Phase 09) | 1-2 días | v1.1 producto |

**Mi recomendación:**
- Aplicar 1, 2 hoy via CCM (usar `REEL-FIX-PASE-2-PROMPT.md`)
- Re-render (#4) — evaluar
- Si sigue mediocre → opción premium (#5) **solo para Gerardo**
- Marcar #6 como Phase 09 — feature de v1.1

---

## Para Gerardo: opciones honestas

1. **Esperar.** Aplicar fixes 1+2+3, re-render, evaluar. Probablemente queda lo suficientemente bueno. ~3 horas + 18¢.
2. **Premium.** Aplicar fix 1+2, después renderizar SOLO el demo Gerardo en Veo Standard ($12.80). La feature general sigue en FFmpeg.
3. **Pivote táctico.** Mientras se aplican los fixes, mandarle a Gerardo una **screen recording de la app misma** (Loom 30s) con tu voz real explicando + meta-frase al final. Más auténtico, más rápido, no depende del fix.

Mi voto: **opción 3 ahora + opción 1 en paralelo**. La autenticidad de tu voz y manos navegando vence a un demo AI mediocre.

---

## Cómo aplicar los fixes

1. Abre `planning/REEL-FIX-PASE-2-PROMPT.md`
2. Pégalo entero en una sesión nueva de Claude Code Max
3. Adjunta `planning/prompts/00-CONTEXT.md`
4. Dile *"proceed"*
5. Cuando termine, re-render del reel y vuelves
