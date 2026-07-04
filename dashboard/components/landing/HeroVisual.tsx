/** Self-contained SVG illustration: a vault "leashed" to an agent - the product's own
 * metaphor, not a stock graphic. The three small dots on the tether use the exact same
 * status colors (success/neutral/warning) as the dashboard's live feed badges, so the
 * illustration and the product share one visual language. */
export function HeroVisual() {
  return (
    <div className="relative flex items-center justify-center">
      <div className="absolute h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
      <svg viewBox="0 0 440 380" className="relative h-auto w-full max-w-md" fill="none">
        {/* the leash, tethering vault to agent */}
        <path
          d="M 150 210 C 220 150 260 270 330 210"
          stroke="currentColor"
          className="animate-leash-flow text-primary/50"
          strokeWidth="3"
          strokeDasharray="9 9"
          strokeLinecap="round"
        />

        {/* status dots riding the leash - same colors as the live feed */}
        <circle cx="190" cy="182" r="6" className="fill-success animate-float-slow" />
        <circle cx="240" cy="238" r="6" className="fill-neutral animate-float-slower" />
        <circle cx="292" cy="192" r="6" className="fill-warning animate-float-slow" />

        {/* vault */}
        <g>
          <circle cx="120" cy="210" r="30" className="animate-pulse-ring fill-primary/15" />
          <rect x="70" y="180" width="100" height="90" rx="20" className="fill-surface stroke-primary/40" strokeWidth="2" />
          <path
            d="M95 180 v-18 a25 25 0 0 1 50 0 v18"
            className="stroke-primary/70"
            strokeWidth="7"
            strokeLinecap="round"
          />
          <rect x="105" y="212" width="30" height="24" rx="6" className="fill-primary" />
          <circle cx="120" cy="224" r="3.5" className="fill-surface" />
        </g>

        {/* agent */}
        <g>
          <circle cx="345" cy="210" r="40" className="animate-pulse-ring fill-primary/10" />
          <circle cx="345" cy="210" r="30" className="fill-surface stroke-primary/40" strokeWidth="2" />
          <rect x="325" y="196" width="40" height="28" rx="8" className="fill-primary/80" />
          <circle cx="336" cy="210" r="4" className="fill-surface" />
          <circle cx="354" cy="210" r="4" className="fill-surface" />
          <rect x="341" y="168" width="8" height="16" rx="4" className="fill-primary/60" />
        </g>
      </svg>
    </div>
  );
}
