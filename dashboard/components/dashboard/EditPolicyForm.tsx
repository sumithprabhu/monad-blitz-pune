"use client";

import { useState } from "react";
import type { Address } from "viem";
import { usePublicClient } from "wagmi";
import { useVaultWriteContract } from "@/lib/useContractAction";
import { Button } from "@/components/ui/Button";
import { agentVaultAbi } from "@/lib/abi";
import { requireVaultAddress } from "@/lib/config";
import { formatUnits } from "viem";
import { parseUsdc } from "@/lib/format";
import { tokenDecimals } from "@/lib/config";

interface CurrentPolicy {
  perTxCap: bigint;
  dailyCap: bigint;
  approvalThreshold: bigint;
  validAfter: bigint;
  validUntil: bigint;
  whitelistOnly: boolean;
}

export function EditPolicyForm({
  agent,
  current,
  onDone,
}: {
  agent: Address;
  current: CurrentPolicy;
  onDone: () => void;
}) {
  const [perTxCap, setPerTxCap] = useState(formatUnits(current.perTxCap, tokenDecimals));
  const [dailyCap, setDailyCap] = useState(formatUnits(current.dailyCap, tokenDecimals));
  const [approvalThreshold, setApprovalThreshold] = useState(formatUnits(current.approvalThreshold, tokenDecimals));
  const [whitelistOnly, setWhitelistOnly] = useState(current.whitelistOnly);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { writeContractAsync } = useVaultWriteContract();
  const publicClient = usePublicClient();

  async function handleSubmit() {
    setError(null);
    const perTx = parseUsdc(perTxCap);
    const daily = parseUsdc(dailyCap);
    const threshold = parseUsdc(approvalThreshold || "0");
    if (threshold !== 0n && threshold > perTx) {
      setError("Approval threshold can't exceed the per-tx cap");
      return;
    }

    setSubmitting(true);
    try {
      const hash = await writeContractAsync({
        address: requireVaultAddress(),
        abi: agentVaultAbi,
        functionName: "updateAgent",
        args: [
          agent,
          {
            perTxCap: perTx,
            dailyCap: daily,
            approvalThreshold: threshold,
            validAfter: current.validAfter,
            validUntil: current.validUntil,
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
    <div className="mt-4 rounded-xl border border-overlay/8 bg-bg/40 p-3">
      <p className="text-xs text-faint">Edit policy</p>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <input
          value={perTxCap}
          onChange={(e) => setPerTxCap(e.target.value)}
          placeholder="per-tx cap"
          inputMode="decimal"
          className="rounded-lg border border-overlay/10 bg-surface-2 px-2.5 py-1.5 text-xs text-ink placeholder:text-faint focus:border-primary/50 focus:outline-none"
        />
        <input
          value={dailyCap}
          onChange={(e) => setDailyCap(e.target.value)}
          placeholder="daily cap"
          inputMode="decimal"
          className="rounded-lg border border-overlay/10 bg-surface-2 px-2.5 py-1.5 text-xs text-ink placeholder:text-faint focus:border-primary/50 focus:outline-none"
        />
        <input
          value={approvalThreshold}
          onChange={(e) => setApprovalThreshold(e.target.value)}
          placeholder="approval threshold"
          inputMode="decimal"
          className="rounded-lg border border-overlay/10 bg-surface-2 px-2.5 py-1.5 text-xs text-ink placeholder:text-faint focus:border-primary/50 focus:outline-none"
        />
      </div>
      <label className="mt-2 flex items-center gap-2 text-xs text-muted">
        <input
          type="checkbox"
          checked={whitelistOnly}
          onChange={(e) => setWhitelistOnly(e.target.checked)}
          className="h-4 w-4 rounded border-overlay/20 bg-surface-2 accent-primary"
        />
        Whitelist only
      </label>

      {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}

      <div className="mt-3 flex gap-2">
        <Button size="sm" onClick={handleSubmit} disabled={submitting}>
          {submitting ? "Saving..." : "Save changes"}
        </Button>
        <Button variant="ghost" size="sm" onClick={onDone} disabled={submitting}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
