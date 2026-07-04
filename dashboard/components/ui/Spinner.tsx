import { cn } from "@/lib/cn";

export function Spinner({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={cn("animate-spin rounded-full border-2 border-primary/20 border-t-primary", className)}
      style={{ width: size, height: size }}
    />
  );
}
