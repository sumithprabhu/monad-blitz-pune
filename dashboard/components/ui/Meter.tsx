import { cn } from "@/lib/cn";

/** Spend-cap meter: fill hue steps accent -> warning -> danger as the ratio climbs; the
 * unfilled track is a lighter step of the same hue so severity reads across the whole bar. */
export function Meter({ ratio, className }: { ratio: number; className?: string }) {
  const pct = Math.max(0, Math.min(1, ratio));
  const severity = pct >= 0.9 ? "danger" : pct >= 0.7 ? "warning" : "primary";

  const fillClass = { primary: "bg-primary", warning: "bg-warning", danger: "bg-danger" }[severity];
  const trackClass = { primary: "bg-primary/12", warning: "bg-warning/12", danger: "bg-danger/12" }[severity];

  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full", trackClass, className)}>
      <div
        className={cn("h-full rounded-full transition-all duration-500", fillClass)}
        style={{ width: `${pct * 100}%` }}
      />
    </div>
  );
}
