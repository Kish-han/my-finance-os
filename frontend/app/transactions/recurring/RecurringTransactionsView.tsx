"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Sparkles,
  Plus,
  Calendar,
  CheckCircle2,
  Clock,
  TrendingDown,
  TrendingUp,
  CreditCard,
  Wallet,
  AlertCircle,
  Pause,
  Play,
  Archive,
  Edit,
  FastForward,
  Check,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  type RecurringScheduleRecord,
  formatFrequencyDescription,
  normalizeMonthlyAmountPaise,
} from "@/lib/finance/recurring-engine";
import type { RecurringTransactionPaymentItem } from "@/lib/finance/payment-schedule";
import {
  RecurringScheduleModal,
} from "./RecurringScheduleModal";
import {
  ConfirmRecurringModal,
  type ConfirmOccurrenceData,
} from "./ConfirmRecurringModal";
import {
  SnoozeRecurringModal,
  type SnoozeModalData,
} from "./SnoozeRecurringModal";
import {
  pauseRecurringSchedule,
  resumeRecurringSchedule,
  archiveRecurringSchedule,
  skipRecurringOccurrence,
} from "./actions";

interface AccountOption {
  id: string;
  name: string;
  account_type: "bank" | "cash";
  institution: string | null;
}

interface CreditCardOption {
  id: string;
  name: string;
  bank_name: string;
  last_four_digits: string | null;
}

export interface HistoryOccurrenceItem {
  id: string;
  scheduleName: string;
  transactionType: "income" | "expense";
  dueDate: string;
  expectedAmountPaise: number;
  status: "confirmed" | "skipped";
  confirmedAmountPaise?: number | null;
  confirmedAt?: string | null;
  confirmedTransactionId?: string | null;
  sourceLabel: string;
  notes?: string | null;
}

interface Props {
  schedules: RecurringScheduleRecord[];
  pendingItems: RecurringTransactionPaymentItem[];
  historyItems: HistoryOccurrenceItem[];
  accounts: AccountOption[];
  creditCards: CreditCardOption[];
  categories: string[];
  today: string;
  createdSuccess?: boolean;
  updatedSuccess?: boolean;
  confirmedSuccess?: boolean;
  skippedSuccess?: boolean;
  snoozedSuccess?: boolean;
  pausedSuccess?: boolean;
  resumedSuccess?: boolean;
  archivedSuccess?: boolean;
  tableMissing?: boolean;
  errorCode?: string;
  errorMessages?: Record<string, string>;
}

