"use client";

import { useState } from "react";
import { useAccount, useSendTransaction, usePublicClient } from "wagmi";
import { createWalletClient, http, parseEventLogs, type Address } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useVaultWriteContract } from "@/lib/useContractAction";
import { agentVaultAbi } from "@/lib/abi";
import { requireVaultAddress, shortAddress, explorerTxUrl } from "@/lib/config";
import { monadTestnet } from "@/lib/chain";
import { parseUsdc, formatUsdc } from "@/lib/format";

type StepStatus = "pending" | "running" | "success";
type Tone = "success" | "warning" | "neutral";

interface Step {
  label: string;
  status: StepStatus;
  tone?: Tone;
  message?: string;
  detail?: string;
  txHashes?: { label: string; hash: `0x${string}` }[];
}

const PLAN = [
  { label: "Register a throwaway demo agent", amount: null },
  { label: "Spend 5 mUSDC (under every cap)", amount: "5" },
  { label: "Spend 15 mUSDC (over approval threshold)", amount: "15" },
  { label: "Spend 50 mUSDC (over per-tx cap)", amount: "50" },
] as const;

export function DemoPanel() {
  const { address } = useAccount();
  const { writeContractAsync } = useVaultWriteContract();
  const { sendTransactionAsync } = useSendTransaction();
  const publicClient = usePublicClient();

  const [steps, setSteps] = useState<Step[]>(PLAN.map((p) => ({ label: p.label, status: "pending" })));
  const [running, setRunning] = useState(false);
  const [demoAgent, setDemoAgent] = useState<Address | null>(null);

  function updateStep(i: number, patch: Partial<Step>) {
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }

  async function run() {
    if (!address || !publicClient) return;
    setRunning(true);
    setSteps(PLAN.map((p) => ({ label: p.label, status: "pending" })));

    try {
      // Step 0: spin up a fresh agent wallet, fund its gas, register it with a small policy.
      updateStep(0, { status: "running" });
      const privateKey = generatePrivateKey();
      const agentAccount = privateKeyToAccount(privateKey);
      setDemoAgent(agentAccount.address);

      const fundHash = await sendTransactionAsync({
        to: agentAccount.address,
        value: 300000000000000000n, // 0.3 MON for gas
        chainId: monadTestnet.id,
      });
      await publicClient.waitForTransactionReceipt({ hash: fundHash });

      const perTxCap = parseUsdc("20");
      const dailyCap = parseUsdc("100");
      const approvalThreshold = parseUsdc("10");
      const policy = {
        perTxCap,
        dailyCap,
        approvalThreshold,
        validAfter: 0n,
        validUntil: 0n,
        whitelistOnly: false,
      };
      const regHash = await writeContractAsync({
        address: requireVaultAddress(),
        abi: agentVaultAbi,
        functionName: "registerAgent",
        args: [agentAccount.address, policy],
      });
      await publicClient.waitForTransactionReceipt({ hash: regHash });
      updateStep(0, {
        status: "success",
        tone: "success",
        message: `agent ${shortAddress(agentAccount.address)} registered`,
        detail: `Per-tx cap: ${formatUsdc(perTxCap)} mUSDC · Daily cap: ${formatUsdc(dailyCap)} mUSDC · Approval threshold: ${formatUsdc(approvalThreshold)} mUSDC · Whitelist: off`,
        txHashes: [
          { label: "fund gas", hash: fundHash },
          { label: "register", hash: regHash },
        ],
      });

      // The agent signs its own spend() calls directly - Door 1, no human in this loop.
      const agentClient = createWalletClient({
        account: agentAccount,
        chain: monadTestnet,
        transport: http(monadTestnet.rpcUrls.default.http[0]),
      });
      const recipient = privateKeyToAccount(generatePrivateKey()).address;

      for (let i = 1; i < PLAN.length; i++) {
        updateStep(i, { status: "running" });
        const amount = parseUsdc(PLAN[i].amount!);
        const hash = await agentClient.writeContract({
          address: requireVaultAddress(),
          abi: agentVaultAbi,
          functionName: "spend",
          args: [recipient, amount, `Demo spend #${i}`],
        });
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        const parsed = parseEventLogs({ abi: agentVaultAbi, logs: receipt.logs }).find((l) =>
          ["SpendExecuted", "SpendBlocked", "SpendRequested"].includes(l.eventName)
        );

        const txHashes = [{ label: "spend", hash }];
        if (parsed?.eventName === "SpendExecuted") {
          updateStep(i, { status: "success", tone: "success", message: "SpendExecuted - funds moved", txHashes });
        } else if (parsed?.eventName === "SpendBlocked") {
          const reason = (parsed.args as { reason: string }).reason;
          updateStep(i, { status: "success", tone: "neutral", message: `SpendBlocked - "${reason}"`, txHashes });
        } else if (parsed?.eventName === "SpendRequested") {
          const id = (parsed.args as { id: bigint }).id;
          updateStep(i, { status: "success", tone: "warning", message: `SpendRequested - queued as #${id} for your approval`, txHashes });
        } else {
          updateStep(i, { status: "success", tone: "neutral", message: "no recognized event emitted", txHashes });
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Demo failed";
      setSteps((prev) => prev.map((s) => (s.status === "running" ? { ...s, status: "success", tone: "neutral", message } : s)));
    } finally {
      setRunning(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Demo"
        subtitle="Spins up a throwaway agent and fires three real spends - executed, queued, and blocked - so you can watch the policy engine react live"
        action={
          <Button size="sm" onClick={run} disabled={running || !address}>
            {running ? "Running..." : "Start demo"}
          </Button>
        }
      />
      <div className="flex flex-col gap-3 p-5">
        <p className="text-xs text-faint">
          Needs mUSDC in your own vault balance (Treasury → Deposit) and a little MON in your wallet for gas.
        </p>
        {steps.map((step, i) => (
          <div key={i} className="flex items-start justify-between gap-3 rounded-xl border border-overlay/8 bg-surface-2/40 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm text-ink">{step.label}</p>
              {step.message ? <p className="mt-1 text-xs text-muted">{step.message}</p> : null}
              {step.detail ? <p className="mt-1 text-xs text-faint">{step.detail}</p> : null}
              {step.txHashes?.length ? (
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                  {step.txHashes.map((t) => (
                    <a
                      key={t.hash}
                      href={explorerTxUrl(t.hash)}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-[11px] text-faint hover:text-primary"
                    >
                      {t.label}: {shortAddress(t.hash, 6)}
                    </a>
                  ))}
                </div>
              ) : null}
            </div>
            {step.status === "running" ? (
              <Badge tone="primary">running...</Badge>
            ) : step.status === "success" ? (
              <Badge tone={step.tone}>{step.tone === "success" ? "executed" : step.tone === "warning" ? "queued" : "blocked"}</Badge>
            ) : null}
          </div>
        ))}
        {demoAgent ? (
          <p className="mt-1 text-[11px] text-faint">
            Demo agent {shortAddress(demoAgent)} is now registered under your account - revoke it from the Agents tab whenever you like.
          </p>
        ) : null}
      </div>
    </Card>
  );
}
