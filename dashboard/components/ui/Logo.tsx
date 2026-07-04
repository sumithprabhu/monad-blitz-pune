import { cn } from "@/lib/cn";

/** Text-only wordmark - no image asset. Space Grotesk gives it a distinct, technical
 * character apart from the body font, so the name itself carries the brand mark. */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-baseline gap-1.5 font-logo", className)}>
      <span className="text-lg font-bold tracking-tight text-ink">Leash</span>
      <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-primary">Protocol</span>
    </span>
  );
}
