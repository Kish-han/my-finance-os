"use client";

import { useState } from "react";
import { saveForeclosureQuote } from "./actions";

type LoanOption = {
  id: string;
  label: string;
  outstandingPrincipalRupees: string;
};

type Props = {
  loans: LoanOption[];
  today: string;
};

function rupeesToPaise(value: string): number {
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

export default function ForeclosureQuoteForm({ loans, today }: Props) {
  const [debtId, setDebtId] = useState("");
  const [principal, setPrincipal] = useState("");
  const [foreclosureCharges, setForeclosureCharges] = useState("0");
  const [tax, setTax] = useState("0");
  const [otherCharges, setOtherCharges] = useState("0");
  const [waivers, setWaivers] = useState("0");
  const [source, setSource] = useState("lender_quote");

  const totalPayoff = Math.max(
    0,
    rupeesToPaise(principal) +
      rupeesToPaise(foreclosureCharges) +
      rupeesToPaise(tax) +
      rupeesToPaise(otherCharges) -
      rupeesToPaise(waivers),
  );

  function handleLoanChange(id: string) {
    setDebtId(id);

    const selectedLoan = loans.find((loan) => loan.id === id);

    // Prefill the principal from the selected loan.
    setPrincipal(selectedLoan?.outstandingPrincipalRupees ?? "");
  }

  const inputClass =
    "mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-base text-slate-900";

  return (
    <form action={saveForeclosureQuote} className="mt-5 space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium text-slate-700 sm:col-span-2">
          Which loan do you want to close?
          <select
            name="debt_id"
            required
            value={debtId}
            onChange={(event) => handleLoanChange(event.target.value)}
            className={inputClass}
          >
            <option value="">Select an active loan</option>
            {loans.map((loan) => (
              <option key={loan.id} value={loan.id}>
                {loan.label}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs font-normal text-slate-500">
            Selecting a loan fills the principal amount below automatically.
          </span>
        </label>

        <label className="block text-sm font-medium text-slate-700">
          Date you received the amount
          <input
            name="quote_date"
            type="date"
            required
            defaultValue={today}
            className={inputClass}
          />
          <span className="mt-1 block text-xs font-normal text-slate-500">
            Usually the date printed on the bank's foreclosure quote.
          </span>
        </label>

        <label className="block text-sm font-medium text-slate-700">
          Amount valid until / review by
          <input
            name="valid_until"
            type="date"
            min={today}
            required
            defaultValue={today}
            className={inputClass}
          />
          <span className="mt-1 block text-xs font-normal text-slate-500">
            For a lender quote, use its expiry date. For your own estimate,
            choose when you plan to review it again.
          </span>
        </label>

        <label className="block text-sm font-medium text-slate-700 sm:col-span-2">
          Outstanding principal (₹)
          <input
            name="outstanding_principal_rupees"
            type="number"
            min="0.01"
            step="0.01"
            required
            value={principal}
            onChange={(event) => setPrincipal(event.target.value)}
            placeholder="Automatically filled when you select a loan"
            className={inputClass}
          />
          <span className="mt-1 block text-xs font-normal text-slate-500">
            This is the estimated remaining loan principal, not the original
            loan amount or the sum of all remaining EMIs. Update it if the
            lender gives you a different current figure.
          </span>
        </label>

        <label className="block text-sm font-medium text-slate-700">
          Foreclosure charges (₹)
          <input
            name="foreclosure_charges_rupees"
            type="number"
            min="0"
            step="0.01"
            required
            value={foreclosureCharges}
            onChange={(event) => setForeclosureCharges(event.target.value)}
            className={inputClass}
          />
        </label>

        <label className="block text-sm font-medium text-slate-700">
          Taxes / GST (₹)
          <input
            name="tax_rupees"
            type="number"
            min="0"
            step="0.01"
            required
            value={tax}
            onChange={(event) => setTax(event.target.value)}
            className={inputClass}
          />
        </label>

        <label className="block text-sm font-medium text-slate-700">
          Other charges (₹)
          <input
            name="other_charges_rupees"
            type="number"
            min="0"
            step="0.01"
            required
            value={otherCharges}
            onChange={(event) => setOtherCharges(event.target.value)}
            className={inputClass}
          />
        </label>

        <label className="block text-sm font-medium text-slate-700">
          Waiver / discount (₹)
          <input
            name="waivers_rupees"
            type="number"
            min="0"
            step="0.01"
            required
            value={waivers}
            onChange={(event) => setWaivers(event.target.value)}
            className={inputClass}
          />
        </label>

        <label className="block text-sm font-medium text-slate-700 sm:col-span-2">
          Where did this amount come from?
          <select
            name="source"
            required
            value={source}
            onChange={(event) => setSource(event.target.value)}
            className={inputClass}
          >
            <option value="lender_quote">Official quote from my lender</option>
            <option value="estimate">My own estimate</option>
          </select>
        </label>
      </div>

      <label className="block text-sm font-medium text-slate-700">
        Notes (optional)
        <textarea
          name="notes"
          rows={3}
          maxLength={1000}
          placeholder="For example, quote reference number or details from the lender"
          className={inputClass}
        />
      </label>

      <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
        <p className="text-sm font-medium text-slate-600">
          Estimated total needed to close the loan
        </p>
        <p className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
          {formatMoney(totalPayoff)}
        </p>

        <div className="mt-3 space-y-1 text-sm text-slate-600">
          <p>Principal: {formatMoney(rupeesToPaise(principal))}</p>
          <p>
            Foreclosure charges:{" "}
            {formatMoney(rupeesToPaise(foreclosureCharges))}
          </p>
          <p>Taxes: {formatMoney(rupeesToPaise(tax))}</p>
          <p>Other charges: {formatMoney(rupeesToPaise(otherCharges))}</p>
          <p>Waiver: −{formatMoney(rupeesToPaise(waivers))}</p>
        </div>

        {source === "estimate" && (
          <p className="mt-3 text-xs leading-5 text-slate-500">
            This is your own estimate, not a confirmed lender payoff amount.
          </p>
        )}
      </section>

      <button
        type="submit"
        className="w-full rounded-xl bg-slate-950 px-4 py-3 font-semibold text-white transition hover:bg-slate-800 sm:w-auto"
      >
        Save Foreclosure Quote
      </button>
    </form>
  );
}
