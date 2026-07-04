"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Logo } from "@/components/ui/Logo";

export function SignInGate() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-6">
      <div className="pointer-events-none absolute inset-0 bg-grid-fade" />
      <div className="relative w-full max-w-sm rounded-2xl border border-overlay/8 bg-surface p-8 text-center">
        <Logo className="justify-center" />
        <h1 className="mt-4 text-lg font-semibold text-ink">Connect your wallet</h1>
        <p className="mt-2 text-sm text-muted">
          Manage agents, approve spends, and watch the vault live.
        </p>
        <div className="mt-6 flex justify-center">
          <ConnectButton />
        </div>
      </div>
    </div>
  );
}
