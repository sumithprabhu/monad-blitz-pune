import type { Address } from "viem";
import { formatUsdc, formatExpiry } from "./format";
import { explorerAddressUrl } from "./config";

export interface AgentDocEntry {
  address: Address;
  active: boolean;
  perTxCap: bigint;
  dailyCap: bigint;
  spentToday: bigint;
  approvalThreshold: bigint;
  validAfter: bigint;
  validUntil: bigint;
  whitelistOnly: boolean;
  whitelist: Address[];
}

export interface SkillsDocParams {
  user: Address;
  vaultAddress: Address;
  tokenAddress: Address | undefined;
  chainId: number;
  rpcUrl: string;
  agents: AgentDocEntry[];
  blacklist: Address[];
}

/** Builds a Skill.md-style doc, generated live from the connected user's own on-chain
 * config, meant to be pasted straight into an agent's system prompt / skill file so it
 * knows exactly how (and how much) it's allowed to spend from this vault. */
export function buildSkillsMarkdown(p: SkillsDocParams): string {
  const lines: string[] = [];
  const push = (s = "") => lines.push(s);

  push(`# Leash Protocol — Agent Spend Skill`);
  push();
  push(
    `You are an autonomous agent authorized to spend from a shared vault on behalf of ` +
      `\`${p.user}\`. You never hold funds yourself - every spend you request is policy-checked ` +
      `on-chain by the AgentVault contract before anything moves. Read this whole document ` +
      `before calling \`spend\`.`
  );
  push();
  push(`## Network`);
  push(`- Chain: Monad Testnet (chainId ${p.chainId})`);
  push(`- RPC: ${p.rpcUrl}`);
  push(`- Vault contract: \`${p.vaultAddress}\` (${explorerAddressUrl(p.vaultAddress)})`);
  if (p.tokenAddress) push(`- Token (mUSDC, 6 decimals): \`${p.tokenAddress}\``);
  push();
  push(`## How to spend`);
  push(
    `Call \`spend(address to, uint256 amount, string memo)\` directly on the vault contract, ` +
      `from your own wallet - you pay your own gas in MON. This is the only write function you ` +
      `should ever call; you are not the vault owner and cannot manage agents, approve requests, ` +
      `deposit, or withdraw.`
  );
  push();
  push("```solidity");
  push(`function spend(address to, uint256 amount, string calldata memo) external`);
  push("```");
  push();
  push("Example (viem):");
  push("```ts");
  push(`await walletClient.writeContract({`);
  push(`  address: "${p.vaultAddress}",`);
  push(`  abi: agentVaultAbi,`);
  push(`  functionName: "spend",`);
  push(`  args: [to, amount, memo],`);
  push(`});`);
  push("```");
  push();
  push(`## What happens after you call spend()`);
  push(`The transaction always succeeds (it never reverts on a policy failure) - check the event it emits:`);
  push(`- **\`SpendExecuted\`** - funds moved. You're done.`);
  push(
    `- **\`SpendBlocked(reason)\`** - nothing moved, no funds at risk. Read \`reason\` and do not ` +
      `retry the identical request; the block is permanent (over cap, not whitelisted, expired, ` +
      `blacklisted recipient, etc.) unless a human changes your policy.`
  );
  push(
    `- **\`SpendRequested(id)\`** - your request is above the approval threshold and is now queued ` +
      `for \`${p.user}\` to approve or reject by hand. Don't re-request the same spend; wait, or ` +
      `tell the human it's pending.`
  );
  push();
  push(`## Ground rules`);
  push(
    `1. Always write a clear, specific memo - it's permanent and public on-chain, and it's how ` +
      `${p.user} audits your spending later.`
  );
  push(
    `2. Never split a payment into smaller amounts to duck under a cap - that's a policy ` +
      `violation even if each individual call would succeed.`
  );
  push(`3. If your address isn't listed below with an active policy, you cannot spend at all.`);
  push();
  push(`## Your agent${p.agents.length === 1 ? "" : "s"}`);

  if (p.agents.length === 0) {
    push();
    push(`_No agents are registered under this vault yet._`);
  }

  for (const a of p.agents) {
    push();
    push(`### \`${a.address}\``);
    push(`| Field | Value |`);
    push(`|---|---|`);
    push(`| Status | ${a.active ? "active" : "**revoked - cannot spend**"} |`);
    push(`| Per-transaction cap | ${formatUsdc(a.perTxCap)} mUSDC |`);
    push(`| Daily cap | ${formatUsdc(a.dailyCap)} mUSDC (spent today: ${formatUsdc(a.spentToday)}) |`);
    push(
      `| Approval threshold | ${a.approvalThreshold === 0n ? "none - always auto-executes under the per-tx cap" : `${formatUsdc(a.approvalThreshold)} mUSDC and above queues for approval`} |`
    );
    push(`| Whitelist enforced | ${a.whitelistOnly ? "yes" : "no"} |`);
    push(`| Valid until | ${formatExpiry(a.validUntil)} |`);

    if (a.whitelistOnly) {
      push();
      push(`**Whitelisted recipients (the only addresses this agent may pay):**`);
      if (a.whitelist.length === 0) {
        push(`- _none yet - this agent cannot successfully spend until at least one is added_`);
      } else {
        for (const r of a.whitelist) push(`- \`${r}\``);
      }
    } else {
      push();
      push(`This agent may pay any address not on the blacklist below.`);
    }
  }

  push();
  push(`## Addresses you must never pay`);
  push(`Blacklisted by \`${p.user}\` - this overrides every agent's whitelist above, with no exceptions.`);
  if (p.blacklist.length === 0) {
    push(`- _none currently_`);
  } else {
    for (const r of p.blacklist) push(`- \`${r}\``);
  }
  push();

  return lines.join("\n");
}
