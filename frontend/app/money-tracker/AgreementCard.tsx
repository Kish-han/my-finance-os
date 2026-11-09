"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  ArrowDownLeft,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Phone,
  Plus,
} from "lucide-react";
import { RecordRepaymentModal } from "./RecordRepaymentModal";
import type {
  AgreementBalance,
  FinancialAccount,
  PersonalLoanAgreement,
} from "@/lib/finance/types";

interface AgreementCardProps {
  agreement: PersonalLoanAgreement;
  balance: AgreementBalance;
  accounts: FinancialAccount[];
}

export function AgreementCard({
  agreement,
  balance,
  accounts,
}: AgreementCardProps) {
  const [isRepayModalOpen, setIsRepayModalOpen] = useState(false);

  const isLent = agreement.direction === "given";
  const isSettled = balance.isSettled;

  return (
    <>
      <article className="aura-card-obsidian rounded-3xl p-5 sm:p-6 border border-[var(--surface-card-border)] hover:border-emerald-500/30 transition-all flex flex-col justify-between group">
        <div>
          {/* Header Row: Direction & Status */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-xl ${
                  isLent
                    ? "bg-emerald-500/15 text-emerald-800 dark:text-[#4edea3] border border-emerald-500/25"
                    : "bg-cyan-500/15 text-cyan-800 dark:text-cyan-400 border border-cyan-500/25"
                }`}
              >
                {isLent ? (
                  <>
                    <ArrowUpRight className="h-3.5 w-3.5 stroke-[2.5]" />
                    <span>Money Given</span>
                  </>
                ) : (
                  <>
                    <ArrowDownLeft className="h-3.5 w-3.5 stroke-[2.5]" />
                    <span>Money Taken</span>
                  </>
                )}
              </span>

              {isSettled ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200/80 dark:bg-white/10 text-slate-700 dark:text-slate-300">
                  <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                  <span>Settled</span>
                </span>
              ) : (
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20">
                  Active
                </span>
              )}
            </div>

            <div className="flex items-center gap-1 text-[11px] font-mono text-[var(--foreground-subtle)]">
              <Calendar className="h-3.5 w-3.5" />
              <span>{agreement.agreementDate}</span>
            </div>
          </div>

          {/* Person & Notes */}
          <div className="mt-4">
            <Link
              href={`/money-tracker/agreement/${agreement.id}`}
              className="text-base font-black text-[var(--foreground)] hover:text-emerald-600 dark:hover:text-[#4edea3] transition-colors flex items-center gap-1.5"
            >
              <span>{agreement.person?.name || "Counterparty"}</span>
              <ChevronRight className="h-4 w-4 opacity-40 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
            </Link>
            {agreement.person?.phone && (
              <p className="text-[11px] text-[var(--foreground-subtle)] mt-0.5 flex items-center gap-1">
                <Phone className="h-3 w-3" />
                <span>{agreement.person.phone}</span>
              </p>
            )}
            {agreement.notes && (
              <p className="text-xs text-[var(--foreground-muted)] line-clamp-1 mt-1.5 italic">
                &ldquo;{agreement.notes}&rdquo;
              </p>
            )}
          </div>

          {/* Amount Telemetry */}
          <div className="mt-5 p-4 rounded-2xl bg-slate-100/70 dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/10">
            <div className="flex items-end justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--foreground-subtle)] block">
                  {isSettled ? "Settled Amount" : "Outstanding Balance"}
                </span>
                <span className="text-xl sm:text-2xl font-black font-mono text-[var(--foreground)] tabular-nums mt-0.5 block">
                  ₹{(balance.totalOutstandingPaise / 100).toLocaleString("en-IN", {
                    minimumFractionDigits: 2,
                  })}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-mono text-[var(--foreground-subtle)] block">
                  Principal: ₹{(agreement.principalPaise / 100).toLocaleString("en-IN")}
                </span>
                {balance.totalInterestPaise > 0 && (
                  <span className="text-[10px] font-mono text-amber-600 dark:text-amber-400 block">
                    + Interest: ₹{(balance.totalInterestPaise / 100).toLocaleString("en-IN")}
                  </span>
                )}
              </div>
            </div>

            {/* Progress Meter */}
            <div className="mt-3">
              <div className="flex items-center justify-between text-[10px] font-mono mb-1 text-[var(--foreground-subtle)]">
                <span>
                  Recovered: ₹{(balance.totalRepaidPaise / 100).toLocaleString("en-IN")}
                </span>
                <span>{balance.progressPercent}%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    isSettled
                      ? "bg-slate-400 dark:bg-slate-500"
                      : isLent
                      ? "bg-gradient-to-r from-emerald-500 to-teal-400"
                      : "bg-gradient-to-r from-cyan-500 to-blue-400"
                  }`}
                  style={{ width: `${balance.progressPercent}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="mt-5 pt-4 border-t border-[var(--surface-panel-border)] flex items-center justify-between gap-3">
          <div className="text-[11px] text-[var(--foreground-subtle)]">
            {agreement.expectedRepaymentDate ? (
              <span>Due: <strong className="text-[var(--foreground)] font-mono">{agreement.expectedRepaymentDate}</strong></span>
            ) : (
              <span>No due date</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {!isSettled && (
              <button
                type="button"
                onClick={() => setIsRepayModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-800 dark:text-[#4edea3] text-xs font-bold transition-all cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
                <span>{isLent ? "Record Receipt" : "Record Repayment"}</span>
              </button>
            )}

            <Link
              href={`/money-tracker/agreement/${agreement.id}`}
              className="px-3 py-1.5 rounded-xl bg-slate-200/60 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/20 text-slate-800 dark:text-slate-200 text-xs font-bold transition-all"
            >
              Details
            </Link>
          </div>
        </div>
      </article>

      {/* Record Repayment Modal */}
      <RecordRepaymentModal
        isOpen={isRepayModalOpen}
        onClose={() => setIsRepayModalOpen(false)}
        agreement={agreement}
        balance={balance}
        accounts={accounts}
      />
    </>
  );
}
