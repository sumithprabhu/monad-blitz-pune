"use client";

import { useState } from "react";
import { usePublicClient } from "wagmi";
import { useVaultWriteContract } from "@/lib/useContractAction";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { agentVaultAbi, erc20Abi } from "@/lib/abi";
import { requireVaultAddress, tokenAddress } from "@/lib/config";
import { parseUsdc } from "@/lib/format";
import { useWalletAllowance, useWalletTokenBalance } from "@/lib/reads";

export function DepositCard() {
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState<"idle" | "approving" | "depositing" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { writeContractAsync } = useVaultWriteContract();
  const publicClient = usePublicClient();
  const { data: allowance, refetch: refetchAllowance } = useWalletAllowance();
  const { data: walletBalance, refetch: refetchBalance } = useWalletTokenBalance();

  const vaultAddress = requireVaultAddress();
  const parsedAmount = amount ? parseUsdc(amount) : 0n;
  const needsApproval = allowance !== undefined && parsedAmount > 0n && allowance < parsedAmount;

  async function handleSubmit() {
    if (!tokenAddress || parsedAmount <= 0n) return;
    setErrorMessage(null);
    try {
      if (needsApproval) {
        setStatus("approving");
        const approveHash = await writeContractAsync({
          address: tokenAddress,
          abi: erc20Abi,
          functionName: "approve",
          args: [vaultAddress, parsedAmount],
        });
        await publicClient?.waitForTransactionReceipt({ hash: approveHash });
        await refetchAllowance();
      }

      setStatus("depositing");
      const depositHash = await writeContractAsync({
        address: vaultAddress,
        abi: agentVaultAbi,
        functionName: "deposit",
        args: [parsedAmount],
      });
      await publicClient?.waitForTransactionReceipt({ hash: depositHash });
      await refetchBalance();
      setAmount("");
      setStatus("idle");
    } catch (err) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "Transaction failed");
    }
  }

  const busy = status === "approving" || status === "depositing";

  return (
    <Card>
      <CardHeader
        title="Deposit"
        subtitle={`Wallet balance: ${walletBalance !== undefined ? Number(walletBalance) / 1e6 : "—"} mUSDC`}
      />
      <div className="flex flex-col gap-3 p-5">
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Amount in mUSDC"
          inputMode="decimal"
          className="rounded-lg border border-overlay/10 bg-surface-2 px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-primary/50 focus:outline-none"
        />
        <Button onClick={handleSubmit} disabled={busy || parsedAmount <= 0n}>
          {status === "approving" ? "Approving..." : status === "depositing" ? "Depositing..." : needsApproval ? "Approve + Deposit" : "Deposit"}
        </Button>
        {errorMessage ? <p className="text-xs text-danger">{errorMessage}</p> : null}
      </div>
    </Card>
  );
}
