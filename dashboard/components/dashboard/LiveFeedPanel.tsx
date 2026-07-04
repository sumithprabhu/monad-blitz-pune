"use client";

import { useMemo } from "react";
import { useAccount } from "wagmi";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { useVaultEvents } from "@/lib/vaultEvents";
import { deriveAgentOwnerMap, deriveFeed, type FeedItem } from "@/lib/derive";
import { formatUsdc } from "@/lib/format";
import { explorerTxUrl, shortAddress } from "@/lib/config";

const kindMeta: Record<FeedItem["kind"], { tone: "success" | "neutral" | "warning"; label: string }> = {
  executed: { tone: "success", label: "executed" },
  blocked: { tone: "neutral", label: "blocked" },
  requested: { tone: "warning", label: "queued" },
};

export function LiveFeedPanel() {
  const { address } = useAccount();
  const { events, loading } = useVaultEvents();
  const feed = useMemo(() => {
    if (!address) return [];
    const agentOwners = deriveAgentOwnerMap(events);
    return deriveFeed(events, agentOwners, address);
  }, [events, address]);

  return (
    <Card>
      <CardHeader title="Live spend feed" subtitle="Every spend attempt from your agents, reconstructed from on-chain events" />
      <div className="scrollbar-thin flex max-h-[560px] flex-col divide-y divide-overlay/6 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Spinner />
          </div>
        ) : null}
        {!loading && feed.length === 0 ? <p className="p-5 text-sm text-faint">No spend activity yet.</p> : null}
        {feed.map((item) => (
          <FeedRow key={item.key} item={item} />
        ))}
      </div>
    </Card>
  );
}

function FeedRow({ item }: { item: FeedItem }) {
  const meta = kindMeta[item.kind];
  return (
    <a
      href={explorerTxUrl(item.txHash)}
      target="_blank"
      rel="noreferrer"
      className="flex items-start justify-between gap-3 px-5 py-3.5 transition-colors hover:bg-overlay/[0.03]"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <Badge tone={meta.tone}>{meta.label}</Badge>
          <span className="font-mono text-xs text-faint">{shortAddress(item.agent)}</span>
          <span className="text-xs text-faint">→</span>
          <span className="font-mono text-xs text-faint">{shortAddress(item.to)}</span>
        </div>
        <p className="mt-1.5 truncate text-sm text-ink">{item.memo}</p>
        {item.reason ? <p className="mt-0.5 text-xs text-danger/80">{item.reason}</p> : null}
      </div>
      <span className="whitespace-nowrap font-mono text-sm text-ink">{formatUsdc(item.amount)}</span>
    </a>
  );
}
