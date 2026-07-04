import type { Address } from "viem";
import type { VaultLog } from "./vaultEvents";

export interface FeedItem {
  key: string;
  kind: "executed" | "blocked" | "requested";
  agent: Address;
  to: Address;
  amount: bigint;
  memo: string;
  reason?: string;
  requestId?: bigint;
  txHash: string;
  blockNumber: bigint;
}

/** agent -> the user who registered it, reconstructed from AgentRegistered events.
 * Every other per-user filter (feed, requests, agent list) is derived from this map. */
export function deriveAgentOwnerMap(events: VaultLog[]): Map<Address, Address> {
  const map = new Map<Address, Address>();
  for (const log of events) {
    if (log.eventName !== "AgentRegistered") continue;
    const a = log.args as Record<string, unknown>;
    map.set((a.agent as Address).toLowerCase() as Address, (a.user as Address).toLowerCase() as Address);
  }
  return map;
}

function isMine(agent: Address, agentOwners: Map<Address, Address>, user: Address): boolean {
  return agentOwners.get(agent.toLowerCase() as Address) === user.toLowerCase();
}

/** Live spend feed: SpendExecuted (green) / SpendBlocked (grey) / SpendRequested (amber), newest
 * first, scoped to agents owned by `user`. */
export function deriveFeed(events: VaultLog[], agentOwners: Map<Address, Address>, user: Address): FeedItem[] {
  const items: FeedItem[] = [];
  for (const log of events) {
    const a = log.args as Record<string, unknown>;
    if (log.eventName === "SpendExecuted") {
      const agent = a.agent as Address;
      if (!isMine(agent, agentOwners, user)) continue;
      items.push({
        key: `${log.transactionHash}-${log.logIndex}`,
        kind: "executed",
        agent,
        to: a.to as Address,
        amount: a.amount as bigint,
        memo: a.memo as string,
        txHash: log.transactionHash!,
        blockNumber: log.blockNumber!,
      });
    } else if (log.eventName === "SpendBlocked") {
      const agent = a.agent as Address;
      if (!isMine(agent, agentOwners, user)) continue;
      items.push({
        key: `${log.transactionHash}-${log.logIndex}`,
        kind: "blocked",
        agent,
        to: a.to as Address,
        amount: a.amount as bigint,
        memo: a.memo as string,
        reason: a.reason as string,
        txHash: log.transactionHash!,
        blockNumber: log.blockNumber!,
      });
    } else if (log.eventName === "SpendRequested") {
      const agent = a.agent as Address;
      if (!isMine(agent, agentOwners, user)) continue;
      items.push({
        key: `${log.transactionHash}-${log.logIndex}`,
        kind: "requested",
        agent,
        to: a.to as Address,
        amount: a.amount as bigint,
        memo: a.memo as string,
        requestId: a.id as bigint,
        txHash: log.transactionHash!,
        blockNumber: log.blockNumber!,
      });
    }
  }
  return items.reverse();
}

export interface RequestView {
  id: bigint;
  agent: Address;
  to: Address;
  amount: bigint;
  memo: string;
  status: 0 | 1 | 2 | 3; // pending / approved / rejected / cancelled
  finalAmount?: bigint;
  txHash: string;
}

/** Reconstructs the approval queue purely from SpendRequested + resolution events, scoped to
 * agents owned by `user` (only that user can act on these anyway). */
export function deriveRequests(
  events: VaultLog[],
  agentOwners: Map<Address, Address>,
  user: Address
): Map<bigint, RequestView> {
  const requests = new Map<bigint, RequestView>();
  for (const log of events) {
    const a = log.args as Record<string, unknown>;
    if (log.eventName === "SpendRequested") {
      const agent = a.agent as Address;
      if (!isMine(agent, agentOwners, user)) continue;
      const id = a.id as bigint;
      requests.set(id, {
        id,
        agent,
        to: a.to as Address,
        amount: a.amount as bigint,
        memo: a.memo as string,
        status: 0,
        txHash: log.transactionHash!,
      });
    } else if (log.eventName === "RequestApproved") {
      const id = a.id as bigint;
      const existing = requests.get(id);
      if (existing) requests.set(id, { ...existing, status: 1, finalAmount: a.finalAmount as bigint });
    } else if (log.eventName === "RequestRejected") {
      const id = a.id as bigint;
      const existing = requests.get(id);
      if (existing) requests.set(id, { ...existing, status: 2 });
    } else if (log.eventName === "RequestCancelled") {
      const id = a.id as bigint;
      const existing = requests.get(id);
      if (existing) requests.set(id, { ...existing, status: 3 });
    }
  }
  return requests;
}

