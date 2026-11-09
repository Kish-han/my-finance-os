"use client";

import React, { useState, useTransition } from "react";
import {
  X,
  ArrowUpRight,
  ArrowDownLeft,
  Calendar,
  AlertTriangle,
  Coins,
  Percent,
  FileText,
  User,
  Phone,
  Landmark,
} from "lucide-react";
import { createAgreementAction } from "./actions";
import type { FinancialAccount, Person } from "@/lib/finance/types";

interface CreateAgreementModalProps {
  isOpen: boolean;
  onClose: () => void;
  people: Person[];
  accounts: FinancialAccount[];
  defaultDirection?: "given" | "taken";
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

export function CreateAgreementModal({
  isOpen,
  onClose,
  people,
  accounts,
  defaultDirection = "given",
}: CreateAgreementModalProps) {
  const [direction, setDirection] = useState<"given" | "taken">(defaultDirection);
  const [personName, setPersonName] = useState("");
  const [personPhone, setPersonPhone] = useState("");
  const [principal, setPrincipal] = useState("");
  const [accountId, setAccountId] = useState(accounts[0]?.id || "");
  const [agreementDate, setAgreementDate] = useState(getTodayString());
  const [expectedDate, setExpectedDate] = useState("");
  const [interestType, setInterestType] = useState<"none" | "fixed_amount" | "simple_annual">("none");
  const [interestRate, setInterestRate] = useState("");
  const [agreedInterest, setAgreedInterest] = useState("");
  const [notes, setNotes] = useState("");
  const [allowOverdraft, setAllowOverdraft] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!isOpen) return null;

  // Auto-fill phone if existing person name selected
  const handlePersonNameChange = (val: string) => {
    setPersonName(val);
    const match = people.find(
      (p) => p.name.trim().toLowerCase() === val.trim().toLowerCase()
    );
    if (match && match.phone) {
      setPersonPhone(match.phone);
    }
  };

  const isLending = direction === "given";

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMsg(null);

    const formData = new FormData(e.currentTarget);
    formData.set("direction", direction);
    formData.set("interestType", interestType);
    formData.set("allowOverdraft", allowOverdraft ? "true" : "false");

