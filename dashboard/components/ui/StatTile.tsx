import { cn } from "@/lib/cn";

export function StatTile({
  label,
  value,
  hint,
  tone = "default",
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "danger";
  className?: string;
}) {
  return (
    <div className={cn("rounded-2xl border border-overlay/8 bg-surface px-5 py-4", className)}>
      <p className="text-sm text-muted">{label}</p>
      <p
        className={cn(
          "mt-1.5 font-mono text-2xl font-semibold tracking-tight",
          tone === "danger" ? "text-danger" : "text-ink"
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-faint">{hint}</p> : null}
    </div>
  );
}
