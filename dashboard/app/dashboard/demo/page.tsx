import { PageHeader } from "@/components/dashboard/PageHeader";
import { DemoPanel } from "@/components/dashboard/DemoPanel";

export default function DemoPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Demo" subtitle="One click, three outcomes - watch the policy engine work." />
      <DemoPanel />
    </div>
  );
}
