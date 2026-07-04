import { PageHeader } from "@/components/dashboard/PageHeader";
import { AgentsPanel } from "@/components/dashboard/AgentsPanel";

export default function AgentsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Agents" subtitle="Register agents, set their spend policy, manage recipients, revoke." />
      <AgentsPanel />
    </div>
  );
}
