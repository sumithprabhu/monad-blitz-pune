"use client";

import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { monadTestnet } from "@/lib/chain";
import { Button } from "@/components/ui/Button";

/** Persistent banner (not just a just-in-time wallet prompt) so a wrong-network wallet is
 * obvious immediately, not only discovered after clicking a write action. */
export function NetworkGuard() {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending } = useSwitchChain();

  if (!isConnected || chainId === monadTestnet.id) return null;

  return (
    <div className="mb-6 flex items-center justify-between gap-3 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm">
      <span className="text-danger">
        Your wallet is on chain {chainId}, not Monad Testnet ({monadTestnet.id}). Transactions will fail until you switch.
      </span>
      <Button
        variant="danger"
        size="sm"
        onClick={() => switchChain({ chainId: monadTestnet.id })}
        disabled={isPending}
      >
        {isPending ? "Switching..." : "Switch to Monad Testnet"}
      </Button>
    </div>
  );
}
