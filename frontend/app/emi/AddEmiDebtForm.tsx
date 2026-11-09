"use client";

import { useState } from "react";
import {
  Landmark,
  CreditCard,
  Sparkles,
  HelpCircle,
  RefreshCw,
  ShoppingBag,
  CheckCircle2,
} from "lucide-react";
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

type CardPurchaseOption = {
  id: string;
  description: string;
  amount_paise: number;
  transaction_date: string;
  credit_card_id: string;
  is_converted?: boolean;
};

type CategoryOption = {
  id: string;
  name: string;
  type: string;
};

type Props = {
  accounts: AccountOption[];
  cards: CardOption[];
  categories?: CategoryOption[];
  cardPurchases?: CardPurchaseOption[];
  today: string;
};

const inputClass =
  "w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none transition-all focus:border-cyan-400 focus:bg-white/10 focus:ring-4 focus:ring-cyan-400/20";

export default function AddEmiDebtForm({
  accounts,
  cards,
  categories = [],
  cardPurchases = [],
  today,
}: Props) {
  const [emiType, setEmiType] = useState<"loan_emi" | "credit_card_emi">("loan_emi");

  // Form states for live loan EMI calculation
  const [loanPrincipalRupees, setLoanPrincipalRupees] = useState("");
  const [loanRatePercent, setLoanRatePercent] = useState("");
  const [loanTenureMonths, setLoanTenureMonths] = useState("");
  const [monthlyEmiRupees, setMonthlyEmiRupees] = useState("");
  const [outstandingRupees, setOutstandingRupees] = useState("");
  const [firstEmiDate, setFirstEmiDate] = useState(today);
  const [nextDueDate, setNextDueDate] = useState(today);

  // Credit Card EMI states
  const [cardEmiScenario, setCardEmiScenario] = useState<"convert_purchase" | "new_purchase">(
    "convert_purchase"
  );
  const [selectedCardId, setSelectedCardId] = useState<string>(cards[0]?.id ?? "");
  const [selectedPurchaseId, setSelectedPurchaseId] = useState<string>("");
  const [cardEmiName, setCardEmiName] = useState<string>("");
  const [cardEmiLender, setCardEmiLender] = useState<string>(
    cards[0]?.bank_name || cards[0]?.name || ""
  );
  const [cardEmiPrincipalRupees, setCardEmiPrincipalRupees] = useState<string>("");
  const [cardEmiOutstandingRupees, setCardEmiOutstandingRupees] = useState<string>("");
  const [cardEmiMonthlyRupees, setCardEmiMonthlyRupees] = useState<string>("");
  const [cardEmiTenureMonths, setCardEmiTenureMonths] = useState<string>("12");
  const [cardEmiPurchaseDate, setCardEmiPurchaseDate] = useState<string>(today);
  const [cardEmiFirstDueDate, setCardEmiFirstDueDate] = useState<string>(today);
  const [cardEmiNextDueDate, setCardEmiNextDueDate] = useState<string>(today);

  // Compute live estimated EMI for amortized loan
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

  function handleCardChange(cardId: string) {
    setSelectedCardId(cardId);
    setSelectedPurchaseId("");
    const matchedCard = cards.find((c) => c.id === cardId);
    if (matchedCard?.bank_name) {
      setCardEmiLender(matchedCard.bank_name);
    }
    if (cardEmiScenario === "convert_purchase") {
      setCardEmiPrincipalRupees("");
      setCardEmiOutstandingRupees("");
      setCardEmiName("");
    }
  }

  function handleSelectPurchase(purchaseId: string) {
    setSelectedPurchaseId(purchaseId);
    const purchase = cardPurchases.find((p) => p.id === purchaseId);
    if (purchase) {
      setCardEmiName(purchase.description);
      const rupees = (purchase.amount_paise / 100).toFixed(2);
      setCardEmiPrincipalRupees(rupees);
      setCardEmiOutstandingRupees(rupees);
      setCardEmiPurchaseDate(purchase.transaction_date);
      setCardEmiFirstDueDate(purchase.transaction_date);
    } else {
      setCardEmiPrincipalRupees("");
      setCardEmiOutstandingRupees("");
      setCardEmiName("");
    }
  }

  // Purchases available on currently selected card
  const purchasesOnSelectedCard = cardPurchases.filter(
    (p) => p.credit_card_id === selectedCardId && !p.is_converted
  );

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
                  Card Ledger Linked
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-400 leading-relaxed">
                Convert an existing card spend or record a new purchase on EMI with zero balance double-counting.
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
                Loan Nickname
              </label>
              <input
                name="name"
                required
                maxLength={120}
                placeholder="e.g. HDFC Car Loan, SBI Home Loan"
                className={inputClass}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300">
                Lender / Bank Name
              </label>
              <input
                name="lender_name"
                required
                maxLength={120}
                placeholder="e.g. HDFC Bank, SBI, ICICI Bank"
                className={inputClass}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300">
                Loan Category / Type
              </label>
              <select name="debt_type" required defaultValue="personal_loan" className={inputClass}>
                <option value="personal_loan" className="bg-slate-900 text-white">Personal Loan</option>
                <option value="vehicle_loan" className="bg-slate-900 text-white">Vehicle Loan</option>
                <option value="consumer_durable_emi" className="bg-slate-900 text-white">Consumer Durable Loan</option>
                <option value="external_loan" className="bg-slate-900 text-white">External Loan / NBFC</option>
                <option value="other" className="bg-slate-900 text-white">Other Term Loan</option>
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300">
                Repayment Bank Account (Optional)
              </label>
              <select name="payment_account_id" defaultValue="" className={inputClass}>
                <option value="" className="bg-slate-900 text-slate-400">
                  Select linked account (auto-debit source)
                </option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id} className="bg-slate-900 text-white">
                    {account.name} {account.institution ? ` · ${account.institution}` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300">
                Sanctioned Principal (₹)
              </label>
              <input
                name="original_principal_rupees"
                type="number"
                min="0.01"
                step="0.01"
                required
                value={loanPrincipalRupees}
                onChange={(e) => handlePrincipalChange(e.target.value)}
                placeholder="e.g. 500000"
                className={`${inputClass} font-semibold tabular-nums`}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300">
                Annual Interest Rate (% p.a.)
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
                placeholder="e.g. 10.5"
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
                    className="text-[11px] font-semibold text-cyan-400 hover:text-cyan-300 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Sparkles className="h-3 w-3" />
                    Auto-fill ₹{liveEstimatedEmiRupees}
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
                placeholder={liveEstimatedEmiRupees ? `Calculated: ₹${liveEstimatedEmiRupees}` : "e.g. 16250"}
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
                Outstanding Principal as of Snapshot (₹)
              </label>
              <input
                name="current_outstanding_principal_rupees"
                type="number"
                min="0"
                step="0.01"
                required
                value={outstandingRupees}
                onChange={(e) => setOutstandingRupees(e.target.value)}
                placeholder="Current balance remaining"
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
                value={firstEmiDate}
                onChange={(e) => setFirstEmiDate(e.target.value)}
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
                onChange={(e) => setFirstEmiDate(e.target.value)}
                className={inputClass}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300">
                Next Upcoming Due Date
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
              Saving this loan will generate a monthly reducing-balance amortization schedule. You can inspect future installments with principal vs interest split on the Repayment Schedule page.
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
        <form action={createEmiDebt} className="space-y-5">
          <input type="hidden" name="debt_type" value="credit_card_emi" />
          <input type="hidden" name="interest_method" value="unknown" />
          <input type="hidden" name="emi_scenario" value={cardEmiScenario} />
          {cardEmiScenario === "new_purchase" && (
            <input type="hidden" name="is_new_purchase" value="true" />
          )}

          {/* Sub-scenario selector: Scenario 1 vs Scenario 2 */}
          <div className="rounded-2xl border border-purple-500/30 bg-purple-950/20 p-3 sm:p-4 space-y-3">
            <span className="block text-xs font-bold uppercase tracking-wider text-purple-300">
              Credit Card EMI Creation Method
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  setCardEmiScenario("convert_purchase");
                  setSelectedPurchaseId("");
                  setCardEmiPrincipalRupees("");
                  setCardEmiOutstandingRupees("");
                  setCardEmiName("");
                }}
                className={`flex items-start gap-3 rounded-xl border p-3.5 text-left transition-all cursor-pointer ${
                  cardEmiScenario === "convert_purchase"
                    ? "border-purple-400 bg-purple-900/40 text-white shadow-md ring-1 ring-purple-400/30"
                    : "border-white/10 bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200"
                }`}
              >
                <RefreshCw
                  className={`h-4 w-4 shrink-0 mt-0.5 ${
                    cardEmiScenario === "convert_purchase" ? "text-purple-300" : "text-slate-400"
                  }`}
                />
                <div>
                  <div className="text-xs font-bold">Scenario 1: Convert Existing Spend</div>
                  <div className="mt-0.5 text-[11px] leading-relaxed text-slate-300">
                    Select a purchase already made on your card. Retains your ledger without double counting.
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setCardEmiScenario("new_purchase");
                  setSelectedPurchaseId("");
                  setCardEmiPrincipalRupees("");
                  setCardEmiOutstandingRupees("");
                  setCardEmiName("");
                }}
                className={`flex items-start gap-3 rounded-xl border p-3.5 text-left transition-all cursor-pointer ${
                  cardEmiScenario === "new_purchase"
                    ? "border-purple-400 bg-purple-900/40 text-white shadow-md ring-1 ring-purple-400/30"
                    : "border-white/10 bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200"
                }`}
              >
                <ShoppingBag
                  className={`h-4 w-4 shrink-0 mt-0.5 ${
                    cardEmiScenario === "new_purchase" ? "text-purple-300" : "text-slate-400"
                  }`}
                />
                <div>
                  <div className="text-xs font-bold">Scenario 2: Make New Purchase on EMI</div>
                  <div className="mt-0.5 text-[11px] leading-relaxed text-slate-300">
                    Records exactly ONE card purchase and creates the linked EMI plan in one clean step.
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Card Selection */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300">
                Select Credit Card
              </label>
              <select
                name="linked_credit_card_id"
                required
                value={selectedCardId}
                onChange={(e) => handleCardChange(e.target.value)}
                className={inputClass}
              >
                {cards.map((card) => (
                  <option key={card.id} value={card.id} className="bg-slate-900 text-white">
                    {card.name} {card.bank_name ? ` · ${card.bank_name}` : ""}{" "}
                    {card.last_four_digits ? ` (···· ${card.last_four_digits})` : ""}
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
                value={cardEmiLender}
                onChange={(e) => setCardEmiLender(e.target.value)}
                placeholder="e.g. HDFC Bank, ICICI Bank, SBI Card"
                className={inputClass}
              />
            </div>
          </div>

          {/* Scenario 1: Choose Existing Purchase */}
          {cardEmiScenario === "convert_purchase" && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 sm:p-5 space-y-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-purple-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                  Select Existing Card Purchase to Convert
                </h3>
              </div>

              {purchasesOnSelectedCard.length > 0 ? (
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300">
                    Card Purchase Transaction
                  </label>
                  <select
                    name="existing_transaction_id"
                    value={selectedPurchaseId}
                    onChange={(e) => handleSelectPurchase(e.target.value)}
                    required
                    className={inputClass}
                  >
                    <option value="" disabled className="bg-slate-900 text-slate-400">
                      Select an eligible card transaction
                    </option>
                    {purchasesOnSelectedCard.map((tx) => (
                      <option key={tx.id} value={tx.id} className="bg-slate-900 text-white">
                        {tx.transaction_date} · {tx.description} — ₹{(tx.amount_paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="rounded-xl border border-amber-500/20 bg-amber-950/20 p-3.5 text-xs text-amber-300">
                  No unconverted card purchases found for this credit card. If you are buying a new item, select <strong>Scenario 2 (New Purchase on EMI)</strong> above.
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300">
                    EMI Nickname / Purchase
                  </label>
                  <input
                    name="name"
                    required
                    maxLength={120}
                    value={cardEmiName}
                    onChange={(e) => setCardEmiName(e.target.value)}
                    placeholder="e.g. Croma Electronics Purchase"
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300">
                    Converted Purchase Amount (₹)
                  </label>
                  <input
                    name="original_principal_rupees"
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                    value={cardEmiPrincipalRupees}
                    onChange={(e) => {
                      setCardEmiPrincipalRupees(e.target.value);
                      setCardEmiOutstandingRupees(e.target.value);
                    }}
                    placeholder="e.g. 10000"
                    className={`${inputClass} font-semibold tabular-nums`}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Scenario 2: Make New Purchase on EMI */}
          {cardEmiScenario === "new_purchase" && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 sm:p-5 space-y-4">
              <div className="flex items-center gap-2">
                <ShoppingBag className="h-4 w-4 text-purple-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                  New Purchase Details (Records 1 Card Purchase)
                </h3>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300">
                    Purchase Description / Merchant
                  </label>
                  <input
                    name="name"
                    required
                    maxLength={120}
                    value={cardEmiName}
                    onChange={(e) => setCardEmiName(e.target.value)}
                    placeholder="e.g. Apple Store iPhone 16 Pro"
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300">
                    Purchase Amount (₹)
                  </label>
                  <input
                    name="original_principal_rupees"
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                    value={cardEmiPrincipalRupees}
                    onChange={(e) => {
                      setCardEmiPrincipalRupees(e.target.value);
                      setCardEmiOutstandingRupees(e.target.value);
                    }}
                    placeholder="e.g. 119900"
                    className={`${inputClass} font-semibold tabular-nums`}
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300">
                    Purchase Date
                  </label>
                  <input
                    name="purchase_date"
                    type="date"
                    required
                    value={cardEmiPurchaseDate}
                    onChange={(e) => {
                      setCardEmiPurchaseDate(e.target.value);
                      setCardEmiFirstDueDate(e.target.value);
                    }}
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300">
                    Expense Category (Optional)
                  </label>
                  <select name="category_id" defaultValue="" className={inputClass}>
                    <option value="" className="bg-slate-900 text-slate-400">
                      Select category (e.g. Electronics, Shopping)
                    </option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id} className="bg-slate-900 text-white">
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Common EMI Repayment Terms */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                value={cardEmiMonthlyRupees}
                onChange={(e) => setCardEmiMonthlyRupees(e.target.value)}
                placeholder="e.g. 5200"
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
                value={cardEmiTenureMonths}
                onChange={(e) => setCardEmiTenureMonths(e.target.value)}
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
                value={cardEmiOutstandingRupees}
                onChange={(e) => setCardEmiOutstandingRupees(e.target.value)}
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
                value={cardEmiPurchaseDate}
                onChange={(e) => setCardEmiPurchaseDate(e.target.value)}
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
                value={cardEmiFirstDueDate}
                onChange={(e) => setCardEmiFirstDueDate(e.target.value)}
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
                value={cardEmiNextDueDate}
                onChange={(e) => setCardEmiNextDueDate(e.target.value)}
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
              {cardEmiScenario === "convert_purchase"
                ? "Scenario 1: Your existing card purchase remains on your card ledger. Converting it to EMI links this repayment plan without adding duplicate debt or creating an artificial payment adjustment."
                : "Scenario 2: Exactly ONE purchase transaction will be recorded on your card, and this EMI plan will be linked to it. Card outstanding increases by the purchase amount with zero double counting."}
            </p>
          </div>

          <button
            type="submit"
            disabled={cards.length === 0}
            className="w-full sm:w-auto rounded-2xl bg-gradient-to-r from-purple-500 to-indigo-600 px-8 py-3.5 text-sm font-bold text-white shadow-xl shadow-purple-500/20 transition-all hover:brightness-110 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {cards.length === 0
              ? "Add a Credit Card First"
              : cardEmiScenario === "convert_purchase"
              ? "Convert Purchase to EMI"
              : "Record Purchase & Create EMI"}
          </button>
        </form>
      )}
    </div>
  );
}