function formatRupees(paise: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(paise / 100);
}

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  if (!year || !month || !day) return dateStr;
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function RecurringTransactionsView({
  schedules,
  pendingItems,
  historyItems,
  accounts,
  creditCards,
  categories,
  today,
  createdSuccess,
  updatedSuccess,
  confirmedSuccess,
  skippedSuccess,
  snoozedSuccess,
  pausedSuccess,
  resumedSuccess,
  archivedSuccess,
  tableMissing,
  errorCode,
  errorMessages = {},
}: Props) {
  const [activeTab, setActiveTab] = useState<"pending" | "schedules" | "history">("pending");
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<RecurringScheduleRecord | null>(null);

  const [confirmModalData, setConfirmModalData] = useState<ConfirmOccurrenceData | null>(null);
  const [snoozeModalData, setSnoozeModalData] = useState<SnoozeModalData | null>(null);

  // High-Level Monthly Metrics
  const activeSchedules = schedules.filter((s) => s.status === "active");
  const monthlyExpensePaise = activeSchedules
    .filter((s) => s.transactionType === "expense")
    .reduce((sum, s) => sum + normalizeMonthlyAmountPaise(s.amountPaise, s.frequency), 0);
  const monthlyIncomePaise = activeSchedules
    .filter((s) => s.transactionType === "income")
    .reduce((sum, s) => sum + normalizeMonthlyAmountPaise(s.amountPaise, s.frequency), 0);

  const overdueCount = pendingItems.filter((i) => i.dueStatus.status === "overdue").length;

  function openCreateModal() {
    setEditingSchedule(null);
    setIsScheduleModalOpen(true);
  }

  function openEditModal(schedule: RecurringScheduleRecord) {
    setEditingSchedule(schedule);
    setIsScheduleModalOpen(true);
  }

  function openConfirmForPending(item: RecurringTransactionPaymentItem) {
    const defaultSourceId = item.creditCardId
      ? `card:${item.creditCardId}`
      : item.accountId
      ? `account:${item.accountId}`
      : "";

    setConfirmModalData({
      occurrenceId: item.occurrenceId,
      scheduleId: item.scheduleId,
      title: item.title,
      amountPaise: item.amountPaise,
      transactionType: item.transactionType,
      dueDate: item.dueDate,
      sourceId: defaultSourceId,
      categoryName: item.categoryName || "General",
      notes: item.notes,
      isAmountVariable: item.isAmountVariable,
    });
  }

  function openSnoozeForPending(item: RecurringTransactionPaymentItem) {
    setSnoozeModalData({
      occurrenceId: item.occurrenceId,
      title: item.title,
      dueDate: item.dueDate,
    });
  }

  return (
    <div className="space-y-8">
      {/* 1. Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 shrink-0 rounded-full bg-purple-400 animate-pulse" />
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-purple-400">
              RECURRING CASHFLOW · EXPECTED RULES
            </span>
          </div>
          <h1 className="mt-1 text-2xl sm:text-3xl font-black tracking-tight text-white">
            Recurring Transactions
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            Set up regular income and expense schedules with automated expected items and reminders
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/transactions"
            className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-slate-300 hover:text-white transition-all"
          >
            ← Back to Ledger
          </Link>
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-purple-500 to-indigo-500 px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-purple-500/20 hover:brightness-110 active:scale-95 transition-all cursor-pointer"
          >
            <Plus className="h-4 w-4 shrink-0" />
            <span>New Schedule</span>
          </button>
        </div>
      </div>

      {/* 2. Notifications & Alerts */}
      {tableMissing && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-950/40 px-5 py-4 text-xs sm:text-sm font-semibold text-amber-300 shadow-xl backdrop-blur-xl"
        >
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5 text-amber-400" />
          <div className="space-y-1">
            <p className="font-bold text-amber-200">Database Migration Pending</p>
            <p className="text-xs text-amber-300/90 font-normal">
              Please apply the migration at <code className="bg-amber-950/80 px-1 py-0.5 rounded font-mono text-[11px]">supabase/migrations/20261028150000_create_recurring_transactions.sql</code> in your Supabase SQL editor to create the recurring transaction tables.
            </p>
          </div>
        </div>
      )}

      {createdSuccess && (
        <div
          role="status"
          className="flex items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-950/40 px-5 py-4 text-xs sm:text-sm font-semibold text-emerald-300 shadow-xl backdrop-blur-xl"
        >
          <Zap className="h-4 w-4 shrink-0 text-emerald-400" />
          <p>Recurring schedule created successfully. Expected occurrences are now active.</p>
        </div>
      )}

      {updatedSuccess && (
        <div
          role="status"
          className="flex items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-950/40 px-5 py-4 text-xs sm:text-sm font-semibold text-emerald-300 shadow-xl backdrop-blur-xl"
        >
          <Zap className="h-4 w-4 shrink-0 text-emerald-400" />
          <p>Recurring schedule updated. Future expected occurrences have been refreshed.</p>
        </div>
      )}

      {confirmedSuccess && (
        <div
          role="status"
          className="flex items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-950/40 px-5 py-4 text-xs sm:text-sm font-semibold text-emerald-300 shadow-xl backdrop-blur-xl"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
          <p>Transaction confirmed and recorded into verified ledger! Balances have been updated.</p>
        </div>
      )}

      {skippedSuccess && (
        <div
          role="status"
          className="flex items-center gap-3 rounded-2xl border border-cyan-500/30 bg-cyan-950/40 px-5 py-4 text-xs sm:text-sm font-semibold text-cyan-300 shadow-xl backdrop-blur-xl"
        >
          <FastForward className="h-4 w-4 shrink-0 text-cyan-400" />
          <p>Occurrence skipped. Next cycle due date has been calculated without breaking the series.</p>
        </div>
      )}

      {snoozedSuccess && (
        <div
          role="status"
          className="flex items-center gap-3 rounded-2xl border border-amber-500/30 bg-amber-950/40 px-5 py-4 text-xs sm:text-sm font-semibold text-amber-300 shadow-xl backdrop-blur-xl"
        >
          <Clock className="h-4 w-4 shrink-0 text-amber-400" />
          <p>Reminder snoozed. The occurrence will remain pending until your new reminder date.</p>
        </div>
      )}

      {pausedSuccess && (
        <div
          role="status"
          className="flex items-center gap-3 rounded-2xl border border-slate-700 bg-slate-900/60 px-5 py-4 text-xs sm:text-sm font-semibold text-slate-300 shadow-xl backdrop-blur-xl"
        >
          <Pause className="h-4 w-4 shrink-0 text-slate-400" />
          <p>Schedule paused. Occurrences are held from active reminder queues until resumed.</p>
        </div>
      )}

      {resumedSuccess && (
        <div
          role="status"
          className="flex items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-950/40 px-5 py-4 text-xs sm:text-sm font-semibold text-emerald-300 shadow-xl backdrop-blur-xl"
        >
          <Play className="h-4 w-4 shrink-0 text-emerald-400" />
          <p>Schedule resumed and now active.</p>
        </div>
      )}

      {archivedSuccess && (
        <div
          role="status"
          className="flex items-center gap-3 rounded-2xl border border-slate-700 bg-slate-900/60 px-5 py-4 text-xs sm:text-sm font-semibold text-slate-300 shadow-xl backdrop-blur-xl"
        >
          <Archive className="h-4 w-4 shrink-0 text-slate-400" />
          <p>Schedule archived. Past confirmed transactions and history have been preserved.</p>
        </div>
      )}

      {errorCode && (
        <div
          role="alert"
          className="flex items-center gap-3 rounded-2xl border border-rose-500/30 bg-rose-950/40 px-5 py-4 text-xs sm:text-sm font-semibold text-rose-300 shadow-xl backdrop-blur-xl"
        >
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
          <p>{errorMessages[errorCode] || `Action failed: ${errorCode}`}</p>
        </div>
      )}

      {/* 3. Monthly Telemetry KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Metric 1: Monthly Outflow */}
        <div className="aura-panel p-4 sm:p-5 space-y-1.5 border border-white/5 bg-white/[0.02]">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
            <span>Monthly Expected Outflow</span>
            <TrendingDown className="h-4 w-4 text-rose-400" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-rose-400 tabular-nums">
            {formatRupees(monthlyExpensePaise)}
          </div>
          <p className="text-[10px] text-slate-500">Normalized monthly recurring expenses</p>
        </div>

        {/* Metric 2: Monthly Inflow */}
        <div className="aura-panel p-4 sm:p-5 space-y-1.5 border border-white/5 bg-white/[0.02]">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
            <span>Monthly Expected Inflow</span>
            <TrendingUp className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-emerald-400 tabular-nums">
            {formatRupees(monthlyIncomePaise)}
          </div>
          <p className="text-[10px] text-slate-500">Normalized monthly recurring income</p>
        </div>

        {/* Metric 3: Active Schedules */}
        <div className="aura-panel p-4 sm:p-5 space-y-1.5 border border-white/5 bg-white/[0.02]">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
            <span>Active Schedules</span>
            <Sparkles className="h-4 w-4 text-purple-400" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-white tabular-nums">
            {activeSchedules.length}
          </div>
          <p className="text-[10px] text-slate-500">Active rules across accounts & cards</p>
        </div>

        {/* Metric 4: Pending / Overdue Reminders */}
        <div className="aura-panel p-4 sm:p-5 space-y-1.5 border border-white/5 bg-white/[0.02]">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
            <span>Actionable Items</span>
            <Clock className="h-4 w-4 text-amber-400" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-white tabular-nums flex items-center gap-2">
            <span>{pendingItems.length}</span>
            {overdueCount > 0 && (
              <span className="text-xs font-bold text-rose-400 bg-rose-500/20 px-2 py-0.5 rounded-full border border-rose-500/30">
                {overdueCount} overdue
              </span>
            )}
          </div>
          <p className="text-[10px] text-slate-500">Awaiting user confirmation</p>
        </div>
      </div>

      {/* 4. Tab Navigation */}
      <div className="flex items-center gap-2 border-b border-white/10 pb-3">
        <button
          type="button"
          onClick={() => setActiveTab("pending")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === "pending"
              ? "bg-[#4edea3] text-slate-950 shadow-md"
              : "text-slate-400 hover:text-white hover:bg-white/5"
          }`}
        >
          <span>Expected Reminders</span>
          {pendingItems.length > 0 && (
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                activeTab === "pending"
                  ? "bg-slate-950 text-[#4edea3]"
                  : "bg-white/10 text-white"
              }`}
            >
              {pendingItems.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("schedules")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === "schedules"
              ? "bg-[#4edea3] text-slate-950 shadow-md"
              : "text-slate-400 hover:text-white hover:bg-white/5"
          }`}
        >
          <span>Active Schedules</span>
          <span
            className={`px-1.5 py-0.2 rounded-full text-[10px] ${
              activeTab === "schedules"
                ? "bg-slate-950 text-[#4edea3]"
                : "bg-white/10 text-white"
            }`}
          >
            {schedules.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("history")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === "history"
              ? "bg-[#4edea3] text-slate-950 shadow-md"
              : "text-slate-400 hover:text-white hover:bg-white/5"
          }`}
        >
          <span>Occurrence History</span>
          {historyItems.length > 0 && (
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                activeTab === "history"
                  ? "bg-slate-950 text-[#4edea3]"
                  : "bg-white/10 text-white"
              }`}
            >
              {historyItems.length}
            </span>
          )}
        </button>
      </div>

      {/* 5. TAB CONTENT */}

      {/* TAB 1: EXPECTED REMINDERS */}
      {activeTab === "pending" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <p>
              Expected financial occurrences awaiting confirmation. Zero impact on actual balances until confirmed.
            </p>
          </div>

          {pendingItems.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.02] p-12 text-center space-y-3">
              <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-400/80" />
              <h3 className="text-base font-bold text-white">No pending recurring reminders</h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                You are completely up to date. As scheduled dates arrive, expected items will appear here for one-click confirmation.
              </p>
              <button
                type="button"
                onClick={openCreateModal}
                className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-300 hover:bg-purple-500/25 text-xs font-bold transition-all cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Create Recurring Schedule</span>
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {pendingItems.map((item) => {
                const isOverdue = item.dueStatus.status === "overdue";
                const isDueToday = item.dueStatus.status === "due_today";
                const isIncome = item.transactionType === "income";

                const borderStyle = isOverdue
                  ? "border-rose-500/40 bg-gradient-to-r from-rose-950/30 via-[#141922] to-[#141922] shadow-[0_0_20px_-5px_rgba(244,63,94,0.15)]"
                  : isDueToday
                  ? "border-amber-500/40 bg-gradient-to-r from-amber-950/30 via-[#141922] to-[#141922]"
                  : "border-white/10 bg-[#141922]";

                return (
                  <div
                    key={item.id}
                    className={`rounded-2xl border p-4 sm:p-5 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 ${borderStyle}`}
                  >
                    {/* Item info */}
                    <div className="flex items-start gap-3.5 min-w-0">
                      <div
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border mt-0.5 ${
                          item.isCreditCard
                            ? "bg-purple-500/15 text-purple-400 border-purple-500/30"
                            : isIncome
                            ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                            : "bg-slate-800 text-slate-300 border-white/10"
                        }`}
                      >
                        {item.isCreditCard ? (
                          <CreditCard className="h-5 w-5" />
                        ) : isIncome ? (
                          <TrendingUp className="h-5 w-5" />
                        ) : (
                          <Wallet className="h-5 w-5" />
                        )}
                      </div>

                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate font-bold text-white text-sm sm:text-base">
                            {item.title}
                          </h3>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold border ${
                              isOverdue
                                ? "bg-rose-500/20 text-rose-300 border-rose-500/30"
                                : isDueToday
                                ? "bg-amber-500/20 text-amber-300 border-amber-500/30 animate-pulse"
                                : "bg-white/10 text-slate-300 border-white/10"
                            }`}
                          >
                            {item.dueStatus.label}
                          </span>
                          {item.isCreditCard && (
                            <span className="rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/30 px-2 py-0.5 text-[10px] font-bold">
                              Card Purchase
                            </span>
                          )}
                          {item.isSnoozed && (
                            <span className="rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 px-2 py-0.5 text-[10px] font-bold flex items-center gap-1">
                              <Clock className="h-2.5 w-2.5" /> Snoozed
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                          <span className="flex items-center gap-1 text-slate-300 font-medium">
                            <Calendar className="h-3 w-3 text-cyan-400" />
                            Due: {formatDate(item.dueDate)}
                          </span>
                          <span>·</span>
                          <span>{item.subtitle}</span>
                          {item.categoryName && (
                            <>
                              <span>·</span>
                              <span className="text-slate-400">{item.categoryName}</span>
                            </>
                          )}
                        </div>

                        {item.notes && (
                          <p className="text-[11px] text-slate-400 italic">
                            {item.notes}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Amount & Actions */}
                    <div className="flex flex-wrap sm:flex-nowrap items-center justify-between md:justify-end gap-3 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-white/5">
                      <div className="text-left md:text-right">
                        <div
                          className={`text-lg sm:text-xl font-black tabular-nums ${
                            isIncome ? "text-emerald-400" : "text-white"
                          }`}
                        >
                          {isIncome ? "+" : "-"}
                          {formatRupees(item.amountPaise)}
                        </div>
                        <span className="text-[10px] text-slate-500">
                          {item.isAmountVariable ? "Variable (Confirm actual)" : "Expected"}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Snooze Button */}
                        <button
                          type="button"
                          onClick={() => openSnoozeForPending(item)}
                          className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-slate-300 hover:text-white transition-all flex items-center gap-1 cursor-pointer"
                        >
                          <Clock className="h-3.5 w-3.5 text-amber-400" />
                          <span>Snooze</span>
                        </button>

                        {/* Skip Button */}
                        <form action={skipRecurringOccurrence}>
                          <input type="hidden" name="returnTo" value="/transactions/recurring" />
                          <input type="hidden" name="occurrenceId" value={item.occurrenceId} />
                          <input type="hidden" name="scheduleId" value={item.scheduleId} />
                          <button
                            type="submit"
                            title="Skip this cycle while preserving recurring series"
                            className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-slate-400 hover:text-rose-400 transition-all cursor-pointer"
                          >
                            <span>Skip</span>
                          </button>
                        </form>

                        {/* Confirm Button */}
                        <button
                          type="button"
                          onClick={() => openConfirmForPending(item)}
                          className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black shadow-md transition-all active:scale-95 cursor-pointer ${
                            isIncome
                              ? "bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/20"
                              : "bg-white hover:bg-slate-100 text-slate-950 shadow-white/10"
                          }`}
                        >
                          <Check className="h-3.5 w-3.5 stroke-[3]" />
                          <span>{isIncome ? "Confirm Deposit" : "Confirm Paid"}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: ACTIVE SCHEDULES */}
      {activeTab === "schedules" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <p>Master recurring configurations. Pausing stops reminders; archiving preserves all past records.</p>
          </div>

          {schedules.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.02] p-12 text-center space-y-3">
              <Sparkles className="mx-auto h-10 w-10 text-purple-400/80" />
              <h3 className="text-base font-bold text-white">No recurring schedules found</h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Set up recurring rules for rent, utilities, subscriptions, or salaries to automate reminder tracking.
              </p>
              <button
                type="button"
                onClick={openCreateModal}
                className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-300 hover:bg-purple-500/25 text-xs font-bold transition-all cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Create First Schedule</span>
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {schedules.map((schedule) => {
                const isPaused = schedule.status === "paused";
                const isIncome = schedule.transactionType === "income";

                let sourceName = "Liquid Account";
                if (schedule.creditCardId) {
                  const card = creditCards.find((c) => c.id === schedule.creditCardId);
                  sourceName = card ? `${card.bank_name} ${card.name}` : "Credit Card";
                } else if (schedule.accountId) {
                  const acc = accounts.find((a) => a.id === schedule.accountId);
                  sourceName = acc ? acc.name : "Bank Account";
                }

                return (
                  <div
                    key={schedule.id}
                    className={`rounded-2xl border p-4 sm:p-5 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                      isPaused
                        ? "border-white/5 bg-white/[0.01] opacity-70"
                        : "border-white/10 bg-[#141922]"
                    }`}
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate font-bold text-white text-base">
                          {schedule.name}
                        </h3>
                        <Badge
                          variant="outline"
                          className={`text-[10px] font-bold ${
                            isPaused
                              ? "bg-slate-800 text-slate-400 border-white/5"
                              : "border-purple-500/30 text-purple-300 bg-purple-500/10"
                          }`}
                        >
                          {isPaused ? "PAUSED" : "ACTIVE"}
                        </Badge>
                        <Badge
                          variant="outline"
                          className="text-[10px] border-white/10 text-slate-400"
                        >
                          {formatFrequencyDescription(
                            schedule.frequency,
                            schedule.dayOfMonth,
                            schedule.dayOfWeek
                          )}
                        </Badge>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                        <span className="text-slate-300">
                          Next due: <strong>{formatDate(schedule.nextDueDate)}</strong>
                        </span>
                        <span>·</span>
                        <span>{sourceName}</span>
                        {schedule.categoryName && (
                          <>
                            <span>·</span>
                            <span>{schedule.categoryName}</span>
                          </>
                        )}
                        {schedule.endDate && (
                          <>
                            <span>·</span>
                            <span className="text-slate-500">Ends: {formatDate(schedule.endDate)}</span>
                          </>
                        )}
                      </div>

                      {schedule.notes && (
                        <p className="text-[11px] text-slate-400 italic">
                          {schedule.notes}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap sm:flex-nowrap items-center justify-between md:justify-end gap-4 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-white/5">
                      <div className="text-left md:text-right">
                        <div
                          className={`text-lg sm:text-xl font-black tabular-nums ${
                            isIncome ? "text-emerald-400" : "text-white"
                          }`}
                        >
                          {isIncome ? "+" : "-"}
                          {formatRupees(schedule.amountPaise)}
                        </div>
                        <span className="text-[10px] text-slate-500">
                          {schedule.isAmountVariable ? "Variable bill" : "Fixed amount"}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Edit Button */}
                        <button
                          type="button"
                          onClick={() => openEditModal(schedule)}
                          className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white transition-all cursor-pointer"
                          title="Edit Schedule"
                        >
                          <Edit className="h-4 w-4" />
                        </button>

                        {/* Pause / Resume */}
                        {isPaused ? (
                          <form action={resumeRecurringSchedule}>
                            <input type="hidden" name="returnTo" value="/transactions/recurring" />
                            <input type="hidden" name="scheduleId" value={schedule.id} />
                            <button
                              type="submit"
                              className="px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25 text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                            >
                              <Play className="h-3 w-3" />
                              <span>Resume</span>
                            </button>
                          </form>
                        ) : (
                          <form action={pauseRecurringSchedule}>
                            <input type="hidden" name="returnTo" value="/transactions/recurring" />
                            <input type="hidden" name="scheduleId" value={schedule.id} />
                            <button
                              type="submit"
                              className="px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-slate-400 hover:text-slate-200 text-xs font-semibold transition-all flex items-center gap-1 cursor-pointer"
                            >
                              <Pause className="h-3 w-3" />
                              <span>Pause</span>
                            </button>
                          </form>
                        )}

                        {/* Archive */}
                        <form
                          action={archiveRecurringSchedule}
                          onSubmit={(e) => {
                            if (!confirm(`Archive schedule "${schedule.name}"? Past transactions are preserved.`)) {
                              e.preventDefault();
                            }
                          }}
                        >
                          <input type="hidden" name="returnTo" value="/transactions/recurring" />
                          <input type="hidden" name="scheduleId" value={schedule.id} />
                          <button
                            type="submit"
                            title="Archive schedule (preserves all transaction history)"
                            className="p-2 rounded-xl bg-white/5 hover:bg-rose-500/20 border border-white/10 text-slate-400 hover:text-rose-300 transition-all cursor-pointer"
                          >
                            <Archive className="h-4 w-4" />
                          </button>
                        </form>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: OCCURRENCE HISTORY */}
      {activeTab === "history" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <p>Audited ledger of past confirmed transactions and skipped cycles.</p>
          </div>

          {historyItems.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.02] p-12 text-center space-y-2">
              <Calendar className="mx-auto h-10 w-10 text-slate-600" />
              <h3 className="text-base font-bold text-white">No occurrence history yet</h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Once you confirm or skip expected recurring occurrences, their historical audit records will appear here.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-white/5 rounded-2xl border border-white/5 bg-[#141922] overflow-hidden">
              {historyItems.map((h) => {
                const isConfirmed = h.status === "confirmed";
                const isIncome = h.transactionType === "income";

                return (
                  <div
                    key={h.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 hover:bg-white/[0.02] transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${
                          isConfirmed
                            ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                            : "bg-slate-800 text-slate-400 border-white/10"
                        }`}
                      >
                        {isConfirmed ? (
                          <CheckCircle2 className="h-4 w-4" />
                        ) : (
                          <FastForward className="h-4 w-4" />
                        )}
                      </div>

                      <div className="space-y-0.5 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold text-white truncate">
                            {h.scheduleName}
                          </p>
                          <Badge
                            variant={isConfirmed ? "emerald" : "outline"}
                            className="text-[9px] uppercase px-1.5 py-0"
                          >
                            {isConfirmed ? "Confirmed" : "Skipped"}
                          </Badge>
                        </div>
                        <p className="text-xs text-slate-400">
                          Due Date: {formatDate(h.dueDate)} · {h.sourceLabel}
                        </p>
                        {h.notes && (
                          <p className="text-[11px] text-slate-500 italic">
                            {h.notes}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="text-left sm:text-right pl-12 sm:pl-0">
                      <div
                        className={`text-sm font-black tabular-nums ${
                          !isConfirmed
                            ? "text-slate-500 line-through"
                            : isIncome
                            ? "text-emerald-400"
                            : "text-white"
                        }`}
                      >
                        {formatRupees(h.confirmedAmountPaise || h.expectedAmountPaise)}
                      </div>
                      {isConfirmed && h.confirmedAt && (
                        <p className="text-[10px] text-slate-500 font-mono">
                          Settled on {new Date(h.confirmedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 6. MODALS */}
      <RecurringScheduleModal
        isOpen={isScheduleModalOpen}
        onClose={() => setIsScheduleModalOpen(false)}
        accounts={accounts}
        creditCards={creditCards}
        categories={categories}
        today={today}
        scheduleToEdit={editingSchedule}
        returnTo="/transactions/recurring"
      />

      <ConfirmRecurringModal
        isOpen={Boolean(confirmModalData)}
        onClose={() => setConfirmModalData(null)}
        data={confirmModalData}
        accounts={accounts}
        creditCards={creditCards}
        categories={categories}
        today={today}
        returnTo="/transactions/recurring"
      />

      <SnoozeRecurringModal
        isOpen={Boolean(snoozeModalData)}
        onClose={() => setSnoozeModalData(null)}
        data={snoozeModalData}
        today={today}
        returnTo="/transactions/recurring"
      />
    </div>
  );
}
