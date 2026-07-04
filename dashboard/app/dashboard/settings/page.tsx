import { PageHeader } from "@/components/dashboard/PageHeader";
import { CircuitBreakerPanel } from "@/components/dashboard/CircuitBreakerPanel";
import { BlacklistPanel } from "@/components/dashboard/BlacklistPanel";
import { EntryPointAdminPanel } from "@/components/dashboard/EntryPointAdminPanel";

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Settings" subtitle="Controls that apply across all of your agents." />
      <CircuitBreakerPanel />
      <BlacklistPanel />
      <EntryPointAdminPanel />
    </div>
  );
}
