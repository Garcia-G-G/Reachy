/**
 * Animated Cover preview for the landing "workshop" mockup.
 *
 * 16:9 editorial cover that prints in the aspect-[4/5] slot — content is
 * vertically centered so the framing never crops. CSS-only loop:
 *   1. Eyebrow + headline mask in
 *   2. Chart stroke draws in
 *   3. Three KPI tiles "tick" up from a hidden state
 *   4. Quiet hold, then loop
 */
export function CoverMockup() {
  return (
    <div className="cover-mockup" aria-hidden="true">
      <div className="cover-mockup__chrome">
        <span>№ 12 · Cover</span>
        <span>1920 × 1080</span>
      </div>

      <div className="cover-mockup__body">
        <div className="cover-mockup__eyebrow">— SaaS Tracker</div>

        <h3 className="cover-mockup__h">
          Track <em>every</em>
          <br />
          metric.
        </h3>

        <svg
          className="cover-mockup__chart"
          viewBox="0 0 360 90"
          preserveAspectRatio="none"
          role="presentation"
          focusable="false"
        >
          <title></title>
          {/* Baseline rule */}
          <line x1="0" y1="86" x2="360" y2="86" strokeWidth="1" className="cover-mockup__axis" />
          {/* Animated line */}
          <path
            className="cover-mockup__line"
            d="M4 72 L40 66 L72 70 L108 56 L142 60 L178 44 L214 50 L250 32 L286 38 L322 22 L356 26"
            fill="none"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>

        <div className="cover-mockup__tiles">
          <Tile label="MRR" prefix="$" target="4.2K" delay={0} />
          <Tile label="Subs" target="1,205" delay={180} />
          <Tile label="Churn" target="1.48%" delay={360} />
        </div>
      </div>

      <div className="cover-mockup__grain" />
    </div>
  );
}

function Tile({
  label,
  prefix,
  target,
  delay,
}: {
  label: string;
  prefix?: string;
  target: string;
  delay: number;
}) {
  return (
    <div className="cover-mockup__tile" style={{ animationDelay: `${delay}ms` }}>
      <div className="cover-mockup__tile-num">
        {prefix ? <span className="cover-mockup__tile-pref">{prefix}</span> : null}
        {target}
      </div>
      <div className="cover-mockup__tile-label">{label}</div>
    </div>
  );
}
