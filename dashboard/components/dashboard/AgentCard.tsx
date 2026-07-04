"use client";

import { useMemo, useState } from "react";
import type { Address } from "viem";
import { isAddress } from "viem";
import { usePublicClient } from "wagmi";
import { useVaultWriteContract } from "@/lib/useContractAction";
import { Badge } from "@/components/ui/Badge";
import { Meter } from "@/components/ui/Meter";
import { Button } from "@/components/ui/Button";
import { agentVaultAbi } from "@/lib/abi";
import { requireVaultAddress, shortAddress } from "@/lib/config";
import { formatUsdc, formatExpiry } from "@/lib/format";
import { useAgentPolicy } from "@/lib/reads";
import { useVaultEvents } from "@/lib/vaultEvents";
import { deriveWhitelist } from "@/lib/derive";
import { EditPolicyForm } from "./EditPolicyForm";

export function AgentCard({ agent }: { agent: Address }) {
  const { data: policy, refetch } = useAgentPolicy(agent);
  const { events } = useVaultEvents();
  const { writeContractAsync } = useVaultWriteContract();
  const publicClient = usePublicClient();
  const [managing, setManaging] = useState(false);
  const [editing, setEditing] = useState(false);
  const [newRecipient, setNewRecipient] = useState("");
  const [busy, setBusy] = useState(false);

  const whitelist = useMemo(() => deriveWhitelist(events, agent), [events, agent]);

  if (!policy) return null;
  const [active, perTxCap, dailyCap, spentToday, , approvalThreshold, validAfter, validUntil, whitelistOnly] = policy;
  const ratio = dailyCap > 0n ? Number(spentToday) / Number(dailyCap) : 0;

  async function revoke() {
    if (!window.confirm(`Revoke agent ${agent}? This freezes it immediately and cancels its pending requests.`)) return;
    setBusy(true);
    try {
      const hash = await writeContractAsync({
        address: requireVaultAddress(),
        abi: agentVaultAbi,
        functionName: "revokeAgent",
        args: [agent],
      });
      await publicClient?.waitForTransactionReceipt({ hash });
      await refetch();
    } finally {
      setBusy(false);
    }
  }

  async function toggleRecipient(recipient: Address, allow: boolean) {
    setBusy(true);
    try {
      const hash = await writeContractAsync({
        address: requireVaultAddress(),
        abi: agentVaultAbi,
        functionName: "setRecipient",
        args: [agent, recipient, allow],
      });
      await publicClient?.waitForTransactionReceipt({ hash });
      setNewRecipient("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-overlay/8 bg-surface-2/40 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-sm text-ink">{shortAddress(agent, 6)}</p>
          <p className="mt-0.5 text-xs text-faint">expires {formatExpiry(validUntil)}</p>
        </div>
        <div className="flex items-center gap-2">
          {whitelistOnly ? <Badge tone="primary">whitelist-only</Badge> : null}
          <Badge tone={active ? "success" : "neutral"}>{active ? "active" : "revoked"}</Badge>
        </div>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between text-xs text-muted">
          <span>Daily spend</span>
          <span className="font-mono">
            {formatUsdc(spentToday)} / {formatUsdc(dailyCap)} mUSDC
          </span>
        </div>
        <Meter ratio={ratio} className="mt-1.5" />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
        <Stat label="Per-tx cap" value={`${formatUsdc(perTxCap)} mUSDC`} />
        <Stat
          label="Approval threshold"
          value={approvalThreshold === 0n ? "none (auto)" : `${formatUsdc(approvalThreshold)} mUSDC`}
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={() => setManaging((m) => !m)}>
          Manage recipients
        </Button>
        {active ? (
          <Button variant="secondary" size="sm" onClick={() => setEditing((e) => !e)}>
            Edit policy
          </Button>
        ) : null}
        {active ? (
          <Button variant="danger" size="sm" onClick={revoke} disabled={busy}>
            Revoke
          </Button>
        ) : null}
      </div>

      {editing ? (
        <EditPolicyForm
          agent={agent}
          current={{ perTxCap, dailyCap, approvalThreshold, validAfter, validUntil, whitelistOnly }}
          onDone={() => {
            setEditing(false);
            void refetch();
          }}
        />
      ) : null}

      {managing ? (
        <div className="mt-4 rounded-xl border border-overlay/8 bg-bg/40 p-3">
          <p className="text-xs text-faint">Whitelisted recipients</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {whitelist.length === 0 ? <span className="text-xs text-faint">none yet</span> : null}
            {whitelist.map((r) => (
              <span
                key={r}
                className="inline-flex items-center gap-1.5 rounded-full bg-overlay/5 px-2.5 py-1 font-mono text-xs text-muted"
              >
                {shortAddress(r)}
                <button
                  onClick={() => toggleRecipient(r, false)}
                  disabled={busy}
                  className="text-faint hover:text-danger"
                  aria-label="remove"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <input
              value={newRecipient}
              onChange={(e) => setNewRecipient(e.target.value)}
              placeholder="0x... recipient to whitelist"
              className="flex-1 rounded-lg border border-overlay/10 bg-surface-2 px-3 py-1.5 font-mono text-xs text-ink placeholder:text-faint focus:border-primary/50 focus:outline-none"
            />
            <Button
              size="sm"
              disabled={busy || !isAddress(newRecipient)}
              onClick={() => toggleRecipient(newRecipient as Address, true)}
            >
              Add
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-faint">{label}</p>
      <p className="mt-0.5 font-mono text-ink">{value}</p>
    </div>
  );
}
