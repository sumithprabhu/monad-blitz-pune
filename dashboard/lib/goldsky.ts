import { getAddress } from "viem";
import { goldskySubgraphUrl } from "./config";
import type { VaultLog } from "./vaultEvents";

/**
 * Goldsky's auto-generated subgraph mirrors each Solidity event 1:1 as an entity (plural
 * field name, e.g. spendExecuteds), with standard metadata (id, block_number,
 * transactionHash_) plus the raw event args. The event's own `id` arg (SpendRequested,
 * RequestApproved/Rejected/Cancelled) collides with the entity's own `id` meta-field, so
 * Goldsky renames it to `idParam` - undone below so the rest of the app never has to know
 * this data came from a subgraph instead of raw logs.
 */
const EVENT_SELECTIONS: Record<string, { eventName: string; fields: string; bigintFields: string[] }> = {
  agentRegistereds: {
    eventName: "AgentRegistered",
    fields: "user agent perTxCap dailyCap approvalThreshold validAfter validUntil whitelistOnly",
    bigintFields: ["perTxCap", "dailyCap", "approvalThreshold", "validAfter", "validUntil"],
  },
  spendExecuteds: {
    eventName: "SpendExecuted",
    fields: "agent to amount memo",
    bigintFields: ["amount"],
  },
  spendBlockeds: {
    eventName: "SpendBlocked",
    fields: "agent to amount memo reason",
    bigintFields: ["amount"],
  },
  spendRequesteds: {
    eventName: "SpendRequested",
    fields: "idParam agent to amount memo",
    bigintFields: ["amount"],
  },
  requestApproveds: {
    eventName: "RequestApproved",
    fields: "idParam finalAmount",
    bigintFields: ["finalAmount"],
  },
  requestRejecteds: {
    eventName: "RequestRejected",
    fields: "idParam",
    bigintFields: [],
  },
  requestCancelleds: {
    eventName: "RequestCancelled",
    fields: "idParam",
    bigintFields: [],
  },
  recipientAlloweds: {
    eventName: "RecipientAllowed",
    fields: "agent recipient allowed",
    bigintFields: [],
  },
  recipientBlacklisteds: {
    eventName: "RecipientBlacklisted",
    fields: "user recipient blocked",
    bigintFields: [],
  },
};

const ADDRESS_FIELDS = new Set(["agent", "to", "user", "recipient"]);

export function isGoldskyConfigured(): boolean {
  return Boolean(goldskySubgraphUrl);
}

/** Fetches every event emitted after `fromBlock`, shaped exactly like the VaultLog[] the
 * rest of the app already expects from raw RPC logs - derive.ts and every component that
 * reads `useVaultEvents()` needs zero changes. */
export async function fetchGoldskyEvents(fromBlock: bigint): Promise<VaultLog[]> {
  if (!goldskySubgraphUrl) throw new Error("NEXT_PUBLIC_GOLDSKY_SUBGRAPH_URL is not set");

  const query = `{
    ${Object.entries(EVENT_SELECTIONS)
      .map(
        ([plural, { fields }]) => `
      ${plural}(first: 1000, orderBy: block_number, orderDirection: asc, where: { block_number_gt: "${fromBlock.toString()}" }) {
        id
        block_number
        transactionHash_
        ${fields}
      }
    `
      )
      .join("\n")}
  }`;

  const res = await fetch(goldskySubgraphUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`Goldsky query failed: HTTP ${res.status}`);
  const json = (await res.json()) as { data?: Record<string, unknown[]>; errors?: { message: string }[] };
  if (json.errors?.length) throw new Error(`Goldsky query failed: ${json.errors[0].message}`);
  if (!json.data) throw new Error("Goldsky query returned no data");

  const logs: VaultLog[] = [];
  for (const [plural, { eventName, bigintFields }] of Object.entries(EVENT_SELECTIONS)) {
    const rows = (json.data[plural] ?? []) as Array<Record<string, unknown>>;
    for (const row of rows) {
      const { id, block_number, transactionHash_, idParam, ...rest } = row;
      const args: Record<string, unknown> = { ...rest };
      if (idParam !== undefined) args.id = BigInt(idParam as string);
      for (const key of bigintFields) {
        if (args[key] !== undefined) args[key] = BigInt(args[key] as string);
      }
      for (const key of ADDRESS_FIELDS) {
        if (typeof args[key] === "string") args[key] = getAddress(args[key] as string);
      }
      logs.push({
        eventName,
        args,
        blockNumber: BigInt(block_number as string),
        transactionHash: transactionHash_ as `0x${string}`,
        logIndex: Number((id as string).split("-").pop()),
      } as unknown as VaultLog);
    }
  }
  return logs;
}
