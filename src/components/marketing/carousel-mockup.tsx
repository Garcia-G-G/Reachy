/**
 * Animated Carousel preview for the landing "workshop" mockup.
 *
 * Four slides (Instagram-style) cycling horizontally on a 16s loop. Top
 * indicator dots highlight the active slide. CSS-only — the strip is a
 * grid of width 400% that translates via keyframes.
 */

interface Slide {
  kicker: string;
  body: React.ReactNode;
  foot?: string;
}

const SLIDES: readonly Slide[] = [
  {
    kicker: '01 — intro',
    body: (
      <>
        <div className="carousel-mockup__h">
          The numbers <em>tell</em>
          <br />
          the story.
        </div>
        <div className="carousel-mockup__sub">SaaS Tracker — May edition.</div>
      </>
    ),
    foot: '@reachy.app',
  },
  {
    kicker: '02 — growth',
    body: (
      <>
        <div className="carousel-mockup__bigstat">
          +38<small>%</small>
        </div>
        <div className="carousel-mockup__sub">MRR · last 30 days.</div>
        <svg
          className="carousel-mockup__chart"
          viewBox="0 0 280 90"
          preserveAspectRatio="none"
          role="presentation"
          focusable="false"
        >
          <title></title>
          <path
            d="M2 76 L34 64 L62 68 L92 50 L122 56 L150 38 L180 44 L210 26 L238 32 L276 14"
            fill="none"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </>
    ),
    foot: 'Swipe →',
  },
  {
    kicker: '03 — pulse',
    body: (
      <>
        <div className="carousel-mockup__rows">
          <Row label="MRR" value="$4.2K" tone="up" />
          <Row label="Subs" value="1,205" tone="up" />
          <Row label="Churn" value="1.48%" tone="down" />
          <Row label="LTV" value="$582" tone="up" />
        </div>
      </>
    ),
    foot: 'Swipe →',
  },
  {
    kicker: '04 — sign-off',
    body: (
      <>
        <div className="carousel-mockup__h carousel-mockup__h--small">
          Get the <em>weekly</em>
          <br />
          pulse.
        </div>
        <div className="carousel-mockup__sub">Edition № 12 · May launch.</div>
        <div className="carousel-mockup__cta">Subscribe →</div>
      </>
    ),
    foot: 'reachy.app',
  },
];

export function CarouselMockup() {
  return (
    <div className="carousel-mockup" aria-hidden="true">
      <div className="carousel-mockup__chrome">
        <span>№ 12 · Carousel</span>
        <span>1080 × 1350</span>
      </div>

      <div className="carousel-mockup__dots">
        {SLIDES.map((s, i) => (
          <span key={s.kicker} className={`carousel-mockup__dot carousel-mockup__dot--${i + 1}`} />
        ))}
      </div>

      <div className="carousel-mockup__viewport">
        <div className="carousel-mockup__track">
          {SLIDES.map((s) => (
            <article key={s.kicker} className="carousel-mockup__slide">
              <div className="carousel-mockup__kicker">{s.kicker}</div>
              <div className="carousel-mockup__content">{s.body}</div>
              {s.foot ? <div className="carousel-mockup__foot">{s.foot}</div> : null}
            </article>
          ))}
        </div>
      </div>

      <div className="carousel-mockup__grain" />
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone: 'up' | 'down' }) {
  return (
    <div className="carousel-mockup__row">
      <span className="carousel-mockup__row-label">{label}</span>
      <span className={`carousel-mockup__row-value carousel-mockup__row-value--${tone}`}>
        {value}
      </span>
    </div>
  );
}
