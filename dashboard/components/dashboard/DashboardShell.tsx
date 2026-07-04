"use client";

import { useAccount } from "wagmi";
import { SignInGate } from "@/components/dashboard/SignInGate";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { NetworkGuard } from "@/components/dashboard/NetworkGuard";
import { Spinner } from "@/components/ui/Spinner";
import { VaultEventsProvider } from "@/lib/vaultEvents";

/** Auth-gates the whole dashboard, then mounts the vault event subscription + sidebar
 * shell only once a wallet is connected - keeps the connect screen renderable even
 * before a vault address is configured (see app/dashboard/layout.tsx history). */
export function DashboardShell({ children }: { children: React.ReactNode }) {
  const { status } = useAccount();

  if (status === "connecting" || status === "reconnecting") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner size={32} />
      </div>
    );
  }

  if (status !== "connected") {
    return <SignInGate />;
  }

  return (
    <VaultEventsProvider>
      <div className="flex">
        <Sidebar />
        <main className="min-h-screen flex-1 overflow-y-auto px-8 py-8">
          <div className="mx-auto max-w-6xl">
            <NetworkGuard />
            {children}
          </div>
        </main>
      </div>
    </VaultEventsProvider>
  );
}
