"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ArrowLeftRight,
  Calendar,
  Search,
  Receipt,
  CreditCard as CreditCardIcon,
  Filter,
  X,
  Plus,
  Zap,
  TrendingUp,
  Pencil,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DashboardMonthlyChart } from "../DashboardMonthlyChart";
import { EditTransactionModal } from "./EditTransactionModal";
import {
  type DateRangePreset,
  type TransactionRecord,
  aggregateTransactionRange,
  getPriorPeriodBounds,
  aggregatePeriodTotals,
} from "@/lib/finance/date-ranges";

export interface AccountOption {
  id: string;
  name: string;
  account_type: "bank" | "cash";
  institution: string | null;
  opening_balance_date: string;
}

export interface CreditCardOption {
  id: string;
  name: string;
  bank_name: string;
  last_four_digits: string | null;
  opening_outstanding_date?: string;
}

export interface CategoryOption {
  id: string;
  name: string;
}

interface TransactionAnalysisViewProps {
  transactions: TransactionRecord[];
  accounts: AccountOption[];
  creditCards: CreditCardOption[];
  categories: CategoryOption[];
  availableCategories?: string[];
  today: string;
  createdSuccess?: boolean;
  updatedSuccess?: boolean;
  errorCode?: string;
  errorMessages?: Record<string, string>;
}

function formatRupees(paise: number | string, fractionDigits = 0): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: fractionDigits,
  }).format(Number(paise) / 100);
}

