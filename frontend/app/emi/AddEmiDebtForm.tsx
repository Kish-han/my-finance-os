"use client";

import { useState } from "react";
import { Landmark, CreditCard, Sparkles, HelpCircle } from "lucide-react";
import { calculateStandardEmiPaise } from "@/lib/finance/amortization";
import { createEmiDebt } from "./actions";

type AccountOption = {
  id: string;
  name: string;
  institution: string | null;
};

type CardOption = {
  id: string;
  name: string;
  bank_name: string | null;
  last_four_digits: string | null;
};

type Props = {
  accounts: AccountOption[];
  cards: CardOption[];
  today: string;
};

const inputClass =
  "w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none transition-all focus:border-cyan-400 focus:bg-white/10 focus:ring-4 focus:ring-cyan-400/20";

export default function AddEmiDebtForm({ accounts, cards, today }: Props) {
  const [emiType, setEmiType] = useState<"loan_emi" | "credit_card_emi">("loan_emi");

  // Form states for live loan EMI calculation
  const [loanPrincipalRupees, setLoanPrincipalRupees] = useState("");
  const [loanRatePercent, setLoanRatePercent] = useState("");
  const [loanTenureMonths, setLoanTenureMonths] = useState("");
  const [monthlyEmiRupees, setMonthlyEmiRupees] = useState("");
  const [outstandingRupees, setOutstandingRupees] = useState("");
  const [firstEmiDate, setFirstEmiDate] = useState(today);
  const [nextDueDate, setNextDueDate] = useState(today);

  // Compute live estimated EMI
  const parsedPrincipalPaise = Math.round(Number(loanPrincipalRupees || 0) * 100);
  const parsedRateBps = Math.round(Number(loanRatePercent || 0) * 100);
  const parsedTenure = Number.parseInt(loanTenureMonths || "0", 10);

  const liveEstimatedEmiPaise =
    parsedPrincipalPaise > 0 && parsedTenure > 0
      ? calculateStandardEmiPaise(parsedPrincipalPaise, parsedRateBps, parsedTenure)
      : 0;

  const liveEstimatedEmiRupees =
    liveEstimatedEmiPaise > 0
      ? (liveEstimatedEmiPaise / 100).toFixed(2)
      : "";

  function applyEstimatedEmi() {
    if (liveEstimatedEmiRupees) {
      setMonthlyEmiRupees(liveEstimatedEmiRupees);
    }
  }

  function handlePrincipalChange(val: string) {
    setLoanPrincipalRupees(val);
    if (!outstandingRupees) {
      setOutstandingRupees(val);
    }
  }

  return (
    <div className="space-y-6">
      {/* Type Selector Segmented Control */}
      <div>
        <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-300">
          Select Commitment Type
        </label>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setEmiType("loan_emi")}
            className={`flex items-start gap-3.5 rounded-2xl border p-4 text-left transition-all cursor-pointer ${
              emiType === "loan_emi"
                ? "border-cyan-400/60 bg-gradient-to-br from-cyan-950/60 to-slate-900/80 shadow-lg shadow-cyan-950/40 ring-1 ring-cyan-400/30"
                : "border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/5 text-slate-400"
            }`}
          >
            <div
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${
                emiType === "loan_emi"
                  ? "border-cyan-400/40 bg-cyan-500/20 text-cyan-300"
                  : "border-white/10 bg-white/5 text-slate-400"
              }`}
            >
              <Landmark className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className={`text-sm font-bold ${emiType === "loan_emi" ? "text-white" : "text-slate-300"}`}>
                  Loan EMI
                </span>
                <span className="rounded-full bg-cyan-500/20 px-2 py-0.5 text-[10px] font-semibold text-cyan-300 border border-cyan-500/30">
                  Amortized Schedule
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-400 leading-relaxed">
                Personal, vehicle, or external loans. Automatically computes monthly reducing-balance principal/interest schedule.
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setEmiType("credit_card_emi")}
            className={`flex items-start gap-3.5 rounded-2xl border p-4 text-left transition-all cursor-pointer ${
              emiType === "credit_card_emi"
                ? "border-purple-400/60 bg-gradient-to-br from-purple-950/60 to-slate-900/80 shadow-lg shadow-purple-950/40 ring-1 ring-purple-400/30"
                : "border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/5 text-slate-400"
            }`}
          >
            <div
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${
                emiType === "credit_card_emi"
                  ? "border-purple-400/40 bg-purple-500/20 text-purple-300"
                  : "border-white/10 bg-white/5 text-slate-400"
              }`}
            >
              <CreditCard className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className={`text-sm font-bold ${emiType === "credit_card_emi" ? "text-white" : "text-slate-300"}`}>
                  Credit Card EMI
                </span>
                <span className="rounded-full bg-purple-500/20 px-2 py-0.5 text-[10px] font-semibold text-purple-300 border border-purple-500/30">
                  Statement Billed
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-400 leading-relaxed">
                Conversions and merchant installments billed to your credit card statement. Preserves existing card workflow.
              </p>
            </div>
          </button>
        </div>
      </div>

      {/* FORM: Option A - Loan EMI */}
      {emiType === "loan_emi" ? (
        <form action={createEmiDebt} className="space-y-4">
          <input type="hidden" name="interest_method" value="reducing_balance" />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300">
                Loan Name
              </label>
              <input
                name="name"
                required
                maxLength={120}
                placeholder="e.g. HDFC Personal Loan, Car Loan"
                className={inputClass}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300">
                Loan Category
              </label>
              <select
                name="debt_type"
                required
                defaultValue="personal_loan"
                className={inputClass}
              >
                <option value="personal_loan" className="bg-slate-900 text-white">Personal Loan</option>
                <option value="vehicle_loan" className="bg-slate-900 text-white">Vehicle Loan</option>
                <option value="consumer_durable_emi" className="bg-slate-900 text-white">Consumer Durable Loan</option>
                <option value="external_loan" className="bg-slate-900 text-white">External Loan</option>
                <option value="other" className="bg-slate-900 text-white">Other Term Loan</option>
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300">
                Bank or Lender
              </label>
              <input
                name="lender_name"
                required
                maxLength={120}
                placeholder="e.g. HDFC Bank, SBI, ICICI"
                className={inputClass}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300">
                Original Principal (₹)
              </label>
              <input
                name="original_principal_rupees"
                type="number"
                min="0.01"
                step="0.01"
                required
                value={loanPrincipalRupees}
                onChange={(e) => handlePrincipalChange(e.target.value)}
                placeholder="e.g. 250000"
                className={`${inputClass} font-semibold tabular-nums`}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300">
                Annual Interest Rate (%)
              </label>
              <input
                name="annual_interest_rate_percent"
                type="number"
                min="0"
                max="100"
                step="0.01"
                required
                value={loanRatePercent}
                onChange={(e) => setLoanRatePercent(e.target.value)}
                placeholder="e.g. 14.5"
                className={`${inputClass} font-semibold tabular-nums`}
              />
              <span className="mt-1 block text-[11px] text-slate-400">
                Nominal per annum interest rate (e.g. 14.5% = ₹8,605/mo for ₹2,50,000 / 36m)
              </span>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300">
                Total Tenure (months)
              </label>
              <input
                name="total_tenure_months"
                type="number"
                min="1"
                max="600"
                step="1"
                required
                value={loanTenureMonths}
                onChange={(e) => setLoanTenureMonths(e.target.value)}
                placeholder="e.g. 36"
                className={`${inputClass} font-semibold tabular-nums`}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-300">
                  Monthly EMI (₹)
                </label>
                {liveEstimatedEmiRupees && (
                  <button
                    type="button"
                    onClick={applyEstimatedEmi}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-cyan-300 hover:text-cyan-200 transition-colors"
                  >
                    <Sparkles className="h-3 w-3" />
                    <span>Use calculated: ₹{Number(liveEstimatedEmiRupees).toLocaleString("en-IN")}</span>
                  </button>
                )}
              </div>
              <input
                name="emi_amount_rupees"
                type="number"
                min="0.01"
                step="0.01"
                required
                value={monthlyEmiRupees}
                onChange={(e) => setMonthlyEmiRupees(e.target.value)}
                placeholder={liveEstimatedEmiRupees || "e.g. 8605"}
                className={`${inputClass} font-semibold tabular-nums`}
              />
              <span className="mt-1 block text-[11px] text-slate-500">
                You can specify your lender&apos;s exact EMI or use the formula calculation.
              </span>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300">
                Instalments Paid Before Tracking
              </label>
              <input
                name="installments_paid_before_tracking"
                type="number"
                min="0"
                step="1"
                defaultValue="0"
                required
                placeholder="0 if starting new"
                className={`${inputClass} font-semibold tabular-nums`}
              />
              <span className="mt-1 block text-[11px] text-slate-500">
                Instalments completed prior to tracking in this app.
              </span>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300">
                Outstanding Principal on Snapshot (₹)
              </label>
              <input
                name="current_outstanding_principal_rupees"
                type="number"
                min="0"
                step="0.01"
                required
                value={outstandingRupees}
                onChange={(e) => setOutstandingRupees(e.target.value)}
                placeholder="Defaults to original principal"
                className={`${inputClass} font-semibold tabular-nums`}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300">
                Balance Snapshot Date
              </label>
              <input
                name="outstanding_as_of_date"
                type="date"
                required
                defaultValue={today}
                className={inputClass}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300">
                First EMI Due Date
              </label>
              <input
                name="first_emi_due_date"
                type="date"
                required
                value={firstEmiDate}
                onChange={(e) => {
                  setFirstEmiDate(e.target.value);
                  if (nextDueDate === today) setNextDueDate(e.target.value);
                }}
                className={inputClass}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300">
                Next EMI Due Date
              </label>
              <input
                name="next_due_date"
                type="date"
                required
                value={nextDueDate}
                onChange={(e) => setNextDueDate(e.target.value)}
                className={inputClass}
              />
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300">
                Paying Bank Account (optional)
              </label>
              <select
                name="payment_account_id"
                defaultValue=""
                className={inputClass}
              >
                <option value="" className="bg-slate-900 text-slate-400">No linked bank account</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id} className="bg-slate-900 text-white">
                    {account.name} {account.institution ? ` · ${account.institution}` : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Additional Charges (Optional) */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 sm:p-5 space-y-3">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                Additional Charges (Optional)
              </h3>
              <p className="mt-0.5 text-[11px] text-slate-400">
                Processing fees, administrative charges, or stamp duty. These are recorded separately and are never folded into loan principal or reducing-balance interest.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300">
                  Additional Charges (₹)
                </label>
                <input
                  name="additional_charges_rupees"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  className={`${inputClass} font-semibold tabular-nums`}
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300">
                  Charge Description (Optional)
                </label>
                <input
                  name="charge_description"
                  type="text"
                  maxLength={120}
                  placeholder="e.g. Processing Fee, Documentation Charges"
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300">
              Notes (optional)
            </label>
            <textarea
              name="notes"
              rows={2}
              maxLength={1000}
              placeholder="Loan account number, prepayment terms, or interest benchmark"
              className={inputClass}
            />
          </div>

          <div className="rounded-xl border border-cyan-500/20 bg-cyan-950/20 p-4 text-xs text-cyan-300 flex items-start gap-2.5">
            <Sparkles className="h-4 w-4 shrink-0 text-cyan-400 mt-0.5" />
            <p>
              Saving this loan will generate a monthly reducing-balance amortization schedule. You can inspect all 36+ future installments with principal vs interest split on the Repayment Schedule page.
            </p>
          </div>

          <button
            type="submit"
            className="w-full sm:w-auto rounded-2xl bg-gradient-to-r from-cyan-500 via-teal-500 to-emerald-600 px-8 py-3.5 text-sm font-bold text-slate-950 shadow-xl shadow-cyan-500/20 transition-all hover:brightness-110 active:scale-[0.99] cursor-pointer"
          >
            Save Loan & Generate Schedule
          </button>
        </form>
      ) : (
        /* FORM: Option B - Credit Card EMI */
        <form action={createEmiDebt} className="space-y-4">
          <input type="hidden" name="debt_type" value="credit_card_emi" />
          <input type="hidden" name="interest_method" value="unknown" />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300">
                EMI Nickname / Purchase
              </label>
              <input
                name="name"
                required
                maxLength={120}
                placeholder="e.g. MacBook Pro EMI, iPhone 16 EMI"
                className={inputClass}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300">
                Linked Credit Card
              </label>
              <select
                name="linked_credit_card_id"
                required
                defaultValue=""
                className={inputClass}
              >
                <option value="" disabled className="bg-slate-900 text-slate-400">
                  Select your credit card
                </option>
                {cards.map((card) => (
                  <option key={card.id} value={card.id} className="bg-slate-900 text-white">
                    {card.name} {card.bank_name ? ` · ${card.bank_name}` : ""} {card.last_four_digits ? ` (···· ${card.last_four_digits})` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300">
                Card Issuer / Bank
              </label>
              <input
                name="lender_name"
                required
                maxLength={120}
                placeholder="e.g. HDFC Bank, ICICI Bank, SBI Card"
                className={inputClass}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300">
                Original Converted Amount (₹)
              </label>
              <input
                name="original_principal_rupees"
                type="number"
                min="0.01"
                step="0.01"
                required
                placeholder="e.g. 75000"
                className={`${inputClass} font-semibold tabular-nums`}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300">
                Monthly Statement EMI (₹)
              </label>
              <input
                name="emi_amount_rupees"
                type="number"
                min="0.01"
                step="0.01"
                required
                placeholder="e.g. 6850"
                className={`${inputClass} font-semibold tabular-nums`}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300">
                Total Tenure (months)
              </label>
              <input
                name="total_tenure_months"
                type="number"
                min="1"
                max="60"
                step="1"
                required
                placeholder="e.g. 12"
                className={`${inputClass} font-semibold tabular-nums`}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300">
                Instalments Paid Before Tracking
              </label>
              <input
                name="installments_paid_before_tracking"
                type="number"
                min="0"
                step="1"
                defaultValue="0"
                required
                className={`${inputClass} font-semibold tabular-nums`}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300">
                Outstanding Balance on Snapshot (₹)
              </label>
              <input
                name="current_outstanding_principal_rupees"
                type="number"
                min="0"
                step="0.01"
                required
                placeholder="Remaining amount on statement"
                className={`${inputClass} font-semibold tabular-nums`}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300">
                Balance Snapshot Date
              </label>
              <input
                name="outstanding_as_of_date"
                type="date"
                required
                defaultValue={today}
                className={inputClass}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300">
                First Statement Due Date
              </label>
              <input
                name="first_emi_due_date"
                type="date"
                required
                defaultValue={today}
                className={inputClass}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300">
                Next Statement Due Date
              </label>
              <input
                name="next_due_date"
                type="date"
                required
                defaultValue={today}
                className={inputClass}
              />
            </div>
          </div>

          {/* Additional Charges (Optional) */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 sm:p-5 space-y-3">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                Additional Charges (Optional)
              </h3>
              <p className="mt-0.5 text-[11px] text-slate-400">
                EMI conversion fee or processing charges billed by your card issuer. Stored distinctly from your regular statement installments.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300">
                  Additional Charges (₹)
                </label>
                <input
                  name="additional_charges_rupees"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  className={`${inputClass} font-semibold tabular-nums`}
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300">
                  Charge Description (Optional)
                </label>
                <input
                  name="charge_description"
                  type="text"
                  maxLength={120}
                  placeholder="e.g. EMI Conversion Charges, Processing Fee"
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300">
              Notes (optional)
            </label>
            <textarea
              name="notes"
              rows={2}
              maxLength={1000}
              placeholder="Merchant name, processing fee, or card statement note"
              className={inputClass}
            />
          </div>

          <div className="rounded-xl border border-purple-500/20 bg-purple-950/20 p-4 text-xs text-purple-300 flex items-start gap-2.5">
            <HelpCircle className="h-4 w-4 shrink-0 text-purple-400 mt-0.5" />
            <p>
              Credit Card EMIs are tracked as monthly commitments billed directly to your credit card statement. They do not alter your card transactions or apply loan reducing-balance calculations.
            </p>
          </div>

          <button
            type="submit"
            disabled={cards.length === 0}
            className="w-full sm:w-auto rounded-2xl bg-gradient-to-r from-purple-500 to-indigo-600 px-8 py-3.5 text-sm font-bold text-white shadow-xl shadow-purple-500/20 transition-all hover:brightness-110 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {cards.length === 0 ? "Add a Credit Card First" : "Save Credit Card EMI"}
          </button>
        </form>
      )}
    </div>
  );
}
