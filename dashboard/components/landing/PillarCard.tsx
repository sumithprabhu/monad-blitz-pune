import type { LucideIcon } from "lucide-react";

export function PillarCard({
  title,
  description,
  index,
  icon: Icon,
}: {
  title: string;
  description: string;
  index: string;
  icon: LucideIcon;
}) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-overlay/8 bg-surface p-6 transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/10">
      <span className="pointer-events-none absolute -right-2 -top-4 font-mono text-6xl font-bold text-overlay/[0.04] transition-colors group-hover:text-primary/10">
        {index}
      </span>
      <div className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-white">
        <Icon size={20} strokeWidth={2} />
      </div>
      <h3 className="relative mt-4 text-base font-semibold text-ink">{title}</h3>
      <p className="relative mt-2 text-sm leading-relaxed text-muted">{description}</p>
    </div>
  );
}
