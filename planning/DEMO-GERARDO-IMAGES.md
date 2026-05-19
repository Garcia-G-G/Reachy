# Demo Gerardo — versión imágenes

> Pa' usar después de que CCM ejecute `IMAGE-MARKETING-GRADE-PROMPT.md`.
> Misma meta-pitch que la versión reel, pero como **campaña de 4 piezas** que Reachy genera para Gerardo.

## Setup en la app

| Campo | Valor |
|-------|-------|
| Project | Reachy |
| Modo | Campaign (1 brief → 4 assets coherentes) |
| Brief | "Pitch a Gerardo — twist: estas piezas las hizo Reachy mismo" |
| Visual style | abstract |
| Quality | high (`gpt-image-1` $0.19 × 4 = ~$0.76) |
| Variants per asset | 2 (para escoger) |

## Las 4 piezas y su layout

| # | Formato | Layout | Función |
|---|---------|--------|---------|
| 1 | **OG (1200×630)** | hero-split-left | Hook — share-friendly |
| 2 | **IG post (1080×1350)** | hero-centered | El twist principal |
| 3 | **Square (1080×1080)** | quote-slab | La frase memorable para captura |
| 4 | **Email header (1200×400)** | announcement-banner | Para meterlo en un email |

## Slots por pieza (copy-paste estos al "edit copy")

### Pieza 1 · OG · hero-split-left
```
eyebrow:    REACHY · DEMO PARA GERARDO
headline:   Marketing real para apps reales.
subheadline: Subes tu marca; Reachy escribe, dibuja y compone todo lo demás.
cta:        VER LA APP →
wordmark:   Reachy
```

### Pieza 2 · IG post · hero-centered
```
eyebrow:    № 03 · EL TRUCO
headline:   Esta pieza la hizo Reachy.
subheadline: La escribió, le dio identidad, la compuso. Ningún humano tocó el render.
cta:        ¿CAZASTE EL TRUCO, GERARDO?
wordmark:   Reachy
```

### Pieza 3 · Square · quote-slab (la más fuerte para mandarle directo)
```
headline:   "El marketing de tu app no debería tomarte un viernes entero."
wordmark:   — Reachy
```

### Pieza 4 · Email header · announcement-banner
```
eyebrow:    PARA GERARDO · MAYO 2026
headline:   Mira lo que esta app hace por la tuya.
subheadline: Hablamos pronto.
```

## Cómo lo mandas

Genera la campaña → escoge la mejor variante de cada pieza → mándale a Gerardo:

1. **Email** con la Pieza 4 como header + un párrafo corto:
   > "Hola Gerardo — estoy construyendo una app que genera el marketing completo de apps SaaS indie. Te adjunto un par de piezas que Reachy mismo armó como demo para ti. Si te resuena, hablamos."
2. **Adjuntar** las 4 piezas (o link al folder R2).
3. **Cierre** con la Pieza 3 (la quote square) como visual fuerte.

El twist meta queda en la pieza 2 + 3, no en una sola pieza forzada.

## Costo total

- Campaign de 4 piezas × 2 variants × $0.19 (high) = **~$1.52**
- Planner LLM × 4 = **~$0.01**
- Sharp compose = $0
- **Total: ~$1.53**

## Iteración después del primer render

Si una pieza no convence: click "Edit copy" en esa thumbnail → tweakea el slot que no funcione → "Re-render overlay" (instantáneo, $0). 

Si el FONDO no convence en una pieza: "↻ regenerate" en esa thumbnail → nuevo background con el mismo layout (cuesta $0.19).

## Backup plan

Si la campaña queda mediocre: quédate con la Pieza 3 (quote-slab). Una sola imagen cuadrada con la quote + wordmark, mandada por DM, es suficiente. El truco meta ya está en el copy mismo.
