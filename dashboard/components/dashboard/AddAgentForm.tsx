"use client";

import { useState } from "react";
import type { Address } from "viem";
import { isAddress } from "viem";
import { usePublicClient } from "wagmi";
import { useVaultWriteContract } from "@/lib/useContractAction";
import { Button } from "@/components/ui/Button";
import { agentVaultAbi } from "@/lib/abi";
import { requireVaultAddress } from "@/lib/config";
import { parseUsdc } from "@/lib/format";

export function AddAgentForm({ onDone }: { onDone: () => void }) {
  const [agent, setAgent] = useState("");
  const [perTxCap, setPerTxCap] = useState("100");
  const [dailyCap, setDailyCap] = useState("500");
  const [approvalThreshold, setApprovalThreshold] = useState("50");
  const [validUntilDays, setValidUntilDays] = useState("");
  const [whitelistOnly, setWhitelistOnly] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { writeContractAsync } = useVaultWriteContract();
  const publicClient = usePublicClient();

  async function handleSubmit() {
    setError(null);
    if (!isAddress(agent)) {
      setError("Enter a valid agent address");
      return;
    }
    const perTx = parseUsdc(perTxCap);
    const daily = parseUsdc(dailyCap);
    const threshold = parseUsdc(approvalThreshold || "0");
    if (threshold !== 0n && threshold > perTx) {
      setError("Approval threshold can't exceed the per-tx cap - the approval queue would be unreachable");
      return;
    }
    const validUntil = validUntilDays
      ? BigInt(Math.floor(Date.now() / 1000) + Number(validUntilDays) * 86400)
      : 0n;

    setSubmitting(true);
    try {
      const hash = await writeContractAsync({
        address: requireVaultAddress(),
        abi: agentVaultAbi,
        functionName: "registerAgent",
        args: [
          agent as Address,
          {
            perTxCap: perTx,
            dailyCap: daily,
            approvalThreshold: threshold,
            validAfter: 0n,
            validUntil,
            whitelistOnly,
          },
        ],
      });
      await publicClient?.waitForTransactionReceipt({ hash });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Transaction failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 border-t border-overlay/8 p-5">
      <input
        value={agent}
        onChange={(e) => setAgent(e.target.value)}
        placeholder="Agent address (0x...)"
        className="rounded-lg border border-overlay/10 bg-surface-2 px-3 py-2 font-mono text-sm text-ink placeholder:text-faint focus:border-primary/50 focus:outline-none"
      />
      <div className="grid grid-cols-3 gap-3">
        <Labeled label="Per-tx cap">
          <input
            value={perTxCap}
            onChange={(e) => setPerTxCap(e.target.value)}
            inputMode="decimal"
            className="w-full rounded-lg border border-overlay/10 bg-surface-2 px-3 py-2 text-sm text-ink focus:border-primary/50 focus:outline-none"
          />
        </Labeled>
        <Labeled label="Daily cap">
          <input
            value={dailyCap}
            onChange={(e) => setDailyCap(e.target.value)}
            inputMode="decimal"
            className="w-full rounded-lg border border-overlay/10 bg-surface-2 px-3 py-2 text-sm text-ink focus:border-primary/50 focus:outline-none"
          />
        </Labeled>
        <Labeled label="Approval threshold">
          <input
            value={approvalThreshold}
            onChange={(e) => setApprovalThreshold(e.target.value)}
            inputMode="decimal"
            className="w-full rounded-lg border border-overlay/10 bg-surface-2 px-3 py-2 text-sm text-ink focus:border-primary/50 focus:outline-none"
          />
        </Labeled>
      </div>
      <div className="flex items-center justify-between gap-3">
        <Labeled label="Expires in (days, blank = never)" className="flex-1">
          <input
            value={validUntilDays}
            onChange={(e) => setValidUntilDays(e.target.value)}
            inputMode="numeric"
            placeholder="never"
            className="w-full rounded-lg border border-overlay/10 bg-surface-2 px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-primary/50 focus:outline-none"
          />
        </Labeled>
        <label className="flex items-center gap-2 pt-5 text-sm text-muted">
          <input
            type="checkbox"
            checked={whitelistOnly}
            onChange={(e) => setWhitelistOnly(e.target.checked)}
            className="h-4 w-4 rounded border-overlay/20 bg-surface-2 accent-primary"
          />
          Whitelist only
        </label>
      </div>

      {error ? <p className="text-xs text-danger">{error}</p> : null}

      <div className="flex gap-2 pt-1">
        <Button onClick={handleSubmit} disabled={submitting}>
          {submitting ? "Registering..." : "Register agent"}
        </Button>
        <Button variant="ghost" onClick={onDone} disabled={submitting}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function Labeled({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={className}>
      <span className="mb-1 block text-xs text-faint">{label}</span>
      {children}
    </label>
  );
}
