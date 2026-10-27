"use client";

import { useState } from "react";
import { createTransaction } from "./actions";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ShieldCheck,
} from "lucide-react";

type AccountRow = {
  id: string;
  name: string;
  account_type: "bank" | "cash";
  institution: string | null;
  opening_balance_date: string;
};

type TransactionFormProps = {
  accounts: AccountRow[];
  availableCategories: string[];
  earliestDate?: string;
  initialType?: "income" | "expense";
  today: string;
  returnTo?: string;
};

export default function TransactionForm({
  accounts,
  availableCategories,
  earliestDate,
  initialType = "expense",
  today,
  returnTo = "/transactions/new",
}: TransactionFormProps) {
  const [flowType, setFlowType] = useState<"income" | "expense">(initialType);
  const [selectedCategory, setSelectedCategory] = useState<string>(
    initialType === "income" ? "Salary" : "Food & Dining"
  );

  const handleTypeChange = (newType: "income" | "expense") => {
    setFlowType(newType);
    if (newType === "income" && selectedCategory === "Food & Dining") {
      setSelectedCategory("Salary");
    } else if (newType === "expense" && selectedCategory === "Salary") {
      setSelectedCategory("Food & Dining");
    }
  };

  return (
    <form action={createTransaction} className="space-y-4">
      <input type="hidden" name="returnTo" value={returnTo} />
      {/* Tactile Deposit & Send Flow Type Selector */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-1.5 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => handleTypeChange("income")}
          className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
            flowType === "income"
              ? "bg-[#4edea3] text-slate-950 shadow-lg shadow-emerald-500/25 font-black scale-[1.01]"
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

        <button
          type="button"
          onClick={() => handleTypeChange("expense")}
          className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
            flowType === "expense"
              ? "bg-rose-500 text-white shadow-lg shadow-rose-500/25 font-black scale-[1.01]"
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
      </div>

      {/* Row 1: Source Account and Flow Type sync */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition-all focus-within:border-[#4edea3]/50">
          <div className="flex items-center justify-between mb-1.5">
            <label
              htmlFor="accountId"
              className="text-[10px] font-bold uppercase tracking-wider text-slate-400 cursor-pointer"
            >
              Source Account
            </label>
            <span className="text-[10px] font-mono text-[#4edea3]">ACCOUNT</span>
          </div>
          <select
            id="accountId"
            name="accountId"
            required
            defaultValue=""
            className="w-full bg-transparent text-sm sm:text-base font-bold text-white outline-none cursor-pointer"
          >
            <option value="" disabled className="bg-slate-900 text-slate-400">
              Select account...
            </option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id} className="bg-slate-900 text-white">
                {account.name} {account.institution ? ` (${account.institution})` : ""} ·{" "}
                {account.account_type === "bank" ? "Bank" : "Cash"}
              </option>
            ))}
          </select>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition-all focus-within:border-[#4edea3]/50">
          <div className="flex items-center justify-between mb-1.5">
            <label
              htmlFor="transactionType"
              className="text-[10px] font-bold uppercase tracking-wider text-slate-400 cursor-pointer"
            >
              Flow Type
            </label>
            <span className="text-[10px] font-mono text-slate-400">
              {flowType === "income" ? "CREDIT (+)" : "DEBIT (−)"}
            </span>
          </div>
          <select
            id="transactionType"
            name="transactionType"
            required
            value={flowType}
            onChange={(e) => handleTypeChange(e.target.value as "income" | "expense")}
            className="w-full bg-transparent text-sm sm:text-base font-bold text-white outline-none cursor-pointer"
          >
            <option value="expense" className="bg-slate-900 text-white">
              Expense (Debit −)
            </option>
            <option value="income" className="bg-slate-900 text-white">
              Income (Credit +)
            </option>
          </select>
        </div>
      </div>

      {/* Row 2: Category Dropdown & Description as 2 separate columns */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition-all focus-within:border-[#4edea3]/50">
          <div className="flex items-center justify-between mb-1.5">
            <label
              htmlFor="category"
              className="text-[10px] font-bold uppercase tracking-wider text-slate-400 cursor-pointer"
            >
              Category
            </label>
            <span className="text-[10px] font-mono text-[#4edea3]">DROPDOWN</span>
          </div>
          <select
            id="category"
            name="category"
            required
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="w-full bg-transparent text-sm sm:text-base font-bold text-white outline-none cursor-pointer"
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

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition-all focus-within:border-[#4edea3]/50">
          <div className="flex items-center justify-between mb-1.5">
            <label
              htmlFor="description"
              className="text-[10px] font-bold uppercase tracking-wider text-slate-400 cursor-pointer"
            >
              Description
            </label>
            <span className="text-[10px] font-mono text-slate-400">NOTE</span>
          </div>
          <input
            id="description"
            name="description"
            type="text"
            maxLength={160}
            required
            placeholder={
              flowType === "income"
                ? "e.g. October Salary, Freelance project, Consulting fee"
                : "e.g. Monthly groceries, Team lunch, Electricity bill"
            }
            className="w-full bg-transparent text-sm sm:text-base font-semibold text-white placeholder:text-slate-500 outline-none"
          />
        </div>
      </div>

      {/* Row 3: Amount and Value Date as 2 separate columns */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition-all focus-within:border-[#4edea3]/50">
          <div className="flex items-center justify-between mb-1.5">
            <label
              htmlFor="amount"
              className="text-[10px] font-bold uppercase tracking-wider text-slate-400 cursor-pointer"
            >
              Settlement Amount (₹)
            </label>
            <span className="text-[10px] font-mono text-[#4edea3]">INR TABULAR</span>
          </div>
          <input
            id="amount"
            name="amount"
            type="number"
            inputMode="decimal"
            min="0.01"
            step="0.01"
            required
            placeholder="0.00"
            className="w-full bg-transparent text-xl sm:text-2xl font-black text-white placeholder:text-slate-600 outline-none tabular-nums"
          />
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition-all focus-within:border-[#4edea3]/50">
          <div className="flex items-center justify-between mb-1.5">
            <label
              htmlFor="transactionDate"
              className="text-[10px] font-bold uppercase tracking-wider text-slate-400 cursor-pointer"
            >
              Value Date
            </label>
            <span className="text-[10px] font-mono text-slate-400">CALENDAR</span>
          </div>
          <input
            id="transactionDate"
            name="transactionDate"
            type="date"
            max={today}
            min={earliestDate}
            defaultValue={today}
            required
            className="w-full bg-transparent text-sm sm:text-base font-bold text-white outline-none cursor-pointer"
          />
        </div>
      </div>

      {/* 256-Bit Encrypted Instant Settlement Action Button */}
      <button
        type="submit"
        className={`w-full rounded-2xl py-4 text-sm font-bold shadow-xl transition-all hover:brightness-110 active:scale-[0.99] cursor-pointer flex items-center justify-center gap-2 mt-2 ${
          flowType === "income"
            ? "bg-gradient-to-r from-[#4edea3] via-[#10b981] to-[#003824] text-[#003824] shadow-emerald-500/25"
            : "bg-gradient-to-r from-rose-500 via-rose-600 to-amber-600 text-white shadow-rose-500/25"
        }`}
      >
        <ShieldCheck className="h-4 w-4" />
        <span>
          {flowType === "income"
            ? "Execute Verified Deposit Credit (+)"
            : "Execute Verified Send Debit (−)"}
        </span>
      </button>
    </form>
  );
}