/** Currently-whitelisted recipients for one agent, reconstructed from RecipientAllowed events
 * (latest allowed/disallowed flag per recipient wins). */
export function deriveWhitelist(events: VaultLog[], agent: Address): Address[] {
  const state = new Map<Address, boolean>();
  for (const log of events) {
    if (log.eventName !== "RecipientAllowed") continue;
    const a = log.args as Record<string, unknown>;
    if ((a.agent as Address).toLowerCase() !== agent.toLowerCase()) continue;
    state.set((a.recipient as Address).toLowerCase() as Address, a.allowed as boolean);
  }
  return [...state.entries()].filter(([, allowed]) => allowed).map(([addr]) => addr);
}

/** Currently-blacklisted recipients for one user, reconstructed from RecipientBlacklisted
 * events. Applies across every agent that user owns. */
export function deriveBlacklist(events: VaultLog[], user: Address): Address[] {
  const state = new Map<Address, boolean>();
  for (const log of events) {
    if (log.eventName !== "RecipientBlacklisted") continue;
    const a = log.args as Record<string, unknown>;
    if ((a.user as Address).toLowerCase() !== user.toLowerCase()) continue;
    state.set((a.recipient as Address).toLowerCase() as Address, a.blocked as boolean);
  }
  return [...state.entries()].filter(([, blocked]) => blocked).map(([addr]) => addr);
}

export interface AgentSpendSummary {
  agent: Address;
  totalExecuted: bigint;
  executedCount: number;
  blockedCount: number;
}

/** Total executed spend (+ executed/blocked counts) per agent owned by `user`, ranked highest
 * spend first. Seeded from every registered agent (not just ones with activity) so a
 * zero-spend agent still shows up as a zero-length bar rather than disappearing. */
export function deriveAgentSpendSummary(
  events: VaultLog[],
  agentOwners: Map<Address, Address>,
  user: Address
): AgentSpendSummary[] {
  const summaries = new Map<Address, AgentSpendSummary>();
  for (const agent of deriveMyAgentAddresses(events, user)) {
    summaries.set(agent, { agent, totalExecuted: 0n, executedCount: 0, blockedCount: 0 });
  }
  for (const log of events) {
    const a = log.args as Record<string, unknown>;
    if (log.eventName === "SpendExecuted") {
      const agent = a.agent as Address;
      const entry = summaries.get(agent);
      if (!entry) continue;
      entry.totalExecuted += a.amount as bigint;
      entry.executedCount += 1;
    } else if (log.eventName === "SpendBlocked") {
      const agent = a.agent as Address;
      const entry = summaries.get(agent);
      if (!entry) continue;
      entry.blockedCount += 1;
    }
  }
  return [...summaries.values()].sort((x, y) => (y.totalExecuted > x.totalExecuted ? 1 : x.totalExecuted > y.totalExecuted ? -1 : 0));
}

/** Every agent registered by `user`, in first-seen order. */
export function deriveMyAgentAddresses(events: VaultLog[], user: Address): Address[] {
  const seen = new Set<Address>();
  const ordered: Address[] = [];
  for (const log of events) {
    if (log.eventName !== "AgentRegistered") continue;
    const a = log.args as Record<string, unknown>;
    if ((a.user as Address).toLowerCase() !== user.toLowerCase()) continue;
    const agent = a.agent as Address;
    if (!seen.has(agent)) {
      seen.add(agent);
      ordered.push(agent);
    }
  }
  return ordered;
}