    startTransition(async () => {
      const res = await createAgreementAction(null, formData);
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
      <div className="relative z-10 w-full max-w-xl max-h-[90vh] overflow-y-auto no-scrollbar aura-card-obsidian rounded-3xl p-6 sm:p-8 border border-[var(--surface-card-border)] shadow-2xl animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[var(--surface-panel-border)]">
          <div>
            <h2 className="text-lg font-black text-[var(--foreground)] tracking-tight">
              Create Lending & Borrowing Agreement
            </h2>
            <p className="text-xs text-[var(--foreground-subtle)] mt-0.5">
              Record personal credit without distorting ordinary income or expenses
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200/80 dark:bg-white/10 hover:bg-slate-300 dark:hover:bg-white/20 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {errorMsg && (
          <div className="mt-4 p-3 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-semibold flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-5">
          {/* Direction Segmented Control */}
          <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-slate-100/80 dark:bg-white/[0.04] border border-slate-200/80 dark:border-white/10">
            <button
              type="button"
              onClick={() => setDirection("given")}
              className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                direction === "given"
                  ? "bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/25"
                  : "text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
              }`}
            >
              <ArrowUpRight className="h-4 w-4 stroke-[2.5]" />
              <span>Money Given (I Lent)</span>
            </button>
            <button
              type="button"
              onClick={() => setDirection("taken")}
              className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                direction === "taken"
                  ? "bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/25"
                  : "text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
              }`}
            >
              <ArrowDownLeft className="h-4 w-4 stroke-[2.5]" />
              <span>Money Taken (I Borrowed)</span>
            </button>
          </div>

          {/* Counterparty / Person Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-[var(--foreground)] mb-1.5 flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 text-emerald-600 dark:text-[#4edea3]" />
                <span>Person Name *</span>
              </label>
              <input
                type="text"
                name="personName"
                value={personName}
                onChange={(e) => handlePersonNameChange(e.target.value)}
                list="people-list"
                placeholder="e.g. Rahul Sharma"
                required
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-100/70 dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/10 text-xs font-medium text-[var(--foreground)] placeholder:text-[var(--foreground-subtle)] focus:border-emerald-500 outline-none"
              />
              <datalist id="people-list">
                {people.map((p) => (
                  <option key={p.id} value={p.name} />
                ))}
              </datalist>
            </div>

            <div>
              <label className="block text-xs font-bold text-[var(--foreground)] mb-1.5 flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5 text-emerald-600 dark:text-[#4edea3]" />
                <span>Phone (Optional)</span>
              </label>
              <input
                type="tel"
                name="personPhone"
                value={personPhone}
                onChange={(e) => setPersonPhone(e.target.value)}
                placeholder="+91 98765 43210"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-100/70 dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/10 text-xs font-medium text-[var(--foreground)] placeholder:text-[var(--foreground-subtle)] focus:border-emerald-500 outline-none"
              />
            </div>
          </div>

          {/* Financial Amounts & Accounts */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-[var(--foreground)] mb-1.5 flex items-center gap-1.5">
                <Coins className="h-3.5 w-3.5 text-emerald-600 dark:text-[#4edea3]" />
                <span>Principal Amount (₹) *</span>
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-[var(--foreground-subtle)]">
                  ₹
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  name="principal"
                  value={principal}
                  onChange={(e) => setPrincipal(e.target.value)}
                  placeholder="0.00"
                  required
                  className="w-full pl-8 pr-3.5 py-2.5 rounded-xl bg-slate-100/70 dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/10 text-xs font-mono font-bold text-[var(--foreground)] tabular-nums focus:border-emerald-500 outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-[var(--foreground)] mb-1.5 flex items-center gap-1.5">
                <Landmark className="h-3.5 w-3.5 text-emerald-600 dark:text-[#4edea3]" />
                <span>{isLending ? "Source Account *" : "Deposit Account *"}</span>
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
          </div>

          {/* Dates */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-[var(--foreground)] mb-1.5 flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-emerald-600 dark:text-[#4edea3]" />
                <span>Agreement Date *</span>
              </label>
              <input
                type="date"
                name="agreementDate"
                value={agreementDate}
                onChange={(e) => setAgreementDate(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-100/70 dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/10 text-xs font-mono text-[var(--foreground)] focus:border-emerald-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[var(--foreground)] mb-1.5 flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-emerald-600 dark:text-[#4edea3]" />
                <span>Expected Due Date</span>
              </label>
              <input
                type="date"
                name="expectedDate"
                value={expectedDate}
                min={agreementDate}
                onChange={(e) => setExpectedDate(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-100/70 dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/10 text-xs font-mono text-[var(--foreground)] focus:border-emerald-500 outline-none"
              />
            </div>
          </div>

          {/* Interest Terms */}
          <div className="p-4 rounded-2xl bg-slate-100/60 dark:bg-white/[0.02] border border-slate-200/80 dark:border-white/10 space-y-3">
            <span className="block text-xs font-bold text-[var(--foreground)] flex items-center gap-1.5">
              <Percent className="h-3.5 w-3.5 text-emerald-600 dark:text-[#4edea3]" />
              <span>Interest Terms</span>
            </span>

            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setInterestType("none")}
                className={`py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  interestType === "none"
                    ? "bg-emerald-500/20 text-emerald-800 dark:text-[#4edea3] border border-emerald-500/40"
                    : "bg-slate-200/50 dark:bg-white/5 text-[var(--foreground-muted)]"
                }`}
              >
                No Interest
              </button>
              <button
                type="button"
                onClick={() => setInterestType("fixed_amount")}
                className={`py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  interestType === "fixed_amount"
                    ? "bg-emerald-500/20 text-emerald-800 dark:text-[#4edea3] border border-emerald-500/40"
                    : "bg-slate-200/50 dark:bg-white/5 text-[var(--foreground-muted)]"
                }`}
              >
                Fixed Amount
              </button>
              <button
                type="button"
                onClick={() => setInterestType("simple_annual")}
                className={`py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  interestType === "simple_annual"
                    ? "bg-emerald-500/20 text-emerald-800 dark:text-[#4edea3] border border-emerald-500/40"
                    : "bg-slate-200/50 dark:bg-white/5 text-[var(--foreground-muted)]"
                }`}
              >
                Simple Annual (%)
              </button>
            </div>

            {interestType === "fixed_amount" && (
              <div className="pt-2">
                <label className="block text-[11px] font-semibold text-[var(--foreground-muted)] mb-1">
                  Agreed Fixed Interest Amount (₹)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  name="agreedInterest"
                  value={agreedInterest}
                  onChange={(e) => setAgreedInterest(e.target.value)}
                  placeholder="e.g. 500.00"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-100/70 dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/10 text-xs font-mono font-bold text-[var(--foreground)] outline-none"
                />
              </div>
            )}

            {interestType === "simple_annual" && (
              <div className="pt-2">
                <label className="block text-[11px] font-semibold text-[var(--foreground-muted)] mb-1">
                  Annual Interest Rate (%)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  name="interestRate"
                  value={interestRate}
                  onChange={(e) => setInterestRate(e.target.value)}
                  placeholder="e.g. 12.0"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-100/70 dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/10 text-xs font-mono font-bold text-[var(--foreground)] outline-none"
                />
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-bold text-[var(--foreground)] mb-1.5 flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5 text-emerald-600 dark:text-[#4edea3]" />
              <span>Notes & Context</span>
            </label>
            <textarea
              name="notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Friendly emergency loan for laptop repair"
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-100/70 dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/10 text-xs font-medium text-[var(--foreground)] placeholder:text-[var(--foreground-subtle)] focus:border-emerald-500 outline-none"
            />
          </div>

          {/* Overdraft Checkbox */}
          {isLending && (
            <label className="flex items-center gap-2.5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 cursor-pointer">
              <input
                type="checkbox"
                name="allowOverdraftCheckbox"
                checked={allowOverdraft}
                onChange={(e) => setAllowOverdraft(e.target.checked)}
                className="h-4 w-4 rounded accent-emerald-500 cursor-pointer"
              />
              <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                Allow overdraft / negative balance if account balance is insufficient
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
              {isPending ? "Creating..." : "Create Agreement"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
