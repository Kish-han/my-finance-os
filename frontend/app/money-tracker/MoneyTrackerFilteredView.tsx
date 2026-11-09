"use client";

import React, { useState } from "react";
import {
  ArrowUpRight,
  ArrowDownLeft,
  CheckCircle2,
  Search,
  Plus,
} from "lucide-react";
import { MoneyTrackerNav } from "./MoneyTrackerNav";
import { CreateAgreementModal } from "./CreateAgreementModal";
import { AgreementCard } from "./AgreementCard";
import { calculateAgreementBalance } from "@/lib/finance/money-tracker-engine";
import type {
  FinancialAccount,
  MoneyTrackerMetrics,
  Person,
  PersonalLoanAgreement,
  PersonalLoanPayment,
} from "@/lib/finance/types";

interface MoneyTrackerFilteredViewProps {
  mode: "given" | "taken" | "settled";
  metrics: MoneyTrackerMetrics;
  agreements: PersonalLoanAgreement[];
  payments: PersonalLoanPayment[];
  people: Person[];
  accounts: FinancialAccount[];
}

export function MoneyTrackerFilteredView({
  mode,
  metrics,
  agreements,
  payments,
  people,
  accounts,
}: MoneyTrackerFilteredViewProps) {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const title =
    mode === "given"
      ? "Money Given (Personal Lending)"
      : mode === "taken"
      ? "Money Taken (Personal Borrowing)"
      : "Settled Agreements Archive";

  const subtitle =
    mode === "given"
      ? "Track money you have lent to others and record incoming repayments"
      : mode === "taken"
      ? "Track money you have borrowed from others and manage your repayments"
      : "Complete chronological history of fully repaid lending and borrowing agreements";

  // Filter agreements based on mode
  const displayedAgreements = agreements.filter((a) => {
    const bal = calculateAgreementBalance(a, payments);
    if (mode === "settled") {
      return bal.isSettled;
    }
    if (bal.isSettled) {
      return false;
    }
    return a.direction === mode;
  });

  const searchedAgreements = displayedAgreements.filter((a) => {
    if (!searchQuery.trim()) return true;
    const name = a.person?.name?.toLowerCase() || "";
    const notes = a.notes?.toLowerCase() || "";
    const q = searchQuery.toLowerCase();
    return name.includes(q) || notes.includes(q);
  });

  return (
    <div className="space-y-6">
      {/* Subnavigation Bar */}
      <MoneyTrackerNav
        activeGivenCount={metrics.activeGivenCount}
        activeTakenCount={metrics.activeTakenCount}
        settledCount={metrics.settledCount}
        peopleCount={people.length}
        onOpenCreateModal={
          mode !== "settled" ? () => setIsCreateModalOpen(true) : undefined
        }
      />

      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-[var(--foreground)] tracking-tight">
            {title}
          </h2>
          <p className="text-xs text-[var(--foreground-subtle)] mt-1 max-w-xl">
            {subtitle}
          </p>
        </div>

        {/* Search Input */}
        <div className="relative shrink-0">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--foreground-subtle)]" />
          <input
            type="text"
            placeholder="Search person or notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 pr-3.5 py-2 rounded-xl bg-slate-100/70 dark:bg-white/[0.04] border border-slate-200/80 dark:border-white/10 text-xs text-[var(--foreground)] outline-none focus:border-emerald-500 w-full sm:w-64"
          />
        </div>
      </div>

      {/* Mode-Specific KPI Banner */}
      {mode === "given" && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="aura-card-obsidian rounded-2xl p-4 border border-[var(--surface-card-border)]">
            <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--foreground-subtle)]">
              Outstanding Receivables
            </span>
            <span className="text-xl font-black font-mono text-emerald-700 dark:text-[#4edea3] tabular-nums mt-1 block">
              ₹{(metrics.outstandingReceivablesPaise / 100).toLocaleString(
                "en-IN",
                { minimumFractionDigits: 2 }
              )}
            </span>
          </div>
          <div className="aura-card-obsidian rounded-2xl p-4 border border-[var(--surface-card-border)]">
            <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--foreground-subtle)]">
              Total Lent
            </span>
            <span className="text-xl font-black font-mono text-[var(--foreground)] tabular-nums mt-1 block">
              ₹{(metrics.totalGivenPaise / 100).toLocaleString("en-IN", {
                minimumFractionDigits: 2,
              })}
            </span>
          </div>
          <div className="aura-card-obsidian rounded-2xl p-4 border border-[var(--surface-card-border)]">
            <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--foreground-subtle)]">
              Recovered Back
            </span>
            <span className="text-xl font-black font-mono text-emerald-600 dark:text-emerald-400 tabular-nums mt-1 block">
              ₹{(metrics.totalReceivedBackPaise / 100).toLocaleString("en-IN", {
                minimumFractionDigits: 2,
              })}
            </span>
          </div>
        </div>
      )}

      {mode === "taken" && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="aura-card-obsidian rounded-2xl p-4 border border-[var(--surface-card-border)]">
            <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--foreground-subtle)]">
              Outstanding Payables
            </span>
            <span className="text-xl font-black font-mono text-cyan-700 dark:text-cyan-400 tabular-nums mt-1 block">
              ₹{(metrics.outstandingPayablesPaise / 100).toLocaleString(
                "en-IN",
                { minimumFractionDigits: 2 }
              )}
            </span>
          </div>
          <div className="aura-card-obsidian rounded-2xl p-4 border border-[var(--surface-card-border)]">
            <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--foreground-subtle)]">
              Total Borrowed
            </span>
            <span className="text-xl font-black font-mono text-[var(--foreground)] tabular-nums mt-1 block">
              ₹{(metrics.totalBorrowedPaise / 100).toLocaleString("en-IN", {
                minimumFractionDigits: 2,
              })}
            </span>
          </div>
          <div className="aura-card-obsidian rounded-2xl p-4 border border-[var(--surface-card-border)]">
            <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--foreground-subtle)]">
              Repaid So Far
            </span>
            <span className="text-xl font-black font-mono text-cyan-600 dark:text-cyan-400 tabular-nums mt-1 block">
              ₹{(metrics.totalRepaidPaise / 100).toLocaleString("en-IN", {
                minimumFractionDigits: 2,
              })}
            </span>
          </div>
        </div>
      )}

      {/* Agreements Cards Grid */}
      {searchedAgreements.length === 0 ? (
        <div className="aura-card-obsidian rounded-3xl p-10 text-center border border-[var(--surface-card-border)] space-y-3">
          <div className="h-12 w-12 mx-auto rounded-2xl bg-slate-200/50 dark:bg-white/10 text-slate-600 dark:text-slate-300 flex items-center justify-center">
            {mode === "settled" ? (
              <CheckCircle2 className="h-6 w-6 text-emerald-500" />
            ) : mode === "given" ? (
              <ArrowUpRight className="h-6 w-6 text-emerald-500" />
            ) : (
              <ArrowDownLeft className="h-6 w-6 text-cyan-500" />
            )}
          </div>
          <h4 className="text-base font-bold text-[var(--foreground)]">
            No {mode === "settled" ? "Settled" : mode === "given" ? "Money Given" : "Money Taken"} Agreements Found
          </h4>
          <p className="text-xs text-[var(--foreground-subtle)] max-w-sm mx-auto">
            {mode === "settled"
              ? "Completed agreements with zero remaining balance will appear here automatically."
              : "No active agreements match your filter criteria."}
          </p>
          {mode !== "settled" && (
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500 text-slate-950 text-xs font-bold shadow-md hover:bg-emerald-400 transition-all cursor-pointer mt-2"
            >
              <Plus className="h-4 w-4 stroke-[2.5]" />
              <span>Create Agreement</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {searchedAgreements.map((agreement) => {
            const bal = calculateAgreementBalance(agreement, payments);
            return (
              <AgreementCard
                key={agreement.id}
                agreement={agreement}
                balance={bal}
                accounts={accounts}
              />
            );
          })}
        </div>
      )}

      {/* Create Agreement Modal */}
      {mode !== "settled" && (
        <CreateAgreementModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          people={people}
          accounts={accounts}
          defaultDirection={mode}
        />
      )}
    </div>
  );
}
