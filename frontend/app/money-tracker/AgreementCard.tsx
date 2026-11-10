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
  FinancialAccount,
  PersonalMoneyRecord,
  RecordBalance,
} from "@/lib/finance/types";

interface AgreementCardProps {
  record?: PersonalMoneyRecord;
  agreement?: PersonalMoneyRecord;
  balance: RecordBalance;
  accounts: FinancialAccount[];
}

export function AgreementCard({
  record: recordProp,
  agreement: agreementProp,
  balance,
  accounts,
}: AgreementCardProps) {
  const [isRepayModalOpen, setIsRepayModalOpen] = useState(false);
  const activeRecord = recordProp || agreementProp;

  if (!activeRecord) return null;

  const isLent = activeRecord.direction === "given";
  const isSettled = balance.isSettled;

  return (
    <>
      <article className="aura-card-obsidian rounded-2xl sm:rounded-3xl p-4 sm:p-5 border border-[var(--surface-card-border)] hover:border-emerald-500/30 transition-all flex flex-col justify-between group min-w-0">
        <div className="min-w-0">
          {/* Header Row: Direction & Status */}
          <div className="flex flex-wrap items-center justify-between gap-2 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap min-w-0">
              <span
                className={`inline-flex items-center gap-1 text-[10px] sm:text-[11px] font-bold px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-xl whitespace-nowrap ${
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
                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200/80 dark:bg-white/10 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                  <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                  <span>Settled</span>
                </span>
              ) : (
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 whitespace-nowrap">
                  Active
                </span>
              )}
            </div>

            <div className="flex items-center gap-1 text-[10px] sm:text-[11px] font-mono text-[var(--foreground-subtle)] shrink-0">
              <Calendar className="h-3.5 w-3.5" />
              <span>{activeRecord.recordDate}</span>
            </div>
          </div>

          {/* Person & Notes */}
          <div className="mt-3.5 min-w-0">
            <Link
              href={`/money-tracker/${activeRecord.id}`}
              className="text-sm sm:text-base font-black text-[var(--foreground)] hover:text-emerald-600 dark:hover:text-[#4edea3] transition-colors flex items-center gap-1.5 truncate"
            >
              <span className="truncate">{activeRecord.person?.name || "Person"}</span>
              <ChevronRight className="h-4 w-4 shrink-0 opacity-40 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
            </Link>
            {activeRecord.person?.phone && (
              <p className="text-[11px] text-[var(--foreground-subtle)] mt-0.5 flex items-center gap-1 font-mono truncate">
                <Phone className="h-3 w-3 shrink-0" />
                <span className="truncate">{activeRecord.person.phone}</span>
              </p>
            )}
            {activeRecord.notes && (
              <p className="text-xs text-[var(--foreground-muted)] line-clamp-1 mt-1 italic">
                &ldquo;{activeRecord.notes}&rdquo;
              </p>
            )}
          </div>

          {/* Amount Telemetry */}
          <div className="mt-4 p-3.5 sm:p-4 rounded-2xl bg-slate-100/70 dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/10 min-w-0">
            <div className="flex flex-wrap items-end justify-between gap-2 min-w-0">
              <div className="min-w-0 flex-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--foreground-subtle)] block truncate">
                  {isSettled ? "Settled Amount" : isLent ? "To Receive" : "To Repay"}
                </span>
                <span className="text-lg sm:text-xl md:text-2xl font-black font-mono text-[var(--foreground)] tabular-nums mt-0.5 block truncate">
                  ₹{(balance.outstandingPaise / 100).toLocaleString("en-IN", {
                    minimumFractionDigits: 2,
                  })}
                </span>
              </div>
              <div className="text-right shrink-0">
                <span className="text-[10px] sm:text-[11px] font-mono text-[var(--foreground-subtle)] block whitespace-nowrap">
                  Total: ₹{(activeRecord.amountPaise / 100).toLocaleString("en-IN")}
                </span>
                <span className="text-[10px] sm:text-[11px] font-mono text-emerald-600 dark:text-[#4edea3] block mt-0.5 whitespace-nowrap">
                  Repaid: ₹{(balance.totalRepaidPaise / 100).toLocaleString("en-IN")}
                </span>
              </div>
            </div>

            {/* Progress Meter */}
            <div className="mt-3">
              <div className="flex items-center justify-between text-[10px] font-mono mb-1 text-[var(--foreground-subtle)]">
                <span>
                  {isSettled ? "Fully Settled" : `${balance.progressPercent}% Repaid`}
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
        <div className="mt-4 pt-3.5 border-t border-[var(--surface-panel-border)] flex flex-wrap items-center justify-between gap-2.5">
          <div className="text-[10px] sm:text-[11px] text-[var(--foreground-subtle)] min-w-0 truncate">
            {activeRecord.dueDate ? (
              <span className="truncate">Return by: <strong className="text-[var(--foreground)] font-mono">{activeRecord.dueDate}</strong></span>
            ) : (
              <span>No return date</span>
            )}
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {!isSettled && (
              <button
                type="button"
                onClick={() => setIsRepayModalOpen(true)}
                className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-800 dark:text-[#4edea3] text-xs font-bold transition-all cursor-pointer whitespace-nowrap"
              >
                <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
                <span className="hidden xs:inline">{isLent ? "Record Receipt" : "Record Repayment"}</span>
                <span className="xs:hidden">{isLent ? "Receipt" : "Repay"}</span>
              </button>
            )}

            <Link
              href={`/money-tracker/${activeRecord.id}`}
              className="px-2.5 sm:px-3 py-1.5 rounded-xl bg-slate-200/60 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/20 text-slate-800 dark:text-slate-200 text-xs font-bold transition-all whitespace-nowrap"
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
        record={activeRecord}
        balance={balance}
        accounts={accounts}
      />
    </>
  );
}

export const MoneyRecordCard = AgreementCard;
