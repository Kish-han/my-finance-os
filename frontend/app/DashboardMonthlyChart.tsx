"use client";

import { useState } from "react";
import {
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Clock,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

export type MonthlyDataPoint = {
  monthKey?: string;
  key?: string;
  monthLabel?: string;
  label?: string;
  yearLabel?: string;
  secondaryLabel?: string;
  incomePaise: number;
  expensePaise: number;
  netPaise: number;
  count?: number;
};

export interface DashboardMonthlyChartProps {
  monthlyData?: MonthlyDataPoint[];
  dataPoints?: MonthlyDataPoint[];
  currentMonthExpensePaise?: number;
  currentExpensePaise?: number;
  prevMonthExpensePaise?: number;
  prevExpensePaise?: number;
  currentMonthIncomePaise?: number;
  currentIncomePaise?: number;
  prevMonthIncomePaise?: number;
  prevIncomePaise?: number;
  timeframeLabel?: string;
  emptyMessage?: string;
}

function formatRupees(paise: number | string, fractionDigits = 0): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: fractionDigits,
  }).format(Number(paise) / 100);
}

export function DashboardMonthlyChart({
  monthlyData,
  dataPoints,
  currentMonthExpensePaise,
  currentExpensePaise,
  prevMonthExpensePaise,
  prevExpensePaise,
  currentMonthIncomePaise,
  currentIncomePaise,
  prevMonthIncomePaise,
  prevIncomePaise,
  timeframeLabel = "Cashflow Dynamics",
  emptyMessage,
}: DashboardMonthlyChartProps) {
  const points = dataPoints ?? monthlyData ?? [];
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const curExpense = currentExpensePaise ?? currentMonthExpensePaise ?? 0;
  const prvExpense = prevExpensePaise ?? prevMonthExpensePaise ?? 0;
  const curIncome = currentIncomePaise ?? currentMonthIncomePaise ?? 0;
  const prvIncome = prevIncomePaise ?? prevMonthIncomePaise ?? 0;

  // Maximum value for chart scaling (minimum 1000 rupees to avoid division by zero)
  const maxPaise = Math.max(
    100000,
    ...points.map((d) => Math.max(d.incomePaise, d.expensePaise))
  );

  // =========================================================
  // Period Comparison Expense Calculations
  // =========================================================
  const expenseDiff = curExpense - prvExpense;
  let expensePct = 0;
  if (prvExpense > 0) {
    expensePct = (expenseDiff / prvExpense) * 100;
  } else if (curExpense > 0) {
    expensePct = 100;
  }

  // =========================================================
  // Period Comparison Income Calculations
  // =========================================================
  const incomeDiff = curIncome - prvIncome;
  let incomePct = 0;
  if (prvIncome > 0) {
    incomePct = (incomeDiff / prvIncome) * 100;
  } else if (curIncome > 0) {
    incomePct = 100;
  }

  const activePoint =
    hoveredIdx !== null ? points[hoveredIdx] : points[points.length - 1];

  const totalActivity = points.reduce(
    (sum, p) => sum + (p.incomePaise > 0 || p.expensePaise > 0 ? 1 : 0),
    0
  );

  return (
    <section className="aura-panel p-6 sm:p-7 space-y-6 relative overflow-hidden">
      {/* Ambient background glow */}
      <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-[#10b981]/10 blur-3xl" />
      <div className="pointer-events-none absolute -left-20 -bottom-20 h-56 w-56 rounded-full bg-[#8b5cf6]/10 blur-3xl" />

      {/* Header with Title and Legend */}
      <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/5 border border-white/10 text-[#4edea3]">
              <BarChart3 className="h-4 w-4 shrink-0" />
            </div>
            <h3 className="text-base sm:text-lg font-black tracking-tight text-white">
              {timeframeLabel}
            </h3>
            <Badge
              variant="outline"
              className="text-[10px] uppercase font-bold text-slate-300 border-white/15"
            >
              FINANCIAL TELEMETRY
            </Badge>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Income credits (green) vs recorded expenses and card debits (rose)
          </p>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 text-xs font-semibold">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#4edea3] shadow-[0_0_8px_rgba(78,222,163,0.8)]" />
            <span className="text-slate-300">Income</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#fb7185] shadow-[0_0_8px_rgba(251,113,133,0.8)]" />
            <span className="text-slate-300">Expenses</span>
          </div>
        </div>
      </div>

      {/* Active Point Hover Preview Card */}
      {activePoint && (
        <div className="relative z-10 rounded-2xl bg-white/[0.03] border border-white/10 p-3 sm:p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-slate-400 shrink-0" />
            <span className="text-xs sm:text-sm font-bold text-white">
              {activePoint.label ?? activePoint.monthLabel ?? ""}{" "}
              {activePoint.secondaryLabel ?? activePoint.yearLabel ?? ""} Activity
            </span>
            {activePoint.count !== undefined && activePoint.count > 0 && (
              <span className="text-[10px] font-mono text-slate-400">
                ({activePoint.count} entries)
              </span>
            )}
          </div>

          <div className="flex items-center gap-4 text-xs font-mono">
            <div>
              <span className="text-slate-400 mr-1.5">Income:</span>
              <span className="font-bold text-[#4edea3] tabular-nums">
                +{formatRupees(activePoint.incomePaise)}
              </span>
            </div>
            <div>
              <span className="text-slate-400 mr-1.5">Spent:</span>
              <span className="font-bold text-[#fb7185] tabular-nums">
                −{formatRupees(activePoint.expensePaise)}
              </span>
            </div>
            <div className="hidden sm:block">
              <span className="text-slate-400 mr-1.5">Net:</span>
              <span
                className={`font-bold tabular-nums ${
                  activePoint.netPaise >= 0 ? "text-[#4edea3]" : "text-[#fb7185]"
                }`}
              >
                {activePoint.netPaise >= 0 ? "+" : "−"}
                {formatRupees(Math.abs(activePoint.netPaise))}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* The Restored Interactive Dual Bar Graph or Empty State */}
      {points.length === 0 || totalActivity === 0 ? (
        <div className="relative z-10 rounded-3xl border border-dashed border-white/10 bg-white/[0.02] p-10 text-center">
          <div className="mx-auto flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/5 text-slate-400">
            <BarChart3 className="h-6 w-6 shrink-0" />
          </div>
          <h4 className="mt-3 text-sm font-bold text-white">
            No transactions in this period
          </h4>
          <p className="mt-1 text-xs text-slate-400 max-w-sm mx-auto">
            {emptyMessage ||
              "Select a different time range or record a transaction below to see your cashflow dynamics visualised here."}
          </p>
        </div>
      ) : (
        <div className="relative z-10 pt-4">
          <div className="relative h-48 sm:h-56 flex items-end justify-between gap-1 sm:gap-4 border-b border-white/15 pb-2 overflow-x-auto">
            {/* Dotted horizontal reference lines */}
            <div className="pointer-events-none absolute inset-x-0 top-0 border-b border-white/5 border-dashed" />
            <div className="pointer-events-none absolute inset-x-0 top-1/2 border-b border-white/5 border-dashed" />

            {points.map((point, idx) => {
              const incomeHeightPct = Math.max(
                point.incomePaise > 0 ? 4 : 0,
                Math.round((point.incomePaise / maxPaise) * 100)
              );
              const expenseHeightPct = Math.max(
                point.expensePaise > 0 ? 4 : 0,
                Math.round((point.expensePaise / maxPaise) * 100)
              );
              const isHovered = hoveredIdx === idx;
              const pointKey =
                point.key ?? point.monthKey ?? `point-${idx}`;
              const labelText =
                point.label ?? point.monthLabel ?? "";

              return (
                <div
                  key={pointKey}
                  onMouseEnter={() => setHoveredIdx(idx)}
                  onMouseLeave={() => setHoveredIdx(null)}
                  className={`relative flex-1 min-w-[24px] sm:min-w-[36px] flex flex-col items-center justify-end h-full group cursor-pointer transition-all ${
                    isHovered ? "scale-105" : "opacity-90 hover:opacity-100"
                  }`}
                >
                  {/* Dual Bars Container */}
                  <div className="w-full flex items-end justify-center gap-1 sm:gap-1.5 h-full pb-1">
                    {/* Income Bar (Emerald) */}
                    <div
                      style={{ height: `${incomeHeightPct}%` }}
                      className="w-1/2 max-w-[16px] sm:max-w-[20px] rounded-t-md sm:rounded-t-lg bg-gradient-to-t from-emerald-600 via-[#10b981] to-[#4edea3] transition-all duration-300 shadow-[0_0_12px_rgba(16,185,129,0.3)] hover:brightness-125"
                      title={`Income: ${formatRupees(point.incomePaise)}`}
                    />

                    {/* Expense Bar (Rose) */}
                    <div
                      style={{ height: `${expenseHeightPct}%` }}
                      className="w-1/2 max-w-[16px] sm:max-w-[20px] rounded-t-md sm:rounded-t-lg bg-gradient-to-t from-rose-600 via-[#f43f5e] to-[#fb7185] transition-all duration-300 shadow-[0_0_12px_rgba(244,63,94,0.3)] hover:brightness-125"
                      title={`Expenses: ${formatRupees(point.expensePaise)}`}
                    />
                  </div>

                  {/* Label */}
                  <div className="mt-2 text-center w-full px-0.5">
                    <span
                      className={`block text-[10px] sm:text-xs font-bold truncate transition-colors ${
                        isHovered ? "text-white" : "text-slate-400"
                      }`}
                    >
                      {labelText}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* =========================================================
          Period Comparison Metric Cards
      ========================================================= */}
      {(prvExpense > 0 || prvIncome > 0 || curExpense > 0 || curIncome > 0) && (
        <div className="relative z-10 grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          {/* Expense Comparison Card */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 sm:p-5 backdrop-blur-md transition-all hover:border-white/20">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Expenses vs Prior Period
              </span>
              <div
                className={`flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black tabular-nums ${
                  expenseDiff > 0
                    ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                    : expenseDiff < 0
                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                    : "bg-white/10 text-slate-300 border border-white/10"
                }`}
              >
                {expenseDiff > 0 ? (
                  <>
                    <ArrowUpRight className="h-3.5 w-3.5 shrink-0" />
                    <span>+{expensePct.toFixed(1)}%</span>
                  </>
                ) : expenseDiff < 0 ? (
                  <>
                    <ArrowDownRight className="h-3.5 w-3.5 shrink-0" />
                    <span>{expensePct.toFixed(1)}%</span>
                  </>
                ) : (
                  <>
                    <Minus className="h-3.5 w-3.5 shrink-0" />
                    <span>0.0%</span>
                  </>
                )}
              </div>
            </div>

            <div className="mt-3">
              <div className="text-xl sm:text-2xl font-black text-white tabular-nums">
                {expenseDiff > 0
                  ? `+${formatRupees(expenseDiff)}`
                  : expenseDiff < 0
                  ? `−${formatRupees(Math.abs(expenseDiff))}`
                  : "No change"}
              </div>
              <p className="mt-1 text-xs text-slate-400">
                {expenseDiff > 0 ? (
                  <span className="text-rose-400">
                    Expenses increased by {Math.abs(expensePct).toFixed(1)}% compared to the prior period.
                  </span>
                ) : expenseDiff < 0 ? (
                  <span className="text-emerald-400">
                    Saved {formatRupees(Math.abs(expenseDiff))} ({Math.abs(expensePct).toFixed(1)}% reduction) vs prior period.
                  </span>
                ) : (
                  <span>Spending matched the prior period&apos;s level exactly.</span>
                )}
              </p>
            </div>
          </div>

          {/* Income Comparison Card */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 sm:p-5 backdrop-blur-md transition-all hover:border-white/20">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Income vs Prior Period
              </span>
              <div
                className={`flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black tabular-nums ${
                  incomeDiff > 0
                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                    : incomeDiff < 0
                    ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                    : "bg-white/10 text-slate-300 border border-white/10"
                }`}
              >
                {incomeDiff > 0 ? (
                  <>
                    <ArrowUpRight className="h-3.5 w-3.5 shrink-0" />
                    <span>+{incomePct.toFixed(1)}%</span>
                  </>
                ) : incomeDiff < 0 ? (
                  <>
                    <ArrowDownRight className="h-3.5 w-3.5 shrink-0" />
                    <span>{incomePct.toFixed(1)}%</span>
                  </>
                ) : (
                  <>
                    <Minus className="h-3.5 w-3.5 shrink-0" />
                    <span>0.0%</span>
                  </>
                )}
              </div>
            </div>

            <div className="mt-3">
              <div className="text-xl sm:text-2xl font-black text-white tabular-nums">
                {incomeDiff > 0
                  ? `+${formatRupees(incomeDiff)}`
                  : incomeDiff < 0
                  ? `−${formatRupees(Math.abs(incomeDiff))}`
                  : "No change"}
              </div>
              <p className="mt-1 text-xs text-slate-400">
                {incomeDiff > 0 ? (
                  <span className="text-emerald-400">
                    Income increased by {Math.abs(incomePct).toFixed(1)}% compared to the prior period.
                  </span>
                ) : incomeDiff < 0 ? (
                  <span className="text-rose-400">
                    Inflow decreased by {Math.abs(incomePct).toFixed(1)}% compared to the prior period.
                  </span>
                ) : (
                  <span>Income matched the prior period&apos;s level exactly.</span>
                )}
              </p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
