"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  ArrowDownLeft,
  Users,
  Search,
  Plus,
  ChevronRight,
  Clock,
  AlertCircle,
} from "lucide-react";
import { MoneyTrackerNav } from "./MoneyTrackerNav";
import { CreateAgreementModal } from "./CreateAgreementModal";
import { AgreementCard } from "./AgreementCard";
import { calculateRecordBalance } from "@/lib/finance/money-tracker-engine";
import type {
  FinancialAccount,
  MoneyTrackerMetrics,
  Person,
  PersonSummary,
  PersonalMoneyRecord,
  PersonalMoneyRepayment,
} from "@/lib/finance/types";

interface MoneyTrackerOverviewViewProps {
  metrics: MoneyTrackerMetrics;
  records: PersonalMoneyRecord[];
  repayments: PersonalMoneyRepayment[];
  people: Person[];
  peopleSummaries: PersonSummary[];
  accounts: FinancialAccount[];
  // Backwards compatibility aliases
  agreements?: PersonalMoneyRecord[];
  payments?: PersonalMoneyRepayment[];
}

export function MoneyTrackerOverviewView({
  metrics,
  records: recordsProp,
  repayments: repaymentsProp,
  agreements: agreementsProp,
  payments: paymentsProp,
  people,
  peopleSummaries,
  accounts,
}: MoneyTrackerOverviewViewProps) {
  const records = recordsProp || agreementsProp || [];
  const repayments = repaymentsProp || paymentsProp || [];

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createDirection, setCreateDirection] = useState<"given" | "taken">("given");
  const [searchQuery, setSearchQuery] = useState("");

  const openModalWithDirection = (dir: "given" | "taken") => {
    setCreateDirection(dir);
    setIsCreateModalOpen(true);
  };

  // Filter records by search query
  const filteredRecords = records.filter((r) => {
    if (!searchQuery.trim()) return true;
    const name = r.person?.name?.toLowerCase() || "";
    const notes = r.notes?.toLowerCase() || "";
    const q = searchQuery.toLowerCase();
    return name.includes(q) || notes.includes(q);
  });

  // Outstanding records
  const outstandingRecords = filteredRecords.filter((r) => {
    const bal = calculateRecordBalance(r, repayments);
    return !bal.isSettled;
  });

  // Recent records (latest 6)
  const recentRecords = filteredRecords.slice(0, 6);

  return (
    <div className="space-y-8">
      {/* Subnavigation Bar */}
      <MoneyTrackerNav
        activeGivenCount={metrics.activeGivenCount}
        activeTakenCount={metrics.activeTakenCount}
        settledCount={metrics.settledCount}
        peopleCount={people.length}
        onOpenCreateModal={() => openModalWithDirection("given")}
      />

      {/* 4 Core Financial KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        {/* 1. Total Money Given */}
        <div className="aura-card-obsidian rounded-3xl p-5 sm:p-6 border border-[var(--surface-card-border)] relative overflow-hidden flex flex-col justify-between shadow-lg">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-bold tracking-wider uppercase text-[var(--foreground-subtle)] flex items-center gap-1.5">
                <ArrowUpRight className="h-4 w-4 text-emerald-500" />
                <span>TOTAL GIVEN</span>
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-800 dark:text-[#4edea3]">
                Given
              </span>
            </div>
            <div className="mt-3">
              <span className="text-2xl sm:text-3xl font-black font-mono tracking-tight text-[var(--foreground)] tabular-nums block">
                ₹{(metrics.totalGivenPaise / 100).toLocaleString("en-IN", {
                  minimumFractionDigits: 2,
                })}
              </span>
              <p className="text-[11px] text-[var(--foreground-subtle)] mt-1">
                Recovered: ₹{(metrics.totalReceivedBackPaise / 100).toLocaleString("en-IN")}
              </p>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-[var(--surface-panel-border)] flex items-center justify-between text-[11px] text-[var(--foreground-subtle)]">
            <span>Active: {metrics.activeGivenCount}</span>
            <button
              onClick={() => openModalWithDirection("given")}
              className="text-emerald-700 dark:text-[#4edea3] font-bold hover:underline cursor-pointer"
            >
              + Give Money
            </button>
          </div>
        </div>

        {/* 2. Outstanding to Receive */}
        <div className="aura-card-obsidian rounded-3xl p-5 sm:p-6 border border-[var(--surface-card-border)] relative overflow-hidden flex flex-col justify-between shadow-lg">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-bold tracking-wider uppercase text-[var(--foreground-subtle)] flex items-center gap-1.5">
                <AlertCircle className="h-4 w-4 text-emerald-600 dark:text-[#4edea3]" />
                <span>TO RECEIVE</span>
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-800 dark:text-[#4edea3] font-mono">
                Receivable
              </span>
            </div>
            <div className="mt-3">
              <span className="text-2xl sm:text-3xl font-black font-mono tracking-tight text-emerald-600 dark:text-[#4edea3] tabular-nums block">
                ₹{(metrics.outstandingReceivablesPaise / 100).toLocaleString("en-IN", {
                  minimumFractionDigits: 2,
                })}
              </span>
              <p className="text-[11px] text-[var(--foreground-subtle)] mt-1">
                Amount people currently owe you
              </p>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-[var(--surface-panel-border)]">
            <Link
              href="/money-tracker/given"
              className="text-[11px] text-emerald-700 dark:text-[#4edea3] font-bold flex items-center justify-between hover:underline"
            >
              <span>View all given</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>

        {/* 3. Total Money Taken */}
        <div className="aura-card-obsidian rounded-3xl p-5 sm:p-6 border border-[var(--surface-card-border)] relative overflow-hidden flex flex-col justify-between shadow-lg">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-bold tracking-wider uppercase text-[var(--foreground-subtle)] flex items-center gap-1.5">
                <ArrowDownLeft className="h-4 w-4 text-cyan-500" />
                <span>TOTAL TAKEN</span>
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-800 dark:text-cyan-400">
                Taken
              </span>
            </div>
            <div className="mt-3">
              <span className="text-2xl sm:text-3xl font-black font-mono tracking-tight text-[var(--foreground)] tabular-nums block">
                ₹{(metrics.totalBorrowedPaise / 100).toLocaleString("en-IN", {
                  minimumFractionDigits: 2,
                })}
              </span>
              <p className="text-[11px] text-[var(--foreground-subtle)] mt-1">
                Repaid: ₹{(metrics.totalRepaidPaise / 100).toLocaleString("en-IN")}
              </p>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-[var(--surface-panel-border)] flex items-center justify-between text-[11px] text-[var(--foreground-subtle)]">
            <span>Active: {metrics.activeTakenCount}</span>
            <button
              onClick={() => openModalWithDirection("taken")}
              className="text-cyan-700 dark:text-cyan-400 font-bold hover:underline cursor-pointer"
            >
              + Take Money
            </button>
          </div>
        </div>

        {/* 4. Outstanding to Repay */}
        <div className="aura-card-obsidian rounded-3xl p-5 sm:p-6 border border-[var(--surface-card-border)] relative overflow-hidden flex flex-col justify-between shadow-lg">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-bold tracking-wider uppercase text-[var(--foreground-subtle)] flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
                <span>TO REPAY</span>
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-800 dark:text-cyan-400 font-mono">
                Payable
              </span>
            </div>
            <div className="mt-3">
              <span className="text-2xl sm:text-3xl font-black font-mono tracking-tight text-cyan-700 dark:text-cyan-300 tabular-nums block">
                ₹{(metrics.outstandingPayablesPaise / 100).toLocaleString("en-IN", {
                  minimumFractionDigits: 2,
                })}
              </span>
              <p className="text-[11px] text-[var(--foreground-subtle)] mt-1">
                Amount you currently owe others
              </p>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-[var(--surface-panel-border)]">
            <Link
              href="/money-tracker/taken"
              className="text-[11px] text-cyan-700 dark:text-cyan-400 font-bold flex items-center justify-between hover:underline"
            >
              <span>View all taken</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </div>

      {/* Person-wise Outstanding Amounts (STRICTLY SEPARATE GIVEN & TAKEN) */}
      <section className="aura-card-obsidian rounded-3xl p-6 sm:p-7 border border-[var(--surface-card-border)] space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-black text-[var(--foreground)] tracking-tight flex items-center gap-2">
              <Users className="h-4 w-4 text-emerald-500" />
              <span>Person-Wise Outstanding</span>
            </h2>
            <p className="text-xs text-[var(--foreground-subtle)] mt-0.5">
              Given and Taken records for each person are kept strictly separate
            </p>
          </div>
          <Link
            href="/money-tracker/people"
            className="text-xs font-bold text-emerald-700 dark:text-[#4edea3] hover:underline flex items-center gap-1 self-start sm:self-auto"
          >
            <span>Directory ({people.length})</span>
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {peopleSummaries.length === 0 ? (
          <div className="p-8 rounded-2xl bg-slate-100/50 dark:bg-white/[0.02] border border-dashed border-slate-300 dark:border-white/10 text-center">
            <p className="text-xs text-[var(--foreground-subtle)]">
              No contacts yet. When you record money given or taken, people will appear here.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {peopleSummaries
              .filter(
                (ps) =>
                  ps.outstandingReceivablePaise > 0 || ps.outstandingPayablePaise > 0
              )
              .slice(0, 9)
              .map((ps) => (
                <div
                  key={ps.person.id}
                  className="p-4 rounded-2xl bg-slate-100/70 dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/10 flex flex-col justify-between gap-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-[var(--foreground)] truncate">
                      {ps.person.name}
                    </span>
                    <span className="text-[10px] text-[var(--foreground-subtle)] font-mono">
                      {ps.activeGivenCount + ps.activeTakenCount} active
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px] pt-2 border-t border-[var(--surface-panel-border)]">
                    <div>
                      <span className="text-[10px] text-[var(--foreground-subtle)] block">
                        To Receive
                      </span>
                      <span className="font-mono font-bold text-emerald-600 dark:text-[#4edea3]">
                        ₹{(ps.outstandingReceivablePaise / 100).toLocaleString("en-IN")}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-[var(--foreground-subtle)] block">
                        To Repay
                      </span>
                      <span className="font-mono font-bold text-cyan-600 dark:text-cyan-400">
                        ₹{(ps.outstandingPayablePaise / 100).toLocaleString("en-IN")}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        )}
      </section>

      {/* Filter / Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-black text-[var(--foreground)] tracking-tight">
            Outstanding Records
          </h2>
          <p className="text-xs text-[var(--foreground-muted)]">
            Active balances requiring recovery or repayment
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

          <button
            onClick={() => openModalWithDirection("given")}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold text-xs shadow-md shadow-emerald-500/20 active:scale-[0.98] transition-all cursor-pointer whitespace-nowrap"
          >
            <Plus className="h-4 w-4 stroke-[2.5]" />
            <span>Add Record</span>
          </button>
        </div>
      </div>

      {/* Outstanding Records Grid */}
      {outstandingRecords.length === 0 ? (
        <div className="aura-card-obsidian rounded-3xl p-12 border border-[var(--surface-card-border)] text-center space-y-4">
          <p className="text-sm font-semibold text-[var(--foreground-muted)]">
            {searchQuery ? "No matching records found." : "No outstanding money records at this time."}
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => openModalWithDirection("given")}
              className="px-4 py-2 rounded-xl bg-emerald-500 text-slate-950 font-bold text-xs"
            >
              + Give Money
            </button>
            <button
              onClick={() => openModalWithDirection("taken")}
              className="px-4 py-2 rounded-xl bg-cyan-500 text-slate-950 font-bold text-xs"
            >
              + Take Money
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {outstandingRecords.map((record) => {
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

      {/* Recent Activity Section */}
      <section className="aura-card-obsidian rounded-3xl p-6 sm:p-7 border border-[var(--surface-card-border)] space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-black text-[var(--foreground)] tracking-tight">
            Recent Records
          </h2>
          <span className="text-xs text-[var(--foreground-subtle)] font-mono">
            {recentRecords.length} records
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {recentRecords.map((record) => {
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
      </section>

      {/* Create Modal */}
      <CreateAgreementModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        people={people}
        accounts={accounts}
        defaultDirection={createDirection}
      />
    </div>
  );
}
