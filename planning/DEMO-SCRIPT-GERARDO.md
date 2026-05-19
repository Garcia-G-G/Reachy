# Demo reel para Gerardo

> Script meta-marketing: presenta Reachy a Gerardo, en algún punto revela que el video mismo lo hizo Reachy, y cierra dirigiéndose a él por nombre. Pensado para el modo "I write the script" del generador (cuando esté listo).

## Configuración recomendada en la app

| Campo | Valor |
|-------|-------|
| Template (Shape) | **Explainer · 25s — Hook / Insight / Insight / Takeaway** |
| Mode | **I write the script** |
| Visual style (en Identity) | **Editorial motion** o **Paper cutout** (mi recomendación: Editorial — coincide con la marca y nadie en SaaS está haciendo eso) |
| Engine | **FFmpeg** (multi-escena con TTS por línea) — Veo Fast no aguanta 25s en una sola pasada |
| Language | **Spanish** |

---

## Script — Versión Spanish (default)

> Pega cada línea en su scene textarea correspondiente. El planner solo genera el `imagePrompt`; el texto sale exacto.

### Scene 1 · HOOK · 5s · `top`
```
Marketing real para apps reales.
```
**Voz (más larga, para TTS si el modo lo permite):**
> "Mira lo que hace esta app — genera marketing real para apps reales."

### Scene 2 · INSIGHT · 7s · `bottom`
```
Subes tu marca; Reachy hace el resto.
```
**Voz (TTS):**
> "Subes el nombre de tu app, los colores y tu tono. Reachy escribe el copy, dibuja las imágenes y compone el video — todo coherente, en español e inglés."

### Scene 3 · INSIGHT · 7s · `bottom` ← *el twist*
```
Este video lo armó la app misma.
```
**Voz (TTS):**
> "De hecho, este video que estás viendo ahorita no lo grabó nadie. Lo escribió, lo narró y lo compuso la misma app — de principio a fin."

### Scene 4 · TAKEAWAY · 6s · `center` · `brand` background
```
¿Cazaste el truco, Gerardo? Esto es Reachy.
```
**Voz (TTS):**
> "¿Cazaste el truco, Gerardo? Esto es Reachy."

---

## Script — Versión English (por si la quieres bilingüe)

### Scene 1 · HOOK · 5s · `top`
```
Real marketing for real apps.
```

### Scene 2 · INSIGHT · 7s · `bottom`
```
Drop your brand; Reachy does the rest.
```

### Scene 3 · INSIGHT · 7s · `bottom`
```
This video? Made by the app itself.
```

### Scene 4 · TAKEAWAY · 6s · `center` · `brand` background
```
Caught it, Gerardo? This is Reachy.
```

---

## Qué debe hacer el planner con cada `imagePrompt` (Editorial style activo)

Con `visualStyle = 'editorial'`, los imagePrompts deberían describir composiciones tipo:

- **Scene 1:** "Editorial print spread in motion. Large Fraunces serif phrase 'REAL MARKETING' draws on with italic 'real apps' in burnt sienna. Thin horizontal rules drawing themselves above and below. Warm paper background. NO people, NO photographs."
- **Scene 2:** "Animated editorial layout. A column of mono uppercase labels (NAME / COLORS / TONE) on the left, growing line-drawing icons on the right (a tiny circle for color, a small page for tone). Burnt sienna accent on one detail. Warm paper. NO people."
- **Scene 3:** "Single oversized italic display word 'self-made' in Instrument Serif italic, slowly fading in centered on warm paper. A thin double rule below. Mono caption '— composed by Reachy' bottom-left. NO people, NO UI."
- **Scene 4:** "Solid burnt sienna background (#b6481a). Centered Fraunces wordmark 'Reachy' weight 500 fades in. A small mono line '— editorial · 04 · 05 · 2026' below it. Cream text. NO people, NO ornament."

Si los imagePrompts del planner se ven distintos, edítalos manualmente en el plan editor antes de "Render reel".

---

## Costo estimado (FFmpeg path, 4 imágenes + TTS + composición)

- 4 imágenes Flux/Recraft: ~16¢
- 4 líneas TTS (OpenAI nova): ~2¢
- FFmpeg compose + R2 upload: ~0¢ (es solo CPU local/contenedor)
- **Total: ~18-20¢ por iteración**

Veo Fast 8s no aplica para este script (necesita 25s).

---

## Después de generar

1. Descarga el MP4
2. Publícalo donde llegue Gerardo (DM directo, post en LinkedIn, video por WhatsApp)
3. Si Gerardo pregunta "¿en serio lo hizo la app?", mándale el link al repo o a la beta de Reachy
4. Si le gusta, considera hacer una **versión con SU app** sustituyendo "esta app" por el nombre que Gerardo esté lanzando — bonus de meta-marketing personalizado

---

## Si quieres iterar el script

Cosas que puedes ajustar antes de render:
- **Cambiar el nombre** "Gerardo" → cualquier prospect
- **Cambiar el twist** del scene 3 — versiones alternativas:
  - "Sí, este video también lo armó la app."
  - "Nada de esto lo hizo un humano. Solo el script."
  - "Si te lo crees, ya entendiste la magia."
- **Agregar urgencia** en el cierre (scene 4):
  - "¿Cazaste el truco, Gerardo? Esto es Reachy. Beta abierta."
  - "Reachy. La beta cierra el viernes, Gerardo."
