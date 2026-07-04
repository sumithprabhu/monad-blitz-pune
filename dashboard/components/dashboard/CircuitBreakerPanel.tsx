"use client";

import { useState } from "react";
import { useAccount, usePublicClient } from "wagmi";
import { useVaultWriteContract } from "@/lib/useContractAction";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Meter } from "@/components/ui/Meter";
import { agentVaultAbi } from "@/lib/abi";
import { requireVaultAddress } from "@/lib/config";
import { formatUsdc, parseUsdc } from "@/lib/format";
import { useUserCircuitBreaker } from "@/lib/reads";

export function CircuitBreakerPanel() {
  const { address } = useAccount();
  const { data, refetch } = useUserCircuitBreaker(address);
  const [newCap, setNewCap] = useState("");
  const [busy, setBusy] = useState(false);
  const { writeContractAsync } = useVaultWriteContract();
  const publicClient = usePublicClient();

  const paused = data?.[0]?.result as boolean | undefined;
  const cap = data?.[1]?.result as bigint | undefined;
  const spent = data?.[2]?.result as bigint | undefined;
  const ratio = cap && cap > 0n && spent !== undefined ? Number(spent) / Number(cap) : 0;

  async function setPaused(value: boolean) {
    setBusy(true);
    try {
      const hash = await writeContractAsync({
        address: requireVaultAddress(),
        abi: agentVaultAbi,
        functionName: "setPaused",
        args: [value],
      });
      await publicClient?.waitForTransactionReceipt({ hash });
      await refetch();
    } finally {
      setBusy(false);
    }
  }

  async function updateCap() {
    if (!newCap) return;
    setBusy(true);
    try {
      const hash = await writeContractAsync({
        address: requireVaultAddress(),
        abi: agentVaultAbi,
        functionName: "setVelocityCap",
        args: [parseUsdc(newCap)],
      });
      await publicClient?.waitForTransactionReceipt({ hash });
      await refetch();
      setNewCap("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Your circuit breaker"
        subtitle="A velocity cap across all of your agents, rolling 24h window. Only affects you."
        action={<Badge tone={paused ? "danger" : "success"}>{paused ? "PAUSED" : "active"}</Badge>}
      />
      <div className="flex flex-col gap-4 p-5">
        <div>
          <div className="flex items-center justify-between text-xs text-muted">
            <span>Window spend</span>
            <span className="font-mono">
              {formatUsdc(spent)} / {cap === 0n ? "disabled" : `${formatUsdc(cap)} mUSDC`}
            </span>
          </div>
          <Meter ratio={ratio} className="mt-1.5" />
        </div>

        <div className="flex gap-2">
          <input
            value={newCap}
            onChange={(e) => setNewCap(e.target.value)}
            placeholder="your velocity cap (mUSDC, 0 = disabled)"
            inputMode="decimal"
            className="flex-1 rounded-lg border border-overlay/10 bg-surface-2 px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-primary/50 focus:outline-none"
          />
          <Button variant="secondary" size="sm" onClick={updateCap} disabled={busy}>
            Set cap
          </Button>
        </div>
        <Button variant={paused ? "primary" : "danger"} onClick={() => setPaused(!paused)} disabled={busy}>
          {paused ? "Unpause my agents" : "Pause my agents"}
        </Button>
      </div>
    </Card>
  );
}
