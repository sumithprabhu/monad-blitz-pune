"use client";

import { useMemo, useState } from "react";
import type { Address } from "viem";
import { isAddress } from "viem";
import { useAccount, usePublicClient } from "wagmi";
import { useVaultWriteContract } from "@/lib/useContractAction";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { agentVaultAbi } from "@/lib/abi";
import { requireVaultAddress, shortAddress } from "@/lib/config";
import { useVaultEvents } from "@/lib/vaultEvents";
import { deriveBlacklist } from "@/lib/derive";

export function BlacklistPanel() {
  const { address } = useAccount();
  const { events } = useVaultEvents();
  const { writeContractAsync } = useVaultWriteContract();
  const publicClient = usePublicClient();
  const [newRecipient, setNewRecipient] = useState("");
  const [busy, setBusy] = useState(false);

  const blacklist = useMemo(() => (address ? deriveBlacklist(events, address) : []), [events, address]);

  async function toggle(recipient: Address, blocked: boolean) {
    setBusy(true);
    try {
      const hash = await writeContractAsync({
        address: requireVaultAddress(),
        abi: agentVaultAbi,
        functionName: "setBlacklist",
        args: [recipient, blocked],
      });
      await publicClient?.waitForTransactionReceipt({ hash });
      setNewRecipient("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Blacklist"
        subtitle="Recipients blocked for ALL of your agents, even if an agent's whitelist would allow them"
      />
      <div className="flex flex-col gap-3 p-5">
        <div className="flex flex-wrap gap-2">
          {blacklist.length === 0 ? <span className="text-sm text-faint">No addresses blacklisted.</span> : null}
          {blacklist.map((r) => (
            <span
              key={r}
              className="inline-flex items-center gap-1.5 rounded-full bg-danger/10 px-2.5 py-1 font-mono text-xs text-danger"
            >
              {shortAddress(r)}
              <button
                onClick={() => toggle(r, false)}
                disabled={busy}
                className="text-danger/70 hover:text-danger"
                aria-label="remove from blacklist"
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={newRecipient}
            onChange={(e) => setNewRecipient(e.target.value)}
            placeholder="0x... address to blacklist"
            className="flex-1 rounded-lg border border-overlay/10 bg-surface-2 px-3 py-2 font-mono text-xs text-ink placeholder:text-faint focus:border-primary/50 focus:outline-none"
          />
          <Button
            variant="danger"
            size="sm"
            disabled={busy || !isAddress(newRecipient)}
            onClick={() => toggle(newRecipient as Address, true)}
          >
            Blacklist
          </Button>
        </div>
      </div>
    </Card>
  );
}
