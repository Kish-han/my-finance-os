"use client";

import { useState, useTransition } from "react";
import { X, PieChart, Sparkles, AlertCircle } from "lucide-react";
import { type CategoryBudget } from "@/lib/finance/budget-engine";
import { saveCategoryBudget } from "./actions";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  availableCategories: string[];
  currentMonthKey: string;
  currentMonthLabel: string;
  budgetToEdit?: CategoryBudget | null;
  returnTo?: string;
}

export function CategoryBudgetModal({
  isOpen,
  onClose,
  availableCategories,
  currentMonthKey,
  currentMonthLabel,
  budgetToEdit,
  returnTo = "/budgets",
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isEditing = Boolean(budgetToEdit);

  // Form states
  const [categoryName, setCategoryName] = useState(budgetToEdit?.category_name || "");
  const [customCategory, setCustomCategory] = useState("");
  const [useCustomCategory, setUseCustomCategory] = useState(false);
  const [amountRupees, setAmountRupees] = useState(
    budgetToEdit ? String(budgetToEdit.amount_paise / 100) : ""
  );
  const [scope, setScope] = useState<"recurring" | "month_only">(
    budgetToEdit?.month_key ? "month_only" : "recurring"
  );
  const [alert50, setAlert50] = useState(budgetToEdit ? budgetToEdit.alert_50 : true);
  const [alert80, setAlert80] = useState(budgetToEdit ? budgetToEdit.alert_80 : true);
  const [alert100, setAlert100] = useState(budgetToEdit ? budgetToEdit.alert_100 : true);
  const [notes, setNotes] = useState(budgetToEdit?.notes || "");

  if (!isOpen) return null;

  const resolvedCategory = useCustomCategory ? customCategory.trim() : categoryName.trim();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!resolvedCategory) {
      setError("Please select or enter a spending category.");
      return;
    }

    const num = Number(amountRupees);
    if (isNaN(num) || num <= 0) {
      setError("Please enter a valid monthly budget amount in ₹ (must be greater than 0).");
      return;
    }

    const formData = new FormData();
    if (budgetToEdit) {
      formData.set("budgetId", budgetToEdit.id);
    }
    formData.set("categoryName", resolvedCategory);
    formData.set("amount", amountRupees);
    formData.set("monthKey", scope === "month_only" ? currentMonthKey : "");
    if (alert50) formData.set("alert50", "on");
    if (alert80) formData.set("alert80", "on");
    if (alert100) formData.set("alert100", "on");
    if (notes) formData.set("notes", notes);
    formData.set("returnTo", returnTo);

    startTransition(async () => {
      try {
        await saveCategoryBudget(formData);
        onClose();
      } catch (err: unknown) {
        if (
          err &&
          typeof err === "object" &&
          "digest" in err &&
          typeof (err as { digest?: unknown }).digest === "string" &&
          ((err as { digest: string }).digest.includes("NEXT_REDIRECT"))
        ) {
          return;
        }
        setError("Failed to save budget. Please check your inputs.");
      }
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div className="aura-card-obsidian w-full max-w-lg rounded-3xl p-5 sm:p-7 shadow-2xl relative border border-white/10 max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/30">
              <PieChart className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black tracking-tight text-white">
                {isEditing ? "Edit Category Budget" : "Create Category Budget"}
              </h2>
              <p className="text-xs text-slate-400">
                {isEditing
                  ? `Adjust limit or alerts for ${budgetToEdit?.category_name}`
                  : "Set a spending limit and receive progress alerts"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-all cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {error && (
          <div
            role="alert"
            className="mt-4 flex items-center gap-2.5 rounded-2xl border border-rose-500/30 bg-rose-950/40 p-3 text-xs text-rose-300 backdrop-blur-md"
          >
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {/* Category selection */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Spending Category <span className="text-emerald-400">*</span>
              </label>
              <button
                type="button"
                onClick={() => setUseCustomCategory(!useCustomCategory)}
                className="text-[11px] font-semibold text-emerald-400 hover:underline cursor-pointer"
              >
                {useCustomCategory ? "Select from list" : "+ Custom category"}
              </button>
            </div>

            {useCustomCategory ? (
              <input
                type="text"
                value={customCategory}
                onChange={(e) => setCustomCategory(e.target.value)}
                placeholder="e.g. Subscriptions, Gadgets, Pets"
                required
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
              />
            ) : (
              <select
                value={categoryName}
                onChange={(e) => setCategoryName(e.target.value)}
                required
                disabled={isEditing}
                className="w-full rounded-2xl border border-white/10 bg-[#171c24] px-4 py-2.5 text-sm text-white focus:border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 cursor-pointer disabled:opacity-75"
              >
                <option value="" disabled className="bg-[#171c24] text-slate-400">
                  Select a category...
                </option>
                {availableCategories.map((cat) => (
                  <option key={cat} value={cat} className="bg-[#171c24] text-white">
                    {cat}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Monthly Budget Amount (₹) */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Monthly Limit (₹) <span className="text-emerald-400">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">
                ₹
              </span>
              <input
                type="number"
                step="1"
                min="1"
                value={amountRupees}
                onChange={(e) => setAmountRupees(e.target.value)}
                placeholder="10000"
                required
                className="w-full rounded-2xl border border-white/10 bg-white/5 pl-9 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
              />
            </div>
            <p className="text-[11px] text-slate-400">
              Maximum planned spending for this category in a calendar month.
            </p>
          </div>

          {/* Budget Scope (Recurring vs Month Override) */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Budget Scope
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setScope("recurring")}
                className={`py-2 px-3 rounded-2xl border text-xs font-bold text-center transition-all cursor-pointer ${
                  scope === "recurring"
                    ? "bg-[#4edea3] text-slate-950 border-[#4edea3] shadow-md shadow-emerald-500/20"
                    : "bg-white/5 text-slate-300 border-white/10 hover:bg-white/10"
                }`}
              >
                Every Month (Default)
              </button>
              <button
                type="button"
                onClick={() => setScope("month_only")}
                className={`py-2 px-3 rounded-2xl border text-xs font-bold text-center transition-all cursor-pointer ${
                  scope === "month_only"
                    ? "bg-[#4edea3] text-slate-950 border-[#4edea3] shadow-md shadow-emerald-500/20"
                    : "bg-white/5 text-slate-300 border-white/10 hover:bg-white/10"
                }`}
              >
                Only {currentMonthLabel}
              </button>
            </div>
            <p className="text-[11px] text-slate-400">
              {scope === "recurring"
                ? "This monthly limit will apply automatically each month unless overridden."
                : `Special override limit strictly for ${currentMonthLabel}.`}
            </p>
          </div>

          {/* Optional Spending Alerts at 50%, 80%, 100% */}
          <div className="space-y-2 rounded-2xl border border-white/10 bg-white/[0.03] p-3.5">
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-200">
              <Sparkles className="h-3.5 w-3.5 text-purple-400" />
              <span>Spending Alerts</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Receive in-app alerts when eligible spending crosses selected milestones:
            </p>

            <div className="space-y-2 pt-1">
              <label className="flex items-center gap-2.5 text-xs font-medium text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={alert50}
                  onChange={(e) => setAlert50(e.target.checked)}
                  className="h-4 w-4 rounded border-white/20 bg-white/5 text-emerald-500 focus:ring-emerald-500/50 cursor-pointer"
                />
                <span>
                  <strong>50% Reached:</strong> Early reminder halfway through budget
                </span>
              </label>

              <label className="flex items-center gap-2.5 text-xs font-medium text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={alert80}
                  onChange={(e) => setAlert80(e.target.checked)}
                  className="h-4 w-4 rounded border-white/20 bg-white/5 text-amber-500 focus:ring-amber-500/50 cursor-pointer"
                />
                <span>
                  <strong>80% Reached:</strong> Approaching spending limit warning
                </span>
              </label>

              <label className="flex items-center gap-2.5 text-xs font-medium text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={alert100}
                  onChange={(e) => setAlert100(e.target.checked)}
                  className="h-4 w-4 rounded border-white/20 bg-white/5 text-rose-500 focus:ring-rose-500/50 cursor-pointer"
                />
                <span>
                  <strong>100% Reached:</strong> Budget reached or exceeded alert
                </span>
              </label>
            </div>
          </div>

          {/* Notes (Optional) */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Notes (Optional)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Includes groceries and takeout"
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
            />
          </div>

          {/* Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="px-4 py-2 rounded-2xl border border-white/10 bg-white/5 text-xs font-bold text-slate-300 hover:text-white hover:bg-white/10 transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 px-5 py-2 text-xs font-bold text-slate-950 shadow-md shadow-emerald-500/20 hover:brightness-110 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
            >
              {isPending ? "Saving..." : isEditing ? "Update Budget" : "Save Budget"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
