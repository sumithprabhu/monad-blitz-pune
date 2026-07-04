import type { Address } from "viem";
import { formatUnits } from "viem";
import { decideSpend } from "./llm.js";
import { describeOutcome, pollRequestUntilResolved, spend, type SpendOutcome } from "./vaultClient.js";
import { publicClient, getAgentAccount } from "./chain.js";
import { agentVaultAbi } from "./abi.js";
import { requireVaultAddress } from "./config.js";

export interface TaskResult {
  outcome: SpendOutcome;
  finalStatus: "success" | "downsized-abort" | "rejected" | "revoked" | "timed-out";
}

/**
 * Runs one goal-directed spend: asks the LLM (or the offline heuristic) to
 * propose a spend, submits it via Door 1, then handles whichever of the
 * three on-chain outcomes comes back.
 *   success  -> spend executed immediately, task can continue
 *   blocked  -> policy rejected it; the agent downsizes once and retries, else aborts
 *   queued   -> spend exceeded the approval threshold; poll until the owner
 *               approves (continue) or rejects/the agent gets revoked (abort)
 */
export async function runTask(params: {
  goal: string;
  allowedRecipients: Record<string, Address>;
}): Promise<TaskResult> {
  const agentAddress = getAgentAccount().address;
  const vaultAddress = requireVaultAddress();

  const policy = await publicClient.readContract({
    address: vaultAddress,
    abi: agentVaultAbi,
    functionName: "policies",
    args: [agentAddress],
  });
  const [, perTxCap, dailyCap, spentToday] = policy;

  const decision = await decideSpend({
    goal: params.goal,
    allowedRecipients: Object.fromEntries(
      Object.entries(params.allowedRecipients).map(([label, addr]) => [addr, label])
    ),
    perTxCapUsdc: formatUnits(perTxCap, 6),
    dailyCapUsdc: formatUnits(dailyCap, 6),
    spentTodayUsdc: formatUnits(spentToday, 6),
  });

  console.log(`\n[agent] goal: "${params.goal}"`);
  console.log(`[agent] decided: send ${formatUnits(decision.amount, 6)} mUSDC to ${decision.to}`);
  console.log(`[agent] memo: "${decision.memo}"  (${decision.reasoning})`);

  let outcome = await spend(decision.to, decision.amount, decision.memo);
  console.log(`[vault] ${describeOutcome(outcome)}`);

  if (outcome.kind === "blocked" && outcome.reason === "over per-tx cap") {
    const downsized = perTxCap > 0n ? perTxCap : 0n;
    if (downsized > 0n) {
      console.log(`[agent] downsizing to per-tx cap (${formatUnits(downsized, 6)} mUSDC) and retrying once`);
      outcome = await spend(decision.to, downsized, `${decision.memo} (downsized)`);
      console.log(`[vault] ${describeOutcome(outcome)}`);
    }
  }

  if (outcome.kind === "blocked") {
    return { outcome, finalStatus: "downsized-abort" };
  }

  if (outcome.kind === "executed") {
    return { outcome, finalStatus: "success" };
  }

  // queued: poll for the owner's decision
  console.log(`[agent] waiting for owner approval on request #${outcome.requestId}...`);
  try {
    const resolved = await pollRequestUntilResolved(outcome.requestId);
    if (resolved.status === 1) {
      console.log(`[agent] request #${outcome.requestId} approved and executed`);
      return { outcome, finalStatus: "success" };
    }
    if (resolved.status === 2) {
      console.log(`[agent] request #${outcome.requestId} rejected by owner - aborting task`);
      return { outcome, finalStatus: "rejected" };
    }
    console.log(`[agent] request #${outcome.requestId} was cancelled (agent likely revoked) - aborting task`);
    return { outcome, finalStatus: "revoked" };
  } catch (err) {
    console.log(`[agent] gave up waiting for approval: ${(err as Error).message}`);
    return { outcome, finalStatus: "timed-out" };
  }
}
