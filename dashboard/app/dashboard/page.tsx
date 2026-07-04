import { PageHeader } from "@/components/dashboard/PageHeader";
import { Overview } from "@/components/dashboard/Overview";
import { SpendByAgentChart } from "@/components/dashboard/SpendByAgentChart";
import { ApprovalQueuePanel } from "@/components/dashboard/ApprovalQueuePanel";
import { LiveFeedPanel } from "@/components/dashboard/LiveFeedPanel";

export default function DashboardOverviewPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Dashboard" subtitle="What needs your attention, and what just happened." />
      <Overview />

      {/* Left: what needs action, then supporting context. Right: a continuously-updating
          audit rail - it's a self-contained scrolling list, so it reads naturally as a
          sidebar next to the actionable content rather than one more full-width block. */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <ApprovalQueuePanel />
          <SpendByAgentChart />
        </div>
        <div className="lg:col-span-1">
          <LiveFeedPanel />
        </div>
      </div>
    </div>
  );
}
