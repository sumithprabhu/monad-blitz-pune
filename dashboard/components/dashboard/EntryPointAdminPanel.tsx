"use client";

import { useState } from "react";
import { parseEther, formatEther } from "viem";
import { useAccount, usePublicClient } from "wagmi";
import { useVaultWriteContract } from "@/lib/useContractAction";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { agentVaultAbi } from "@/lib/abi";
import { requireVaultAddress } from "@/lib/config";
import { useEntryPointDepositBalance, useIsDeployerAdmin } from "@/lib/reads";

/** Manages this contract's own MON gas float at the EntryPoint (Door 2 self-funding without
 * a paymaster) - NOT user treasury. Restricted on-chain to the deployer; visible to everyone
 * so the feature is discoverable, but only works if you're connected as the deployer. */
export function EntryPointAdminPanel() {
  const isDeployer = useIsDeployerAdmin();
  const { data: deposit, refetch } = useEntryPointDepositBalance();
  const { writeContractAsync } = useVaultWriteContract();
  const publicClient = usePublicClient();
  const { address } = useAccount();
  const [amount, setAmount] = useState("");
  const [withdrawTo, setWithdrawTo] = useState(address ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fund() {
    if (!amount) return;
    setError(null);
    setBusy(true);
    try {
      const hash = await writeContractAsync({
        address: requireVaultAddress(),
        abi: agentVaultAbi,
        functionName: "fundEntryPointDeposit",
        value: parseEther(amount),
      });
      await publicClient?.waitForTransactionReceipt({ hash });
      await refetch();
      setAmount("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Transaction failed");
    } finally {
      setBusy(false);
    }
  }

  async function withdraw() {
    if (!amount || !withdrawTo) return;
    setError(null);
    setBusy(true);
    try {
      const hash = await writeContractAsync({
        address: requireVaultAddress(),
        abi: agentVaultAbi,
        functionName: "withdrawEntryPointDeposit",
        args: [withdrawTo as `0x${string}`, parseEther(amount)],
      });
      await publicClient?.waitForTransactionReceipt({ hash });
      await refetch();
      setAmount("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Transaction failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="EntryPoint gas float"
        subtitle="This contract's own MON deposit for Door 2 (ERC-4337) self-funding - not user treasury"
        action={<Badge tone={isDeployer ? "success" : "neutral"}>{isDeployer ? "you are the deployer" : "deployer only"}</Badge>}
      />
      <div className="flex flex-col gap-3 p-5">
        <p className="font-mono text-sm text-ink">{deposit !== undefined ? formatEther(deposit) : "—"} MON deposited</p>
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="amount in MON"
          inputMode="decimal"
          className="rounded-lg border border-overlay/10 bg-surface-2 px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-primary/50 focus:outline-none"
        />
        <div className="flex gap-2">
          <Button size="sm" onClick={fund} disabled={busy || !amount}>
            Fund
          </Button>
          <input
            value={withdrawTo}
            onChange={(e) => setWithdrawTo(e.target.value)}
            placeholder="withdraw to address"
            className="flex-1 rounded-lg border border-overlay/10 bg-surface-2 px-3 py-2 font-mono text-xs text-ink placeholder:text-faint focus:border-primary/50 focus:outline-none"
          />
          <Button variant="secondary" size="sm" onClick={withdraw} disabled={busy || !amount || !withdrawTo}>
            Withdraw
          </Button>
        </div>
        {error ? <p className="text-xs text-danger">{error}</p> : null}
      </div>
    </Card>
  );
}
