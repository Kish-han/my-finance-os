"use client";

import { useState } from "react";
import { saveForeclosureQuote } from "./actions";
import { Scale } from "lucide-react";

type LoanOption = {
  id: string;
  label: string;
  outstandingPrincipalRupees: string;
  emiRupees: string;
  remainingInstallments: number;
  estimatedRemainingPaymentsRupees: string;
};

type Props = {
  loans: LoanOption[];
  today: string;
};

function rupeesToPaise(value: string): number {
  if (!value.trim()) return 0;

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;

  return Math.round(parsed * 100);
}

function formatMoney(paise: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(paise / 100);
}

const inputClass =
  "w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none transition-all focus:border-cyan-400 focus:bg-white/10 focus:ring-4 focus:ring-cyan-400/20";

export default function ForeclosureQuoteForm({ loans, today }: Props) {
  const [debtId, setDebtId] = useState("");
  const [principal, setPrincipal] = useState("");
  const [foreclosureCharges, setForeclosureCharges] = useState("0");
  const [tax, setTax] = useState("0");
  const [otherCharges, setOtherCharges] = useState("0");
  const [waivers, setWaivers] = useState("0");
  const [source, setSource] = useState("lender_quote");

  const selectedLoan = loans.find((loan) => loan.id === debtId);

  const totalPayoff = Math.max(
    0,
    rupeesToPaise(principal) +
      rupeesToPaise(foreclosureCharges) +
      rupeesToPaise(tax) +
      rupeesToPaise(otherCharges) -
      rupeesToPaise(waivers),
  );

  const remainingScheduledPayments = selectedLoan
    ? rupeesToPaise(selectedLoan.estimatedRemainingPaymentsRupees)
    : 0;

  const difference = remainingScheduledPayments - totalPayoff;

  function handleLoanChange(id: string) {
    setDebtId(id);
    const loan = loans.find((item) => item.id === id);
    setPrincipal(loan?.outstandingPrincipalRupees ?? "");
  }

  return (
    <form action={saveForeclosureQuote} className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300">
            Which loan do you want to close?
          </label>
          <select
            name="debt_id"
            required
            value={debtId}
            onChange={(event) => handleLoanChange(event.target.value)}
            className={inputClass}
          >
            <option value="" className="bg-slate-900 text-slate-400">Select an active loan</option>
            {loans.map((loan) => (
              <option key={loan.id} value={loan.id} className="bg-slate-900 text-white">
                {loan.label}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-[11px] text-slate-500">
            Selecting a loan auto-fills its estimated remaining principal.
          </span>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300">
            Quote date
          </label>
          <input
            name="quote_date"
            type="date"
            required
            defaultValue={today}
            className={inputClass}
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300">
            Valid until / review by
          </label>
          <input
            name="valid_until"
            type="date"
            min={today}
            required
            defaultValue={today}
            className={inputClass}
          />
        </div>

        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300">
            Outstanding principal (₹)
          </label>
          <input
            name="outstanding_principal_rupees"
            type="number"
            min="0.01"
            step="0.01"
            required
            value={principal}
            onChange={(event) => setPrincipal(event.target.value)}
            placeholder="Automatically populated upon loan selection"
            className={`${inputClass} font-semibold tabular-nums`}
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300">
            Foreclosure fee (₹)
          </label>
          <input
            name="foreclosure_charges_rupees"
            type="number"
            min="0"
            step="0.01"
            required
            value={foreclosureCharges}
            onChange={(event) => setForeclosureCharges(event.target.value)}
            className={`${inputClass} font-semibold tabular-nums`}
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300">
            Taxes / GST (₹)
          </label>
          <input
            name="tax_rupees"
            type="number"
            min="0"
            step="0.01"
            required
            value={tax}
            onChange={(event) => setTax(event.target.value)}
            className={`${inputClass} font-semibold tabular-nums`}
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300">
            Other charges (₹)
          </label>
          <input
            name="other_charges_rupees"
            type="number"
            min="0"
            step="0.01"
            required
            value={otherCharges}
            onChange={(event) => setOtherCharges(event.target.value)}
            className={`${inputClass} font-semibold tabular-nums`}
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300">
            Waivers / discount (₹)
          </label>
          <input
            name="waivers_rupees"
            type="number"
            min="0"
            step="0.01"
            required
            value={waivers}
            onChange={(event) => setWaivers(event.target.value)}
            className={`${inputClass} font-semibold tabular-nums text-emerald-400`}
          />
        </div>

        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300">
            Source of this quote
          </label>
          <select
            name="source"
            required
            value={source}
            onChange={(event) => setSource(event.target.value)}
            className={inputClass}
          >
            <option value="lender_quote" className="bg-slate-900 text-white">Official quote from lender</option>
            <option value="estimate" className="bg-slate-900 text-white">My own estimate</option>
          </select>
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
          placeholder="Quote reference number, banker email or prepayment details"
          className={inputClass}
        />
      </div>

      {/* Payoff Calculation Box */}
      <section className="rounded-2xl border border-cyan-500/25 bg-cyan-950/20 p-5 space-y-3">
        <p className="text-xs font-bold uppercase tracking-wider text-cyan-300">
          Estimated Payoff Required to Close Loan
        </p>
        <div className="text-3xl sm:text-4xl font-black text-white tabular-nums">
          {formatMoney(totalPayoff)}
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs text-slate-400 sm:grid-cols-4 border-t border-white/10 pt-3">
          <div>Principal: <strong className="text-white">{formatMoney(rupeesToPaise(principal))}</strong></div>
          <div>Fee: <strong className="text-white">{formatMoney(rupeesToPaise(foreclosureCharges))}</strong></div>
          <div>Taxes: <strong className="text-white">{formatMoney(rupeesToPaise(tax))}</strong></div>
          <div>Waiver: <strong className="text-emerald-400">−{formatMoney(rupeesToPaise(waivers))}</strong></div>
        </div>
      </section>

      {/* Interactive Foreclosure Comparison Strategy */}
      {selectedLoan && (
        <section className="apple-panel p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Scale className="h-4 w-4 text-cyan-400" />
            <h3 className="text-sm font-bold text-white">
              Foreclose Now vs Continue Scheduled EMIs
            </h3>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs text-slate-400">Continue Scheduled EMIs</p>
              <p className="mt-1 text-xl font-black text-white tabular-nums">
                {formatMoney(remainingScheduledPayments)}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                {selectedLoan.remainingInstallments} instalments × {formatMoney(rupeesToPaise(selectedLoan.emiRupees))}
              </p>
            </div>

            <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/10 p-4">
              <p className="text-xs text-cyan-300">Foreclosure Payoff</p>
              <p className="mt-1 text-xl font-black text-white tabular-nums">
                {formatMoney(totalPayoff)}
              </p>
              <p className="mt-1 text-[11px] text-cyan-400/80">
                Includes all charges & fee adjustments
              </p>
            </div>
          </div>

          {selectedLoan.remainingInstallments > 0 ? (
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              {difference > 0 ? (
                <div className="space-y-1">
                  <p className="text-sm font-bold text-emerald-400">
                    {formatMoney(difference)} lower cash outflow than remaining EMI sum
                  </p>
                  <p className="text-xs text-slate-400">
                    The lump-sum payoff amount is lower than the total future scheduled EMI cash obligations.
                  </p>
                </div>
              ) : difference < 0 ? (
                <div className="space-y-1">
                  <p className="text-sm font-bold text-rose-400">
                    {formatMoney(Math.abs(difference))} higher than remaining EMI sum
                  </p>
                  <p className="text-xs text-slate-400">
                    Payoff exceeds remaining scheduled instalments. Check charges and fees before proceeding.
                  </p>
                </div>
              ) : (
                <p className="text-sm font-bold text-slate-300">
                  Both totals are exactly equal.
                </p>
              )}
            </div>
          ) : (
            <p className="text-xs text-slate-400">
              No future scheduled instalments remain for this loan.
            </p>
          )}
        </section>
      )}

      <button
        type="submit"
        className="w-full sm:w-auto rounded-2xl bg-gradient-to-r from-cyan-500 via-teal-500 to-emerald-600 px-8 py-3.5 text-sm font-bold text-slate-950 shadow-xl shadow-cyan-500/20 transition-all hover:brightness-110 active:scale-[0.99] cursor-pointer"
      >
        Calculate and Save Quote
      </button>
    </form>
  );
}
