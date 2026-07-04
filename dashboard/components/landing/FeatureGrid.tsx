import { Lock, ShieldCheck, UserCheck, Zap, Power, ScrollText } from "lucide-react";
import { PillarCard } from "./PillarCard";

export const pillars = [
  {
    index: "01",
    icon: Lock,
    title: "Capped, not custodial",
    description:
      "Agents never hold funds. Per-tx and daily caps mean a leaked agent key can only spend up to what you've allowed, never drain the vault.",
  },
  {
    index: "02",
    icon: ShieldCheck,
    title: "Whitelist-enforced",
    description:
      "Recipients are pre-approved per agent, so a compromised key can't redirect funds anywhere else. This is the linchpin of the whole model.",
  },
  {
    index: "03",
    icon: UserCheck,
    title: "Human-in-the-loop for big spends",
    description:
      "Anything above the approval threshold queues for your sign-off instead of executing, so you see the anomaly before money moves.",
  },
  {
    index: "04",
    icon: Zap,
    title: "Vault-wide circuit breaker",
    description:
      "A rolling velocity cap across every agent auto-pauses the entire vault on abnormal spend activity, with no human needed to notice first.",
  },
  {
    index: "05",
    icon: Power,
    title: "Killable in one transaction",
    description:
      "Revoke freezes the agent and cancels its pending requests atomically. No multi-step cleanup, no race condition to worry about.",
  },
  {
    index: "06",
    icon: ScrollText,
    title: "Full on-chain audit trail",
    description:
      "Every executed, blocked, and queued spend is an event. The live feed and approval queue are reconstructed straight from logs, no database.",
  },
];

export function FeatureGrid() {
  return (
    <section id="security" className="scroll-mt-24">
      <p className="font-mono text-xs uppercase tracking-widest text-faint">Security model</p>
      <h2 className="mt-2 max-w-xl text-2xl font-semibold text-ink">
        A leaked agent key is bounded damage, by design.
      </h2>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {pillars.map((p) => (
          <PillarCard key={p.index} {...p} />
        ))}
      </div>
    </section>
  );
}
