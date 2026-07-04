"use client";

import { useMemo } from "react";
import { useAccount } from "wagmi";
import { StatTile } from "@/components/ui/StatTile";
import { useUserBalance, useUserCircuitBreaker } from "@/lib/reads";
import { useVaultEvents } from "@/lib/vaultEvents";
import { deriveMyAgentAddresses } from "@/lib/derive";
import { formatUsdc } from "@/lib/format";

export function Overview() {
  const { address } = useAccount();
  const { data: balance } = useUserBalance(address);
  const { data: breaker } = useUserCircuitBreaker(address);
  const { events } = useVaultEvents();

  const agentCount = useMemo(() => (address ? deriveMyAgentAddresses(events, address).length : 0), [events, address]);

  const paused = breaker?.[0]?.result as boolean | undefined;

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <StatTile label="Your balance" value={`${formatUsdc(balance)} mUSDC`} />
      <StatTile label="Your agents" value={String(agentCount)} />
      <StatTile
        label="Your circuit breaker"
        value={paused ? "PAUSED" : "Active"}
        tone={paused ? "danger" : "default"}
        hint={paused ? "All of your agents are blocked until you unpause" : "Your agents can spend normally"}
      />
    </div>
  );
}
