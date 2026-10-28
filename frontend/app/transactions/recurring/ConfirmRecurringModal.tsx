"use client";

import { useState } from "react";
import {
  X,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";
import { confirmRecurringOccurrence } from "./actions";

interface AccountOption {
  id: string;
  name: string;
  account_type: "bank" | "cash";
  institution: string | null;
}

interface CreditCardOption {
  id: string;
  name: string;
  bank_name: string;
  last_four_digits: string | null;
}

export interface ConfirmOccurrenceData {
  occurrenceId: string;
  scheduleId: string;
  title: string;
  amountPaise: number;
  transactionType: "income" | "expense";
  dueDate: string;
  sourceId: string;
  categoryName: string;
  notes?: string | null;
  isAmountVariable?: boolean;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  data: ConfirmOccurrenceData | null;
  accounts: AccountOption[];
  creditCards: CreditCardOption[];
  categories: string[];
  today: string;
  returnTo?: string;
}

export function ConfirmRecurringModal({
  isOpen,
  onClose,
  data,
  accounts,
  creditCards,
  categories,
  today,
  returnTo = "/",
}: Props) {
  const [amount, setAmount] = useState<string>(
    data ? (data.amountPaise / 100).toFixed(2) : ""
  );
  const [transactionDate, setTransactionDate] = useState<string>(today);
  const [sourceId, setSourceId] = useState<string>(data?.sourceId || "");
  const [description, setDescription] = useState<string>(data?.title || "");
  const [category, setCategory] = useState<string>(data?.categoryName || "");
  const [notes, setNotes] = useState<string>(data?.notes || "");

  if (!isOpen || !data) return null;

  const isIncome = data.transactionType === "income";
  const isCard = sourceId.startsWith("card:");

  const bankAccounts = accounts.filter((a) => a.account_type === "bank");
  const cashAccounts = accounts.filter((a) => a.account_type === "cash");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg rounded-3xl border border-white/10 bg-[#141922] p-6 sm:p-7 shadow-2xl text-[#dfe2eb] max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div
              className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                isIncome
                  ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                  : "bg-rose-500/15 text-rose-400 border border-rose-500/30"
              }`}
            >
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                Confirm & Record Transaction
              </h3>
              <p className="text-xs text-slate-400">
                Turns this expected item into an actual ledger entry
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Financial Transparency Callout */}
        <div
          className={`mt-4 rounded-xl border p-3 text-xs ${
            isCard
              ? "border-purple-500/20 bg-purple-950/20 text-purple-300"
              : isIncome
              ? "border-emerald-500/20 bg-emerald-950/20 text-emerald-300"
              : "border-slate-700 bg-slate-900/60 text-slate-300"
          }`}
        >
          {isCard ? (
            <p>
              💳 <strong>Credit Card Spend:</strong> Recorded as an actual card purchase. Will increase revolving debt and update available credit, with zero deduction from bank accounts.
            </p>
          ) : isIncome ? (
            <p>
              💰 <strong>Income Inflow:</strong> Increases the liquid balance of the selected bank or cash account upon confirmation.
            </p>
          ) : (
            <p>
              🏦 <strong>Expense Outflow:</strong> Reduces the liquid balance of the selected bank or cash account upon confirmation.
            </p>
          )}
        </div>

        <form action={confirmRecurringOccurrence} className="mt-5 space-y-4">
          <input type="hidden" name="returnTo" value={returnTo} />
          <input type="hidden" name="occurrenceId" value={data.occurrenceId} />
          <input type="hidden" name="scheduleId" value={data.scheduleId} />

          {/* Description */}
          <div>
            <label
              htmlFor="conf-desc"
              className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5"
            >
              Transaction Description *
            </label>
            <input
              id="conf-desc"
              name="description"
              required
              maxLength={160}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white outline-none focus:border-cyan-400 focus:bg-white/10 focus:ring-2 focus:ring-cyan-400/20"
            />
          </div>

          {/* Amount & Date Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="conf-amt"
                className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5"
              >
                Actual Amount (₹) *
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">
                  ₹
                </span>
                <input
                  id="conf-amt"
                  name="amount"
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  step="0.01"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/5 pl-8 pr-4 py-2.5 text-sm font-bold tabular-nums text-white outline-none focus:border-cyan-400 focus:bg-white/10 focus:ring-2 focus:ring-cyan-400/20"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="conf-dt"
                className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5"
              >
                Payment Date *
              </label>
              <input
                id="conf-dt"
                name="transactionDate"
                type="date"
                required
                max={today}
                value={transactionDate}
                onChange={(e) => setTransactionDate(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold tabular-nums text-white outline-none focus:border-cyan-400 focus:bg-white/10 focus:ring-2 focus:ring-cyan-400/20"
              />
            </div>
          </div>

          {/* Source Selection */}
          <div>
            <label
              htmlFor="conf-src"
              className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5"
            >
              {isIncome ? "Deposit Destination Account *" : "Payment Account or Card *"}
            </label>
            <select
              id="conf-src"
              name="sourceId"
              required
              value={sourceId}
              onChange={(e) => setSourceId(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white outline-none focus:border-cyan-400 focus:bg-white/10 focus:ring-2 focus:ring-cyan-400/20"
            >
              {bankAccounts.length > 0 && (
                <optgroup label="── Bank Accounts ──" className="bg-slate-900 font-bold text-emerald-400">
                  {bankAccounts.map((acc) => (
                    <option key={acc.id} value={`account:${acc.id}`} className="bg-slate-900 text-white font-normal">
                      {acc.name} {acc.institution ? `· ${acc.institution}` : ""}
                    </option>
                  ))}
                </optgroup>
              )}

              {cashAccounts.length > 0 && (
                <optgroup label="── Cash Wallets ──" className="bg-slate-900 font-bold text-amber-400">
                  {cashAccounts.map((acc) => (
                    <option key={acc.id} value={`account:${acc.id}`} className="bg-slate-900 text-white font-normal">
                      {acc.name} (Physical Cash)
                    </option>
                  ))}
                </optgroup>
              )}

              {!isIncome && creditCards.length > 0 && (
                <optgroup label="── Credit Cards ──" className="bg-slate-900 font-bold text-purple-400">
                  {creditCards.map((card) => (
                    <option key={card.id} value={`card:${card.id}`} className="bg-slate-900 text-white font-normal">
                      {card.bank_name} {card.name} {card.last_four_digits ? `(••${card.last_four_digits})` : ""}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>

          {/* Category */}
          <div>
            <label
              htmlFor="conf-cat"
              className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5"
            >
              Category *
            </label>
            <input
              id="conf-cat"
              name="category"
              list="confirm-category-list"
              required
              maxLength={60}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white outline-none focus:border-cyan-400 focus:bg-white/10 focus:ring-2 focus:ring-cyan-400/20"
            />
            <datalist id="confirm-category-list">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>

          {/* Notes */}
          <div>
            <label
              htmlFor="conf-notes"
              className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5"
            >
              Memo / Settlement Notes
            </label>
            <input
              id="conf-notes"
              name="notes"
              maxLength={120}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Paid via UPI, bill #12345"
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-slate-500 outline-none focus:border-cyan-400 focus:bg-white/10 focus:ring-2 focus:ring-cyan-400/20"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 text-xs font-black shadow-lg shadow-emerald-500/25 transition-all active:scale-95 cursor-pointer"
            >
              <span>Record Transaction Now</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
