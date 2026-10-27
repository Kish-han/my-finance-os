"use client";

import { useState } from "react";
import { recordEmiPayment } from "./actions";
import { Landmark, CreditCard, Sparkles, ShieldCheck } from "lucide-react";

export type LoanOption = {
  id: string;
  label: string;
  emiRupees: string;
  nextInstallmentNumber: number;
  totalTenureMonths: number;
  nextDueDate: string | null;
  category: "loan_emi" | "credit_card_emi";
  linkedCreditCardId?: string | null;
  expectedPrincipalRupees?: string;
  expectedInterestRupees?: string;
  outstandingRupees?: string;
};

export type AccountOption = {
  id: string;
  label: string;
};

export type CardOption = {
  id: string;
  label: string;
};

type Props = {
  loans: LoanOption[];
  accounts: AccountOption[];
  cards?: CardOption[];
  today: string;
  defaultDebtId?: string;
};

const inputClass =
  "w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none transition-all focus:border-cyan-400 focus:bg-white/10 focus:ring-4 focus:ring-cyan-400/20";

export default function ScheduledEmiForm({
  loans,
  accounts,
  cards = [],
  today,
  defaultDebtId,
}: Props) {
  const initialLoan =
    loans.find((l) => l.id === defaultDebtId) ?? (loans.length > 0 ? loans[0] : null);

  const [debtId, setDebtId] = useState(initialLoan?.id ?? "");
  const [paymentDate, setPaymentDate] = useState(today);
  const [amount, setAmount] = useState(initialLoan?.emiRupees ?? "");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");

  const initialIsCard = initialLoan?.category === "credit_card_emi";
  const [paymentMethod, setPaymentMethod] = useState<"bank_debit" | "billed_to_credit_card">(
    initialIsCard ? "billed_to_credit_card" : "bank_debit"
  );
  const [cardId, setCardId] = useState(
    initialLoan?.linkedCreditCardId ?? (cards.length > 0 ? cards[0].id : "")
  );

  const [principalRupees, setPrincipalRupees] = useState(
    initialLoan?.expectedPrincipalRupees ?? ""
  );
  const [interestRupees, setInterestRupees] = useState(
    initialLoan?.expectedInterestRupees ?? ""
  );

  const selectedLoan = loans.find((loan) => loan.id === debtId);

  function handleLoanChange(nextDebtId: string) {
    setDebtId(nextDebtId);
    const loan = loans.find((item) => item.id === nextDebtId);
    setAmount(loan?.emiRupees ?? "");
    setPrincipalRupees(loan?.expectedPrincipalRupees ?? "");
    setInterestRupees(loan?.expectedInterestRupees ?? "");
    if (loan?.category === "credit_card_emi") {
      setPaymentMethod("billed_to_credit_card");
      if (loan.linkedCreditCardId) {
        setCardId(loan.linkedCreditCardId);
      }
    } else {
      setPaymentMethod("bank_debit");
    }
  }

  const isLoanEmi = selectedLoan?.category === "loan_emi";
  const isCreditCardEmi = selectedLoan?.category === "credit_card_emi";

  return (
    <form action={recordEmiPayment} className="space-y-5">
      <input type="hidden" name="payment_kind" value="scheduled_emi" />
      <input
        type="hidden"
        name="payment_method"
        value={isCreditCardEmi ? paymentMethod : "bank_debit"}
      />
      <input type="hidden" name="charges_rupees" value="0" />

      <div>
        <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300">
          Which commitment did you pay?
        </label>
        <select
          name="debt_id"
          required
          value={debtId}
          onChange={(event) => handleLoanChange(event.target.value)}
          className={inputClass}
        >
          <option value="" className="bg-slate-900 text-slate-400">Select loan or EMI</option>
          {loans.map((loan) => (
            <option key={loan.id} value={loan.id} className="bg-slate-900 text-white">
              {loan.label} {loan.category === "credit_card_emi" ? "(Card EMI)" : "(Loan)"}
            </option>
          ))}
        </select>
      </div>

      {selectedLoan && (
        <div className="rounded-2xl border border-cyan-500/30 bg-cyan-950/30 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-cyan-300 flex items-center gap-1.5">
              {isLoanEmi ? (
                <Landmark className="h-3.5 w-3.5" />
              ) : (
                <CreditCard className="h-3.5 w-3.5" />
              )}
              <span>
                Installment #{selectedLoan.nextInstallmentNumber} of {selectedLoan.totalTenureMonths}
              </span>
            </span>

            <span className="text-[11px] text-slate-400">
              {selectedLoan.nextDueDate
                ? `Due: ${selectedLoan.nextDueDate}`
                : "No due date set"}
            </span>
          </div>

          <div className="flex flex-wrap items-baseline gap-4 pt-1">
            <div>
              <span className="text-[10px] text-slate-400 uppercase font-semibold">Scheduled EMI</span>
              <p className="text-base font-black text-white tabular-nums">
                ₹{Number(selectedLoan.emiRupees).toLocaleString("en-IN", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </p>
            </div>

            {selectedLoan.outstandingRupees && (
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-semibold">Current Balance</span>
                <p className="text-base font-black text-cyan-300 tabular-nums">
                  ₹{Number(selectedLoan.outstandingRupees).toLocaleString("en-IN", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </p>
              </div>
            )}
          </div>

          {isLoanEmi && selectedLoan.expectedPrincipalRupees && (
            <div className="mt-2 rounded-xl bg-cyan-500/10 p-3 border border-cyan-500/20 text-xs space-y-1">
              <div className="flex items-center gap-1.5 text-cyan-300 font-bold">
                <Sparkles className="h-3.5 w-3.5" />
                <span>Calculated Amortization Breakdown</span>
              </div>
              <p className="text-slate-300">
                Principal: <strong className="text-emerald-400">₹{Number(selectedLoan.expectedPrincipalRupees).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</strong> · Interest: <strong className="text-amber-300">₹{Number(selectedLoan.expectedInterestRupees).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</strong>
              </p>
              <p className="text-[11px] text-slate-400">
                Only the principal portion reduces your outstanding balance. Interest is accounted for separately.
              </p>
            </div>
          )}
        </div>
      )}

      {isCreditCardEmi && (
        <div className="space-y-2 rounded-2xl border border-purple-500/30 bg-purple-950/20 p-4">
          <label className="block text-xs font-bold uppercase tracking-wider text-purple-200">
            Payment Settlement Method
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setPaymentMethod("billed_to_credit_card")}
              className={`flex items-start gap-3 rounded-xl border p-3 text-left transition-all cursor-pointer ${
                paymentMethod === "billed_to_credit_card"
                  ? "border-purple-400 bg-purple-950/60 shadow-md ring-1 ring-purple-400/40 text-white"
                  : "border-white/10 bg-white/[0.02] hover:border-white/20 text-slate-400"
              }`}
            >
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${
                  paymentMethod === "billed_to_credit_card"
                    ? "border-purple-400/40 bg-purple-500/20 text-purple-300"
                    : "border-white/10 bg-white/5 text-slate-400"
                }`}
              >
                <CreditCard className="h-4 w-4" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold">Billed to Credit Card</span>
                  <span className="rounded-full bg-purple-500/20 px-1.5 py-0.5 text-[9px] font-semibold text-purple-300 border border-purple-500/30">
                    Recommended
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] text-slate-400 leading-tight">
                  Added to card statement. Paid during monthly card bill to avoid duplicate bank deductions.
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setPaymentMethod("bank_debit")}
              className={`flex items-start gap-3 rounded-xl border p-3 text-left transition-all cursor-pointer ${
                paymentMethod === "bank_debit"
                  ? "border-cyan-400 bg-cyan-950/60 shadow-md ring-1 ring-cyan-400/40 text-white"
                  : "border-white/10 bg-white/[0.02] hover:border-white/20 text-slate-400"
              }`}
            >
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${
                  paymentMethod === "bank_debit"
                    ? "border-cyan-400/40 bg-cyan-500/20 text-cyan-300"
                    : "border-white/10 bg-white/5 text-slate-400"
                }`}
              >
                <Landmark className="h-4 w-4" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold">Direct Bank Debit</span>
                </div>
                <p className="mt-0.5 text-[11px] text-slate-400 leading-tight">
                  Direct deduction from a bank or liquid cash account.
                </p>
              </div>
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300">
            Payment Date
          </label>
          <input
            type="date"
            name="payment_date"
            required
            value={paymentDate}
            onChange={(event) => setPaymentDate(event.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300">
            Installment Number
          </label>
          <input
            type="number"
            name="installment_number"
            required
            readOnly
            value={selectedLoan?.nextInstallmentNumber ?? ""}
            className={`${inputClass} bg-white/[0.02] text-slate-400 cursor-not-allowed`}
          />
          <span className="mt-1 block text-[11px] text-slate-500">
            Sequence tracked from actual payment ledger.
          </span>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300">
            Total Amount Paid (₹)
          </label>
          <input
            type="number"
            name="amount_rupees"
            min="0.01"
            step="0.01"
            required
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="e.g. 8605"
            className={`${inputClass} font-semibold tabular-nums`}
          />
        </div>

        {isCreditCardEmi && paymentMethod === "billed_to_credit_card" ? (
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-purple-200">
              Billed to Credit Card
            </label>
            <select
              name="billed_to_credit_card_id"
              required
              value={cardId}
              onChange={(event) => setCardId(event.target.value)}
              className={inputClass}
            >
              <option value="" className="bg-slate-900 text-slate-400">Select credit card</option>
              {cards.map((card) => (
                <option key={card.id} value={card.id} className="bg-slate-900 text-white">
                  {card.label}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-[11px] text-purple-300/80">
              Billed on card statement; settled via Credit Card Repayment.
            </span>
          </div>
        ) : (
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300">
              Account Debited
            </label>
            <select
              name="payment_account_id"
              required
              value={accountId}
              onChange={(event) => setAccountId(event.target.value)}
              className={inputClass}
            >
              <option value="" className="bg-slate-900 text-slate-400">Select payment account</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id} className="bg-slate-900 text-white">
                  {account.label}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-[11px] text-slate-500">
              Bank or liquid account directly deducted.
            </span>
          </div>
        )}
      </div>

      {/* Principal & Interest Breakdown (pre-filled or adjustable) */}
      <details className="rounded-xl border border-white/10 bg-white/5 p-4" open={Boolean(isLoanEmi)}>
        <summary className="cursor-pointer text-xs font-bold uppercase tracking-wider text-cyan-300 hover:text-cyan-200">
          Principal & Interest Breakdown (Automated or Statement)
        </summary>

        <p className="mt-2 text-xs leading-5 text-slate-400">
          {isLoanEmi
            ? "Values are pre-computed using your loan's reducing-balance amortization schedule. You can adjust them if your lender statement shows a minor day-count variation."
            : "Optional: enter statement interest and principal if known."}
        </p>

        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300">
              Principal Component (₹)
            </label>
            <input
              type="number"
              name="principal_rupees"
              min="0"
              step="0.01"
              value={principalRupees}
              onChange={(e) => setPrincipalRupees(e.target.value)}
              placeholder="e.g. 5584.41"
              className={`${inputClass} font-semibold tabular-nums text-emerald-400`}
            />
            <span className="mt-1 block text-[11px] text-slate-500">
              Directly reduces outstanding principal.
            </span>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300">
              Interest Component (₹)
            </label>
            <input
              type="number"
              name="interest_rupees"
              min="0"
              step="0.01"
              value={interestRupees}
              onChange={(e) => setInterestRupees(e.target.value)}
              placeholder="e.g. 3020.83"
              className={`${inputClass} font-semibold tabular-nums text-amber-300`}
            />
            <span className="mt-1 block text-[11px] text-slate-500">
              Periodic interest charge.
            </span>
          </div>
        </div>
      </details>

      <div>
        <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300">
          Notes (optional)
        </label>
        <textarea
          name="notes"
          rows={2}
          maxLength={1000}
          placeholder="Payment transaction ID or statement notes"
          className={inputClass}
        />
      </div>

      <div className="flex items-center gap-2 text-xs text-slate-400">
        <ShieldCheck className="h-4 w-4 text-emerald-400" />
        <span>
          Payment will be safely recorded in your ledger and outstanding balance updated without duplicate ledger entries.
        </span>
      </div>

      <button
        type="submit"
        disabled={
          !selectedLoan ||
          (isCreditCardEmi && paymentMethod === "billed_to_credit_card"
            ? !cardId || cards.length === 0
            : !accountId || accounts.length === 0)
        }
        className="w-full sm:w-auto rounded-2xl bg-gradient-to-r from-cyan-500 via-teal-500 to-emerald-600 px-8 py-3.5 text-sm font-bold text-slate-950 shadow-xl shadow-cyan-500/20 transition-all hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
      >
        Record EMI Payment
      </button>
    </form>
  );
}
