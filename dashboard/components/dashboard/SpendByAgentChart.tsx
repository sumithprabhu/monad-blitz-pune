"use client";

import { useMemo } from "react";
import { useAccount } from "wagmi";
import { Card, CardHeader } from "@/components/ui/Card";
import { useVaultEvents } from "@/lib/vaultEvents";
import { deriveAgentOwnerMap, deriveAgentSpendSummary } from "@/lib/derive";
import { formatUsdc } from "@/lib/format";
import { shortAddress } from "@/lib/config";

/** One metric (total executed spend) ranked across agents - a single accent hue is correct
 * here since color isn't carrying category identity, the agent address label is. */
export function SpendByAgentChart() {
  const { address } = useAccount();
  const { events } = useVaultEvents();

  const summary = useMemo(() => {
    if (!address) return [];
    const agentOwners = deriveAgentOwnerMap(events);
    return deriveAgentSpendSummary(events, agentOwners, address);
  }, [events, address]);

  const max = Math.max(1, ...summary.map((s) => Number(s.totalExecuted)));
  const totalExecuted = summary.reduce((sum, s) => sum + s.totalExecuted, 0n);

  return (
    <Card>
      <CardHeader
        title="Spend by agent"
        subtitle={`${summary.length} agent${summary.length === 1 ? "" : "s"} · ${formatUsdc(totalExecuted)} mUSDC executed all-time`}
      />
      <div className="flex flex-col gap-4 p-5">
        {summary.length === 0 ? (
          <p className="text-sm text-faint">Register an agent to see spend activity here.</p>
        ) : (
          summary.map((s) => {
            const pct = s.totalExecuted > 0n ? Math.max(3, (Number(s.totalExecuted) / max) * 100) : 0;
            return (
              <div key={s.agent} className="group">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono text-muted">{shortAddress(s.agent)}</span>
                  <span className="font-mono text-ink">{formatUsdc(s.totalExecuted)} mUSDC</span>
                </div>
                <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-overlay/8">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-500 group-hover:opacity-80"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="mt-1 text-[11px] text-faint">
                  {s.executedCount} executed{s.blockedCount > 0 ? ` · ${s.blockedCount} blocked` : ""}
                </p>
              </div>
            );
          })
        )}
      </div>
    </Card>
  );
}
