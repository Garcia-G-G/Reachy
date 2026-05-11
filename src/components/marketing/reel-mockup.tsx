/**
 * Animated Reel preview for the landing "workshop" mockup.
 *
 * Pure CSS animation (no JS, no Motion library): three story-style frames
 * advance on a 12s loop with a top progress bar — matches the editorial
 * Cover/Carousel imagery beside it but actually moves so visitors register
 * "this generates Reels too", not just static cards.
 */
export function ReelMockup() {
  return (
    <div className="reel-mockup" aria-hidden="true">
      {/* Story-style progress segments along the top of the phone screen */}
      <div className="reel-mockup__bars">
        <span className="reel-mockup__bar reel-mockup__bar--1">
          <i />
        </span>
        <span className="reel-mockup__bar reel-mockup__bar--2">
          <i />
        </span>
        <span className="reel-mockup__bar reel-mockup__bar--3">
          <i />
        </span>
      </div>

      {/* Tiny top chrome — edition tag + LIVE dot */}
      <div className="reel-mockup__chrome">
        <span>№ 12 · Reel</span>
        <span className="reel-mockup__live">
          <i /> 0:30
        </span>
      </div>

      {/* Stage with three frames cross-fading on the loop */}
      <div className="reel-mockup__stage">
        <div className="reel-mockup__frame reel-mockup__frame--1">
          <div className="reel-mockup__kicker">— hook</div>
          <div className="reel-mockup__h">
            30 <em>seconds,</em>
          </div>
          <div className="reel-mockup__h">12 metrics.</div>
          <div className="reel-mockup__sub">A weekly pulse for your SaaS.</div>
        </div>

        <div className="reel-mockup__frame reel-mockup__frame--2">
          <div className="reel-mockup__kicker">— growth</div>
          <div className="reel-mockup__bigstat">
            <span>+38%</span>
            <i />
            <span>$4.2K</span>
          </div>
          <div className="reel-mockup__sub">MRR · last 30 days.</div>
          {/* Mini animated line chart — stroke draws on each loop */}
          <svg
            className="reel-mockup__chart"
            viewBox="0 0 240 80"
            preserveAspectRatio="none"
            role="presentation"
            focusable="false"
          >
            <title></title>
            <path
              d="M2 64 L34 56 L62 60 L92 44 L122 48 L150 30 L180 36 L210 18 L238 22"
              fill="none"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        <div className="reel-mockup__frame reel-mockup__frame--3">
          <div className="reel-mockup__kicker">— sign-off</div>
          <div className="reel-mockup__h reel-mockup__h--small">
            <em>Reachy</em>
          </div>
          <div className="reel-mockup__sub">Edition № 12 · May launch</div>
          <div className="reel-mockup__cta">Subscribe →</div>
        </div>
      </div>

      {/* Subtle scanline / grain overlay to sell the "screen" feel */}
      <div className="reel-mockup__grain" />
    </div>
  );
}
