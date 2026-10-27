"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export type DebtScheduleOption = {
  id: string;
  name: string;
  lenderName: string | null;
};

type DebtScheduleSelectorProps = {
  debts: DebtScheduleOption[];
  selectedDebtId: string;
};

export default function DebtScheduleSelector({
  debts,
  selectedDebtId,
}: DebtScheduleSelectorProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const handleSelectChange = (newDebtId: string) => {
    const params = new URLSearchParams(searchParams ? searchParams.toString() : "");
    params.set("debt_id", newDebtId);
    const targetUrl = `${pathname || "/emi/schedule"}?${params.toString()}`;
    router.push(targetUrl);
  };

  return (
    <div className="flex items-center gap-2">
      <label
        htmlFor="debt-schedule-select"
        className="text-xs font-semibold text-slate-400 whitespace-nowrap"
      >
        Select loan:
      </label>
      <select
        id="debt-schedule-select"
        name="debt_id"
        value={selectedDebtId}
        onChange={(e) => handleSelectChange(e.target.value)}
        className="rounded-xl border border-white/10 bg-slate-900/80 px-3 py-2 text-xs font-bold text-cyan-300 outline-none transition-all focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20"
      >
        {debts.map((d) => (
          <option key={d.id} value={d.id} className="bg-slate-900 text-white">
            {d.name} {d.lenderName ? `(${d.lenderName})` : ""}
          </option>
        ))}
      </select>
    </div>
  );
}
