"use client";

import { useState } from "react";
import Link from "next/link";
import { Landmark, CreditCard, Sparkles, AlertCircle, ArrowLeft } from "lucide-react";
import { calculateStandardEmiPaise, getEmiCategory } from "@/lib/finance/amortization";
import {
  extractAdditionalCharges,
  stripChargesFromNotes,
} from "@/lib/finance/emi-charges";
import { updateEmiDebt } from "../actions";

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

type DebtData = {
  id: string;
  name: string;
  debt_type: string;
  lender_name: string | null;
  linked_credit_card_id: string | null;
  payment_account_id: string | null;
  original_principal_paise: number | string;
  current_outstanding_principal_paise: number | string;
  outstanding_as_of_date: string;
  annual_interest_rate_basis_points: number | string | null;
  interest_method: string;
  total_tenure_months: number;
  installments_paid_before_tracking: number;
  emi_amount_paise: number | string;
  first_emi_due_date: string;
  next_due_date: string | null;
  status: string;
  additional_charges_paise?: number | string | null;
  charge_description?: string | null;
  notes: string | null;
};

type Props = {
  debt: DebtData;
  accounts: AccountOption[];
  cards: CardOption[];
  today: string;
};

const inputClass =
  "w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none transition-all focus:border-cyan-400 focus:bg-white/10 focus:ring-4 focus:ring-cyan-400/20";

function numeric(v: number | string | null | undefined): number {
  return Number(v ?? 0);
}

