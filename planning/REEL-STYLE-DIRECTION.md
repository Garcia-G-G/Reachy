# Dirección de estilo para reels

> Compañero del archivo visual: `planning/reel-style-references.html` (ábrelo en el navegador para ver los 6 estilos en simulación).

## El problema

El reel que generaste hoy ("From scattered feedback to smarter product decisions") salió como **fotografía de stock con persona estresada y post-its**. Está bien hecho, pero NO es la dirección que queremos para Reachy: queremos algo más **informativo, animado, sin personas reales**, manteniendo la misma calidad visual.

## La causa exacta en el código

`src/server/ai/reelPlanner.ts` línea 71-73 le dice a Veo:

```ts
'  • Estilo editorial moderno: paleta cálida, luz natural, profundidad de campo media.',
'  • Encuadre medio o cuerpo entero, NUNCA primer plano de cara cortada por arriba o abajo.',
```

Veo interpreta eso como "rodaje fotográfico realista". Por eso te genera personas. **No es un bug — es el prompt el que lo pide.**

## Las 6 direcciones propuestas

Ver el HTML para detalle visual. Resumen:

| № | Estilo | Mejor para | Referencias |
|---|--------|------------|-------------|
| 01 | Flat 2D Explainer | onboarding, features, tono amigable | Duolingo, Mailchimp |
| 02 | Animated Infographic | stats, case studies, B2B credibility | The Pudding, NYT |
| 03 | Isometric Mini | producto técnico, workflows | Notion, Linear, Stripe |
| 04 | Editorial Motion | thought leadership, launches | NYT, The Pudding, Aperture |
| 05 | Abstract Shapes | brand reveal, teaser, ambient | Apple, Stripe, Vercel |
| 06 | Paper Cutout | storytelling, feel-good emocional | Headway, Fable |

**Mi recomendación si quieres Reachy mismo:** № 04 (Editorial) + № 06 (Paper Cutout) como mezcla. Coincide 1:1 con tu paleta paper/ink/sienna y nadie en SaaS está haciendo esa mezcla.

**Mi recomendación si quieres máximo alcance en redes:** № 01 (Flat 2D) + № 02 (Infographic). Lo que mejor performa orgánico para SaaS B2B en TikTok/Reels.

## El cambio de código que vendrá (preview)

Cuando me confirmes uno o dos estilos, esto es lo que cambiaría en `reelPlanner.ts`:

### 1. Reemplazar las 3 líneas de "image prompts" en `buildSystemPrompt`

**Antes:**
```ts
'  • Estilo editorial moderno: paleta cálida, luz natural, profundidad de campo media.',
'  • Encuadre medio o cuerpo entero, NUNCA primer plano de cara cortada por arriba o abajo.',
'  • Sin marca de agua, sin texto, sin logos, sin caracteres legibles en pantallas.',
```

**Después (ejemplo para mezcla 04+06 = "Editorial + Paper Cutout"):**
```ts
'  • ESTILO: animated motion graphics, NO real people, NO stock photography.',
'  • Subject: paper-cutout shapes (hard-edge geometric forms with subtle drop shadow), animated typography in serif display font, simple iconography, abstract data visualization (bars/lines/numbers).',
'  • Paleta: warm off-white paper (#f1ebdf), deep ink (#14110d), burnt sienna accent (#b6481a). Editorial print aesthetic.',
'  • Camera: static or very slow push-in. NO handheld, NO dolly, NO swooping.',
'  • Composition: keep top 20% and bottom 25% clean for caption box.',
'  • Sin marca de agua, sin texto generado por el modelo, sin logos.',
```

### 2. Agregar campo `visualStyle` al brand kit (Phase 03)

Para que cada proyecto pueda tener su propio estilo:

```ts
// src/server/db/schema/brandKits.ts
visualStyle: text('visual_style', {
  enum: ['flat-2d', 'infographic', 'isometric', 'editorial', 'abstract', 'paper-cutout', 'mixed']
}).default('editorial'),
```

Y en el planner, leer `brandKit.visualStyle` para inyectar las instrucciones correspondientes (catálogo de prompt fragments por estilo).

