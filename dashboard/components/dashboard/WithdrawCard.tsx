"use client";

import { useState } from "react";
import { useAccount, usePublicClient } from "wagmi";
import { useVaultWriteContract } from "@/lib/useContractAction";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { agentVaultAbi } from "@/lib/abi";
import { requireVaultAddress } from "@/lib/config";
import { formatUsdc, parseUsdc } from "@/lib/format";
import { useUserBalance } from "@/lib/reads";

export function WithdrawCard() {
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { address } = useAccount();
  const { writeContractAsync } = useVaultWriteContract();
  const publicClient = usePublicClient();
  const { data: myBalance, refetch } = useUserBalance(address);

  const vaultAddress = requireVaultAddress();
  const parsedAmount = amount ? parseUsdc(amount) : 0n;

  async function handleSubmit() {
    if (parsedAmount <= 0n) return;
    setErrorMessage(null);
    setBusy(true);
    try {
      const hash = await writeContractAsync({
        address: vaultAddress,
        abi: agentVaultAbi,
        functionName: "withdraw",
        args: [parsedAmount],
      });
      await publicClient?.waitForTransactionReceipt({ hash });
      await refetch();
      setAmount("");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Transaction failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Withdraw" subtitle={`You can withdraw up to ${formatUsdc(myBalance)} mUSDC`} />
      <div className="flex flex-col gap-3 p-5">
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Amount in mUSDC"
          inputMode="decimal"
          className="rounded-lg border border-overlay/10 bg-surface-2 px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-primary/50 focus:outline-none"
        />
        <Button variant="secondary" onClick={handleSubmit} disabled={busy || parsedAmount <= 0n}>
          {busy ? "Withdrawing..." : "Withdraw to my wallet"}
        </Button>
        {errorMessage ? <p className="text-xs text-danger">{errorMessage}</p> : null}
      </div>
    </Card>
  );
}
