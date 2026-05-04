import { BtnInkLink, Masthead, MonoEyebrow } from '@/components/editorial';

const cabeceras = [
  { n: '01', t: 'SaaS Tracker', active: true },
  { n: '02', t: 'HabitForge', active: false },
  { n: '03', t: 'NoteSync', active: false },
];

const piecesInEdition = ['Portada', 'Carrusel', 'Hilo', 'Reel', 'Email'];

const pieces = [
  {
    title: 'Portada',
    sub: 'Hero · landing',
    px: '1920×1080',
    gradient: 'linear-gradient(135deg, #d8cfbb, var(--accent))',
  },
  {
    title: 'Carrusel',
    sub: 'Instagram',
    px: '1080×1350',
    gradient: 'linear-gradient(150deg, #c8c2b1, var(--ink))',
  },
  {
    title: 'Reel',
    sub: '30 segundos',
    px: '1080×1920',
    gradient: 'linear-gradient(160deg, #1f3a2f, var(--accent))',
  },
];

export default function HomePage() {
  return (
    <>
      <Masthead />

      {/* ────── COVER ────── */}
      <section className="mx-auto max-w-[1200px] px-6 pt-20 pb-24 text-center md:px-10 md:pt-[140px] md:pb-[160px]">
        <div className="mb-14 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-3">
          № 01<span className="mx-[6px] text-accent">—</span>Edición de bienvenida
        </div>

        <h1
          className="display mx-auto"
          style={{
            fontSize: 'clamp(56px, 9vw, 128px)',
            letterSpacing: '-0.035em',
            lineHeight: 0.95,
            maxWidth: '14ch',
          }}
        >
          Tu app merece más que un post a las <em className="it text-accent">3 a.m.</em>
        </h1>

        <p
          className="mx-auto mt-14 text-ink-2"
          style={{
            fontFamily: 'var(--font-fraunces), Georgia, serif',
            fontWeight: 300,
            fontSize: 21,
            lineHeight: 1.45,
            maxWidth: '44ch',
            fontVariationSettings: "'opsz' 36",
          }}
        >
          Reachy convierte cada lanzamiento en una <span className="it">pequeña edición</span> —
          imágenes, copy y reels con la coherencia de una revista bien editada. Multi-proyecto, en
          español e inglés, con tu marca.
        </p>

        <div className="mt-16 inline-flex flex-col items-center gap-[18px]">
          <BtnInkLink href="/signup">Empezar la primera edición</BtnInkLink>
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3">
            Beta abierta · sin tarjeta · desde $0/mes
          </span>
        </div>
      </section>

      {/* ────── INDEX ────── */}
      <section className="border-y border-ink">
        <div className="mx-auto grid max-w-[1200px] grid-cols-1 items-start gap-6 px-6 py-14 md:grid-cols-[200px_1fr] md:gap-14 md:px-10">
          <MonoEyebrow as="div" className="border-t border-ink pt-3">
            — Lo que produce
            <br />
            cada edición
          </MonoEyebrow>

          <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
            <article className="border-t border-ink pt-3">
              <div className="mb-[14px] font-mono text-[10px] uppercase tracking-[0.14em] text-accent">
                № 01 — Imágenes
              </div>
              <h3 className="display mb-[10px] text-[28px] font-medium leading-[1.05]">
                Hero, OG, posts, <span className="it">covers.</span>
              </h3>
              <p className="max-w-[28ch] text-[14px] leading-[1.55] text-ink-2">
                Generadas con OpenAI gpt-image-1 y fal.ai (FLUX, Recraft). Cada formato en el tamaño
                que necesitas.
              </p>
            </article>

            <article className="border-t border-ink pt-3">
              <div className="mb-[14px] font-mono text-[10px] uppercase tracking-[0.14em] text-accent">
                № 02 — Copy
              </div>
              <h3 className="display mb-[10px] text-[28px] font-medium leading-[1.05]">
                Tweets, hilos, <span className="it">captions.</span>
              </h3>
              <p className="max-w-[28ch] text-[14px] leading-[1.55] text-ink-2">
                Cada pieza en español e inglés, lado a lado, con el tono de tu brand kit. Sin
                clichés genéricos.
              </p>
            </article>

            <article className="border-t border-ink pt-3">
              <div className="mb-[14px] font-mono text-[10px] uppercase tracking-[0.14em] text-accent">
                № 03 — Reels
              </div>
              <h3 className="display mb-[10px] text-[28px] font-medium leading-[1.05]">
                Verticales 9:16, <span className="it">listos.</span>
              </h3>
              <p className="max-w-[28ch] text-[14px] leading-[1.55] text-ink-2">
                Compuestos con FFmpeg desde tus imágenes y textos, o generados con Veo 3.1 cuando la
                ocasión lo merece.
              </p>
            </article>
          </div>
        </div>
      </section>

      {/* ────── SPREAD — el taller ────── */}
      <section className="bg-paper-2">
        <div className="mx-auto max-w-[1200px] px-6 pt-20 pb-24 md:px-10 md:pt-24 md:pb-28">
          <div className="mb-14 flex flex-col items-baseline justify-between gap-2 border-b border-rule pb-[18px] md:flex-row">
            <h2 className="display text-[32px] leading-none md:text-[44px]">
              El <span className="it">taller</span>.
            </h2>
            <MonoEyebrow>— pliego 02</MonoEyebrow>
          </div>

          <div className="card-paper card-hard">
            {/* editor bar */}
            <div className="flex flex-wrap items-center gap-[14px] border-b border-ink px-[18px] py-3 font-mono text-[10px] uppercase tracking-[0.14em]">
              <span className="text-accent">№ 12</span>
              <span>SaaS Tracker — Lanzamiento Mayo</span>
              <span className="ml-auto text-ink-3">12 piezas · 2 en cola</span>
            </div>

            <div className="grid min-h-[460px] grid-cols-1 md:grid-cols-[220px_1fr]">
              {/* sidebar */}
              <aside className="hidden border-r border-ink p-[22px_20px] md:block">
                <div className="mono-eyebrow mb-3 text-[9px]!">— Cabeceras</div>
                {cabeceras.map((c) => (
                  <div
                    key={c.n}
                    className="flex items-baseline gap-[10px] border-b border-dotted border-rule py-[7px] last:border-b-0"
                  >
                    <span
                      className={`display w-[26px] text-[18px] ${
                        c.active ? 'text-accent font-medium' : 'text-ink-3'
                      }`}
                    >
                      {c.n}
                    </span>
                    <span
                      className={`display text-[15px] leading-[1.15] ${
                        c.active ? 'text-accent font-medium' : ''
                      }`}
                    >
                      {c.t}
                    </span>
                  </div>
                ))}

                <div className="mono-eyebrow mt-7 mb-3 text-[9px]!">— Esta edición</div>
                {piecesInEdition.map((p) => (
                  <div
                    key={p}
                    className="display py-[6px] text-[15px] text-ink-2 transition-colors hover:text-accent"
                  >
                    › {p}
                  </div>
                ))}
              </aside>

              {/* canvas */}
              <div className="p-7">
                <div className="mb-[22px] flex items-baseline justify-between border-b border-ink pb-3">
                  <h4 className="display text-[22px] font-medium tracking-tight">Edición № 12</h4>
                  <MonoEyebrow>04 · 05 · 2026</MonoEyebrow>
                </div>

                <div className="grid grid-cols-1 gap-[18px] md:grid-cols-[1.3fr_1fr_1fr]">
                  {pieces.map((p) => (
                    <article key={p.title} className="flex flex-col border border-ink">
                      <div
                        className="aspect-[4/5]"
                        style={{ background: p.gradient }}
                        aria-hidden="true"
                      />
                      <div className="flex items-baseline justify-between border-t border-ink px-[14px] py-3">
                        <div className="display text-[14px] font-medium">
                          {p.title}
                          <small className="mt-[2px] block text-[10px] font-normal not-italic tracking-[0.03em] text-ink-3">
                            {p.sub}
                          </small>
                        </div>
                        <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-ink-3">
                          {p.px}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ────── COLOPHON ────── */}
      <footer className="border-t border-ink px-6 py-9 md:px-10">
        <div className="mx-auto flex max-w-[1200px] flex-col items-center justify-between gap-4 text-center font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3 md:flex-row md:gap-6 md:text-left">
          <span>© Reachy 2026</span>
          <span>Hecho con Inter, Fraunces, Instrument Serif</span>
          <span>
            <a href="mailto:hello@reachy.app" className="transition-colors hover:text-accent">
              Contacto
            </a>{' '}
            ·{' '}
            <a href="/docs" className="transition-colors hover:text-accent">
              Self-hosting
            </a>
          </span>
        </div>
      </footer>
    </>
  );
}
