"use client";

import React, { useState } from "react";
import {
  Users,
  Search,
  Plus,
  Phone,
  ArrowUpRight,
  ArrowDownLeft,
} from "lucide-react";
import { MoneyTrackerNav } from "../MoneyTrackerNav";
import { CreateAgreementModal } from "../CreateAgreementModal";
import type {
  FinancialAccount,
  MoneyTrackerMetrics,
  Person,
  PersonSummary,
} from "@/lib/finance/types";

interface PeopleDirectoryViewProps {
  metrics: MoneyTrackerMetrics;
  people: Person[];
  peopleSummaries: PersonSummary[];
  accounts: FinancialAccount[];
}

export function PeopleDirectoryView({
  metrics,
  people,
  peopleSummaries,
  accounts,
}: PeopleDirectoryViewProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const filteredPeople = peopleSummaries.filter((p) => {
    if (!searchQuery.trim()) return true;
    const name = p.person.name.toLowerCase();
    const phone = p.person.phone?.toLowerCase() || "";
    const q = searchQuery.toLowerCase();
    return name.includes(q) || phone.includes(q);
  });

  return (
    <div className="space-y-6">
      {/* Subnavigation Bar */}
      <MoneyTrackerNav
        activeGivenCount={metrics.activeGivenCount}
        activeTakenCount={metrics.activeTakenCount}
        settledCount={metrics.settledCount}
        peopleCount={people.length}
        onOpenCreateModal={() => setIsCreateModalOpen(true)}
      />

      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-[var(--foreground)] tracking-tight">
            People Directory
          </h2>
          <p className="text-xs text-[var(--foreground-subtle)] mt-1">
            People you have given money to or taken money from (records remain strictly separate)
          </p>
        </div>

        {/* Search Input */}
        <div className="relative shrink-0">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--foreground-subtle)]" />
          <input
            type="text"
            placeholder="Search by name or phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 pr-3.5 py-2 rounded-xl bg-slate-100/70 dark:bg-white/[0.04] border border-slate-200/80 dark:border-white/10 text-xs text-[var(--foreground)] outline-none focus:border-emerald-500 w-full sm:w-64"
          />
        </div>
      </div>

      {/* People Grid */}
      {filteredPeople.length === 0 ? (
        <div className="aura-card-obsidian rounded-3xl p-10 text-center border border-[var(--surface-card-border)] space-y-3">
          <div className="h-12 w-12 mx-auto rounded-2xl bg-slate-200/50 dark:bg-white/10 text-slate-600 dark:text-slate-300 flex items-center justify-center">
            <Users className="h-6 w-6 text-emerald-500" />
          </div>
          <h4 className="text-base font-bold text-[var(--foreground)]">
            No Contacts Found
          </h4>
          <p className="text-xs text-[var(--foreground-subtle)] max-w-sm mx-auto">
            Add your first money record to create contacts automatically.
          </p>
          <button
            type="button"
            onClick={() => setIsCreateModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500 text-slate-950 text-xs font-bold shadow-md hover:bg-emerald-400 transition-all cursor-pointer mt-2"
          >
            <Plus className="h-4 w-4 stroke-[2.5]" />
            <span>Add First Record</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredPeople.map((summary) => {
            const { person } = summary;

            return (
              <div
                key={person.id}
                className="aura-card-obsidian rounded-3xl p-5 sm:p-6 border border-[var(--surface-card-border)] hover:border-emerald-500/30 transition-all flex flex-col justify-between gap-4"
              >
                <div>
                  {/* Contact Info Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-base font-bold text-[var(--foreground)] tracking-tight">
                        {person.name}
                      </h3>
                      {person.phone && (
                        <p className="text-xs text-[var(--foreground-subtle)] mt-0.5 flex items-center gap-1 font-mono">
                          <Phone className="h-3 w-3" />
                          <span>{person.phone}</span>
                        </p>
                      )}
                    </div>
                    <span className="text-[10px] font-mono text-[var(--foreground-subtle)]">
                      {summary.activeGivenCount + summary.activeTakenCount} active
                    </span>
                  </div>

                  {/* Strictly Separate Given and Taken Cards (Never Auto-Offset) */}
                  <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                    {/* Given Block */}
                    <div className="p-3 rounded-2xl bg-emerald-500/5 border border-emerald-500/15 flex flex-col justify-between">
                      <div>
                        <span className="text-[10px] font-bold text-emerald-800 dark:text-[#4edea3] flex items-center gap-1 mb-1">
                          <ArrowUpRight className="h-3 w-3" />
                          <span>Money Given</span>
                        </span>
                        <span className="text-sm font-black font-mono text-emerald-700 dark:text-[#4edea3] block">
                          ₹{(summary.outstandingReceivablePaise / 100).toLocaleString("en-IN")}
                        </span>
                        <span className="text-[9px] text-[var(--foreground-subtle)] block">
                          Outstanding to Receive
                        </span>
                      </div>
                      <div className="mt-2 pt-2 border-t border-emerald-500/10 text-[10px] text-[var(--foreground-subtle)]">
                        <span>Total: ₹{(summary.totalGivenPaise / 100).toLocaleString("en-IN")}</span>
                      </div>
                    </div>

                    {/* Taken Block */}
                    <div className="p-3 rounded-2xl bg-cyan-500/5 border border-cyan-500/15 flex flex-col justify-between">
                      <div>
                        <span className="text-[10px] font-bold text-cyan-800 dark:text-cyan-400 flex items-center gap-1 mb-1">
                          <ArrowDownLeft className="h-3 w-3" />
                          <span>Money Taken</span>
                        </span>
                        <span className="text-sm font-black font-mono text-cyan-700 dark:text-cyan-300 block">
                          ₹{(summary.outstandingPayablePaise / 100).toLocaleString("en-IN")}
                        </span>
                        <span className="text-[9px] text-[var(--foreground-subtle)] block">
                          Outstanding to Repay
                        </span>
                      </div>
                      <div className="mt-2 pt-2 border-t border-cyan-500/10 text-[10px] text-[var(--foreground-subtle)]">
                        <span>Total: ₹{(summary.totalTakenPaise / 100).toLocaleString("en-IN")}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div className="pt-3 border-t border-[var(--surface-panel-border)] flex items-center justify-between text-xs text-[var(--foreground-subtle)]">
                  <span>
                    {summary.activeGivenCount + summary.activeTakenCount} Active · {summary.settledCount} Settled
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsCreateModalOpen(true)}
                    className="text-xs font-bold text-emerald-600 dark:text-[#4edea3] hover:underline cursor-pointer"
                  >
                    + Add Record
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Record Modal */}
      <CreateAgreementModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        people={people}
        accounts={accounts}
      />
    </div>
  );
}