### 3. Catálogo de fragmentos por estilo

Nuevo archivo `src/server/ai/visualStyles.ts`:

```ts
export const VISUAL_STYLES = {
  'flat-2d': {
    label: 'Flat 2D Explainer',
    prompt: 'Flat 2D animated illustration, bold geometric characters with thick outlines, saturated solid colors (no gradients), Lottie/Rive aesthetic, friendly and approachable. Subjects are illustrated cartoon characters or icons, NEVER real people.',
  },
  'infographic': {
    label: 'Animated Infographic',
    prompt: 'Animated data visualization, large display numbers counting up, bars growing from baseline, lines drawing themselves, minimalist icons appearing with spring physics. Background: clean off-white or single brand color. NO people, NO product shots.',
  },
  'isometric': {
    label: 'Isometric Mini',
    prompt: 'Isometric 3D illustration with small cute characters, floating UI cards and dashboards, light pastel gradients, technical-but-warm aesthetic. Style of Notion/Linear/Stripe marketing illustrations.',
  },
  'editorial': {
    label: 'Editorial Motion',
    prompt: 'Editorial print magazine aesthetic in motion. Large serif display typography (Fraunces-style) animating in, italic accents, thin horizontal rules drawing themselves, large numbers in display font. Paper background (#f1ebdf), ink text (#14110d), burnt sienna accent (#b6481a). NO photographic content.',
  },
  'abstract': {
    label: 'Abstract Shapes',
    prompt: 'Premium abstract motion graphics. Large soft color blobs morphing slowly, smooth gradient transitions, minimal centered typography. Apple/Stripe/Vercel premium feel. NO objects, NO people, NO UI — pure form and color.',
  },
  'paper-cutout': {
    label: 'Paper Cutout',
    prompt: 'Paper cutout collage style. Hard-edge geometric paper shapes layered with subtle drop shadows, warm cream background, hand-cut feel. Style of Headway summaries and Fable. Subjects are abstracted shapes representing concepts, NOT realistic illustrations.',
  },
} as const;
```

### 4. UI del generador (Fase 06)

Agregar un selector en `src/components/app/generate-reel-form.tsx`:

```tsx
<label className="mono-eyebrow">Visual style</label>
<select className="field" value={visualStyle} onChange={e => setVisualStyle(e.target.value)}>
  <option value="editorial">Editorial motion (default for Reachy)</option>
  <option value="paper-cutout">Paper cutout (Headway-style)</option>
  <option value="flat-2d">Flat 2D explainer (Duolingo-style)</option>
  <option value="infographic">Animated infographic (data-driven)</option>
  <option value="isometric">Isometric mini (Notion-style)</option>
  <option value="abstract">Abstract shapes (Apple-style)</option>
</select>
```

## Lo que necesito de ti

**Dime un número (o dos para mezclar) y aplico el cambio:**

- **01** Flat 2D Explainer
- **02** Animated Infographic
- **03** Isometric Mini
- **04** Editorial Motion ← *recomiendo para Reachy mismo*
- **05** Abstract Shapes
- **06** Paper Cutout ← *recomiendo combinar con 04*

Si me dices "04+06", el default del brand kit será editorial pero podrás escoger paper-cutout por reel. Si me dices solo "04", todos salen editorial. Si me dices "no me gusta ninguno, quiero algo distinto" — me das una referencia (link, screenshot) y armo un séptimo.

## Sources

- [Veo 3 prompt guide — DeepMind](https://deepmind.google/models/veo/prompt-guide/)
- [Veo 3 prompt examples — Powtoon](https://www.powtoon.com/blog/veo-3-video-prompt-examples/)
- [Animation trends 2026 — Hatch Studios](https://hatchstudios.com/top-video-and-animation-trends-to-know-in-2026/)
- [Rive — interactive animation engine](https://rive.app/) (Duolingo's animation tool)
- [Best AI explainer videos 2026 — DigitalOcean](https://www.digitalocean.com/resources/articles/ai-animation-video-generator)
