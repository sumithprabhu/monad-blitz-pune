"use client";

import { useMemo, useState } from "react";
import { useAccount, usePublicClient } from "wagmi";
import { useVaultWriteContract } from "@/lib/useContractAction";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { agentVaultAbi } from "@/lib/abi";
import { requireVaultAddress, shortAddress } from "@/lib/config";
import { formatUsdc, parseUsdc } from "@/lib/format";
import { useVaultEvents } from "@/lib/vaultEvents";
import { deriveAgentOwnerMap, deriveRequests, type RequestView } from "@/lib/derive";

export function ApprovalQueuePanel() {
  const { address } = useAccount();
  const { events, loading } = useVaultEvents();

  const pending = useMemo(() => {
    if (!address) return [];
    const agentOwners = deriveAgentOwnerMap(events);
    const all = [...deriveRequests(events, agentOwners, address).values()];
    return all.filter((r) => r.status === 0).sort((a, b) => Number(b.id - a.id));
  }, [events, address]);

  return (
    <Card>
      <CardHeader title="Approval queue" subtitle="Spends from your agents, at or above their approval threshold" />
      <div className="flex flex-col gap-3 p-5">
        {loading ? (
          <div className="flex items-center justify-center py-4">
            <Spinner />
          </div>
        ) : null}
        {!loading && pending.length === 0 ? (
          <p className="text-sm text-faint">Nothing pending.</p>
        ) : null}
        {pending.map((req) => (
          <RequestRow key={req.id.toString()} request={req} />
        ))}
      </div>
    </Card>
  );
}

function RequestRow({ request }: { request: RequestView }) {
  const [modifiedAmount, setModifiedAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const { writeContractAsync } = useVaultWriteContract();
  const publicClient = usePublicClient();

  async function approve(finalAmount: bigint) {
    setBusy(true);
    try {
      const hash = await writeContractAsync({
        address: requireVaultAddress(),
        abi: agentVaultAbi,
        functionName: "approveRequest",
        args: [request.id, finalAmount],
      });
      await publicClient?.waitForTransactionReceipt({ hash });
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    setBusy(true);
    try {
      const hash = await writeContractAsync({
        address: requireVaultAddress(),
        abi: agentVaultAbi,
        functionName: "rejectRequest",
        args: [request.id],
      });
      await publicClient?.waitForTransactionReceipt({ hash });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-overlay/8 bg-surface-2/40 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Badge tone="warning">#{request.id.toString()}</Badge>
            <span className="font-mono text-xs text-faint">{shortAddress(request.agent)}</span>
            <span className="text-xs text-faint">→</span>
            <span className="font-mono text-xs text-faint">{shortAddress(request.to)}</span>
          </div>
          <p className="mt-1.5 text-sm text-ink">{request.memo}</p>
        </div>
        <span className="whitespace-nowrap font-mono text-sm text-ink">{formatUsdc(request.amount)} mUSDC</span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => approve(request.amount)} disabled={busy}>
          Approve full
        </Button>
        <input
          value={modifiedAmount}
          onChange={(e) => setModifiedAmount(e.target.value)}
          placeholder="reduced amount"
          inputMode="decimal"
          className="w-32 rounded-lg border border-overlay/10 bg-surface-2 px-2.5 py-1.5 text-xs text-ink placeholder:text-faint focus:border-primary/50 focus:outline-none"
        />
        <Button
          variant="secondary"
          size="sm"
          disabled={busy || !modifiedAmount}
          onClick={() => approve(parseUsdc(modifiedAmount))}
        >
          Approve modified
        </Button>
        <Button variant="danger" size="sm" onClick={reject} disabled={busy}>
          Reject
        </Button>
      </div>
    </div>
  );
}