export default function EditEmiDebtForm({
  debt,
  accounts,
  cards,
  today,
}: Props) {
  const category = getEmiCategory(debt);
  const isLoanEmi = category === "loan_emi";

  // Form states prefilled from existing loan data
  const [name, setName] = useState(debt.name);
  const [debtType, setDebtType] = useState(debt.debt_type);
  const [lenderName, setLenderName] = useState(debt.lender_name ?? "");
  const [principalRupees, setPrincipalRupees] = useState(
    (numeric(debt.original_principal_paise) / 100).toFixed(2)
  );
  const [ratePercent, setRatePercent] = useState(
    debt.annual_interest_rate_basis_points != null
      ? (numeric(debt.annual_interest_rate_basis_points) / 100).toString()
      : ""
  );
  const [tenureMonths, setTenureMonths] = useState(
    debt.total_tenure_months.toString()
  );
  const [emiRupees, setEmiRupees] = useState(
    (numeric(debt.emi_amount_paise) / 100).toFixed(2)
  );
  const [outstandingRupees, setOutstandingRupees] = useState(
    (numeric(debt.current_outstanding_principal_paise) / 100).toFixed(2)
  );
  const [installmentsPaid, setInstallmentsPaid] = useState(
    debt.installments_paid_before_tracking.toString()
  );
  const [outstandingDate, setOutstandingDate] = useState(
    debt.outstanding_as_of_date
  );
  const [firstDueDate, setFirstDueDate] = useState(debt.first_emi_due_date);
  const [nextDueDate, setNextDueDate] = useState(debt.next_due_date ?? "");
  const [paymentAccountId, setPaymentAccountId] = useState(
    debt.payment_account_id ?? ""
  );
  const [linkedCardId, setLinkedCardId] = useState(
    debt.linked_credit_card_id ?? ""
  );
  const initialCharges = extractAdditionalCharges(debt);
  const [chargesRupees, setChargesRupees] = useState(
    initialCharges.chargesPaise > 0
      ? (initialCharges.chargesPaise / 100).toFixed(2)
      : ""
  );
  const [chargeDescription, setChargeDescription] = useState(
    initialCharges.description ?? ""
  );
  const [notes, setNotes] = useState(
    debt.notes ? stripChargesFromNotes(debt.notes) : ""
  );

  // Live recalculate estimated EMI
  const parsedPrincipalPaise = Math.round(Number(principalRupees || 0) * 100);
  const parsedRateBps = Math.round(Number(ratePercent || 0) * 100);
  const parsedTenure = Number.parseInt(tenureMonths || "0", 10);

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
      setEmiRupees(liveEstimatedEmiRupees);
    }
  }

  return (
    <form action={updateEmiDebt} className="space-y-6">
      <input type="hidden" name="debt_id" value={debt.id} />
      <input
        type="hidden"
        name="interest_method"
        value={isLoanEmi ? "reducing_balance" : "unknown"}
      />

      {/* Commitment Type Banner */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${
              isLoanEmi
                ? "border-cyan-400/30 bg-cyan-500/10 text-cyan-300"
                : "border-purple-400/30 bg-purple-500/10 text-purple-300"
            }`}
          >
            {isLoanEmi ? (
              <Landmark className="h-5 w-5" />
            ) : (
              <CreditCard className="h-5 w-5" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-white">
                {isLoanEmi ? "Loan EMI" : "Credit Card EMI"}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold border ${
                  isLoanEmi
                    ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/30"
                    : "bg-purple-500/20 text-purple-300 border-purple-500/30"
                }`}
              >
                {isLoanEmi ? "Amortized Schedule" : "Statement Billed"}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Editing commitment ID: <span className="font-mono text-slate-300">{debt.id.slice(0, 8)}...</span>
            </p>
          </div>
        </div>

        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
          Status: <strong className="text-white">{debt.status}</strong>
        </span>
      </div>

      {/* Notice regarding existing payments */}
      <div className="rounded-2xl border border-cyan-500/20 bg-cyan-950/20 p-4 text-xs text-cyan-200 flex items-start gap-3">
        <AlertCircle className="h-4 w-4 shrink-0 text-cyan-400 mt-0.5" />
        <p className="leading-relaxed">
          Updating financial parameters (principal, interest rate, tenure, or snapshot balance) will recompute future schedule projections. Historical payment records in your ledger remain intact and are never retroactively overwritten.
        </p>
      </div>

      {/* Conditional Form Fields */}
      {isLoanEmi ? (
        /* ==================== Loan EMI Fields ==================== */
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300">
                Loan Name
              </label>
              <input
                name="name"
                required
                maxLength={120}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Car Loan, Personal Loan"
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
                value={debtType}
                onChange={(e) => setDebtType(e.target.value)}
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
                value={lenderName}
                onChange={(e) => setLenderName(e.target.value)}
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
                value={principalRupees}
                onChange={(e) => setPrincipalRupees(e.target.value)}
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
                value={ratePercent}
                onChange={(e) => setRatePercent(e.target.value)}
                placeholder="e.g. 14.5"
                className={`${inputClass} font-semibold tabular-nums`}
              />
              <span className="mt-1 block text-[11px] text-slate-400">
                Per annum nominal rate used for reducing-balance amortization
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
                value={tenureMonths}
                onChange={(e) => setTenureMonths(e.target.value)}
                className={`${inputClass} font-semibold tabular-nums`}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-300">
                  Monthly EMI (₹)
                </label>
                {liveEstimatedEmiRupees && liveEstimatedEmiRupees !== emiRupees && (
                  <button
                    type="button"
                    onClick={applyEstimatedEmi}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-cyan-300 hover:text-cyan-200 transition-colors"
                  >
                    <Sparkles className="h-3 w-3" />
                    <span>Calculated: ₹{Number(liveEstimatedEmiRupees).toLocaleString("en-IN")}</span>
                  </button>
                )}
              </div>
              <input
                name="emi_amount_rupees"
                type="number"
                min="0.01"
                step="0.01"
                required
                value={emiRupees}
                onChange={(e) => setEmiRupees(e.target.value)}
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
                required
                value={installmentsPaid}
                onChange={(e) => setInstallmentsPaid(e.target.value)}
                className={`${inputClass} font-semibold tabular-nums`}
              />
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
                max={today}
                required
                value={outstandingDate}
                onChange={(e) => setOutstandingDate(e.target.value)}
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
                value={firstDueDate}
                onChange={(e) => setFirstDueDate(e.target.value)}
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
                value={paymentAccountId}
                onChange={(e) => setPaymentAccountId(e.target.value)}
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

            {/* Additional Charges (Optional) */}
            <div className="sm:col-span-2 rounded-2xl border border-white/10 bg-white/[0.02] p-4 sm:p-5 space-y-3">
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
                    value={chargesRupees}
                    onChange={(e) => setChargesRupees(e.target.value)}
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
                    value={chargeDescription}
                    onChange={(e) => setChargeDescription(e.target.value)}
                    placeholder="e.g. Processing Fee, Documentation Charges"
                    className={inputClass}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ==================== Credit Card EMI Fields ==================== */
        <div className="space-y-4">
          <input type="hidden" name="debt_type" value="credit_card_emi" />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300">
                EMI Nickname / Purchase
              </label>
              <input
                name="name"
                required
                maxLength={120}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. MacBook EMI"
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
                value={linkedCardId}
                onChange={(e) => setLinkedCardId(e.target.value)}
                className={inputClass}
              >
                <option value="" disabled className="bg-slate-900 text-slate-400">
                  Select credit card
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
                value={lenderName}
                onChange={(e) => setLenderName(e.target.value)}
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
                value={principalRupees}
                onChange={(e) => setPrincipalRupees(e.target.value)}
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
                value={emiRupees}
                onChange={(e) => setEmiRupees(e.target.value)}
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
                value={tenureMonths}
                onChange={(e) => setTenureMonths(e.target.value)}
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
                required
                value={installmentsPaid}
                onChange={(e) => setInstallmentsPaid(e.target.value)}
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
                value={outstandingRupees}
                onChange={(e) => setOutstandingRupees(e.target.value)}
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
                max={today}
                required
                value={outstandingDate}
                onChange={(e) => setOutstandingDate(e.target.value)}
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
                value={firstDueDate}
                onChange={(e) => setFirstDueDate(e.target.value)}
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
                value={nextDueDate}
                onChange={(e) => setNextDueDate(e.target.value)}
                className={inputClass}
              />
            </div>

            {/* Additional Charges (Optional) */}
            <div className="sm:col-span-2 rounded-2xl border border-white/10 bg-white/[0.02] p-4 sm:p-5 space-y-3">
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
                    value={chargesRupees}
                    onChange={(e) => setChargesRupees(e.target.value)}
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
                    value={chargeDescription}
                    onChange={(e) => setChargeDescription(e.target.value)}
                    placeholder="e.g. EMI Conversion Charges, Processing Fee"
                    className={inputClass}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Notes Field */}
      <div>
        <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300">
          Notes (optional)
        </label>
        <textarea
          name="notes"
          rows={2}
          maxLength={1000}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Loan account number, prepayment terms, or remarks"
          className={inputClass}
        />
      </div>

      {/* Action Buttons: Save Changes & Cancel */}
      <div className="flex flex-wrap items-center gap-3 pt-2">
        <button
          type="submit"
          className="rounded-2xl bg-gradient-to-r from-cyan-500 via-teal-500 to-emerald-600 px-8 py-3.5 text-sm font-bold text-slate-950 shadow-xl shadow-cyan-500/20 transition-all hover:brightness-110 active:scale-[0.99] cursor-pointer"
        >
          Save Changes
        </button>

        <Link
          href={`/emi`}
          className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-6 py-3.5 text-sm font-semibold text-slate-300 hover:text-white hover:bg-white/10 transition-all"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Cancel</span>
        </Link>
      </div>
    </form>
  );
}
