"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Handshake,
  ArrowUpRight,
  ArrowDownLeft,
  CheckCircle2,
  Users,
  Plus,
} from "lucide-react";

interface MoneyTrackerNavProps {
  activeGivenCount?: number;
  activeTakenCount?: number;
  settledCount?: number;
  peopleCount?: number;
  onOpenCreateModal?: () => void;
}

export function MoneyTrackerNav({
  activeGivenCount = 0,
  activeTakenCount = 0,
  settledCount = 0,
  peopleCount = 0,
  onOpenCreateModal,
}: MoneyTrackerNavProps) {
  const pathname = usePathname();

  const isOverview = pathname === "/money-tracker";
  const isGiven = pathname === "/money-tracker/given";
  const isTaken = pathname === "/money-tracker/taken";
  const isSettled = pathname === "/money-tracker/settled";
  const isPeople = pathname === "/money-tracker/people";

  const tabs = [
    {
      href: "/money-tracker",
      label: "Overview",
      icon: Handshake,
      active: isOverview,
      count: undefined,
    },
    {
      href: "/money-tracker/given",
      label: "Money Given",
      icon: ArrowUpRight,
      active: isGiven,
      count: activeGivenCount,
      countColor: "bg-emerald-500/15 text-emerald-800 dark:text-[#4edea3]",
    },
    {
      href: "/money-tracker/taken",
      label: "Money Taken",
      icon: ArrowDownLeft,
      active: isTaken,
      count: activeTakenCount,
      countColor: "bg-cyan-500/15 text-cyan-800 dark:text-cyan-400",
    },
    {
      href: "/money-tracker/settled",
      label: "Settled",
      icon: CheckCircle2,
      active: isSettled,
      count: settledCount,
      countColor: "bg-slate-500/15 text-slate-800 dark:text-slate-300",
    },
    {
      href: "/money-tracker/people",
      label: "People Directory",
      icon: Users,
      active: isPeople,
      count: peopleCount,
      countColor: "bg-purple-500/15 text-purple-800 dark:text-purple-300",
    },
  ];

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 pb-2 border-b border-[var(--surface-panel-border)] min-w-0">
      {/* Scrollable Subnav Tabs with touch support and smooth scrolling */}
      <nav className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1 px-0.5 min-w-0 flex-1 touch-pan-x">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex items-center gap-2 px-3 sm:px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all touch-manipulation min-h-[38px] shrink-0 ${
                tab.active
                  ? "bg-emerald-500/15 dark:bg-[#10b981]/20 text-emerald-800 dark:text-[#4edea3] font-bold border border-emerald-500/30 dark:border-[#10b981]/40 shadow-sm"
                  : "text-[var(--foreground-muted)] hover:text-[var(--foreground)] hover:bg-slate-200/50 dark:hover:bg-white/[0.04]"
              }`}
            >
              <Icon
                className={`h-4 w-4 shrink-0 ${
                  tab.active ? "text-emerald-700 dark:text-[#4edea3]" : "text-[var(--foreground-subtle)]"
                }`}
              />
              <span>{tab.label}</span>
              {typeof tab.count === "number" && tab.count > 0 && (
                <span
                  className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-full ${
                    tab.countColor || "bg-slate-200/80 dark:bg-white/10"
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* New Agreement Action Button */}
      {onOpenCreateModal && (
        <button
          type="button"
          onClick={onOpenCreateModal}
          className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold text-xs shadow-md shadow-emerald-500/20 active:scale-[0.98] transition-all cursor-pointer shrink-0 w-full sm:w-auto"
        >
          <Plus className="h-4 w-4 stroke-[2.5]" />
          <span>New Agreement</span>
        </button>
      )}
    </div>
  );
}
