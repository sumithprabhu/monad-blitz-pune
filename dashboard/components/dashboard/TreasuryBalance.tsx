"use client";

import { useAccount } from "wagmi";
import { Card } from "@/components/ui/Card";
import { useUserBalance, usePoolTotalBalance } from "@/lib/reads";
import { formatUsdc } from "@/lib/format";

export function TreasuryBalance() {
  const { address } = useAccount();
  const { data: myBalance } = useUserBalance(address);
  const { data: poolTotal } = usePoolTotalBalance();

  return (
    <Card className="px-6 py-6">
      <p className="text-sm text-muted">Your balance</p>
      <p className="mt-2 font-mono text-4xl font-semibold tracking-tight text-ink">
        {formatUsdc(myBalance)} <span className="text-lg text-faint">mUSDC</span>
      </p>
      <p className="mt-2 text-xs text-faint">
        One shared contract, {formatUsdc(poolTotal)} mUSDC pooled across every user — but only
        you can withdraw yours, and only your agents can spend it.
      </p>
    </Card>
  );
}
