"use client";

import React, { useState, useTransition } from "react";
import {
  X,
  Coins,
  Calendar,
  AlertTriangle,
  Landmark,
  FileText,
} from "lucide-react";
import { recordRepaymentAction } from "./actions";
import type {
  FinancialAccount,
  PersonalMoneyRecord,
  RecordBalance,
} from "@/lib/finance/types";

interface RecordRepaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  record: PersonalMoneyRecord;
  balance: RecordBalance;
  accounts: FinancialAccount[];
  // Backwards compatibility alias
  agreement?: PersonalMoneyRecord;
}

function getTodayString(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

export function RecordRepaymentModal({
  isOpen,
  onClose,
  record: recordProp,
  agreement: agreementProp,
  balance,
  accounts,
}: RecordRepaymentModalProps) {
  const activeRecord = recordProp || agreementProp;

  const outstandingPaise = balance.outstandingPaise;
  const outstandingRupees = (outstandingPaise / 100).toFixed(2);

  const [paymentAmount, setPaymentAmount] = useState(outstandingRupees);
  const [accountId, setAccountId] = useState(accounts[0]?.id || activeRecord?.accountId || "");
  const [repaymentDate, setRepaymentDate] = useState(getTodayString());
  const [notes, setNotes] = useState("");
  const [allowOverdraft, setAllowOverdraft] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!isOpen || !activeRecord) return null;

  const isLent = activeRecord.direction === "given";

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMsg(null);

    const formData = new FormData(e.currentTarget);
    formData.set("recordId", activeRecord.id);
    formData.set("allowOverdraft", allowOverdraft ? "true" : "false");

    startTransition(async () => {
      const res = await recordRepaymentAction(null, formData);
      if (res?.error) {
        setErrorMsg(res.error);
      } else {
        onClose();
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Liquid Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-md transition-opacity"
        onClick={onClose}
      />

      {/* Modal Card */}
      <div className="relative w-full max-w-lg rounded-3xl bg-[var(--background)]/90 dark:bg-[#121619]/90 border border-[var(--surface-card-border)] shadow-2xl backdrop-blur-2xl p-6 sm:p-8 z-10 max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[var(--surface-panel-border)]">
          <div>
            <h2 className="text-xl font-black text-[var(--foreground)] tracking-tight">
              {isLent ? "Record Receipt" : "Record Repayment"}
            </h2>
            <p className="text-xs text-[var(--foreground-muted)] mt-0.5">
              {isLent
                ? `Record money repaid by ${activeRecord.person?.name || "Person"}`
                : `Record money you are repaying to ${activeRecord.person?.name || "Person"}`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-[var(--foreground-muted)] hover:text-[var(--foreground)] hover:bg-slate-200/50 dark:hover:bg-white/10 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {errorMsg && (
          <div className="mt-4 p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-400 text-xs flex items-start gap-2.5">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Current Balance Summary Banner */}
        <div className="mt-5 p-4 rounded-2xl bg-slate-100/70 dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/10 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--foreground-subtle)] block">
              Outstanding Amount
            </span>
            <span className="text-2xl font-black font-mono text-[var(--foreground)] tabular-nums mt-0.5 block">
              ₹{(outstandingPaise / 100).toLocaleString("en-IN", {
                minimumFractionDigits: 2,
              })}
            </span>
          </div>
          <div className="text-right">
            <span className="text-[11px] font-mono text-[var(--foreground-subtle)] block">
              Original: ₹{(activeRecord.amountPaise / 100).toLocaleString("en-IN")}
            </span>
            <span className="text-[11px] font-mono text-emerald-600 dark:text-[#4edea3] block mt-0.5">
              Repaid: ₹{(balance.totalRepaidPaise / 100).toLocaleString("en-IN")}
            </span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-5">
          {/* Repayment Amount */}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--foreground-subtle)] block mb-1.5">
              Repayment Amount (₹) <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <Coins className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--foreground-subtle)]" />
              <input
                type="text"
                name="amount"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                placeholder="0.00"
                required
                className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-slate-100/70 dark:bg-white/5 border border-slate-300/60 dark:border-white/10 text-sm font-mono font-bold text-[var(--foreground)] focus:outline-none focus:border-emerald-500 transition-all placeholder:text-[var(--foreground-subtle)]"
              />
            </div>
            <p className="text-[11px] text-[var(--foreground-subtle)] mt-1.5 px-1">
              Cannot exceed remaining outstanding amount of ₹{outstandingRupees}
            </p>
          </div>

          {/* Account & Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--foreground-subtle)] block mb-1.5">
                {isLent ? "Receiving Account" : "Paying Account"} <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <Landmark className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--foreground-subtle)]" />
                <select
                  name="accountId"
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  required
                  className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-slate-100/70 dark:bg-white/5 border border-slate-300/60 dark:border-white/10 text-xs font-semibold text-[var(--foreground)] focus:outline-none focus:border-emerald-500 transition-all"
                >
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id} className="bg-[var(--background)] text-[var(--foreground)]">
                      {acc.name} ({acc.type === "cash" ? "Cash" : "Bank"})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--foreground-subtle)] block mb-1.5">
                Repayment Date <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--foreground-subtle)]" />
                <input
                  type="date"
                  name="repaymentDate"
                  value={repaymentDate}
                  min={activeRecord.recordDate}
                  onChange={(e) => setRepaymentDate(e.target.value)}
                  required
                  className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-slate-100/70 dark:bg-white/5 border border-slate-300/60 dark:border-white/10 text-xs font-mono font-semibold text-[var(--foreground)] focus:outline-none focus:border-emerald-500 transition-all"
                />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--foreground-subtle)] block mb-1.5">
              Notes <span className="text-[10px] lowercase font-normal opacity-70">(optional)</span>
            </label>
            <div className="relative">
              <FileText className="absolute left-3.5 top-3 h-4 w-4 text-[var(--foreground-subtle)]" />
              <textarea
                name="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Optional repayment reference (UPI ID, cash receipt note...)"
                className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-slate-100/70 dark:bg-white/5 border border-slate-300/60 dark:border-white/10 text-xs font-medium text-[var(--foreground)] focus:outline-none focus:border-emerald-500 transition-all placeholder:text-[var(--foreground-subtle)] resize-none"
              />
            </div>
          </div>

          {/* Overdraft check when repaying borrowed money */}
          {!isLent && (
            <div className="flex items-start gap-2.5 p-3 rounded-2xl bg-slate-100/50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/5">
              <input
                type="checkbox"
                id="repayAllowOverdraft"
                checked={allowOverdraft}
                onChange={(e) => setAllowOverdraft(e.target.checked)}
                className="mt-0.5 rounded text-emerald-500 focus:ring-emerald-500"
              />
              <label htmlFor="repayAllowOverdraft" className="text-xs text-[var(--foreground-muted)] cursor-pointer">
                Allow overdraft / negative balance for this bank payment if permitted
              </label>
            </div>
          )}

          {/* Actions */}
          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="px-5 py-2.5 rounded-2xl bg-slate-200/70 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/15 text-xs font-bold text-[var(--foreground)] transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="px-6 py-2.5 rounded-2xl font-bold text-xs text-slate-950 bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 shadow-lg shadow-emerald-500/25 active:scale-[0.98] transition-all cursor-pointer"
            >
              {isPending ? "Recording..." : "Confirm Repayment"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
