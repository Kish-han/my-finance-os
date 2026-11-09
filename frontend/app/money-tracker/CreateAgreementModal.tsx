"use client";

import React, { useState, useTransition } from "react";
import {
  X,
  ArrowUpRight,
  ArrowDownLeft,
  Calendar,
  AlertTriangle,
  Coins,
  FileText,
  User,
  Phone,
  Landmark,
} from "lucide-react";
import { createRecordAction } from "./actions";
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
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState(accounts[0]?.id || "");
  const [recordDate, setRecordDate] = useState(getTodayString());
  const [dueDate, setDueDate] = useState("");
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
    formData.set("allowOverdraft", allowOverdraft ? "true" : "false");

    startTransition(async () => {
      const res = await createRecordAction(null, formData);
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
              Add Money Record
            </h2>
            <p className="text-xs text-[var(--foreground-muted)] mt-0.5">
              Record money given to or taken from another person
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

        <form onSubmit={handleSubmit} className="mt-6 space-y-5">
          {/* Direction Selector */}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--foreground-subtle)] block mb-2">
              Record Type
            </label>
            <div className="grid grid-cols-2 gap-3 p-1 rounded-2xl bg-slate-200/50 dark:bg-white/5 border border-slate-300/40 dark:border-white/10">
              <button
                type="button"
                onClick={() => setDirection("given")}
                className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                  isLending
                    ? "bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/25"
                    : "text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
                }`}
              >
                <ArrowUpRight className="h-4 w-4 stroke-[2.5]" />
                <span>Money Given</span>
              </button>

              <button
                type="button"
                onClick={() => setDirection("taken")}
                className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                  !isLending
                    ? "bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/25"
                    : "text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
                }`}
              >
                <ArrowDownLeft className="h-4 w-4 stroke-[2.5]" />
                <span>Money Taken</span>
              </button>
            </div>
            <p className="text-[11px] text-[var(--foreground-subtle)] mt-1.5 px-1">
              {isLending
                ? "Deducts money from your account and tracks an amount receivable."
                : "Deposits money into your account and tracks an amount payable."}
            </p>
          </div>

          {/* Counterparty / Person */}
          <div className="space-y-3">
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--foreground-subtle)] block mb-1.5">
                Person&apos;s Name <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--foreground-subtle)]" />
                <input
                  type="text"
                  name="personName"
                  list="people-list"
                  value={personName}
                  onChange={(e) => handlePersonNameChange(e.target.value)}
                  placeholder="e.g. Ramesh Kumar, Priya..."
                  required
                  className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-slate-100/70 dark:bg-white/5 border border-slate-300/60 dark:border-white/10 text-xs font-semibold text-[var(--foreground)] focus:outline-none focus:border-emerald-500 transition-all placeholder:text-[var(--foreground-subtle)]"
                />
                <datalist id="people-list">
                  {people.map((p) => (
                    <option key={p.id} value={p.name} />
                  ))}
                </datalist>
              </div>
            </div>

            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--foreground-subtle)] block mb-1.5">
                Phone Number <span className="text-[10px] lowercase font-normal opacity-70">(optional)</span>
              </label>
              <div className="relative">
                <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--foreground-subtle)]" />
                <input
                  type="tel"
                  name="personPhone"
                  value={personPhone}
                  onChange={(e) => setPersonPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-slate-100/70 dark:bg-white/5 border border-slate-300/60 dark:border-white/10 text-xs font-semibold text-[var(--foreground)] focus:outline-none focus:border-emerald-500 transition-all placeholder:text-[var(--foreground-subtle)]"
                />
              </div>
            </div>
          </div>

          {/* Amount & Account */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--foreground-subtle)] block mb-1.5">
                Amount (₹) <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <Coins className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--foreground-subtle)]" />
                <input
                  type="text"
                  name="amount"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  required
                  className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-slate-100/70 dark:bg-white/5 border border-slate-300/60 dark:border-white/10 text-xs font-mono font-bold text-[var(--foreground)] focus:outline-none focus:border-emerald-500 transition-all placeholder:text-[var(--foreground-subtle)]"
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--foreground-subtle)] block mb-1.5">
                Account <span className="text-rose-500">*</span>
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
          </div>

          {/* Dates: Record Date and Expected Due Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--foreground-subtle)] block mb-1.5">
                Date <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--foreground-subtle)]" />
                <input
                  type="date"
                  name="recordDate"
                  value={recordDate}
                  onChange={(e) => setRecordDate(e.target.value)}
                  required
                  className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-slate-100/70 dark:bg-white/5 border border-slate-300/60 dark:border-white/10 text-xs font-mono font-semibold text-[var(--foreground)] focus:outline-none focus:border-emerald-500 transition-all"
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--foreground-subtle)] block mb-1.5">
                Expected Return Date <span className="text-[10px] lowercase font-normal opacity-70">(optional)</span>
              </label>
              <div className="relative">
                <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--foreground-subtle)]" />
                <input
                  type="date"
                  name="dueDate"
                  value={dueDate}
                  min={recordDate}
                  onChange={(e) => setDueDate(e.target.value)}
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
                placeholder="Reason or context for this transaction..."
                className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-slate-100/70 dark:bg-white/5 border border-slate-300/60 dark:border-white/10 text-xs font-medium text-[var(--foreground)] focus:outline-none focus:border-emerald-500 transition-all placeholder:text-[var(--foreground-subtle)] resize-none"
              />
            </div>
          </div>

          {/* Overdraft Checkbox for Bank Accounts */}
          {isLending && (
            <div className="flex items-start gap-2.5 p-3 rounded-2xl bg-slate-100/50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/5">
              <input
                type="checkbox"
                id="allowOverdraft"
                checked={allowOverdraft}
                onChange={(e) => setAllowOverdraft(e.target.checked)}
                className="mt-0.5 rounded text-emerald-500 focus:ring-emerald-500"
              />
              <label htmlFor="allowOverdraft" className="text-xs text-[var(--foreground-muted)] cursor-pointer">
                Allow overdraft / negative balance for this bank transaction if permitted
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
              className={`px-6 py-2.5 rounded-2xl font-bold text-xs text-slate-950 shadow-lg active:scale-[0.98] transition-all cursor-pointer ${
                isLending
                  ? "bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 shadow-emerald-500/25"
                  : "bg-gradient-to-r from-cyan-500 to-blue-400 hover:from-cyan-400 hover:to-blue-300 shadow-cyan-500/25"
              }`}
            >
              {isPending
                ? "Saving..."
                : isLending
                ? "Record Money Given"
                : "Record Money Taken"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export const CreateRecordModal = CreateAgreementModal;
