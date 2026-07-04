"use client";

import { useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { useVaultEvents } from "@/lib/vaultEvents";
import { deriveMyAgentAddresses } from "@/lib/derive";
import { AgentCard } from "./AgentCard";
import { AddAgentForm } from "./AddAgentForm";

export function AgentsPanel() {
  const { address } = useAccount();
  const { events, loading } = useVaultEvents();
  const [adding, setAdding] = useState(false);

  const agents = useMemo(() => (address ? deriveMyAgentAddresses(events, address) : []), [events, address]);

  return (
    <Card>
      <CardHeader
        title="Your agents"
        subtitle={`${agents.length} registered by you`}
        action={
          <Button size="sm" onClick={() => setAdding((a) => !a)}>
            {adding ? "Close" : "+ Add agent"}
          </Button>
        }
      />
      {adding ? <AddAgentForm onDone={() => setAdding(false)} /> : null}

      <div className="flex flex-col gap-3 p-5">
        {loading ? (
          <div className="flex items-center justify-center py-4">
            <Spinner />
          </div>
        ) : null}
        {!loading && agents.length === 0 ? (
          <p className="text-sm text-faint">You haven&apos;t registered any agents yet.</p>
        ) : null}
        {agents.map((agent) => (
          <AgentCard key={agent} agent={agent} />
        ))}
      </div>
    </Card>
  );
}
