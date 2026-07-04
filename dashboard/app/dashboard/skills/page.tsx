import { PageHeader } from "@/components/dashboard/PageHeader";
import { SkillsDocPanel } from "@/components/dashboard/SkillsDocPanel";

export default function SkillsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Skills.md" subtitle="Onboarding doc for the agent making requests against your vault." />
      <SkillsDocPanel />
    </div>
  );
}
