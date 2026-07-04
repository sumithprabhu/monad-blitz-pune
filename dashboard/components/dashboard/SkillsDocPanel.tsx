"use client";

import { useMemo, useState } from "react";
import { useAccount } from "wagmi";
import type { Address } from "viem";
import { Copy, Check } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useVaultEvents } from "@/lib/vaultEvents";
import { deriveMyAgentAddresses, deriveWhitelist, deriveBlacklist } from "@/lib/derive";
import { useAgentPoliciesBatch } from "@/lib/reads";
import { requireVaultAddress, tokenAddress, chainId, rpcUrl } from "@/lib/config";
import { buildSkillsMarkdown, type AgentDocEntry } from "@/lib/skillsDoc";

export function SkillsDocPanel() {
  const { address } = useAccount();
  const { events } = useVaultEvents();
  const [copied, setCopied] = useState(false);

  const agentAddresses = useMemo(() => (address ? deriveMyAgentAddresses(events, address) : []), [events, address]);
  const { data: policyResults } = useAgentPoliciesBatch(agentAddresses);

  const markdown = useMemo(() => {
    if (!address) return "";

    const agents: AgentDocEntry[] = agentAddresses.map((agent, i) => {
      const result = policyResults?.[i]?.result as
        | readonly [boolean, bigint, bigint, bigint, bigint, bigint, bigint, bigint, boolean]
        | undefined;
      const [active, perTxCap, dailyCap, spentToday, , approvalThreshold, validAfter, validUntil, whitelistOnly] =
        result ?? [false, 0n, 0n, 0n, 0n, 0n, 0n, 0n, false];
      return {
        address: agent,
        active,
        perTxCap,
        dailyCap,
        spentToday,
        approvalThreshold,
        validAfter,
        validUntil,
        whitelistOnly,
        whitelist: deriveWhitelist(events, agent),
      };
    });

    return buildSkillsMarkdown({
      user: address,
      vaultAddress: requireVaultAddress(),
      tokenAddress: tokenAddress as Address | undefined,
      chainId,
      rpcUrl,
      agents,
      blacklist: deriveBlacklist(events, address),
    });
  }, [address, agentAddresses, policyResults, events]);

  async function copy() {
    await navigator.clipboard.writeText(markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Card>
      <CardHeader
        title="Skills.md"
        subtitle="Paste this into your agent's system prompt or skill file - it's generated live from your own vault config"
        action={
          <Button size="sm" variant="secondary" onClick={copy} disabled={!markdown}>
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? "Copied" : "Copy"}
          </Button>
        }
      />
      <pre className="scrollbar-thin max-h-[70vh] overflow-auto whitespace-pre-wrap break-words p-5 font-mono text-xs leading-relaxed text-muted">
        {markdown || "Connect a wallet to generate your doc."}
      </pre>
    </Card>
  );
}
