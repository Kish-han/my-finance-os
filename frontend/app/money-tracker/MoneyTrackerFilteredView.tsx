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
import { calculateRecordBalance } from "@/lib/finance/money-tracker-engine";
import type {
  FinancialAccount,
  MoneyTrackerMetrics,
  Person,
  PersonalMoneyRecord,
  PersonalMoneyRepayment,
} from "@/lib/finance/types";

interface MoneyTrackerFilteredViewProps {
  mode: "given" | "taken" | "settled";
  metrics: MoneyTrackerMetrics;
  records?: PersonalMoneyRecord[];
  repayments?: PersonalMoneyRepayment[];
  agreements?: PersonalMoneyRecord[];
  payments?: PersonalMoneyRepayment[];
  people: Person[];
  accounts: FinancialAccount[];
}

export function MoneyTrackerFilteredView({
  mode,
  metrics,
  records: recordsProp,
  repayments: repaymentsProp,
  agreements: agreementsProp,
  payments: paymentsProp,
  people,
  accounts,
}: MoneyTrackerFilteredViewProps) {
  const records = recordsProp || agreementsProp || [];
  const repayments = repaymentsProp || paymentsProp || [];

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const title =
    mode === "given"
      ? "Money Given"
      : mode === "taken"
      ? "Money Taken"
      : "Settled Records Archive";

  const subtitle =
    mode === "given"
      ? "Track money you have lent to others and record incoming repayments"
      : mode === "taken"
      ? "Track money you have borrowed from others and record your repayments"
      : "Complete chronological history of fully repaid records";

  // Filter records based on mode
  const displayedRecords = records.filter((r) => {
    const bal = calculateRecordBalance(r, repayments);
    if (mode === "settled") {
      return bal.isSettled;
    }
    if (bal.isSettled) {
      return false;
    }
    return r.direction === mode;
  });

  const searchedRecords = displayedRecords.filter((r) => {
    if (!searchQuery.trim()) return true;
    const name = r.person?.name?.toLowerCase() || "";
    const notes = r.notes?.toLowerCase() || "";
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

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--foreground-subtle)]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by person or notes..."
              className="pl-9 pr-4 py-2 rounded-xl bg-slate-100/70 dark:bg-white/5 border border-slate-300/60 dark:border-white/10 text-xs text-[var(--foreground)] placeholder:text-[var(--foreground-subtle)] focus:outline-none focus:border-emerald-500 transition-all w-full sm:w-64"
            />
          </div>

          {mode !== "settled" && (
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold text-xs shadow-md shadow-emerald-500/20 active:scale-[0.98] transition-all cursor-pointer whitespace-nowrap"
            >
              <Plus className="h-4 w-4 stroke-[2.5]" />
              <span>{mode === "given" ? "Give Money" : "Take Money"}</span>
            </button>
          )}
        </div>
      </div>

      {/* Grid of Cards */}
      {searchedRecords.length === 0 ? (
        <div className="aura-card-obsidian rounded-3xl p-12 border border-[var(--surface-card-border)] text-center space-y-4">
          <div className="inline-flex p-4 rounded-full bg-slate-200/50 dark:bg-white/5 mx-auto">
            {mode === "given" ? (
              <ArrowUpRight className="h-8 w-8 text-emerald-500" />
            ) : mode === "taken" ? (
              <ArrowDownLeft className="h-8 w-8 text-cyan-500" />
            ) : (
              <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            )}
          </div>
          <div>
            <h3 className="text-base font-bold text-[var(--foreground)]">
              {searchQuery ? "No matching records found" : "No records in this section"}
            </h3>
            <p className="text-xs text-[var(--foreground-subtle)] mt-1 max-w-sm mx-auto">
              {mode === "given"
                ? "You haven't recorded any money given to other people."
                : mode === "taken"
                ? "You haven't recorded any money taken from other people."
                : "No settled records yet. When records are fully repaid, they appear here."}
            </p>
          </div>
          {mode !== "settled" && (
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="px-5 py-2.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-md shadow-emerald-500/20 transition-all cursor-pointer inline-flex items-center gap-2"
            >
              <Plus className="h-4 w-4 stroke-[2.5]" />
              <span>{mode === "given" ? "Record Money Given" : "Record Money Taken"}</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {searchedRecords.map((record) => {
            const bal = calculateRecordBalance(record, repayments);
            return (
              <AgreementCard
                key={record.id}
                record={record}
                balance={bal}
                accounts={accounts}
              />
            );
          })}
        </div>
      )}

      {/* Create Modal */}
      <CreateAgreementModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        people={people}
        accounts={accounts}
        defaultDirection={mode === "taken" ? "taken" : "given"}
      />
    </div>
  );
}
