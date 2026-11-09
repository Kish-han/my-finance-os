"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  ArrowDownLeft,
  Calendar,
  CheckCircle2,
  Coins,
  Phone,
  Plus,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import { RecordRepaymentModal } from "../RecordRepaymentModal";
import { deleteRecordAction } from "../actions";
import type {
  FinancialAccount,
  PersonalMoneyRecord,
  PersonalMoneyRepayment,
  RecordBalance,
} from "@/lib/finance/types";

interface RecordDetailViewProps {
  record: PersonalMoneyRecord;
  repayments: PersonalMoneyRepayment[];
  balance: RecordBalance;
  accounts: FinancialAccount[];
}

export function RecordDetailView({
  record,
  repayments,
  balance,
  accounts,
}: RecordDetailViewProps) {
  const [isRepayModalOpen, setIsRepayModalOpen] = useState(false);
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const isLent = record.direction === "given";
  const isSettled = balance.isSettled;

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb & Actions Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[var(--surface-panel-border)]">
        <Link
          href="/money-tracker"
          className="inline-flex items-center gap-2 text-xs font-bold text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Money Tracker</span>
        </Link>

        <div className="flex items-center gap-2.5">
          {!isSettled && (
            <button
              type="button"
              onClick={() => setIsRepayModalOpen(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold text-xs shadow-md shadow-emerald-500/20 active:scale-[0.98] transition-all cursor-pointer"
            >
              <Plus className="h-4 w-4 stroke-[2.5]" />
              <span>{isLent ? "Record Receipt" : "Record Repayment"}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsConfirmDeleteOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 font-bold text-xs transition-all cursor-pointer"
          >
            <Trash2 className="h-4 w-4" />
            <span>Delete</span>
          </button>
        </div>
      </div>

      {/* Flagship Header Card */}
      <div className="aura-card-obsidian rounded-3xl p-6 sm:p-8 border border-[var(--surface-card-border)] space-y-6 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <span
                className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-xl ${
                  isLent
                    ? "bg-emerald-500/15 text-emerald-800 dark:text-[#4edea3] border border-emerald-500/30"
                    : "bg-cyan-500/15 text-cyan-800 dark:text-cyan-400 border border-cyan-500/30"
                }`}
              >
                {isLent ? (
                  <>
                    <ArrowUpRight className="h-4 w-4 stroke-[2.5]" />
                    <span>Money Given</span>
                  </>
                ) : (
                  <>
                    <ArrowDownLeft className="h-4 w-4 stroke-[2.5]" />
                    <span>Money Taken</span>
                  </>
                )}
              </span>

              {isSettled ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full bg-slate-200/80 dark:bg-white/10 text-slate-700 dark:text-slate-300">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  <span>Fully Settled</span>
                </span>
              ) : (
                <span className="text-xs font-mono font-bold px-3 py-1 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/25">
                  Active Outstanding
                </span>
              )}
            </div>

            <h1 className="text-2xl sm:text-3xl font-black text-[var(--foreground)] tracking-tight mt-3">
              {record.person?.name}
            </h1>
            {record.person?.phone && (
              <p className="text-xs text-[var(--foreground-subtle)] font-mono flex items-center gap-1.5 mt-1">
                <Phone className="h-3.5 w-3.5" />
                <span>{record.person.phone}</span>
              </p>
            )}
          </div>

          {/* Outstanding Balance Callout */}
          <div className="p-4 rounded-2xl bg-slate-100/70 dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/10 text-left sm:text-right">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--foreground-subtle)] block">
              Remaining Outstanding
            </span>
            <span className="text-2xl sm:text-3xl font-black font-mono text-[var(--foreground)] tabular-nums mt-0.5 block">
              ₹{(balance.outstandingPaise / 100).toLocaleString("en-IN", {
                minimumFractionDigits: 2,
              })}
            </span>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs font-mono text-[var(--foreground-subtle)]">
            <span>
              Repaid: ₹{(balance.totalRepaidPaise / 100).toLocaleString("en-IN")} of ₹
              {(record.amountPaise / 100).toLocaleString("en-IN")}
            </span>
            <span className="font-bold text-[var(--foreground)]">{balance.progressPercent}%</span>
          </div>
          <div className="h-3 w-full rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
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

        {/* 3 Telemetry Metrics Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-3.5 rounded-2xl bg-slate-100/60 dark:bg-white/[0.02] border border-slate-200/60 dark:border-white/5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--foreground-subtle)] block">
              Original Amount
            </span>
            <span className="text-base font-bold font-mono text-[var(--foreground)] tabular-nums mt-0.5 block">
              ₹{(record.amountPaise / 100).toLocaleString("en-IN")}
            </span>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-100/60 dark:bg-white/[0.02] border border-slate-200/60 dark:border-white/5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--foreground-subtle)] block">
              Total Repaid
            </span>
            <span className="text-base font-bold font-mono text-emerald-600 dark:text-emerald-400 tabular-nums mt-0.5 block">
              ₹{(balance.totalRepaidPaise / 100).toLocaleString("en-IN")}
            </span>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-100/60 dark:bg-white/[0.02] border border-slate-200/60 dark:border-white/5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--foreground-subtle)] block">
              Outstanding Balance
            </span>
            <span className="text-base font-bold font-mono text-[var(--foreground)] tabular-nums mt-0.5 block">
              ₹{(balance.outstandingPaise / 100).toLocaleString("en-IN")}
            </span>
          </div>
        </div>
      </div>

      {/* Terms & Account Details */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="aura-card-obsidian rounded-3xl p-6 border border-[var(--surface-card-border)] space-y-4">
          <h3 className="text-sm font-bold text-[var(--foreground)] flex items-center gap-2">
            <Calendar className="h-4 w-4 text-emerald-600 dark:text-[#4edea3]" />
            <span>Timeline & Terms</span>
          </h3>

          <div className="space-y-2.5 text-xs">
            <div className="flex items-center justify-between py-1.5 border-b border-[var(--surface-panel-border)]">
              <span className="text-[var(--foreground-subtle)]">Record Date</span>
              <span className="font-mono font-bold text-[var(--foreground)]">
                {record.recordDate}
              </span>
            </div>

            <div className="flex items-center justify-between py-1.5 border-b border-[var(--surface-panel-border)]">
              <span className="text-[var(--foreground-subtle)]">Expected Return Date</span>
              <span className="font-mono font-bold text-[var(--foreground)]">
                {record.dueDate || "None (Open-ended)"}
              </span>
            </div>

            <div className="flex items-center justify-between py-1.5">
              <span className="text-[var(--foreground-subtle)]">Account Used</span>
              <span className="font-semibold text-[var(--foreground)]">
                {record.account?.name || "Account"}
              </span>
            </div>
          </div>
        </div>

        <div className="aura-card-obsidian rounded-3xl p-6 border border-[var(--surface-card-border)] flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-[var(--foreground)] flex items-center gap-2">
              <Coins className="h-4 w-4 text-emerald-600 dark:text-[#4edea3]" />
              <span>Notes & Context</span>
            </h3>
            <p className="text-xs text-[var(--foreground-muted)] mt-3 italic leading-relaxed">
              {record.notes ? `"${record.notes}"` : "No notes recorded for this transaction."}
            </p>
          </div>

          <div className="pt-4 border-t border-[var(--surface-panel-border)] mt-4 flex items-center justify-between text-xs text-[var(--foreground-subtle)]">
            <span>Status</span>
            <span className="font-bold text-[var(--foreground)] capitalize">{record.status}</span>
          </div>
        </div>
      </div>

      {/* Repayments History */}
      <section className="aura-card-obsidian rounded-3xl p-6 sm:p-7 border border-[var(--surface-card-border)] space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-black text-[var(--foreground)] tracking-tight">
              Repayment History
            </h2>
            <p className="text-xs text-[var(--foreground-subtle)] mt-0.5">
              Chronological log of all partial and full payments
            </p>
          </div>

          {!isSettled && (
            <button
              onClick={() => setIsRepayModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-800 dark:text-[#4edea3] text-xs font-bold transition-all cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
              <span>{isLent ? "Record Receipt" : "Record Repayment"}</span>
            </button>
          )}
        </div>

        {repayments.length === 0 ? (
          <div className="p-8 rounded-2xl bg-slate-100/50 dark:bg-white/[0.02] border border-dashed border-slate-300 dark:border-white/10 text-center">
            <p className="text-xs text-[var(--foreground-subtle)]">
              No repayments recorded yet. Use the button above to record payments.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[var(--surface-panel-border)] text-[10px] font-mono uppercase text-[var(--foreground-subtle)] tracking-wider">
                  <th className="pb-3 font-bold">Date</th>
                  <th className="pb-3 font-bold">Account</th>
                  <th className="pb-3 font-bold text-right">Amount (₹)</th>
                  <th className="pb-3 font-bold">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--surface-panel-border)] font-medium">
                {repayments.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-100/50 dark:hover:bg-white/[0.02] transition-colors">
                    <td className="py-3 font-mono text-[var(--foreground)]">{p.repaymentDate}</td>
                    <td className="py-3 text-[var(--foreground-muted)]">{p.account?.name || "Account"}</td>
                    <td className="py-3 font-mono font-bold text-right text-emerald-600 dark:text-[#4edea3]">
                      ₹{(p.amountPaise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 text-[var(--foreground-subtle)] italic">{p.notes || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Record Repayment Modal */}
      <RecordRepaymentModal
        isOpen={isRepayModalOpen}
        onClose={() => setIsRepayModalOpen(false)}
        record={record}
        balance={balance}
        accounts={accounts}
      />

      {/* Confirm Delete Modal */}
      {isConfirmDeleteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-md"
            onClick={() => setIsConfirmDeleteOpen(false)}
          />
          <div className="relative w-full max-w-md rounded-3xl bg-[var(--background)] p-6 border border-[var(--surface-card-border)] shadow-2xl z-10 space-y-4">
            <div className="flex items-center gap-3 text-rose-600 dark:text-rose-400">
              <AlertTriangle className="h-6 w-6 shrink-0" />
              <h3 className="text-base font-bold text-[var(--foreground)]">
                Delete Money Record?
              </h3>
            </div>
            <p className="text-xs text-[var(--foreground-muted)] leading-relaxed">
              This will permanently delete this record, its {repayments.length} associated repayments,
              and remove their companion transactions from your account ledger.
            </p>
            {deleteError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-500 font-medium">
                {deleteError}
              </div>
            )}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setIsConfirmDeleteOpen(false);
                  setDeleteError(null);
                }}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl bg-slate-200/70 dark:bg-white/10 text-xs font-bold"
              >
                Cancel
              </button>
              <form
                action={async (formData: FormData) => {
                  setIsDeleting(true);
                  setDeleteError(null);
                  try {
                    const res = await deleteRecordAction(null, formData);
                    if (res?.error) {
                      setDeleteError(res.error);
                      setIsDeleting(false);
                    }
                  } catch {
                    // Next.js redirect navigates away
                  }
                }}
              >
                <input type="hidden" name="recordId" value={record.id} />
                <button
                  type="submit"
                  disabled={isDeleting}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-bold transition-all cursor-pointer"
                >
                  {isDeleting ? "Deleting..." : "Confirm Delete"}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export const AgreementDetailView = RecordDetailView;
