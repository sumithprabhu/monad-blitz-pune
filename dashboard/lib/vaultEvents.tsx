"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePublicClient, useWatchContractEvent } from "wagmi";
import type { Log, PublicClient } from "viem";
import { agentVaultAbi } from "./abi";
import { requireVaultAddress } from "./config";
import { fetchGoldskyEvents, isGoldskyConfigured } from "./goldsky";

export type VaultLog = Log<bigint, number, false> & {
  eventName: string;
  args: Record<string, unknown>;
};

interface VaultEventsContextValue {
  events: VaultLog[];
  loading: boolean;
}

const VaultEventsContext = createContext<VaultEventsContextValue>({ events: [], loading: true });

// Bump this if the ABI/event shape ever changes in a way that makes old cached logs unsafe
// to reuse - it's baked into the storage key so old caches are simply ignored, never read.
const CACHE_VERSION = "v1";

function cacheKey(vaultAddress: string) {
  return `leash:events:${CACHE_VERSION}:${vaultAddress.toLowerCase()}`;
}

// localStorage is JSON-only; every bigint (blockNumber, and bigints nested inside `args`
// like amounts/ids/caps) needs a lossless round-trip through a marker object.
function replacer(_key: string, value: unknown) {
  return typeof value === "bigint" ? { __bigint: value.toString() } : value;
}
function reviver(_key: string, value: unknown) {
  if (value && typeof value === "object" && "__bigint" in (value as Record<string, unknown>)) {
    return BigInt((value as { __bigint: string }).__bigint);
  }
  return value;
}

function loadCache(vaultAddress: string): VaultLog[] | null {
  try {
    const raw = localStorage.getItem(cacheKey(vaultAddress));
    if (!raw) return null;
    return JSON.parse(raw, reviver) as VaultLog[];
  } catch {
    return null;
  }
}

function saveCache(vaultAddress: string, events: VaultLog[]) {
  try {
    localStorage.setItem(cacheKey(vaultAddress), JSON.stringify(events, replacer));
  } catch {
    // quota exceeded or storage unavailable (e.g. private browsing) - caching is purely an
    // optimization, so just skip it rather than break the dashboard.
  }
}

/** Some RPCs (Monad's included) cap eth_getLogs to a small block range and error instead of
 * paginating. Try the full range first (fast path for RPCs with no such cap), and only fall
 * back to chunked pagination if the RPC actually complains about the range. */
async function fetchEventsResilient(
  publicClient: PublicClient,
  vaultAddress: `0x${string}`,
  fromBlock: bigint,
  toBlock: bigint
): Promise<VaultLog[]> {
  try {
    return (await publicClient.getContractEvents({
      address: vaultAddress,
      abi: agentVaultAbi,
      fromBlock,
      toBlock,
    })) as unknown as VaultLog[];
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!/range/i.test(message) || toBlock - fromBlock <= 100n) throw err;

    const chunk = 100n;
    const out: VaultLog[] = [];
    for (let from = fromBlock; from <= toBlock; from += chunk) {
      const to = from + chunk - 1n > toBlock ? toBlock : from + chunk - 1n;
      const logs = await publicClient.getContractEvents({
        address: vaultAddress,
        abi: agentVaultAbi,
        fromBlock: from,
        toBlock: to,
      });
      out.push(...(logs as unknown as VaultLog[]));
    }
    return out;
  }
}

function dedupeAndSort(logs: VaultLog[]): VaultLog[] {
  const seen = new Set<string>();
  const out: VaultLog[] = [];
  for (const log of logs) {
    const key = `${log.transactionHash}-${log.logIndex}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(log);
  }
  out.sort((a, b) => (a.blockNumber !== b.blockNumber ? Number(a.blockNumber - b.blockNumber) : a.logIndex - b.logIndex));
  return out;
}

/** Single shared subscription for every AgentVault event. Reconstructs everything
 * (agent discovery, the live feed, the approval queue) from logs - no backend.
 *
 * Backfilling from block 0 directly against the RPC is what made the dashboard feel slow
 * (and Monad's RPCs cap eth_getLogs to a small block range on top of that), so historical
 * events are fetched from a Goldsky subgraph instead - no range limit, indexed, fast -
 * falling back to the direct RPC only if Goldsky isn't configured or errors. The merged
 * result is cached in localStorage (keyed by vault address) so repeat visits only need to
 * fetch events newer than the last block already cached. Live events still come from the
 * RPC's watchContractEvent regardless of which backfill path ran, so new activity shows up
 * immediately rather than waiting on subgraph indexing lag. */
export function VaultEventsProvider({ children }: { children: ReactNode }) {
  const publicClient = usePublicClient();
  const vaultAddress = requireVaultAddress();

  const cached = useMemo(() => loadCache(vaultAddress), [vaultAddress]);

  const [historical, setHistorical] = useState<VaultLog[]>(cached ?? []);
  const [live, setLive] = useState<VaultLog[]>([]);
  const [loading, setLoading] = useState(!cached);

  useEffect(() => {
    let cancelled = false;
    async function loadHistory() {
      const fromBlock = cached && cached.length > 0 ? cached[cached.length - 1].blockNumber + 1n : 0n;

      let logs: VaultLog[] = [];
      let goldskySucceeded = false;
      if (isGoldskyConfigured()) {
        try {
          logs = await fetchGoldskyEvents(fromBlock);
          goldskySucceeded = true;
        } catch (err) {
          console.warn("Goldsky query failed, falling back to direct RPC:", err);
        }
      }
      if (!goldskySucceeded) {
        if (!publicClient) return;
        const toBlock = await publicClient.getBlockNumber();
        if (fromBlock <= toBlock) {
          logs = await fetchEventsResilient(publicClient, vaultAddress, fromBlock, toBlock);
        }
      }

      if (cancelled) return;
      setHistorical((prev) => {
        const merged = dedupeAndSort([...prev, ...logs]);
        saveCache(vaultAddress, merged);
        return merged;
      });
      setLoading(false);
    }
    void loadHistory();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicClient, vaultAddress]);

  useWatchContractEvent({
    address: vaultAddress,
    abi: agentVaultAbi,
    onLogs: (logs) => {
      setLive((prev) => [...prev, ...(logs as unknown as VaultLog[])]);
    },
  });

  const events = useMemo(() => dedupeAndSort([...historical, ...live]), [historical, live]);

  // Keep the cache current as live events stream in too, not just after the initial backfill.
  useEffect(() => {
    if (live.length === 0) return;
    saveCache(vaultAddress, events);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live]);

  return <VaultEventsContext.Provider value={{ events, loading }}>{children}</VaultEventsContext.Provider>;
}

export function useVaultEvents() {
  return useContext(VaultEventsContext);
}