function formatDisplayDate(dateStr: string): string {
  try {
    return new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${dateStr}T12:00:00Z`));
  } catch {
    return dateStr;
  }
}

function transactionTypeBadge(type: TransactionRecord["transaction_type"]) {
  switch (type) {
    case "income":
      return { label: "Income", variant: "emerald" as const };
    case "expense":
      return { label: "Expense", variant: "rose" as const };
    case "card_purchase":
      return { label: "Card Spend", variant: "outline" as const };
    case "card_payment":
      return { label: "Card Payment", variant: "cyan" as const };
    case "transfer":
      return { label: "Transfer", variant: "cyan" as const };
    default:
      return { label: type, variant: "outline" as const };
  }
}

export function TransactionAnalysisView({
  transactions,
  accounts,
  creditCards,
  categories,
  availableCategories = [],
  today,
  createdSuccess,
  updatedSuccess,
  errorCode,
  errorMessages = {},
}: TransactionAnalysisViewProps) {
  // 1. Time Range State
  const [rangePreset, setRangePreset] = useState<DateRangePreset>("this_month");
  const [customStart, setCustomStart] = useState<string>(() => {
    // Default custom range: last 30 days
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [customEnd, setCustomEnd] = useState<string>(today);

  // 2. Filter & Search State
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [accountFilter, setAccountFilter] = useState<string>("all");
  const [limitToDateRange, setLimitToDateRange] = useState<boolean>(true);

  // 3. Edit Transaction State
  const [editingTx, setEditingTx] = useState<TransactionRecord | null>(null);
  const [localUpdatedSuccess, setLocalUpdatedSuccess] = useState<boolean>(false);

  // 4. Progressive List Rendering (Avoids rendering hundreds of DOM cards at once)
  const [visibleCount, setVisibleCount] = useState<number>(40);
  const filterKey = `${rangePreset}_${typeFilter}_${categoryFilter}_${accountFilter}_${searchQuery}`;
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey);
    setVisibleCount(40);
  }

  // Quick Account & Card Lookup Maps
  const accountMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of accounts) map.set(a.id, a.name);
    return map;
  }, [accounts]);

  const cardMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of creditCards) {
      map.set(
        c.id,
        `${c.name}${c.last_four_digits ? ` (••${c.last_four_digits})` : ""}`
      );
    }
    return map;
  }, [creditCards]);

  const categoryMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const cat of categories) map.set(cat.id, cat.name);
    return map;
  }, [categories]);

  // Find all-time earliest transaction date for bounds
  const allTimeEarliest = useMemo(() => {
    if (transactions.length === 0) return today;
    let min = transactions[0].transaction_date;
    for (const tx of transactions) {
      if (tx.transaction_date < min) min = tx.transaction_date;
    }
    return min;
  }, [transactions, today]);

  // Compute Aggregations for the Selected Date Range
  const summary = useMemo(() => {
    return aggregateTransactionRange(transactions, rangePreset, {
      customStart,
      customEnd,
      allTimeEarliest,
    });
  }, [transactions, rangePreset, customStart, customEnd, allTimeEarliest]);

  // Filtered Transaction List (matches range, search, category, account, type)
  const filteredTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      // 1. Date Range restriction (if enabled)
      if (limitToDateRange) {
        if (
          tx.transaction_date < summary.startDate ||
          tx.transaction_date > summary.endDate
        ) {
          return false;
        }
      }

      // 2. Type filter
      if (typeFilter !== "all") {
        if (typeFilter === "income" && tx.transaction_type !== "income") {
          return false;
        }
        if (
          typeFilter === "expense" &&
          tx.transaction_type !== "expense" &&
          tx.transaction_type !== "card_purchase"
        ) {
          return false;
        }
        if (typeFilter === "transfer" && tx.transaction_type !== "transfer") {
          return false;
        }
        if (
          typeFilter === "card" &&
          tx.transaction_type !== "card_purchase" &&
          tx.transaction_type !== "card_payment"
        ) {
          return false;
        }
      }

      // 3. Category filter
      if (categoryFilter !== "all") {
        const catName = categoryMap.get(tx.category_id ?? "") ?? tx.category_id;
        if (catName !== categoryFilter) {
          return false;
        }
      }

      // 4. Account filter
      if (accountFilter !== "all") {
        const matched =
          tx.account_id === accountFilter ||
          tx.from_account_id === accountFilter ||
          tx.to_account_id === accountFilter ||
          tx.credit_card_id === accountFilter;
        if (!matched) return false;
      }

      // 5. Search text query
      if (searchQuery.trim().length > 0) {
        const q = searchQuery.toLowerCase().trim();
        const descMatch = tx.description.toLowerCase().includes(q);
        const catMatch = (
          categoryMap.get(tx.category_id ?? "") ?? ""
        )
          .toLowerCase()
          .includes(q);
        const accMatch = (
          accountMap.get(tx.account_id ?? "") ??
          accountMap.get(tx.from_account_id ?? "") ??
          cardMap.get(tx.credit_card_id ?? "") ??
          ""
        )
          .toLowerCase()
          .includes(q);

        if (!descMatch && !catMatch && !accMatch) {
          return false;
        }
      }

      return true;
    });
  }, [
    transactions,
    limitToDateRange,
    summary.startDate,
    summary.endDate,
    typeFilter,
    categoryFilter,
    accountFilter,
    searchQuery,
    categoryMap,
    accountMap,
    cardMap,
  ]);

  // Prior period metrics for comparative cashflow telemetry in the restored chart
  const priorPeriodSummary = useMemo(() => {
    const { priorStart, priorEnd } = getPriorPeriodBounds(
      summary.startDate,
      summary.endDate,
      rangePreset
    );
    return aggregatePeriodTotals(transactions, priorStart, priorEnd);
  }, [transactions, summary.startDate, summary.endDate, rangePreset]);

  const presetLabels: Record<DateRangePreset, string> = {
    this_week: "This Week",
    this_month: "This Month",
    last_6_months: "Last 6 Months",
    this_year: "This Year",
    all_time: "All Time",
    custom: "Custom Range",
  };

  return (
    <div className="space-y-8">
      {/* =========================================================
          1. PAGE HEADING: Transactions
      ========================================================= */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 shrink-0 rounded-full bg-[#4edea3] animate-pulse" />
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#4edea3]">
              LEDGER INTELLIGENCE · AUDITED
            </span>
          </div>
          <h1 className="mt-1 text-2xl sm:text-3xl font-black tracking-tight text-white">
            Transactions
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            Time-based cashflow telemetry, spending analysis and verified ledger history
          </p>
        </div>

        {/* Clear action shortcut to jump to new transaction */}
        <Link
          href="/transactions/new"
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-2.5 text-xs font-bold text-slate-950 shadow-md shadow-emerald-500/20 hover:brightness-110 active:scale-95 transition-all self-start sm:self-center cursor-pointer"
        >
          <Plus className="h-4 w-4 shrink-0" />
          <span>Add Transaction</span>
        </Link>
      </div>

      {/* Notifications */}
      {createdSuccess && (
        <div
          role="status"
          className="flex items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-950/40 px-5 py-4 text-xs sm:text-sm font-semibold text-emerald-300 shadow-xl backdrop-blur-xl"
        >
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
            <Zap className="h-4 w-4 shrink-0" />
          </div>
          <p>Transaction recorded successfully into your verified ledger.</p>
        </div>
      )}

      {(updatedSuccess || localUpdatedSuccess) && (
        <div
          role="status"
          className="flex items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-950/40 px-5 py-4 text-xs sm:text-sm font-semibold text-emerald-300 shadow-xl backdrop-blur-xl animate-in fade-in"
        >
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
            <Zap className="h-4 w-4 shrink-0" />
          </div>
          <p>
            Transaction updated successfully. All affected balances, available credit, and financial analytics have been recalculated.
          </p>
        </div>
      )}

      {errorCode && (
        <div
          role="alert"
          className="rounded-2xl border border-rose-500/30 bg-rose-950/40 p-4 text-sm font-semibold text-rose-300 backdrop-blur-xl"
        >
          {errorMessages[errorCode] ?? "Something went wrong."}
        </div>
      )}

      {/* =========================================================
          2. SUMMARY FOR THE SELECTED DATE RANGE
      ========================================================= */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Total Inflow / Income Card */}
        <div className="aura-panel p-4 sm:p-5 relative overflow-hidden group hover:border-emerald-500/40 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
              <ArrowDownLeft className="h-4 w-4 shrink-0 text-emerald-400" />
              <span>Total Inflow</span>
            </span>
            <Badge
              variant="outline"
              className="text-[9px] uppercase font-bold text-emerald-400 border-emerald-500/30 bg-emerald-500/10 py-0.5 px-2"
            >
              {summary.incomeCount} CREDITS
            </Badge>
          </div>
          <p className="mt-2.5 text-2xl sm:text-3xl font-black text-white tabular-nums drop-shadow-sm">
            +{formatRupees(summary.totalIncomePaise, 2)}
          </p>
          <p className="mt-1 text-[11px] text-slate-400">
            Verified salary, deposit and income credits
          </p>
        </div>

        {/* Total Outflow / Expenses Card */}
        <div className="aura-panel p-4 sm:p-5 relative overflow-hidden group hover:border-rose-500/40 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-rose-400 flex items-center gap-1.5">
              <ArrowUpRight className="h-4 w-4 shrink-0 text-rose-400" />
              <span>Total Outflow</span>
            </span>
            <Badge
              variant="outline"
              className="text-[9px] uppercase font-bold text-rose-400 border-rose-500/30 bg-rose-500/10 py-0.5 px-2"
            >
              {summary.expenseCount} DEBITS
            </Badge>
          </div>
          <p className="mt-2.5 text-2xl sm:text-3xl font-black text-rose-200 tabular-nums drop-shadow-sm">
            −{formatRupees(summary.totalExpensePaise, 2)}
          </p>
          <p className="mt-1 text-[11px] text-slate-400">
            Recorded direct expenses and card purchases
          </p>
        </div>

        {/* Net Cashflow / Savings Card */}
        <div
          className={`aura-panel p-4 sm:p-5 relative overflow-hidden group transition-all ${
            summary.netCashflowPaise >= 0
              ? "hover:border-[#4edea3]/40"
              : "hover:border-amber-500/40"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <TrendingUp className="h-4 w-4 shrink-0 text-[#4edea3]" />
              <span>Net Cashflow</span>
            </span>
            <Badge
              variant="outline"
              className={`text-[9px] uppercase font-bold py-0.5 px-2 ${
                summary.netCashflowPaise >= 0
                  ? "text-[#4edea3] border-[#4edea3]/30 bg-[#4edea3]/10"
                  : "text-rose-400 border-rose-500/30 bg-rose-500/10"
              }`}
            >
              {summary.netCashflowPaise >= 0 ? "SURPLUS" : "DEFICIT"}
            </Badge>
          </div>
          <p
            className={`mt-2.5 text-2xl sm:text-3xl font-black tabular-nums drop-shadow-sm ${
              summary.netCashflowPaise >= 0 ? "text-[#4edea3]" : "text-rose-400"
            }`}
          >
            {summary.netCashflowPaise >= 0 ? "+" : "−"}
            {formatRupees(Math.abs(summary.netCashflowPaise), 2)}
          </p>
          <p className="mt-1 text-[11px] text-slate-400 flex items-center gap-1.5">
            {summary.totalIncomePaise > 0 ? (
              <span>Savings rate: <strong className="text-white">{summary.savingsRatePct}%</strong> of inflow</span>
            ) : (
              <span>{summary.transactionCount} transactions recorded in period</span>
            )}
          </p>
        </div>
      </section>

      {/* =========================================================
          3. TIME-RANGE SELECTOR
      ========================================================= */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-[#4edea3] shrink-0" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Analysis Timeframe
            </span>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
            <span className="hidden sm:inline">Active Window:</span>
            <span className="px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-white font-semibold">
              {formatDisplayDate(summary.startDate)} – {formatDisplayDate(summary.endDate)}
            </span>
          </div>
        </div>

        {/* Segmented Control Buttons */}
        <div className="flex flex-wrap gap-1.5 p-1 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xl">
          {(
            [
              "this_week",
              "this_month",
              "last_6_months",
              "this_year",
              "all_time",
              "custom",
            ] as DateRangePreset[]
          ).map((preset) => {
            const isActive = rangePreset === preset;
            return (
              <button
                key={preset}
                type="button"
                onClick={() => setRangePreset(preset)}
                className={`flex-1 min-w-[100px] py-2 px-3 rounded-xl text-xs font-bold transition-all text-center cursor-pointer ${
                  isActive
                    ? "bg-[#4edea3] text-slate-950 font-black shadow-md shadow-emerald-500/25"
                    : "text-slate-300 hover:text-white hover:bg-white/10"
                }`}
              >
                {presetLabels[preset]}
              </button>
            );
          })}
        </div>

        {/* Custom Date Range Inputs */}
        {rangePreset === "custom" && (
          <div className="aura-panel p-4 flex flex-wrap items-center gap-4 animate-in fade-in duration-300">
            <div className="flex-1 min-w-[150px] space-y-1">
              <label
                htmlFor="customStart"
                className="block text-[11px] font-bold uppercase tracking-wider text-slate-400"
              >
                Start Date
              </label>
              <input
                id="customStart"
                type="date"
                value={customStart}
                max={customEnd}
                onChange={(e) => setCustomStart(e.target.value)}
                className="w-full rounded-xl bg-white/5 border border-white/15 px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-[#4edea3]"
              />
            </div>

            <div className="flex-1 min-w-[150px] space-y-1">
              <label
                htmlFor="customEnd"
                className="block text-[11px] font-bold uppercase tracking-wider text-slate-400"
              >
                End Date
              </label>
              <input
                id="customEnd"
                type="date"
                value={customEnd}
                min={customStart}
                max={today}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="w-full rounded-xl bg-white/5 border border-white/15 px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-[#4edea3]"
              />
            </div>

            <div className="self-end pb-1 text-xs text-slate-400">
              Interval: <span className="font-bold text-white capitalize">{summary.interval}</span>
            </div>
          </div>
        )}
      </section>

      {/* =========================================================
          4. TRANSACTION GRAPH (Restored Financial Telemetry)
      ========================================================= */}
      <DashboardMonthlyChart
        dataPoints={summary.buckets}
        timeframeLabel={`${presetLabels[rangePreset]} Cashflow Dynamics`}
        currentExpensePaise={summary.totalExpensePaise}
        prevExpensePaise={priorPeriodSummary.totalExpensePaise}
        currentIncomePaise={summary.totalIncomePaise}
        prevIncomePaise={priorPeriodSummary.totalIncomePaise}
      />

      {/* =========================================================
          5. SEARCH AND TRANSACTION FILTERS
      ========================================================= */}
      <section className="aura-panel p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-[#4edea3] shrink-0" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-white">
              Filter Ledger Entries
            </h3>
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={limitToDateRange}
                onChange={(e) => setLimitToDateRange(e.target.checked)}
                className="rounded border-white/20 bg-white/5 text-[#4edea3] focus:ring-[#4edea3]"
              />
              <span>Filter by selected timeframe</span>
            </label>
          </div>
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search description, account, institution, or category..."
            className="w-full rounded-xl bg-white/5 border border-white/15 pl-10 pr-9 py-2.5 text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#4edea3]"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
            >
              <X className="h-4 w-4 shrink-0" />
            </button>
          )}
        </div>

        {/* Dropdowns and Type Selector Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Type Filter Buttons */}
          <div className="sm:col-span-1">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              Transaction Type
            </label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="w-full rounded-xl bg-white/5 border border-white/15 px-3 py-2 text-xs text-white focus:outline-none focus:border-[#4edea3] cursor-pointer"
            >
              <option value="all" className="bg-[#181c22]">All Types</option>
              <option value="income" className="bg-[#181c22]">Income Credits (+)</option>
              <option value="expense" className="bg-[#181c22]">Expenses & Spends (−)</option>
              <option value="transfer" className="bg-[#181c22]">Internal Transfers</option>
              <option value="card" className="bg-[#181c22]">Credit Card Spends & Payments</option>
            </select>
          </div>

          {/* Category Dropdown */}
          <div className="sm:col-span-1">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              Category
            </label>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full rounded-xl bg-white/5 border border-white/15 px-3 py-2 text-xs text-white focus:outline-none focus:border-[#4edea3] cursor-pointer"
            >
              <option value="all" className="bg-[#181c22]">All Categories</option>
              {availableCategories.map((c) => (
                <option key={c} value={c} className="bg-[#181c22]">
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Account / Card Dropdown */}
          <div className="sm:col-span-1">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              Account / Card
            </label>
            <select
              value={accountFilter}
              onChange={(e) => setAccountFilter(e.target.value)}
              className="w-full rounded-xl bg-white/5 border border-white/15 px-3 py-2 text-xs text-white focus:outline-none focus:border-[#4edea3] cursor-pointer"
            >
              <option value="all" className="bg-[#181c22]">All Accounts & Cards</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id} className="bg-[#181c22]">
                  {a.name} ({a.account_type})
                </option>
              ))}
              {creditCards.map((c) => (
                <option key={c.id} value={c.id} className="bg-[#181c22]">
                  {c.name} {c.last_four_digits ? `(••${c.last_four_digits})` : ""}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Active Filters Reset Pill */}
        {(typeFilter !== "all" ||
          categoryFilter !== "all" ||
          accountFilter !== "all" ||
          searchQuery.trim().length > 0) && (
          <div className="flex items-center justify-between pt-2">
            <span className="text-[11px] text-slate-400">
              Matching <strong className="text-white">{filteredTransactions.length}</strong> of{" "}
              {transactions.length} total entries
            </span>
            <button
              type="button"
              onClick={() => {
                setTypeFilter("all");
                setCategoryFilter("all");
                setAccountFilter("all");
                setSearchQuery("");
              }}
              className="text-[11px] text-emerald-400 hover:underline cursor-pointer"
            >
              Clear all filters
            </button>
          </div>
        )}
      </section>

      {/* =========================================================
          6. COMPLETE TRANSACTION HISTORY
      ========================================================= */}
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Receipt className="h-4 w-4 text-emerald-400 shrink-0" />
            <h2 className="text-base sm:text-lg font-bold tracking-tight text-white">
              Transaction History ({filteredTransactions.length})
            </h2>
          </div>

          <div className="flex items-center gap-2.5">
            <Link
              href="/transactions/new"
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-slate-200 hover:text-white transition-all cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5 text-[#4edea3]" />
              <span>Add Transaction</span>
            </Link>
            <span className="text-[10px] font-mono uppercase tracking-widest text-[#4edea3]">
              {limitToDateRange
                ? `${presetLabels[rangePreset]}`
                : "ALL AVAILABLE HISTORY"}
            </span>
          </div>
        </div>

        {filteredTransactions.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.02] p-10 text-center backdrop-blur-md">
            <div className="mx-auto flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/30">
              <Receipt className="h-7 w-7 shrink-0" />
            </div>
            <h3 className="mt-4 text-base font-bold text-white">
              No matching transactions found
            </h3>
            <p className="mt-1 text-xs text-slate-400 max-w-sm mx-auto">
              Try adjusting your search query, type filter, or timeframe window.
            </p>
            <div className="mt-4">
              <Link
                href="/transactions/new"
                className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-2 text-xs font-bold text-slate-950 shadow-md hover:brightness-110 transition-all cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Transaction</span>
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-2.5">
            {filteredTransactions.slice(0, visibleCount).map((tx) => {
              const isIncome = tx.transaction_type === "income";
              const isTransfer = tx.transaction_type === "transfer";
              const isCardRepayment = tx.transaction_type === "card_payment";
              const badgeInfo = transactionTypeBadge(tx.transaction_type);

              const accountLabel =
                accountMap.get(tx.account_id ?? "") ??
                accountMap.get(tx.from_account_id ?? "") ??
                cardMap.get(tx.credit_card_id ?? "") ??
                "Primary Vault";

              const categoryLabel =
                categoryMap.get(tx.category_id ?? "") ??
                badgeInfo.label;

              return (
                <article
                  key={tx.id}
                  className="aura-panel group flex items-center justify-between gap-3 p-3.5 sm:p-4.5 transition-all duration-200 hover:border-[#4edea3]/30 hover:-translate-y-0.5"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    {/* Direction Icon Badge */}
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-base shadow-sm ${
                        isIncome
                          ? "bg-[#10b981]/15 text-[#4edea3] border border-[#10b981]/30"
                          : isTransfer || isCardRepayment
                          ? "bg-cyan-500/15 text-cyan-400 border border-cyan-500/30"
                          : "bg-white/5 text-slate-300 border border-white/10"
                      }`}
                    >
                      {isIncome ? (
                        <ArrowDownLeft className="h-5 w-5 shrink-0" />
                      ) : isTransfer ? (
                        <ArrowLeftRight className="h-5 w-5 shrink-0" />
                      ) : isCardRepayment ? (
                        <CreditCardIcon className="h-5 w-5 shrink-0" />
                      ) : (
                        <ArrowUpRight className="h-5 w-5 shrink-0" />
                      )}
                    </div>

                    {/* Metadata column */}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-white group-hover:text-[#4edea3] transition-colors">
                        {tx.description}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-400 flex items-center gap-1.5 truncate">
                        <span>{categoryLabel}</span>
                        <span>·</span>
                        <span className="font-mono text-[11px] text-slate-500">
                          {formatDisplayDate(tx.transaction_date)}
                        </span>
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-slate-500">
                        {accountLabel}
                      </p>
                    </div>
                  </div>

                  {/* Amount Column & Actions */}
                  <div className="shrink-0 flex items-center gap-2.5 sm:gap-3">
                    <div className="text-right">
                      <p
                        className={`text-sm sm:text-base font-black tabular-nums ${
                          isIncome
                            ? "text-[#4edea3]"
                            : isTransfer || isCardRepayment
                            ? "text-cyan-300"
                            : "text-white"
                        }`}
                      >
                        {isIncome ? "+" : isTransfer || isCardRepayment ? "" : "−"}
                        {formatRupees(tx.amount_paise, 2)}
                      </p>
                      <Badge
                        variant={badgeInfo.variant}
                        className="mt-1 text-[9px] uppercase px-1.5 py-0"
                      >
                        {badgeInfo.label}
                      </Badge>
                    </div>

                    <button
                      type="button"
                      onClick={() => setEditingTx(tx)}
                      title="Edit this transaction"
                      className="flex h-8 w-8 sm:h-8.5 sm:w-auto sm:px-2.5 items-center justify-center gap-1 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-emerald-500/40 text-slate-300 hover:text-white transition-all text-xs font-semibold cursor-pointer active:scale-95"
                    >
                      <Pencil className="h-3.5 w-3.5 text-[#4edea3] shrink-0" />
                      <span className="hidden sm:inline">Edit</span>
                    </button>
                  </div>
                </article>
              );
            })}

            {filteredTransactions.length > visibleCount && (
              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={() => setVisibleCount((prev) => prev + 40)}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-6 py-2.5 text-xs font-bold text-slate-300 hover:text-white hover:border-[#4edea3]/40 hover:bg-white/10 transition-all cursor-pointer active:scale-95 shadow-lg"
                >
                  <span>Show More Transactions</span>
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-mono text-[#4edea3]">
                    +{Math.min(40, filteredTransactions.length - visibleCount)} of{" "}
                    {filteredTransactions.length - visibleCount} remaining
                  </span>
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      {/* =========================================================
          7. ACTION SHORTCUT: ADD TRANSACTION
      ========================================================= */}
      <section className="aura-panel p-6 sm:p-7 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-white/10 bg-gradient-to-r from-white/[0.03] to-white/[0.01]">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#10b981]/15 text-[#4edea3] border border-[#10b981]/30">
            <Plus className="h-5 w-5 shrink-0" />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-bold text-white">
              Record Financial Activity
            </h3>
            <p className="text-xs text-slate-400">
              Post verified income credits or expense debits on the dedicated entry page
            </p>
          </div>
        </div>
        <Link
          href="/transactions/new"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-5 py-2.5 text-xs font-bold text-slate-950 shadow-md shadow-emerald-500/20 hover:brightness-110 active:scale-95 transition-all shrink-0 cursor-pointer"
        >
          <Plus className="h-4 w-4 shrink-0" />
          <span>Add Transaction</span>
        </Link>
      </section>
      {/* Edit Transaction Modal */}
      <EditTransactionModal
        isOpen={Boolean(editingTx)}
        onClose={() => setEditingTx(null)}
        transaction={editingTx}
        accounts={accounts}
        creditCards={creditCards}
        categories={categories}
        availableCategories={availableCategories}
        today={today}
        onSuccess={() => setLocalUpdatedSuccess(true)}
      />
    </div>
  );
}
