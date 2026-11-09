"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Handshake,
  ArrowUpRight,
  ArrowDownLeft,
  Scale,
  Users,
  Search,
  Plus,
  ChevronRight,
} from "lucide-react";
import { MoneyTrackerNav } from "./MoneyTrackerNav";
import { CreateAgreementModal } from "./CreateAgreementModal";
import { AgreementCard } from "./AgreementCard";
import { calculateAgreementBalance } from "@/lib/finance/money-tracker-engine";
import type {
  FinancialAccount,
  MoneyTrackerMetrics,
  Person,
  PersonBalanceSummary,
  PersonalLoanAgreement,
  PersonalLoanPayment,
} from "@/lib/finance/types";

interface MoneyTrackerOverviewViewProps {
  metrics: MoneyTrackerMetrics;
  agreements: PersonalLoanAgreement[];
  payments: PersonalLoanPayment[];
  people: Person[];
  peopleSummaries: PersonBalanceSummary[];
  accounts: FinancialAccount[];
}

export function MoneyTrackerOverviewView({
  metrics,
  agreements,
  payments,
  people,
  peopleSummaries,
  accounts,
}: MoneyTrackerOverviewViewProps) {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createDirection, setCreateDirection] = useState<"given" | "taken">("given");
  const [searchQuery, setSearchQuery] = useState("");

  const openModalWithDirection = (dir: "given" | "taken") => {
    setCreateDirection(dir);
    setIsCreateModalOpen(true);
  };

  const isNetPositive = metrics.netPositionPaise >= 0;

  // Filter agreements by search
  const filteredAgreements = agreements.filter((a) => {
    if (!searchQuery.trim()) return true;
    const name = a.person?.name?.toLowerCase() || "";
    const notes = a.notes?.toLowerCase() || "";
    const q = searchQuery.toLowerCase();
    return name.includes(q) || notes.includes(q);
  });

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

      {/* Flagship KPI Hero: Net Lending Position */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Main Hero Card: Net Position */}
        <div className="aura-card-obsidian lg:col-span-1 rounded-3xl p-6 sm:p-7 border border-[var(--surface-card-border)] relative overflow-hidden flex flex-col justify-between shadow-xl">
          <div className="relative z-10">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-bold tracking-widest uppercase text-[var(--foreground-subtle)] flex items-center gap-1.5">
                <Scale className="h-3.5 w-3.5 text-emerald-600 dark:text-[#4edea3]" />
                <span>NET LENDING POSITION</span>
              </span>
              <span
                className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                  isNetPositive
                    ? "bg-emerald-500/15 text-emerald-800 dark:text-[#4edea3]"
                    : "bg-cyan-500/15 text-cyan-800 dark:text-cyan-400"
                }`}
              >
                {isNetPositive ? "Net Creditor" : "Net Debtor"}
              </span>
            </div>

            <div className="mt-3">
              <span className="text-3xl sm:text-4xl font-black font-mono tracking-tight text-[var(--foreground)] tabular-nums block">
                {metrics.netPositionPaise < 0 ? "-" : ""}₹
                {(Math.abs(metrics.netPositionPaise) / 100).toLocaleString(
                  "en-IN",
                  { minimumFractionDigits: 2 }
                )}
              </span>
              <p className="text-xs text-[var(--foreground-muted)] mt-1.5">
                {isNetPositive
                  ? "Overall people owe you more than you owe others"
                  : "Overall you owe more than people owe you"}
              </p>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-[var(--surface-panel-border)] flex items-center gap-2">
            <button
              type="button"
              onClick={() => openModalWithDirection("given")}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-800 dark:text-[#4edea3] text-xs font-bold transition-all cursor-pointer"
            >
              <ArrowUpRight className="h-3.5 w-3.5 stroke-[2.5]" />
              <span>Lend Money</span>
            </button>
            <button
              type="button"
              onClick={() => openModalWithDirection("taken")}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-800 dark:text-cyan-400 text-xs font-bold transition-all cursor-pointer"
            >
              <ArrowDownLeft className="h-3.5 w-3.5 stroke-[2.5]" />
              <span>Borrow Money</span>
            </button>
          </div>
        </div>

        {/* Receivables & Payables Breakdown Cards */}
        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-5">
          {/* Receivables Card */}
          <div className="aura-card-obsidian rounded-3xl p-6 border border-[var(--surface-card-border)] flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold tracking-widest uppercase text-emerald-700 dark:text-[#4edea3] flex items-center gap-1.5">
                  <ArrowUpRight className="h-3.5 w-3.5 stroke-[2.5]" />
                  <span>MONEY GIVEN (RECEIVABLES)</span>
                </span>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-800 dark:text-[#4edea3]">
                  {metrics.activeGivenCount} Active
                </span>
              </div>

              <div className="mt-3">
                <span className="text-2xl sm:text-3xl font-black font-mono text-[var(--foreground)] tabular-nums block">
                  ₹{(metrics.outstandingReceivablesPaise / 100).toLocaleString(
                    "en-IN",
                    { minimumFractionDigits: 2 }
                  )}
                </span>
                <span className="text-[11px] text-[var(--foreground-subtle)] mt-0.5 block">
                  Outstanding balance to be collected
                </span>
              </div>
            </div>

            <div className="mt-5 pt-3 border-t border-[var(--surface-panel-border)] flex items-center justify-between text-xs">
              <div>
                <span className="text-[10px] text-[var(--foreground-subtle)] block">Total Lent</span>
                <span className="font-mono font-bold text-[var(--foreground)]">
                  ₹{(metrics.totalGivenPaise / 100).toLocaleString("en-IN")}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-[var(--foreground-subtle)] block">Recovered</span>
                <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  ₹{(metrics.totalReceivedBackPaise / 100).toLocaleString("en-IN")}
                </span>
              </div>
            </div>
          </div>

          {/* Payables Card */}
          <div className="aura-card-obsidian rounded-3xl p-6 border border-[var(--surface-card-border)] flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold tracking-widest uppercase text-cyan-700 dark:text-cyan-400 flex items-center gap-1.5">
                  <ArrowDownLeft className="h-3.5 w-3.5 stroke-[2.5]" />
                  <span>MONEY TAKEN (PAYABLES)</span>
                </span>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-800 dark:text-cyan-400">
                  {metrics.activeTakenCount} Active
                </span>
              </div>

              <div className="mt-3">
                <span className="text-2xl sm:text-3xl font-black font-mono text-[var(--foreground)] tabular-nums block">
                  ₹{(metrics.outstandingPayablesPaise / 100).toLocaleString(
                    "en-IN",
                    { minimumFractionDigits: 2 }
                  )}
                </span>
                <span className="text-[11px] text-[var(--foreground-subtle)] mt-0.5 block">
                  Outstanding debt to be repaid
                </span>
              </div>
            </div>

            <div className="mt-5 pt-3 border-t border-[var(--surface-panel-border)] flex items-center justify-between text-xs">
              <div>
                <span className="text-[10px] text-[var(--foreground-subtle)] block">Total Borrowed</span>
                <span className="font-mono font-bold text-[var(--foreground)]">
                  ₹{(metrics.totalBorrowedPaise / 100).toLocaleString("en-IN")}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-[var(--foreground-subtle)] block">Repaid</span>
                <span className="font-mono font-bold text-cyan-600 dark:text-cyan-400">
                  ₹{(metrics.totalRepaidPaise / 100).toLocaleString("en-IN")}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Top Counterparties / People Quick Bar */}
      {peopleSummaries.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-[var(--foreground)] flex items-center gap-2">
              <Users className="h-4 w-4 text-emerald-600 dark:text-[#4edea3]" />
              <span>Counterparties Directory</span>
            </h3>
            <Link
              href="/money-tracker/people"
              className="text-xs font-bold text-emerald-600 dark:text-[#4edea3] hover:underline flex items-center gap-1"
            >
              <span>View All ({people.length})</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {peopleSummaries.slice(0, 4).map((p) => {
              const owesUser = p.netPositionPaise > 0;
              const userOwes = p.netPositionPaise < 0;
              return (
                <div
                  key={p.person.id}
                  className="p-3.5 rounded-2xl bg-slate-100/70 dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/10 hover:border-emerald-500/30 transition-all flex flex-col justify-between"
                >
                  <div>
                    <h4 className="text-xs font-bold text-[var(--foreground)] truncate">
                      {p.person.name}
                    </h4>
                    {p.person.phone && (
                      <span className="text-[10px] text-[var(--foreground-subtle)] truncate block">
                        {p.person.phone}
                      </span>
                    )}
                  </div>
                  <div className="mt-2.5 pt-2 border-t border-[var(--surface-panel-border)] flex items-center justify-between text-[11px] font-mono">
                    <span className="text-[10px] text-[var(--foreground-subtle)]">
                      {owesUser ? "Owes you" : userOwes ? "You owe" : "Settled"}
                    </span>
                    <span
                      className={`font-bold ${
                        owesUser
                          ? "text-emerald-700 dark:text-[#4edea3]"
                          : userOwes
                          ? "text-cyan-700 dark:text-cyan-400"
                          : "text-[var(--foreground-subtle)]"
                      }`}
                    >
                      ₹{(Math.abs(p.netPositionPaise) / 100).toLocaleString("en-IN")}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Active Agreements Lists */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-black text-[var(--foreground)] tracking-tight">
            Active Agreements
          </h3>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--foreground-subtle)]" />
              <input
                type="text"
                placeholder="Search person..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 rounded-xl bg-slate-100/70 dark:bg-white/[0.04] border border-slate-200/80 dark:border-white/10 text-xs text-[var(--foreground)] outline-none focus:border-emerald-500"
              />
            </div>
          </div>
        </div>

        {agreements.length === 0 ? (
          <div className="aura-card-obsidian rounded-3xl p-10 text-center border border-[var(--surface-card-border)] space-y-3">
            <div className="h-12 w-12 mx-auto rounded-2xl bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-[#4edea3] flex items-center justify-center">
              <Handshake className="h-6 w-6" />
            </div>
            <h4 className="text-base font-bold text-[var(--foreground)]">
              No Agreements Yet
            </h4>
            <p className="text-xs text-[var(--foreground-subtle)] max-w-sm mx-auto">
              Start tracking money you lend to friends, family, or colleagues, and informal personal borrowings.
            </p>
            <button
              type="button"
              onClick={() => openModalWithDirection("given")}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500 text-slate-950 text-xs font-bold shadow-md hover:bg-emerald-400 transition-all cursor-pointer mt-2"
            >
              <Plus className="h-4 w-4 stroke-[2.5]" />
              <span>Create First Agreement</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {filteredAgreements
              .filter((a) => a.status === "active")
              .map((agreement) => {
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
      </div>

      {/* Create Agreement Modal */}
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
