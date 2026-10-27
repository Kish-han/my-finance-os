"use client";

import { useState } from "react";
import Link from "next/link";
import { executeForeclosureSettlement } from "./actions";
import {
  ShieldAlert,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  Receipt,
} from "lucide-react";

export type LoanOption = {
  id: string;
  name: string;
  lender_name: string | null;
  debt_type: string;
  original_principal_paise: number | string;
  estimated_principal_paise: number;
  outstanding_as_of_date: string;
  emi_amount_paise: number | string;
};

export type AccountOption = {
  id: string;
  name: string;
  account_type: string;
  institution: string | null;
  opening_balance_date: string;
};

type Props = {
  loans: LoanOption[];
  accounts: AccountOption[];
  initialDebtId?: string;
  today: string;
};

function formatRupees(paise: number | string): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(paise) / 100);
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function SimpleForeclosureForm({
  loans,
  accounts,
  initialDebtId,
  today,
}: Props) {
  const [selectedDebtId, setSelectedDebtId] = useState<string>(() => {
    if (initialDebtId && loans.some((loan) => loan.id === initialDebtId)) {
      return initialDebtId;
    }
    return loans[0]?.id ?? "";
  });

  const [payoffAmount, setPayoffAmount] = useState<string>("");
  const [paymentDate, setPaymentDate] = useState<string>(today);
  const [selectedAccountId, setSelectedAccountId] = useState<string>(
    accounts[0]?.id ?? ""
  );
  const [notes, setNotes] = useState<string>("");

  const [isConfirming, setIsConfirming] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [clientError, setClientError] = useState<string | null>(null);

  const selectedLoan = loans.find((l) => l.id === selectedDebtId);
  const selectedAccount = accounts.find((a) => a.id === selectedAccountId);

  function handleReview(e: React.FormEvent) {
    e.preventDefault();
    setClientError(null);

    if (!selectedDebtId || !selectedLoan) {
      setClientError("Please select an active loan to foreclose.");
      return;
    }

    if (!selectedAccountId || !selectedAccount) {
      setClientError("Please select the bank or cash account used for payment.");
      return;
    }

    const cleanAmount = payoffAmount.trim();
    if (!cleanAmount || !/^\d+(\.\d{1,2})?$/.test(cleanAmount)) {
      setClientError("Please enter a valid payoff amount in Rupees (e.g. 150000).");
      return;
    }

    const rupees = Number(cleanAmount);
    if (!Number.isFinite(rupees) || rupees <= 0) {
      setClientError("Payoff amount must be greater than ₹0.");
      return;
    }

    if (!paymentDate) {
      setClientError("Please select the foreclosure payment date.");
      return;
    }

    if (paymentDate > today) {
      setClientError("Foreclosure payment date cannot be in the future.");
      return;
    }

    if (paymentDate < selectedLoan.outstanding_as_of_date) {
      setClientError(
        `Payment date (${formatDate(paymentDate)}) cannot be earlier than the loan balance snapshot date (${formatDate(selectedLoan.outstanding_as_of_date)}).`
      );
      return;
    }

    if (paymentDate < selectedAccount.opening_balance_date) {
      setClientError(
        `Payment date cannot be before the account opening date (${formatDate(selectedAccount.opening_balance_date)}).`
      );
      return;
    }

    setIsConfirming(true);
  }

  return (
    <div className="aura-panel p-6 sm:p-8 space-y-6">
      {clientError && (
        <div
          role="alert"
          className="flex items-center gap-3 rounded-2xl border border-rose-500/30 bg-rose-950/40 p-4 text-xs sm:text-sm font-semibold text-rose-300 backdrop-blur-xl"
        >
          <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
          <p>{clientError}</p>
        </div>
      )}

      {/* Confirmation Step View */}
      {isConfirming && selectedLoan && selectedAccount ? (
        <div className="space-y-6 animate-fadeIn">
          <div className="flex items-center gap-3 rounded-2xl border border-amber-500/30 bg-amber-950/30 p-4 text-amber-200 backdrop-blur-xl">
            <ShieldAlert className="h-6 w-6 shrink-0 text-amber-400" />
            <div className="text-xs sm:text-sm">
              <p className="font-bold text-amber-300 uppercase tracking-wider">
                Step 2: Confirm Foreclosure Settlement
              </p>
              <p className="mt-0.5 text-amber-200/80">
                Please verify the final settlement terms before committing. This transaction will permanently close the loan.
              </p>
            </div>
          </div>

          {/* Settlement Summary Card */}
          <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Target Loan
                </span>
                <h4 className="text-base sm:text-lg font-bold text-white">
                  {selectedLoan.name}
                </h4>
                <p className="text-xs text-slate-400">
                  {selectedLoan.lender_name || "Direct Lender"}
                </p>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Current Estimate
                </span>
                <p className="text-sm font-semibold text-slate-300 tabular-nums">
                  {formatRupees(selectedLoan.estimated_principal_paise)}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400">
                  Actual Lender Payoff Amount
                </span>
                <p className="text-2xl font-black text-cyan-300 tabular-nums">
                  {formatRupees(Math.round(Number(payoffAmount) * 100))}
                </p>
                <p className="text-[11px] text-slate-400">
                  Debited as expense from your account
                </p>
              </div>

              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Debit Source Account
                </span>
                <p className="text-base font-bold text-white">
                  {selectedAccount.name}
                </p>
                <p className="text-[11px] text-slate-400">
                  {selectedAccount.institution ? `${selectedAccount.institution} · ` : ""}
                  {selectedAccount.account_type.toUpperCase()}
                </p>
              </div>

              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Settlement Date
                </span>
                <p className="text-sm font-semibold text-white">
                  {formatDate(paymentDate)}
                </p>
              </div>

              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                  Resulting Loan Status
                </span>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  <span className="text-sm font-bold text-emerald-300">
                    Foreclosed (₹0 Remaining Balance)
                  </span>
                </div>
              </div>
            </div>

            {notes && (
              <div className="border-t border-white/10 pt-3 text-xs text-slate-400">
                <span className="font-semibold text-slate-300">Notes:</span> {notes}
              </div>
            )}
          </div>

          {/* Confirmation Form Posting to Server Action */}
          <form
            action={executeForeclosureSettlement}
            onSubmit={() => setIsSubmitting(true)}
            className="flex flex-col-reverse sm:flex-row items-center justify-between gap-4 pt-2"
          >
            {/* Hidden Form Inputs */}
            <input type="hidden" name="debt_id" value={selectedDebtId} />
            <input type="hidden" name="amount_rupees" value={payoffAmount} />
            <input type="hidden" name="payment_date" value={paymentDate} />
            <input
              type="hidden"
              name="payment_account_id"
              value={selectedAccountId}
            />
            <input type="hidden" name="notes" value={notes} />

            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => setIsConfirming(false)}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-6 py-3.5 text-xs font-bold text-slate-300 transition-all hover:bg-white/10 active:scale-[0.99] disabled:opacity-50 cursor-pointer"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back to Edit</span>
            </button>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 px-8 py-3.5 text-xs sm:text-sm font-bold text-slate-950 shadow-xl shadow-emerald-500/20 transition-all hover:brightness-110 active:scale-[0.99] disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-950 border-t-transparent" />
                  <span>Recording Settlement...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Confirm & Execute Foreclosure</span>
                </>
              )}
            </button>
          </form>
        </div>
      ) : (
        /* Step 1: Input Form View */
        <form onSubmit={handleReview} className="space-y-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-400 ring-1 ring-cyan-500/30">
              <Receipt className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold tracking-tight text-white">
                Foreclose Active Loan
              </h3>
              <p className="text-xs text-slate-400">
                Enter the final payoff amount from your lender to record the settlement and close the loan account.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {/* 1. Loan Selection */}
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300">
                Select Active Loan to Foreclose
              </label>
              <select
                value={selectedDebtId}
                onChange={(e) => setSelectedDebtId(e.target.value)}
                required
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition-all focus:border-cyan-400 focus:bg-white/10 focus:ring-4 focus:ring-cyan-400/20"
              >
                {loans.map((loan) => (
                  <option
                    key={loan.id}
                    value={loan.id}
                    className="bg-slate-900 text-white"
                  >
                    {loan.name} {loan.lender_name ? `(${loan.lender_name})` : ""} · Current Est: {formatRupees(loan.estimated_principal_paise)}
                  </option>
                ))}
              </select>
            </div>

            {/* Selected Loan Snapshot Card */}
            {selectedLoan && (
              <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400">
                    Registered Terms
                  </span>
                  <p className="font-semibold text-white">
                    Original Principal: {formatRupees(selectedLoan.original_principal_paise)}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400">
                    Estimated Outstanding
                  </span>
                  <p className="font-semibold text-cyan-300 tabular-nums">
                    {formatRupees(selectedLoan.estimated_principal_paise)}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Snapshot Date
                  </span>
                  <p className="font-semibold text-slate-300">
                    {formatDate(selectedLoan.outstanding_as_of_date)}
                  </p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* 2. Foreclosure Payoff Amount */}
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300">
                  Actual Lender Payoff Amount (₹)
                </label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  placeholder="e.g. 185000"
                  value={payoffAmount}
                  onChange={(e) => setPayoffAmount(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold tabular-nums text-white placeholder:text-slate-500 outline-none transition-all focus:border-cyan-400 focus:bg-white/10 focus:ring-4 focus:ring-cyan-400/20"
                />
                <span className="mt-1 block text-[11px] text-slate-400">
                  Final settlement amount stated in lender payoff letter / statement.
                </span>
              </div>

              {/* 3. Payment Date */}
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300">
                  Settlement Payment Date
                </label>
                <input
                  type="date"
                  required
                  min={selectedLoan?.outstanding_as_of_date}
                  max={today}
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition-all focus:border-cyan-400 focus:bg-white/10 focus:ring-4 focus:ring-cyan-400/20"
                />
                <span className="mt-1 block text-[11px] text-slate-400">
                  Date the payment was processed by your bank. Cannot be in future.
                </span>
              </div>
            </div>

            {/* 4. Payment Account */}
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300">
                Payment Source Account
              </label>
              <select
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
                required
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition-all focus:border-cyan-400 focus:bg-white/10 focus:ring-4 focus:ring-cyan-400/20"
              >
                {accounts.map((account) => (
                  <option
                    key={account.id}
                    value={account.id}
                    className="bg-slate-900 text-white"
                  >
                    {account.name} {account.institution ? `· ${account.institution}` : ""} ({account.account_type.toUpperCase()})
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-[11px] text-slate-400">
                The settlement amount will be recorded as an expense against this account ledger.
              </span>
            </div>

            {/* 5. Notes */}
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300">
                Notes / Reference (Optional)
              </label>
              <input
                type="text"
                maxLength={200}
                placeholder="e.g. NOC ref #12345, RTGS UTR, or foreclosure letter ID"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none transition-all focus:border-cyan-400 focus:bg-white/10 focus:ring-4 focus:ring-cyan-400/20"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <Link
              href="/emi"
              className="text-xs font-semibold text-slate-400 hover:text-white transition-colors"
            >
              Cancel and return to loans
            </Link>

            <button
              type="submit"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-500 via-teal-500 to-emerald-500 px-8 py-3.5 text-xs sm:text-sm font-bold text-slate-950 shadow-xl shadow-cyan-500/20 transition-all hover:brightness-110 active:scale-[0.99] cursor-pointer"
            >
              <span>Review Foreclosure Settlement</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
