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
  ChevronDown,
  ChevronUp,
  Plus,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

export type LedgerTransaction = {
  id: string;
  transaction_date: string;
  description: string;
  amount_paise: number | string;
  transaction_type: "income" | "expense" | "transfer" | "card_purchase" | "card_payment";
  account_id: string | null;
  from_account_id: string | null;
  category_id: string | null;
};

interface MonthwiseLedgerViewProps {
  transactions: LedgerTransaction[];
  accountMap: Record<string, string>;
  categoryMap: Record<string, string>;
  userEmail: string;
}

function formatRupees(paise: number | string): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
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

function getMonthYearLabel(monthKey: string): string {
  const [year, month] = monthKey.split("-");
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, 1));
  return new Intl.DateTimeFormat("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function MonthwiseLedgerView({
  transactions,
  accountMap,
  categoryMap,
}: MonthwiseLedgerViewProps) {
  const [selectedType, setSelectedType] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [collapsedMonths, setCollapsedMonths] = useState<Record<string, boolean>>({});

  // Toggle collapsing a month section
  function toggleMonth(monthKey: string) {
    setCollapsedMonths((prev) => ({
      ...prev,
      [monthKey]: !prev[monthKey],
    }));
  }

  // Filtered transactions
  const filteredTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      // Type filter
      if (selectedType !== "all") {
        if (selectedType === "income" && tx.transaction_type !== "income") return false;
        if (selectedType === "expense" && tx.transaction_type !== "expense") return false;
        if (selectedType === "transfer" && tx.transaction_type !== "transfer") return false;
        if (
          selectedType === "card" &&
          tx.transaction_type !== "card_purchase" &&
          tx.transaction_type !== "card_payment"
        ) {
          return false;
        }
      }

      // Search query filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const descMatch = tx.description.toLowerCase().includes(query);
        const catName = categoryMap[tx.category_id ?? ""]?.toLowerCase() || "";
        const catMatch = catName.includes(query);
        const accName = accountMap[tx.account_id ?? ""]?.toLowerCase() || "";
        const accMatch = accName.includes(query);
        if (!descMatch && !catMatch && !accMatch) return false;
      }

      return true;
    });
  }, [transactions, selectedType, searchQuery, categoryMap, accountMap]);

  // Group by Month (YYYY-MM in descending order)
  const monthGroups = useMemo(() => {
    const groups = new Map<
      string,
      {
        monthKey: string;
        monthLabel: string;
        incomePaise: number;
        expensePaise: number;
        netPaise: number;
        items: LedgerTransaction[];
      }
    >();

    for (const tx of filteredTransactions) {
      const monthKey = tx.transaction_date.slice(0, 7);
      let group = groups.get(monthKey);
      if (!group) {
        group = {
          monthKey,
          monthLabel: getMonthYearLabel(monthKey),
          incomePaise: 0,
          expensePaise: 0,
          netPaise: 0,
          items: [],
        };
        groups.set(monthKey, group);
      }

      const amount = Number(tx.amount_paise);
      if (tx.transaction_type === "income") {
        group.incomePaise += amount;
      } else if (
        tx.transaction_type === "expense" ||
        tx.transaction_type === "card_purchase"
      ) {
        group.expensePaise += amount;
      }
      group.items.push(tx);
    }

    // Compute net for each month and sort descending by monthKey
    const sorted = Array.from(groups.values()).sort((a, b) =>
      b.monthKey.localeCompare(a.monthKey)
    );

    for (const group of sorted) {
      group.netPaise = group.incomePaise - group.expensePaise;
    }

    return sorted;
  }, [filteredTransactions]);

  return (
    <div className="space-y-6">
      {/* Top Controls: Search and Filter Pills */}
      <section className="aura-panel p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base sm:text-lg font-black tracking-tight text-[var(--foreground)] flex items-center gap-2">
              <Calendar className="h-4 w-4 text-emerald-600 dark:text-[#4edea3]" />
              <span>Monthwise Financial Ledger</span>
            </h2>
            <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
              Chronologically aligned transaction history grouped by calendar month
            </p>
          </div>

          <Link
            href="/transactions"
            className="inline-flex items-center gap-1.5 self-start sm:self-center px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-xs font-bold text-slate-950 shadow-md shadow-emerald-500/20 hover:brightness-110 transition-all shrink-0"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Record Entry</span>
          </Link>
        </div>

        {/* Search input + Type Filters */}
        <div className="flex flex-col sm:flex-row gap-3 pt-2 border-t border-[var(--border)]">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--muted-foreground)]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search description, category, or account..."
              className="w-full rounded-xl bg-slate-100/70 dark:bg-white/5 border border-[var(--border)] pl-10 pr-4 py-2 text-xs sm:text-sm text-[var(--foreground)] placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30 transition-all"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-1 sm:pb-0">
            {[
              { id: "all", label: "All" },
              { id: "income", label: "Income" },
              { id: "expense", label: "Expenses" },
              { id: "transfer", label: "Transfers" },
              { id: "card", label: "Cards" },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSelectedType(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  selectedType === tab.id
                    ? "bg-emerald-500 text-white dark:bg-[#4edea3] dark:text-slate-950 shadow-md shadow-emerald-500/20"
                    : "bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-[var(--foreground)] border border-[var(--border)]"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Month Groups List */}
      {monthGroups.length === 0 ? (
        <section className="rounded-3xl border border-dashed border-[var(--border)] bg-slate-50/50 dark:bg-white/[0.02] p-12 text-center backdrop-blur-md">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 dark:bg-white/5 text-[var(--muted-foreground)] ring-1 ring-[var(--border)]">
            <Receipt className="h-7 w-7" />
          </div>
          <h3 className="mt-4 text-base font-bold text-[var(--foreground)]">No transactions found</h3>
          <p className="mt-1 text-xs text-[var(--muted-foreground)] max-w-sm mx-auto">
            {searchQuery || selectedType !== "all"
              ? "No transactions match your current search or filter criteria."
              : "No transactions have been recorded into your ledger yet."}
          </p>
        </section>
      ) : (
        <div className="space-y-6">
          {monthGroups.map((group) => {
            const isCollapsed = Boolean(collapsedMonths[group.monthKey]);

            return (
              <section
                key={group.monthKey}
                className="aura-panel rounded-3xl overflow-hidden border border-[var(--border)] transition-all"
              >
                {/* Month Summary Header (Clickable to Collapse/Expand) */}
                <div
                  onClick={() => toggleMonth(group.monthKey)}
                  className="p-5 sm:p-6 bg-slate-50/50 dark:bg-white/[0.02] hover:bg-slate-100/50 dark:hover:bg-white/[0.04] transition-colors cursor-pointer border-b border-[var(--border)] flex flex-col sm:flex-row sm:items-center justify-between gap-4 select-none"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-[#4edea3]">
                      <Calendar className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-base sm:text-lg font-black tracking-tight text-[var(--foreground)] flex items-center gap-2">
                        <span>{group.monthLabel}</span>
                        <Badge
                          variant="outline"
                          className="text-[10px] uppercase font-bold text-[var(--muted-foreground)] border-[var(--border)]"
                        >
                          {group.items.length} {group.items.length === 1 ? "entry" : "entries"}
                        </Badge>
                      </h3>
                      <p className="text-xs text-[var(--muted-foreground)]">
                        Monthly aggregation of verified transactions
                      </p>
                    </div>
                  </div>

                  {/* Month Totals Banner */}
                  <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-5 text-xs font-mono">
                    <div className="text-right">
                      <span className="text-[10px] text-[var(--muted-foreground)] uppercase block font-sans">
                        Income
                      </span>
                      <span className="font-bold text-emerald-600 dark:text-[#4edea3] tabular-nums text-sm">
                        +{formatRupees(group.incomePaise)}
                      </span>
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] text-[var(--muted-foreground)] uppercase block font-sans">
                        Spent
                      </span>
                      <span className="font-bold text-rose-600 dark:text-[#fb7185] tabular-nums text-sm">
                        −{formatRupees(group.expensePaise)}
                      </span>
                    </div>

                    <div className="text-right pl-2 border-l border-[var(--border)]">
                      <span className="text-[10px] text-[var(--muted-foreground)] uppercase block font-sans">
                        Net Savings
                      </span>
                      <span
                        className={`font-bold tabular-nums text-sm ${
                          group.netPaise >= 0 ? "text-emerald-600 dark:text-[#4edea3]" : "text-rose-600 dark:text-[#fb7185]"
                        }`}
                      >
                        {group.netPaise >= 0 ? "+" : "−"}
                        {formatRupees(Math.abs(group.netPaise))}
                      </span>
                    </div>

                    <div className="text-[var(--muted-foreground)] p-1">
                      {isCollapsed ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronUp className="h-4 w-4" />
                      )}
                    </div>
                  </div>
                </div>

                {/* Month Transactions List */}
                {!isCollapsed && (
                  <div className="divide-y divide-[var(--border)]">
                    {group.items.map((tx) => {
                      const isIncome = tx.transaction_type === "income";
                      const isTransfer = tx.transaction_type === "transfer";
                      const isCardPurchase = tx.transaction_type === "card_purchase";
                      const isCardPayment = tx.transaction_type === "card_payment";

                      return (
                        <article
                          key={tx.id}
                          className="flex items-center justify-between p-4 sm:p-5 transition-colors hover:bg-slate-100/50 dark:hover:bg-white/[0.03]"
                        >
                          <div className="flex items-center gap-3.5 min-w-0">
                            {/* Type Icon */}
                            <div
                              className={`flex h-10 w-10 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-xl text-base shadow-sm ${
                                isIncome
                                  ? "bg-[#10b981]/15 text-emerald-600 dark:text-[#4edea3] border border-[#10b981]/30"
                                  : isTransfer
                                  ? "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30"
                                  : isCardPurchase
                                  ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30"
                                  : isCardPayment
                                  ? "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30"
                                  : "bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30"
                              }`}
                            >
                              {isIncome ? (
                                <ArrowDownLeft className="h-5 w-5" />
                              ) : isTransfer ? (
                                <ArrowLeftRight className="h-5 w-5" />
                              ) : (
                                <ArrowUpRight className="h-5 w-5" />
                              )}
                            </div>

                            {/* Details */}
                            <div className="min-w-0">
                              <p className="truncate text-xs sm:text-sm font-bold text-[var(--foreground)]">
                                {tx.description}
                              </p>
                              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-[var(--muted-foreground)]">
                                <span>{formatDisplayDate(tx.transaction_date)}</span>
                                <span>•</span>
                                <Badge
                                  variant="outline"
                                  className="text-[9px] uppercase font-semibold py-0 px-1.5 border-[var(--border)] text-[var(--foreground)]"
                                >
                                  {categoryMap[tx.category_id ?? ""] ||
                                    (isIncome
                                      ? "Income"
                                      : isTransfer
                                      ? "Transfer"
                                      : isCardPurchase
                                      ? "Card Spend"
                                      : isCardPayment
                                      ? "Card Repayment"
                                      : "Expense")}
                                </Badge>
                                <span className="hidden sm:inline">•</span>
                                <span className="hidden sm:inline text-[var(--muted-foreground)] text-[11px]">
                                  {accountMap[tx.account_id ?? ""] ||
                                    (tx.from_account_id ? "Transfer Source" : "Account")}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Amount */}
                          <div className="shrink-0 text-right">
                            <p
                              className={`text-sm sm:text-base font-black tabular-nums drop-shadow-sm ${
                                isIncome
                                  ? "text-emerald-600 dark:text-[#4edea3]"
                                  : isTransfer
                                  ? "text-cyan-600 dark:text-cyan-400"
                                  : "text-[var(--foreground)]"
                              }`}
                            >
                              {isIncome ? "+" : isTransfer ? "" : "−"}
                              {isTransfer ? "" : formatRupees(tx.amount_paise)}
                            </p>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
