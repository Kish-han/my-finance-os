"use client";

import { useState, useMemo } from "react";
import { createTransaction } from "./actions";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ShieldCheck,
  CreditCard as CreditCardIcon,
  Landmark,
  Wallet,
  Calendar,
  Tag,
  FileText,
} from "lucide-react";

export type AccountRow = {
  id: string;
  name: string;
  account_type: "bank" | "cash";
  institution: string | null;
  opening_balance_date: string;
};

export type CreditCardRow = {
  id: string;
  name: string;
  bank_name: string;
  last_four_digits: string | null;
  opening_outstanding_date: string;
};

type TransactionFormProps = {
  accounts: AccountRow[];
  creditCards?: CreditCardRow[];
  availableCategories: string[];
  earliestDate?: string;
  initialType?: "income" | "expense";
  initialSourceId?: string;
  today: string;
  returnTo?: string;
};

export default function TransactionForm({
  accounts,
  creditCards = [],
  availableCategories,
  initialType = "expense",
  initialSourceId,
  today,
  returnTo = "/transactions/new",
}: TransactionFormProps) {
  const [flowType, setFlowType] = useState<"income" | "expense">(initialType);

  // Group accounts by bank vs cash
  const bankAccounts = useMemo(
    () => accounts.filter((a) => a.account_type === "bank"),
    [accounts]
  );
  const cashAccounts = useMemo(
    () => accounts.filter((a) => a.account_type === "cash"),
    [accounts]
  );

  // Determine initial valid source ID
  const defaultSourceId = useMemo(() => {
    if (initialSourceId) return initialSourceId;
    if (initialType === "income") {
      return accounts[0] ? `account:${accounts[0].id}` : "";
    }
    // For expense, prefer first credit card if available, else first account
    if (creditCards.length > 0) return `card:${creditCards[0].id}`;
    if (accounts.length > 0) return `account:${accounts[0].id}`;
    return "";
  }, [initialSourceId, initialType, accounts, creditCards]);

  const [selectedSourceId, setSelectedSourceId] = useState<string>(defaultSourceId);
  const [selectedCategory, setSelectedCategory] = useState<string>(
    initialType === "income" ? "Salary" : "Food & Dining"
  );
  const [showNotes, setShowNotes] = useState<boolean>(false);

  // Handle flow type switch (Income <-> Expense)
  const handleTypeChange = (newType: "income" | "expense") => {
    setFlowType(newType);

    // If switching to income and a credit card is selected, switch to first bank/cash account
    if (newType === "income" && selectedSourceId.startsWith("card:")) {
      const fallbackAccount = accounts[0];
      setSelectedSourceId(fallbackAccount ? `account:${fallbackAccount.id}` : "");
    }

    // Adjust category default if unchanged
    if (newType === "income" && selectedCategory === "Food & Dining") {
      setSelectedCategory("Salary");
    } else if (newType === "expense" && selectedCategory === "Salary") {
      setSelectedCategory("Food & Dining");
    }
  };

  // Inspect currently selected source details
  const selectedSourceDetails = useMemo(() => {
    if (selectedSourceId.startsWith("card:")) {
      const cardId = selectedSourceId.replace("card:", "");
      const card = creditCards.find((c) => c.id === cardId);
      return {
        type: "card" as const,
        label: card ? `${card.bank_name} ${card.name} (••${card.last_four_digits || "Card"})` : "Credit Card",
        minDate: card?.opening_outstanding_date,
      };
    }
    const accId = selectedSourceId.replace("account:", "");
    const acc = accounts.find((a) => a.id === accId);
    return {
      type: (acc?.account_type ?? "bank") as "bank" | "cash",
      label: acc ? acc.name : "Account",
      minDate: acc?.opening_balance_date,
    };
  }, [selectedSourceId, accounts, creditCards]);

  // Contextual helper label based on selection and type
  const sourceLabel = useMemo(() => {
    if (flowType === "income") {
      return `Deposit To — ${selectedSourceDetails.label}`;
    }
    if (selectedSourceDetails.type === "card") {
      return `Paid With — ${selectedSourceDetails.label}`;
    }
    if (selectedSourceDetails.type === "cash") {
      return `Paid From — ${selectedSourceDetails.label} (Cash in Hand)`;
    }
    return `Paid From — ${selectedSourceDetails.label} (Bank Account)`;
  }, [flowType, selectedSourceDetails]);

  // Contextual placeholder for description
  const descriptionPlaceholder = useMemo(() => {
    if (flowType === "income") {
      return "e.g. October Salary, Client Invoice, Consulting Retainer, Dividend";
    }
    if (selectedSourceDetails.type === "card") {
      return "e.g. Amazon, Flight Tickets, Swiggy, Dinner with Team, Fuel";
    }
    if (selectedSourceDetails.type === "cash") {
      return "e.g. Fresh Groceries, Local Market, Taxi Fare, Coffee";
    }
    return "e.g. House Rent, Electricity Bill, Internet Subscription, Groceries";
  }, [flowType, selectedSourceDetails]);

  return (
    <form action={createTransaction} className="space-y-5">
      <input type="hidden" name="returnTo" value={returnTo} />
      <input type="hidden" name="transactionType" value={flowType} />

      {/* 1. Tactile Deposit & Send Flow Type Selector */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-1.5 grid grid-cols-2 gap-2 shadow-inner">
        <button
          type="button"
          onClick={() => handleTypeChange("expense")}
          className={`flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
            flowType === "expense"
              ? "bg-rose-500 text-white shadow-lg shadow-rose-500/30 font-black scale-[1.01]"
              : "text-slate-400 hover:text-white hover:bg-white/5"
          }`}
        >
          <div
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${
              flowType === "expense"
                ? "bg-white/20 text-white"
                : "bg-rose-500/15 text-rose-400"
            }`}
          >
            <ArrowUpRight className="h-4 w-4" />
          </div>
          <span>Send (Expense −)</span>
        </button>

        <button
          type="button"
          onClick={() => handleTypeChange("income")}
          className={`flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
            flowType === "income"
              ? "bg-[#4edea3] text-slate-950 shadow-lg shadow-emerald-500/30 font-black scale-[1.01]"
              : "text-slate-400 hover:text-white hover:bg-white/5"
          }`}
        >
          <div
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${
              flowType === "income"
                ? "bg-slate-950/20 text-slate-950"
                : "bg-emerald-500/15 text-emerald-400"
            }`}
          >
            <ArrowDownLeft className="h-4 w-4" />
          </div>
          <span>Deposit (Income +)</span>
        </button>
      </div>

      {/* 2. Prominent Settlement Amount Card */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5 transition-all focus-within:border-[#4edea3]/50 focus-within:bg-white/[0.05] shadow-lg">
        <div className="flex items-center justify-between mb-2">
          <label
            htmlFor="amount"
            className="text-[10px] font-bold uppercase tracking-wider text-slate-400 cursor-pointer"
          >
            Settlement Amount
          </label>
          <span className="text-[10px] font-mono text-[#4edea3] font-semibold">INR TABULAR</span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`text-2xl sm:text-3xl font-black ${
              flowType === "income" ? "text-[#4edea3]" : "text-rose-400"
            }`}
          >
            ₹
          </span>
          <input
            id="amount"
            name="amount"
            type="number"
            inputMode="decimal"
            min="0.01"
            step="0.01"
            required
            autoFocus
            placeholder="0.00"
            className="w-full bg-transparent text-2xl sm:text-4xl font-black text-white placeholder:text-slate-600 outline-none tabular-nums tracking-tight"
          />
        </div>
      </div>

      {/* 3. Smart Account / Payment Source Dropdown */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition-all focus-within:border-[#4edea3]/50 focus-within:bg-white/[0.05] shadow-sm">
        <div className="flex items-center justify-between mb-1.5">
          <label
            htmlFor="sourceId"
            className="text-[10px] font-bold uppercase tracking-wider text-slate-400 cursor-pointer"
          >
            {flowType === "income" ? "Destination Account" : "Payment Source / Card"}
          </label>
          <div className="flex items-center gap-1.5">
            {selectedSourceDetails.type === "card" ? (
              <span className="flex items-center gap-1 text-[10px] font-mono font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                <CreditCardIcon className="h-3 w-3" />
                <span>CREDIT CARD</span>
              </span>
            ) : selectedSourceDetails.type === "cash" ? (
              <span className="flex items-center gap-1 text-[10px] font-mono font-bold text-emerald-300 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                <Wallet className="h-3 w-3" />
                <span>CASH</span>
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[10px] font-mono font-bold text-cyan-300 bg-cyan-500/10 px-2 py-0.5 rounded-full border border-cyan-500/20">
                <Landmark className="h-3 w-3" />
                <span>BANK</span>
              </span>
            )}
          </div>
        </div>

        <select
          id="sourceId"
          name="sourceId"
          required
          value={selectedSourceId}
          onChange={(e) => setSelectedSourceId(e.target.value)}
          className="w-full bg-transparent text-sm sm:text-base font-bold text-white outline-none cursor-pointer py-1"
        >
          <option value="" disabled className="bg-slate-900 text-slate-400">
            Select payment source...
          </option>

          {/* Group: Bank Accounts */}
          {bankAccounts.length > 0 && (
            <optgroup label="── Bank Accounts ──" className="bg-slate-900 text-slate-300 font-bold">
              {bankAccounts.map((account) => (
                <option
                  key={account.id}
                  value={`account:${account.id}`}
                  className="bg-slate-900 text-white font-normal"
                >
                  🏦 {account.name} {account.institution ? `(${account.institution})` : ""}
                </option>
              ))}
            </optgroup>
          )}

          {/* Group: Cash in Hand */}
          {cashAccounts.length > 0 && (
            <optgroup label="── Cash in Hand ──" className="bg-slate-900 text-slate-300 font-bold">
              {cashAccounts.map((account) => (
                <option
                  key={account.id}
                  value={`account:${account.id}`}
                  className="bg-slate-900 text-white font-normal"
                >
                  💵 {account.name} (Physical Cash)
                </option>
              ))}
            </optgroup>
          )}

          {/* Group: Credit Cards (Available for Expenses only) */}
          {flowType === "expense" && creditCards.length > 0 && (
            <optgroup label="── Credit Cards ──" className="bg-slate-900 text-amber-300 font-bold">
              {creditCards.map((card) => (
                <option
                  key={card.id}
                  value={`card:${card.id}`}
                  className="bg-slate-900 text-amber-200 font-normal"
                >
                  💳 {card.bank_name} {card.name} {card.last_four_digits ? `(••${card.last_four_digits})` : ""}
                </option>
              ))}
            </optgroup>
          )}
        </select>

        <p className="mt-2 text-[11px] text-slate-400 font-medium truncate flex items-center gap-1.5 border-t border-white/5 pt-2">
          <span className="text-[#4edea3]">●</span>
          <span>{sourceLabel}</span>
        </p>
      </div>

      {/* 4. Description / Merchant & Category (2-Column Grid) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition-all focus-within:border-[#4edea3]/50 focus-within:bg-white/[0.05]">
          <div className="flex items-center justify-between mb-1.5">
            <label
              htmlFor="description"
              className="text-[10px] font-bold uppercase tracking-wider text-slate-400 cursor-pointer flex items-center gap-1"
            >
              <FileText className="h-3 w-3" />
              <span>Description / Merchant</span>
            </label>
            <span className="text-[10px] font-mono text-slate-500">REQUIRED</span>
          </div>
          <input
            id="description"
            name="description"
            type="text"
            maxLength={160}
            required
            placeholder={descriptionPlaceholder}
            className="w-full bg-transparent text-sm sm:text-base font-semibold text-white placeholder:text-slate-500 outline-none"
          />
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition-all focus-within:border-[#4edea3]/50 focus-within:bg-white/[0.05]">
          <div className="flex items-center justify-between mb-1.5">
            <label
              htmlFor="category"
              className="text-[10px] font-bold uppercase tracking-wider text-slate-400 cursor-pointer flex items-center gap-1"
            >
              <Tag className="h-3 w-3" />
              <span>Category</span>
            </label>
            <span className="text-[10px] font-mono text-[#4edea3]">DROPDOWN</span>
          </div>
          <select
            id="category"
            name="category"
            required
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="w-full bg-transparent text-sm sm:text-base font-bold text-white outline-none cursor-pointer py-0.5"
          >
            <option value="" disabled className="bg-slate-900 text-slate-400">
              Select category...
            </option>
            {availableCategories.map((catName) => (
              <option key={catName} value={catName} className="bg-slate-900 text-white">
                {catName}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 5. Date & Optional Notes Toggle */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition-all focus-within:border-[#4edea3]/50 focus-within:bg-white/[0.05]">
          <div className="flex items-center justify-between mb-1.5">
            <label
              htmlFor="transactionDate"
              className="text-[10px] font-bold uppercase tracking-wider text-slate-400 cursor-pointer flex items-center gap-1"
            >
              <Calendar className="h-3 w-3" />
              <span>Transaction Date</span>
            </label>
            <span className="text-[10px] font-mono text-slate-500">IST TODAY</span>
          </div>
          <input
            id="transactionDate"
            name="transactionDate"
            type="date"
            max={today}
            min={selectedSourceDetails.minDate}
            defaultValue={today}
            required
            className="w-full bg-transparent text-sm sm:text-base font-bold text-white outline-none cursor-pointer"
          />
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Additional Memo
            </span>
            <button
              type="button"
              onClick={() => setShowNotes(!showNotes)}
              className="text-xs font-semibold text-[#4edea3] hover:underline cursor-pointer"
            >
              {showNotes ? "Hide Notes" : "+ Add Note / Tag"}
            </button>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            {showNotes
              ? "Optional context appended to transaction ledger record."
              : "Add invoice number, receipt tag, or reimbursement note."}
          </p>
        </div>
      </div>

      {/* Optional Notes Input Field */}
      {showNotes && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 animate-in fade-in duration-200">
          <label
            htmlFor="notes"
            className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 cursor-pointer"
          >
            Optional Notes / Metadata
          </label>
          <input
            id="notes"
            name="notes"
            type="text"
            maxLength={100}
            placeholder="e.g. Receipt #1042, reimbursed by client, work travel"
            className="w-full bg-transparent text-sm font-medium text-white placeholder:text-slate-500 outline-none"
          />
        </div>
      )}

      {/* 6. Prominent Verified Settlement Action Button */}
      <button
        type="submit"
        className={`w-full rounded-2xl py-4 text-sm sm:text-base font-bold shadow-xl transition-all hover:brightness-110 active:scale-[0.99] cursor-pointer flex items-center justify-center gap-2.5 mt-3 ${
          flowType === "income"
            ? "bg-gradient-to-r from-[#4edea3] via-[#10b981] to-[#003824] text-[#003824] shadow-emerald-500/25"
            : selectedSourceDetails.type === "card"
            ? "bg-gradient-to-r from-amber-500 via-amber-600 to-amber-700 text-slate-950 shadow-amber-500/25"
            : "bg-gradient-to-r from-rose-500 via-rose-600 to-amber-600 text-white shadow-rose-500/25"
        }`}
      >
        <ShieldCheck className="h-5 w-5" />
        <span>
          {flowType === "income"
            ? "Record Verified Deposit (+)"
            : selectedSourceDetails.type === "card"
            ? "Record Verified Card Purchase (−)"
            : "Record Verified Debit Expense (−)"}
        </span>
      </button>
    </form>
  );
}
