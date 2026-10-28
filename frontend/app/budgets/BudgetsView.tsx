"use client";

import { useState } from "react";
import Link from "next/link";
import {
  PieChart,
  Plus,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  Clock,
  Pencil,
  Trash2,
  ExternalLink,
  ShieldAlert,
  Bell,
  Check,
} from "lucide-react";
import {
  type CategoryBudget,
  type BudgetAlertEvent,
  type MonthlyBudgetOverview,
  type CategorySpendingSummary,
  formatRupees,
  getRelativeMonthKey,
  getCurrentMonthKey,
} from "@/lib/finance/budget-engine";
import { CategoryBudgetModal } from "./CategoryBudgetModal";
import { deleteCategoryBudget, acknowledgeBudgetAlert } from "./actions";

interface Props {
  overview: MonthlyBudgetOverview;
  allBudgets: CategoryBudget[];
  alertEvents: BudgetAlertEvent[];
  availableCategories: string[];
  tableMissing?: boolean;
  errorCode?: string;
  savedSuccess?: boolean;
  updatedSuccess?: boolean;
  deletedSuccess?: boolean;
}

export function BudgetsView({
  overview,
  allBudgets,
  alertEvents,
  availableCategories,
  tableMissing,
  errorCode,
  savedSuccess,
  updatedSuccess,
  deletedSuccess,
}: Props) {
  const currentSystemMonth = getCurrentMonthKey();
  const isViewingCurrentMonth = overview.monthKey === currentSystemMonth;

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [budgetToEdit, setBudgetToEdit] = useState<CategoryBudget | null>(null);

  // Active unacknowledged alerts for this month
  const activeAlerts = alertEvents.filter(
    (a) => a.month_key === overview.monthKey && !a.is_acknowledged
  );

  // Helper to open edit modal
  function handleEditBudget(summary: CategorySpendingSummary) {
    const rawBudget = allBudgets.find((b) => b.id === summary.budgetId) ?? null;
    setBudgetToEdit(rawBudget);
    setIsModalOpen(true);
  }

  function handleCreateBudget() {
    setBudgetToEdit(null);
    setIsModalOpen(true);
  }

  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-300">
      {/* =========================================================
          1. HEADER & MONTH NAVIGATOR
      ========================================================= */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/30">
              <PieChart className="h-4 w-4" />
            </div>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
              Monthly Budgets & Alerts
            </h1>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Set category limits, monitor spending progress, and prevent budget overruns.
          </p>
        </div>

        {/* Action Controls & Month Switcher */}
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-center">
          {/* Month Selector Pill */}
          <div className="flex items-center rounded-2xl border border-white/10 bg-white/5 p-1 backdrop-blur-xl">
            <Link
              href={`/budgets?month=${getRelativeMonthKey(overview.monthKey, -1)}`}
              title="Previous Month"
              className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-all cursor-pointer"
            >
              <ChevronLeft className="h-4 w-4" />
            </Link>

            <div className="px-3 text-center min-w-[120px]">
              <span className="text-xs font-black text-white whitespace-nowrap">
                {overview.monthLabel}
              </span>
            </div>

            <Link
              href={`/budgets?month=${getRelativeMonthKey(overview.monthKey, 1)}`}
              title="Next Month"
              className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-all cursor-pointer"
            >
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>

          {!isViewingCurrentMonth && (
            <Link
              href={`/budgets?month=${currentSystemMonth}`}
              className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-slate-300 hover:text-white hover:bg-white/10 transition-all cursor-pointer"
            >
              Current Month
            </Link>
          )}

          <button
            type="button"
            onClick={handleCreateBudget}
            className="inline-flex items-center gap-1.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-2 text-xs font-bold text-slate-950 shadow-md shadow-emerald-500/20 hover:brightness-110 active:scale-95 transition-all cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>Create Budget</span>
          </button>
        </div>
      </div>

      {/* =========================================================
          2. NOTIFICATIONS & ALERTS
      ========================================================= */}
      {tableMissing && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-950/40 p-4 text-xs sm:text-sm font-semibold text-amber-300 shadow-xl backdrop-blur-xl"
        >
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5 text-amber-400" />
          <div className="space-y-1">
            <p className="font-bold text-amber-200">Database Migration Pending</p>
            <p className="text-xs text-amber-300/90 font-normal">
              Please apply the migration at{" "}
              <code className="bg-amber-950/80 px-1 py-0.5 rounded font-mono text-[11px]">
                supabase/migrations/20261028160000_create_category_budgets.sql
              </code>{" "}
              in your Supabase SQL editor to create the category budgets and alert tables.
            </p>
          </div>
        </div>
      )}

      {savedSuccess && (
        <div
          role="status"
          className="flex items-center gap-2.5 rounded-2xl border border-emerald-500/30 bg-emerald-950/40 p-3.5 text-xs font-semibold text-emerald-300 backdrop-blur-md shadow-lg"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
          <span>Category budget saved successfully. Real-time spending is now tracking.</span>
        </div>
      )}

      {updatedSuccess && (
        <div
          role="status"
          className="flex items-center gap-2.5 rounded-2xl border border-emerald-500/30 bg-emerald-950/40 p-3.5 text-xs font-semibold text-emerald-300 backdrop-blur-md shadow-lg"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
          <span>Budget status updated successfully.</span>
        </div>
      )}

      {deletedSuccess && (
        <div
          role="status"
          className="flex items-center gap-2.5 rounded-2xl border border-white/10 bg-white/5 p-3.5 text-xs font-semibold text-slate-300 backdrop-blur-md shadow-lg"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0 text-slate-400" />
          <span>Budget removed successfully.</span>
        </div>
      )}

      {errorCode && (
        <div
          role="alert"
          className="rounded-2xl border border-rose-500/30 bg-rose-950/40 p-4 text-xs font-semibold text-rose-300 backdrop-blur-xl"
        >
          {errorCode === "invalid-amount"
            ? "Please enter a valid monthly budget limit in ₹."
            : errorCode === "missing-category"
            ? "Please specify a spending category."
            : "An unexpected error occurred while saving your budget."}
        </div>
      )}

      {/* Active Threshold Alert Banners (if any) */}
      {activeAlerts.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-300">
            <Bell className="h-4 w-4 text-amber-400 animate-pulse" />
            <span>Active Spending Alerts ({activeAlerts.length})</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {activeAlerts.map((alert) => {
              const isOver = alert.threshold_percent === 100;
              return (
                <div
                  key={alert.id}
                  className={`p-4 rounded-3xl border backdrop-blur-xl flex items-center justify-between gap-3 shadow-lg ${
                    isOver
                      ? "border-rose-500/40 bg-rose-950/30"
                      : "border-amber-500/40 bg-amber-950/30"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl ${
                        isOver
                          ? "bg-rose-500/20 text-rose-400"
                          : "bg-amber-500/20 text-amber-400"
                      }`}
                    >
                      <ShieldAlert className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-black text-white truncate">
                          {alert.category_name}
                        </span>
                        <span
                          className={`text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded-md ${
                            isOver
                              ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                              : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                          }`}
                        >
                          {alert.threshold_percent}% Limit Reached
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-300 mt-0.5">
                        Spent {formatRupees(alert.spending_paise)} of{" "}
                        {formatRupees(alert.budget_paise)} limit
                      </p>
                    </div>
                  </div>

                  <form action={acknowledgeBudgetAlert} className="shrink-0">
                    <input type="hidden" name="alertId" value={alert.id} />
                    <input type="hidden" name="returnTo" value={`/budgets?month=${overview.monthKey}`} />
                    <button
                      type="submit"
                      title="Acknowledge this alert"
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-[11px] font-bold transition-all cursor-pointer"
                    >
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                      <span>Dismiss</span>
                    </button>
                  </form>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* =========================================================
          3. MONTHLY OVERVIEW METRICS
      ========================================================= */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Budget */}
        <div className="aura-panel p-4 sm:p-5 relative overflow-hidden group hover:border-[#4edea3]/40 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Total Budget
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-slate-300">
              {overview.categoriesCount} {overview.categoriesCount === 1 ? "CATEGORY" : "CATEGORIES"}
            </span>
          </div>
          <p className="mt-2 text-2xl sm:text-3xl font-black text-white tabular-nums drop-shadow-sm">
            {formatRupees(overview.totalBudgetPaise)}
          </p>
          <p className="mt-1 text-[11px] text-slate-400">
            Planned monthly limit for {overview.monthLabel}
          </p>
        </div>

        {/* Actual Spending */}
        <div className="aura-panel p-4 sm:p-5 relative overflow-hidden group hover:border-[#4edea3]/40 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Actual Spending
            </span>
            <span
              className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full border ${
                overview.overallPercentageUsed > 100
                  ? "bg-rose-500/20 text-rose-300 border-rose-500/40"
                  : overview.overallPercentageUsed >= 80
                  ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                  : "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
              }`}
            >
              {Math.round(overview.overallPercentageUsed)}% CONSUMED
            </span>
          </div>
          <p className="mt-2 text-2xl sm:text-3xl font-black text-white tabular-nums drop-shadow-sm">
            {formatRupees(overview.totalActualSpendingPaise)}
          </p>
          <div className="mt-2 h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                overview.overallPercentageUsed > 100
                  ? "bg-rose-500"
                  : overview.overallPercentageUsed >= 80
                  ? "bg-amber-400"
                  : "bg-[#4edea3]"
              }`}
              style={{ width: `${Math.min(100, overview.overallPercentageUsed)}%` }}
            />
          </div>
        </div>

        {/* Remaining Budget / Overspent */}
        <div
          className={`aura-panel p-4 sm:p-5 relative overflow-hidden group transition-all ${
            overview.totalOverspentPaise > 0
              ? "hover:border-rose-500/40"
              : "hover:border-[#4edea3]/40"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              {overview.totalOverspentPaise > 0 ? "Total Overspent" : "Remaining Budget"}
            </span>
            <span
              className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full border ${
                overview.totalOverspentPaise > 0
                  ? "bg-rose-500/20 text-rose-300 border-rose-500/40"
                  : "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
              }`}
            >
              {overview.totalOverspentPaise > 0 ? "DEFICIT" : "AVAILABLE"}
            </span>
          </div>
          <p
            className={`mt-2 text-2xl sm:text-3xl font-black tabular-nums drop-shadow-sm ${
              overview.totalOverspentPaise > 0 ? "text-rose-400" : "text-[#4edea3]"
            }`}
          >
            {overview.totalOverspentPaise > 0
              ? `−${formatRupees(overview.totalOverspentPaise)}`
              : `+${formatRupees(overview.totalRemainingPaise)}`}
          </p>
          <p className="mt-1 text-[11px] text-slate-400">
            {overview.totalOverspentPaise > 0
              ? "Actual spending exceeds total monthly budget"
              : "Unused buffer across configured categories"}
          </p>
        </div>

        {/* Health Status Breakdown */}
        <div className="aura-panel p-4 sm:p-5 relative overflow-hidden group hover:border-[#4edea3]/40 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Budget Health
            </span>
            <span className="text-[10px] font-mono text-slate-400">
              {overview.categoriesCount} Total
            </span>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-black text-emerald-400 tabular-nums">
              {overview.withinLimitCount}
            </span>
            <span className="text-xs text-slate-400">within limits</span>
          </div>
          <div className="mt-1 flex items-center gap-3 text-[11px] text-slate-400">
            {overview.approachingCount + overview.nearLimitCount > 0 && (
              <span className="text-amber-400 font-semibold">
                {overview.approachingCount + overview.nearLimitCount} approaching
              </span>
            )}
            {overview.exceededCount > 0 && (
              <span className="text-rose-400 font-semibold">
                {overview.exceededCount} exceeded
              </span>
            )}
            {overview.approachingCount + overview.nearLimitCount === 0 &&
              overview.exceededCount === 0 && (
                <span className="text-slate-500">All categories healthy</span>
              )}
          </div>
        </div>
      </section>

      {/* =========================================================
          4. CATEGORY BUDGET CARDS GRID
      ========================================================= */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PieChart className="h-4 w-4 text-[#4edea3]" />
            <h2 className="text-base sm:text-lg font-bold tracking-tight text-white">
              Category Budgets ({overview.categorySummaries.length})
            </h2>
          </div>
          <span className="text-[10px] font-mono uppercase tracking-widest text-[#4edea3]">
            {overview.monthLabel}
          </span>
        </div>

        {overview.categorySummaries.length === 0 ? (
          /* Informative Empty State */
          <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.02] p-8 sm:p-12 text-center backdrop-blur-md">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/30">
              <PieChart className="h-7 w-7" />
            </div>
            <h3 className="mt-4 text-base sm:text-lg font-bold text-white">
              No Budgets Configured for {overview.monthLabel}
            </h3>
            <p className="mt-1.5 max-w-md mx-auto text-xs text-slate-400 leading-relaxed">
              Assign monthly spending targets to your top categories like Groceries, Shopping,
              Dining, or Utilities to track progress and receive timely threshold alerts.
            </p>
            <button
              type="button"
              onClick={handleCreateBudget}
              className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 px-5 py-2.5 text-xs font-bold text-slate-950 shadow-md shadow-emerald-500/20 hover:brightness-110 active:scale-95 transition-all cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              <span>Create Your First Budget</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {overview.categorySummaries.map((cat) => {
              const isOver = cat.isOverspent;
              const isWarning80 = cat.status === "warning_80";
              const isWarning50 = cat.status === "warning_50";

              const badgeColor = isOver
                ? "bg-rose-500/20 text-rose-300 border-rose-500/40"
                : isWarning80
                ? "bg-orange-500/20 text-orange-300 border-orange-500/40"
                : isWarning50
                ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                : "bg-emerald-500/20 text-emerald-300 border-emerald-500/40";

              const progressColor = isOver
                ? "bg-rose-500"
                : isWarning80
                ? "bg-orange-400"
                : isWarning50
                ? "bg-amber-400"
                : "bg-[#4edea3]";

              const statusLabel = isOver
                ? "Overspent"
                : isWarning80
                ? "Near Limit (≥80%)"
                : isWarning50
                ? "Approaching (≥50%)"
                : "Under Budget";

              return (
                <div
                  key={cat.budgetId}
                  className={`aura-card-obsidian rounded-3xl p-5 border relative overflow-hidden flex flex-col justify-between transition-all group ${
                    isOver
                      ? "border-rose-500/40 shadow-rose-950/20"
                      : "hover:border-[#4edea3]/40"
                  }`}
                >
                  {/* Card Header: Category & Tags */}
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h3 className="text-sm sm:text-base font-bold text-white truncate">
                            {cat.categoryName}
                          </h3>
                          {cat.isOverride && (
                            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 uppercase">
                              Override
                            </span>
                          )}
                        </div>
                        {cat.notes && (
                          <p className="text-[11px] text-slate-400 truncate mt-0.5">
                            {cat.notes}
                          </p>
                        )}
                      </div>

                      {/* Status Badge */}
                      <span
                        className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full border shrink-0 ${badgeColor}`}
                      >
                        {statusLabel}
                      </span>
                    </div>

                    {/* Numbers: Spent vs Limit */}
                    <div className="mt-4 flex items-baseline justify-between gap-2">
                      <div>
                        <span className="text-[11px] font-medium text-slate-400">Spent</span>
                        <p className="text-xl sm:text-2xl font-black text-white tabular-nums">
                          {formatRupees(cat.actualSpendingPaise)}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="text-[11px] font-medium text-slate-400">Limit</span>
                        <p className="text-base sm:text-lg font-bold text-slate-300 tabular-nums">
                          {formatRupees(cat.budgetPaise)}
                        </p>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-[11px] mb-1">
                        <span className="text-slate-400 font-medium">
                          {Math.round(cat.percentageUsed)}% used
                        </span>
                        <span
                          className={`font-bold tabular-nums ${
                            isOver ? "text-rose-400" : "text-[#4edea3]"
                          }`}
                        >
                          {isOver
                            ? `${formatRupees(cat.overspentPaise)} exceeded`
                            : `${formatRupees(cat.remainingPaise)} left`}
                        </span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${progressColor}`}
                          style={{ width: `${Math.min(100, cat.percentageUsed)}%` }}
                        />
                      </div>
                    </div>

                    {/* Active Alert Milestones */}
                    <div className="mt-3 flex items-center gap-1.5 text-[10px] font-mono text-slate-400">
                      <span>Alerts:</span>
                      {cat.alert_50 && (
                        <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10">
                          50%
                        </span>
                      )}
                      {cat.alert_80 && (
                        <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10">
                          80%
                        </span>
                      )}
                      {cat.alert_100 && (
                        <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10">
                          100%
                        </span>
                      )}
                      {!cat.alert_50 && !cat.alert_80 && !cat.alert_100 && (
                        <span className="text-slate-500">None</span>
                      )}
                    </div>
                  </div>

                  {/* Card Actions Footer */}
                  <div className="mt-5 pt-3 border-t border-white/10 flex items-center justify-between gap-2">
                    <Link
                      href={`/transactions?rangePreset=custom&from=${overview.startDate}&to=${overview.endDate}&category=${encodeURIComponent(
                        cat.categoryName
                      )}`}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400 hover:text-white hover:underline transition-colors"
                    >
                      <span>{cat.transactionCount} txns</span>
                      <ExternalLink className="h-3 w-3" />
                    </Link>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleEditBudget(cat)}
                        title="Edit monthly budget"
                        className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition-all cursor-pointer"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>

                      <form action={deleteCategoryBudget}>
                        <input type="hidden" name="budgetId" value={cat.budgetId} />
                        <input
                          type="hidden"
                          name="returnTo"
                          value={`/budgets?month=${overview.monthKey}`}
                        />
                        <button
                          type="submit"
                          title="Remove budget"
                          onClick={(e) => {
                            if (!confirm(`Remove budget for ${cat.categoryName}?`)) {
                              e.preventDefault();
                            }
                          }}
                          className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/5 hover:bg-rose-500/20 text-slate-300 hover:text-rose-300 transition-all cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </form>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* =========================================================
          5. ALERT HISTORY SECTION
      ========================================================= */}
      {alertEvents.length > 0 && (
        <section className="space-y-3 pt-4 border-t border-white/10">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-purple-400" />
            <h2 className="text-base font-bold tracking-tight text-white">
              Threshold Alert History
            </h2>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-4 backdrop-blur-md overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead>
                <tr className="border-b border-white/10 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <th className="pb-3 px-3">Category</th>
                  <th className="pb-3 px-3">Threshold</th>
                  <th className="pb-3 px-3">Spending at Trigger</th>
                  <th className="pb-3 px-3">Month</th>
                  <th className="pb-3 px-3">Triggered At</th>
                  <th className="pb-3 px-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {alertEvents.slice(0, 10).map((event) => (
                  <tr key={event.id} className="hover:bg-white/[0.02]">
                    <td className="py-2.5 px-3 font-bold text-white">
                      {event.category_name}
                    </td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                          event.threshold_percent === 100
                            ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                            : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                        }`}
                      >
                        {event.threshold_percent}%
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-mono">
                      {formatRupees(event.spending_paise)} / {formatRupees(event.budget_paise)}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-400">
                      {event.month_key}
                    </td>
                    <td className="py-2.5 px-3 text-slate-400 whitespace-nowrap">
                      {new Date(event.triggered_at).toLocaleString("en-IN", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="py-2.5 px-3">
                      {event.is_acknowledged ? (
                        <span className="text-[10px] font-semibold text-slate-500 flex items-center gap-1">
                          <Check className="h-3 w-3" /> Dismissed
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-amber-400">
                          Active
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Modal */}
      <CategoryBudgetModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setBudgetToEdit(null);
        }}
        availableCategories={availableCategories}
        currentMonthKey={overview.monthKey}
        currentMonthLabel={overview.monthLabel}
        budgetToEdit={budgetToEdit}
        returnTo={`/budgets?month=${overview.monthKey}`}
      />
    </div>
  );
}
