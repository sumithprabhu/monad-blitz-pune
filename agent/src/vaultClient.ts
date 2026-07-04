import { type Address, type Hex, parseEventLogs } from "viem";
import { agentVaultAbi } from "./abi.js";
import { publicClient, getAgentWalletClient, explorerTxUrl } from "./chain.js";
import { config, requireVaultAddress } from "./config.js";

export type SpendOutcome =
  | { kind: "executed"; txHash: Hex; agent: Address; to: Address; amount: bigint; memo: string }
  | { kind: "blocked"; txHash: Hex; reason: string; agent: Address; to: Address; amount: bigint; memo: string }
  | { kind: "queued"; txHash: Hex; requestId: bigint; agent: Address; to: Address; amount: bigint; memo: string };

export interface PendingRequest {
  id: bigint;
  agent: Address;
  to: Address;
  amount: bigint;
  memo: string;
  createdAt: bigint;
  status: number; // 0 pending, 1 approved/executed, 2 rejected, 3 cancelled
}

/**
 * Door 1: agent calls vault.spend() directly from its own EOA, pays its own gas.
 * Decodes the emitted event to tell the caller whether the spend executed,
 * was blocked by policy, or was queued for owner approval.
 */
export async function spend(to: Address, amount: bigint, memo: string): Promise<SpendOutcome> {
  const vaultAddress = requireVaultAddress();
  const { walletClient, account } = getAgentWalletClient();

  const hash = await walletClient.writeContract({
    address: vaultAddress,
    abi: agentVaultAbi,
    functionName: "spend",
    args: [to, amount, memo],
  });

  console.log(`  tx submitted: ${explorerTxUrl(hash)}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  const logs = parseEventLogs({ abi: agentVaultAbi, logs: receipt.logs });
  for (const log of logs) {
    if (log.eventName === "SpendExecuted") {
      return { kind: "executed", txHash: hash, agent: account.address, to, amount, memo };
    }
    if (log.eventName === "SpendBlocked") {
      return { kind: "blocked", txHash: hash, reason: log.args.reason, agent: account.address, to, amount, memo };
    }
    if (log.eventName === "SpendRequested") {
      return { kind: "queued", txHash: hash, requestId: log.args.id, agent: account.address, to, amount, memo };
    }
  }

  throw new Error(`spend() tx ${hash} did not emit a recognized event`);
}

export async function getRequest(id: bigint): Promise<PendingRequest> {
  const vaultAddress = requireVaultAddress();
  const r = await publicClient.readContract({
    address: vaultAddress,
    abi: agentVaultAbi,
    functionName: "getRequest",
    args: [id],
  });
  return r as unknown as PendingRequest;
}

/** Poll getRequest(id) until the owner approves/rejects it (or it's cancelled by a revoke). */
export async function pollRequestUntilResolved(
  id: bigint,
  opts: { timeoutMs?: number; intervalMs?: number } = {}
): Promise<PendingRequest> {
  const timeoutMs = opts.timeoutMs ?? config.approvalPollTimeoutMs;
  const intervalMs = opts.intervalMs ?? config.pollIntervalMs;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const req = await getRequest(id);
    if (req.status !== 0) return req;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Timed out after ${timeoutMs}ms waiting for request #${id} to resolve`);
}

export function describeOutcome(o: SpendOutcome): string {
  switch (o.kind) {
    case "executed":
      return `EXECUTED: sent ${o.amount} to ${o.to} ("${o.memo}")`;
    case "blocked":
      return `BLOCKED: ${o.reason} (attempted ${o.amount} to ${o.to}, "${o.memo}")`;
    case "queued":
      return `QUEUED as request #${o.requestId}: ${o.amount} to ${o.to} ("${o.memo}") awaiting owner approval`;
  }
}
