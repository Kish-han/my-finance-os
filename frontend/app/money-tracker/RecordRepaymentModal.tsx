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
import { recordPaymentAction } from "./actions";
import type {
  AgreementBalance,
  FinancialAccount,
  PersonalLoanAgreement,
} from "@/lib/finance/types";

interface RecordRepaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  agreement: PersonalLoanAgreement;
  balance: AgreementBalance;
  accounts: FinancialAccount[];
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
  agreement,
  balance,
  accounts,
}: RecordRepaymentModalProps) {
  const remainingPaise = balance.totalOutstandingPaise;
  const remainingRupees = (remainingPaise / 100).toFixed(2);

  const [paymentAmount, setPaymentAmount] = useState(remainingRupees);
  const [principalComponent, setPrincipalComponent] = useState(
    (Math.min(remainingPaise, balance.remainingPrincipalPaise) / 100).toFixed(2)
  );
  const [interestComponent, setInterestComponent] = useState(
    (Math.min(
      Math.max(0, remainingPaise - balance.remainingPrincipalPaise),
      balance.remainingInterestPaise
    ) / 100).toFixed(2)
  );
  const [accountId, setAccountId] = useState(accounts[0]?.id || agreement.accountId);
  const [paymentDate, setPaymentDate] = useState(getTodayString());
  const [notes, setNotes] = useState("");
  const [allowOverdraft, setAllowOverdraft] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!isOpen) return null;

  const isLent = agreement.direction === "given";

  // When total amount changes, auto-split between principal and interest
  const handleAmountChange = (val: string) => {
    setPaymentAmount(val);
    const amountNum = Number(val.replace(/,/g, "")) || 0;
    const amountPaise = Math.round(amountNum * 100);

    const princPaise = Math.min(amountPaise, balance.remainingPrincipalPaise);
    const intPaise = Math.min(
      Math.max(0, amountPaise - princPaise),
      balance.remainingInterestPaise
    );

    setPrincipalComponent((princPaise / 100).toFixed(2));
    setInterestComponent((intPaise / 100).toFixed(2));
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMsg(null);

    const formData = new FormData(e.currentTarget);
    formData.set("agreementId", agreement.id);
    formData.set("allowOverdraft", allowOverdraft ? "true" : "false");

    startTransition(async () => {
      const res = await recordPaymentAction(null, formData);
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

      {/* Modal Dialog */}
      <div className="relative z-10 w-full max-w-lg aura-card-obsidian rounded-3xl p-6 sm:p-8 border border-[var(--surface-card-border)] shadow-2xl animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[var(--surface-panel-border)]">
          <div>
            <div className="flex items-center gap-2">
              <span
                className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                  isLent
                    ? "bg-emerald-500/15 text-emerald-800 dark:text-[#4edea3]"
                    : "bg-cyan-500/15 text-cyan-800 dark:text-cyan-400"
                }`}
              >
                {isLent ? "Recovery Received" : "Repayment Made"}
              </span>
              <span className="text-xs text-[var(--foreground-subtle)] font-medium">
                {agreement.person?.name}
              </span>
            </div>
            <h2 className="text-base font-black text-[var(--foreground)] tracking-tight mt-1">
              Record Repayment
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200/80 dark:bg-white/10 hover:bg-slate-300 dark:hover:bg-white/20 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Current Outstanding Balance Badge */}
        <div className="mt-4 p-4 rounded-2xl bg-slate-100/70 dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/10 flex items-center justify-between">
          <div>
            <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--foreground-subtle)]">
              Remaining Outstanding
            </span>
            <div className="text-lg font-black font-mono text-[var(--foreground)] tabular-nums mt-0.5">
              ₹{(balance.totalOutstandingPaise / 100).toLocaleString("en-IN", {
                minimumFractionDigits: 2,
              })}
            </div>
          </div>
          <button
            type="button"
            onClick={() => handleAmountChange(remainingRupees)}
            className="text-[11px] font-bold px-3 py-1.5 rounded-xl bg-emerald-500/15 text-emerald-800 dark:text-[#4edea3] hover:bg-emerald-500/25 transition-colors cursor-pointer"
          >
            Pay in Full
          </button>
        </div>

        {errorMsg && (
          <div className="mt-4 p-3 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-semibold flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* Payment Amount */}
          <div>
            <label className="block text-xs font-bold text-[var(--foreground)] mb-1.5 flex items-center gap-1.5">
              <Coins className="h-3.5 w-3.5 text-emerald-600 dark:text-[#4edea3]" />
              <span>Total Payment Amount (₹) *</span>
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-[var(--foreground-subtle)]">
                ₹
              </span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                max={(balance.totalOutstandingPaise / 100).toFixed(2)}
                name="paymentAmount"
                value={paymentAmount}
                onChange={(e) => handleAmountChange(e.target.value)}
                required
                className="w-full pl-8 pr-3.5 py-2.5 rounded-xl bg-slate-100/70 dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/10 text-xs font-mono font-bold text-[var(--foreground)] tabular-nums focus:border-emerald-500 outline-none"
              />
            </div>
          </div>

          {/* Component Split Breakdown */}
          {balance.totalInterestPaise > 0 && (
            <div className="grid grid-cols-2 gap-3 p-3 rounded-2xl bg-slate-100/50 dark:bg-white/[0.02] border border-slate-200/60 dark:border-white/5">
              <div>
                <label className="block text-[11px] font-semibold text-[var(--foreground-muted)] mb-1">
                  Principal Component (₹)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  name="principalComponent"
                  value={principalComponent}
                  onChange={(e) => setPrincipalComponent(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl bg-slate-100/70 dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/10 text-xs font-mono font-bold text-[var(--foreground)] tabular-nums outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[var(--foreground-muted)] mb-1">
                  Interest Component (₹)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  name="interestComponent"
                  value={interestComponent}
                  onChange={(e) => setInterestComponent(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl bg-slate-100/70 dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/10 text-xs font-mono font-bold text-[var(--foreground)] tabular-nums outline-none"
                />
              </div>
            </div>
          )}

          {/* Account Selector */}
          <div>
            <label className="block text-xs font-bold text-[var(--foreground)] mb-1.5 flex items-center gap-1.5">
              <Landmark className="h-3.5 w-3.5 text-emerald-600 dark:text-[#4edea3]" />
              <span>{isLent ? "Deposited To Account *" : "Paid From Account *"}</span>
            </label>
            <select
              name="accountId"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              required
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-100/70 dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/10 text-xs font-medium text-[var(--foreground)] focus:border-emerald-500 outline-none cursor-pointer"
            >
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id} className="dark:bg-slate-900">
                  {acc.name} ({acc.type.toUpperCase()})
                </option>
              ))}
            </select>
          </div>

          {/* Payment Date */}
          <div>
            <label className="block text-xs font-bold text-[var(--foreground)] mb-1.5 flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-emerald-600 dark:text-[#4edea3]" />
              <span>Payment Date *</span>
            </label>
            <input
              type="date"
              name="paymentDate"
              value={paymentDate}
              min={agreement.agreementDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              required
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-100/70 dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/10 text-xs font-mono text-[var(--foreground)] focus:border-emerald-500 outline-none"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-bold text-[var(--foreground)] mb-1.5 flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5 text-emerald-600 dark:text-[#4edea3]" />
              <span>Notes (Optional)</span>
            </label>
            <input
              type="text"
              name="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. UPI transfer reference"
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-100/70 dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/10 text-xs font-medium text-[var(--foreground)] placeholder:text-[var(--foreground-subtle)] focus:border-emerald-500 outline-none"
            />
          </div>

          {/* Overdraft Checkbox for Borrowing Repayment */}
          {!isLent && (
            <label className="flex items-center gap-2.5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 cursor-pointer">
              <input
                type="checkbox"
                name="allowOverdraftCheckbox"
                checked={allowOverdraft}
                onChange={(e) => setAllowOverdraft(e.target.checked)}
                className="h-4 w-4 rounded accent-emerald-500 cursor-pointer"
              />
              <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                Allow overdraft if account balance is insufficient
              </span>
            </label>
          )}

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[var(--surface-panel-border)]">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="px-4 py-2.5 rounded-xl text-xs font-bold text-[var(--foreground-muted)] hover:text-[var(--foreground)] hover:bg-slate-200/50 dark:hover:bg-white/5 transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold text-xs shadow-md shadow-emerald-500/25 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50"
            >
              {isPending ? "Recording..." : "Record Repayment"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
