import { PageHeader } from "@/components/dashboard/PageHeader";
import { TreasuryBalance } from "@/components/dashboard/TreasuryBalance";
import { DepositCard } from "@/components/dashboard/DepositCard";
import { WithdrawCard } from "@/components/dashboard/WithdrawCard";

export default function TreasuryPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Treasury" subtitle="Funds held by the vault. Only the owner can move them." />
      <TreasuryBalance />
      <div className="grid gap-6 sm:grid-cols-2">
        <DepositCard />
        <WithdrawCard />
      </div>
    </div>
  );
}
