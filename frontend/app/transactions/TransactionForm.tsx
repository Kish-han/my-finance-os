"use client";

import { useState, useMemo, useTransition } from "react";
import { createTransaction } from "./actions";
import {
  toggleFavoriteTemplate,
  deleteTransactionTemplate,
  togglePinCategory,
} from "./templates/actions";
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
  AlertTriangle,
  Star,
  Pin,
  Sparkles,
  Repeat,
  Trash2,
  Bookmark,
  Check,
  ChevronDown,
  X,
} from "lucide-react";
import {
  formatRupees,
  buildLimitExceededMessage,
} from "@/lib/finance/card-limit-engine";
import {
  parseAmountToPaise,
  formatAmountInputFromPaise,
  applyTemplateToForm,
  type TransactionTemplate,
  type RankedCategoryItem,
} from "@/lib/finance/quick-entry-engine";

export type AccountRow = {
  id: string;
  name: string;
  account_type: "bank" | "cash";
  institution: string | null;
  opening_balance_date: string;
  is_archived?: boolean;
};

export type CreditCardRow = {
  id: string;
  name: string;
  bank_name: string;
  last_four_digits: string | null;
  opening_outstanding_date: string;
  credit_limit_paise?: number | string;
  opening_outstanding_paise?: number | string;
  current_utilized_paise?: number;
  current_available_paise?: number;
  is_archived?: boolean;
};

export type RepeatableTransactionItem = {
  id: string;
  name: string;
  transactionType: "income" | "expense";
  amountPaise: number;
  categoryName: string;
  sourceId: string;
  description: string;
  lastDate: string;
};

type TransactionFormProps = {
  accounts: AccountRow[];
  creditCards?: CreditCardRow[];
  availableCategories: string[];
  rankedExpenseCategories?: RankedCategoryItem[];
  rankedIncomeCategories?: RankedCategoryItem[];
  templates?: TransactionTemplate[];
  repeatableTransactions?: RepeatableTransactionItem[];
  rememberedExpenseSourceId?: string;
  rememberedIncomeSourceId?: string;
  pinnedCategories?: string[];
  earliestDate?: string;
  initialType?: "income" | "expense";
  initialSourceId?: string;
  today: string;
  returnTo?: string;
};

const QUICK_INCREMENTS = [
  { label: "+100", paise: 10000 },
  { label: "+500", paise: 50000 },
  { label: "+1,000", paise: 100000 },
  { label: "+2,000", paise: 200000 },
  { label: "+5,000", paise: 500000 },
];

export default function TransactionForm({
  accounts,
  creditCards = [],
  availableCategories,
  rankedExpenseCategories = [],
  rankedIncomeCategories = [],
  templates = [],
  repeatableTransactions = [],
  rememberedExpenseSourceId,
  rememberedIncomeSourceId,
  pinnedCategories = [],
  initialType = "expense",
  initialSourceId,
  today,
  returnTo = "/transactions/new",
}: TransactionFormProps) {
  const [, startTransition] = useTransition();
  const [flowType, setFlowType] = useState<"income" | "expense">(initialType);

  // Group accounts by bank vs cash
  const bankAccounts = useMemo(
    () => accounts.filter((a) => a.account_type === "bank" && !a.is_archived),
    [accounts]
  );
  const cashAccounts = useMemo(
    () => accounts.filter((a) => a.account_type === "cash" && !a.is_archived),
    [accounts]
  );
  const activeCards = useMemo(
    () => creditCards.filter((c) => !c.is_archived),
    [creditCards]
  );

  // Determine initial source ID
  const defaultSourceId = useMemo(() => {
    if (initialSourceId) return initialSourceId;
    if (initialType === "income") {
      if (rememberedIncomeSourceId) return rememberedIncomeSourceId;
      return bankAccounts[0]
        ? `account:${bankAccounts[0].id}`
        : accounts[0]
        ? `account:${accounts[0].id}`
        : "";
    }
    if (rememberedExpenseSourceId) return rememberedExpenseSourceId;
    if (activeCards.length > 0) return `card:${activeCards[0].id}`;
    if (accounts.length > 0) return `account:${accounts[0].id}`;
    return "";
  }, [
    initialSourceId,
    initialType,
    rememberedIncomeSourceId,
    rememberedExpenseSourceId,
    bankAccounts,
    accounts,
    activeCards,
  ]);

  const [selectedSourceId, setSelectedSourceId] = useState<string>(defaultSourceId);
  const [amountInput, setAmountInput] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [transactionDate, setTransactionDate] = useState<string>(today);
  const [notes, setNotes] = useState<string>("");
  const [showNotes, setShowNotes] = useState<boolean>(false);

  // Initial category based on flow type and ranking
  const initialCategory = useMemo(() => {
    if (initialType === "income") {
      return rankedIncomeCategories[0]?.name || "Salary";
    }
    return rankedExpenseCategories[0]?.name || "Food & Dining";
  }, [initialType, rankedIncomeCategories, rankedExpenseCategories]);

  const [selectedCategory, setSelectedCategory] = useState<string>(initialCategory);
  const [showAllCategories, setShowAllCategories] = useState<boolean>(false);

  // Template creation states
  const [saveAsTemplate, setSaveAsTemplate] = useState<boolean>(false);
  const [customTemplateName, setCustomTemplateName] = useState<string>("");
  const [makeFavorite, setMakeFavorite] = useState<boolean>(false);
  const [usedTemplateId, setUsedTemplateId] = useState<string>("");

  // Submission protection state
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [templateActionMessage, setTemplateActionMessage] = useState<string | null>(null);

  // Pinned categories set for quick lookup
  const pinnedSet = useMemo(
    () => new Set(pinnedCategories.map((c) => c.trim().toLowerCase())),
    [pinnedCategories]
  );

  // Active ranked categories for current flow type
  const currentRankedCategories = useMemo(() => {
    const list = flowType === "income" ? rankedIncomeCategories : rankedExpenseCategories;
    if (list.length > 0) return list;
    // Fallback defaults if no history yet
    if (flowType === "income") {
      return [
        { name: "Salary", isPinned: false },
        { name: "Freelance & Consulting", isPinned: false },
        { name: "Investments & Savings", isPinned: false },
        { name: "Gifts & Donations", isPinned: false },
      ];
    }
    return [
      { name: "Food & Dining", isPinned: false },
      { name: "Groceries", isPinned: false },
      { name: "Shopping & Lifestyle", isPinned: false },
      { name: "Utilities & Bills", isPinned: false },
      { name: "Housing & Rent", isPinned: false },
      { name: "Transportation & Fuel", isPinned: false },
    ];
  }, [flowType, rankedIncomeCategories, rankedExpenseCategories]);

  // Filter templates & repeatables matching current flow type
  const currentTemplates = useMemo(
    () => templates.filter((t) => t.transactionType === flowType),
    [templates, flowType]
  );

  const currentRepeatables = useMemo(
    () => repeatableTransactions.filter((r) => r.transactionType === flowType),
    [repeatableTransactions, flowType]
  );

  // Handle flow type switch (Income <-> Expense)
  const handleTypeChange = (newType: "income" | "expense") => {
    if (newType === flowType) return;
    setFlowType(newType);

    // If switching to income and current source is a credit card, automatically fallback
    if (newType === "income" && selectedSourceId.startsWith("card:")) {
      const fallbackSource =
        rememberedIncomeSourceId ||
        (bankAccounts[0]
          ? `account:${bankAccounts[0].id}`
          : accounts[0]
          ? `account:${accounts[0].id}`
          : "");
      setSelectedSourceId(fallbackSource);
    } else if (newType === "expense" && rememberedExpenseSourceId) {
      // Restore remembered expense source if available
      setSelectedSourceId(rememberedExpenseSourceId);
    }

    // Adjust category to top ranked category of new type
    if (newType === "income") {
      const topIncome = rankedIncomeCategories[0]?.name || "Salary";
      setSelectedCategory(topIncome);
    } else {
      const topExpense = rankedExpenseCategories[0]?.name || "Food & Dining";
      setSelectedCategory(topExpense);
    }
  };

  // Inspect currently selected source details
  const selectedSourceDetails = useMemo(() => {
    if (selectedSourceId.startsWith("card:")) {
      const cardId = selectedSourceId.replace("card:", "");
      const card = creditCards.find((c) => c.id === cardId);
      return {
        type: "card" as const,
        label: card
          ? `${card.bank_name} ${card.name} (••${card.last_four_digits || "Card"})`
          : "Credit Card",
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

  // Credit Card Limit Telemetry and Invariant check
  const selectedCardInfo = useMemo(() => {
    if (flowType !== "expense" || !selectedSourceId.startsWith("card:")) {
      return null;
    }
    const cardId = selectedSourceId.replace("card:", "");
    const card = creditCards.find((c) => c.id === cardId);
    if (!card) return null;

    const limitPaise = Number(card.credit_limit_paise || 0);
    const utilizedPaise = Number(card.current_utilized_paise || 0);
    const availablePaise =
      card.current_available_paise !== undefined
        ? Number(card.current_available_paise)
        : limitPaise - utilizedPaise;

    const parsed = parseAmountToPaise(amountInput);
    const chargePaise = parsed.valid ? parsed.paise : 0;
    const projectedUtilizedPaise = utilizedPaise + chargePaise;
    const projectedAvailablePaise = availablePaise - chargePaise;
    const isExceeded = chargePaise > 0 && projectedAvailablePaise < 0;
    const exceededByPaise = isExceeded ? Math.abs(projectedAvailablePaise) : 0;

    return {
      card,
      limitPaise,
      utilizedPaise,
      availablePaise,
      chargePaise,
      projectedUtilizedPaise,
      projectedAvailablePaise,
      isExceeded,
      exceededByPaise,
      errorMessage: isExceeded
        ? buildLimitExceededMessage(exceededByPaise, availablePaise, chargePaise)
        : undefined,
    };
  }, [flowType, selectedSourceId, creditCards, amountInput]);

  // Quick Amount Increment Handler
  const handleIncrementAmount = (additionPaise: number) => {
    const parsed = parseAmountToPaise(amountInput);
    const currentPaise = parsed.valid ? parsed.paise : 0;
    const nextPaise = currentPaise + additionPaise;
    setAmountInput(formatAmountInputFromPaise(nextPaise));
  };

  // Quick Amount Clear Handler
  const handleClearAmount = () => {
    setAmountInput("");
  };

  // 1-Tap Template / Routine Replay Pre-fill Handler
  const handleApplyTemplate = (item: TransactionTemplate | RepeatableTransactionItem) => {
    const prefill = applyTemplateToForm({
      template: item,
      accounts,
      creditCards,
      today,
    });

    setFlowType(prefill.transactionType);
    setAmountInput(prefill.amountInput);
    setDescription(prefill.description);
    setSelectedCategory(prefill.category);
    setSelectedSourceId(prefill.sourceId);
    setTransactionDate(today); // Always ensure date is TODAY

    if (prefill.notes) {
      setNotes(prefill.notes);
      setShowNotes(true);
    }

    if ("id" in item && item.id) {
      setUsedTemplateId(item.id);
    }

    setTemplateActionMessage(`Prefilled from "${item.name}". Review & tap Save.`);
    setTimeout(() => setTemplateActionMessage(null), 3500);
  };

  // Template Favorite Toggle Handler
  const handleToggleFavorite = async (templateId: string, currentStatus: boolean, e: React.MouseEvent) => {
    e.stopPropagation();
    startTransition(async () => {
      await toggleFavoriteTemplate(templateId, !currentStatus);
    });
  };

  // Template Delete Handler
  const handleDeleteTemplate = async (templateId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this template?")) return;
    startTransition(async () => {
      await deleteTransactionTemplate(templateId);
    });
  };

  // Category Pin Toggle Handler
  const handleTogglePinCategory = async (catName: string, isPinned: boolean, e: React.MouseEvent) => {
    e.stopPropagation();
    startTransition(async () => {
      await togglePinCategory(catName, !isPinned);
    });
  };

  // Contextual helper labels
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

  // Form submit handler with double-submission protection
  const handleFormSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    if (isSubmitting) {
      e.preventDefault();
      return;
    }
    if (selectedCardInfo?.isExceeded) {
      e.preventDefault();
      return;
    }
    setIsSubmitting(true);
  };

  return (
    <form action={createTransaction} onSubmit={handleFormSubmit} className="space-y-6">
      <input type="hidden" name="returnTo" value={returnTo} />
      <input type="hidden" name="transactionType" value={flowType} />
      <input type="hidden" name="usedTemplateId" value={usedTemplateId} />

      {/* ========================================================================= */}
      {/* 1. INCOME / EXPENSE DUAL SWITCH (Tier 1)                                   */}
      {/* ========================================================================= */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-1.5 grid grid-cols-2 gap-2 shadow-inner">
        <button
          type="button"
          onClick={() => handleTypeChange("expense")}
          className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
            flowType === "expense"
              ? "bg-rose-500 text-white shadow-lg shadow-rose-500/30 font-black scale-[1.01]"
              : "text-slate-400 hover:text-white hover:bg-white/5"
          }`}
        >
          <div
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${
              flowType === "expense" ? "bg-white/20 text-white" : "bg-rose-500/15 text-rose-400"
            }`}
          >
            <ArrowUpRight className="h-4 w-4" />
          </div>
          <span>Send (Expense −)</span>
        </button>

        <button
          type="button"
          onClick={() => handleTypeChange("income")}
          className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
            flowType === "income"
              ? "bg-[#4edea3] text-slate-950 shadow-lg shadow-emerald-500/30 font-black scale-[1.01]"
              : "text-slate-400 hover:text-white hover:bg-white/5"
          }`}
        >
          <div
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${
              flowType === "income" ? "bg-slate-950/20 text-slate-950" : "bg-emerald-500/15 text-emerald-400"
            }`}
          >
            <ArrowDownLeft className="h-4 w-4" />
          </div>
          <span>Deposit (Income +)</span>
        </button>
      </div>

      {/* Notification Toast for Template Prefills */}
      {templateActionMessage && (
        <div className="flex items-center justify-between rounded-xl bg-cyan-950/60 border border-cyan-500/30 p-3 text-xs text-cyan-300 animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-cyan-400 shrink-0" />
            <span>{templateActionMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setTemplateActionMessage(null)}
            className="text-cyan-400 hover:text-white"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. RECENT & PINNED CATEGORIES QUICK SELECT (Tier 2)                       */}
      {/* ========================================================================= */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <Tag className="h-3 w-3 text-[#4edea3]" />
            <span>Quick Categories</span>
          </label>
          <button
            type="button"
            onClick={() => setShowAllCategories(!showAllCategories)}
            className="text-[11px] font-semibold text-[#4edea3] hover:underline flex items-center gap-1 cursor-pointer"
          >
            <span>{showAllCategories ? "Hide Full List" : "+ More Categories"}</span>
            <ChevronDown
              className={`h-3 w-3 transition-transform ${showAllCategories ? "rotate-180" : ""}`}
            />
          </button>
        </div>

        {/* Quick Ranked & Pinned Chips */}
        <div className="flex flex-wrap gap-2">
          {currentRankedCategories.map((cat) => {
            const isSelected = selectedCategory.toLowerCase() === cat.name.toLowerCase();
            const isPinned = Boolean(cat.isPinned) || pinnedSet.has(cat.name.toLowerCase());

            return (
              <button
                key={cat.name}
                type="button"
                onClick={() => setSelectedCategory(cat.name)}
                className={`group relative flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  isSelected
                    ? flowType === "income"
                      ? "bg-[#4edea3] text-slate-950 shadow-md shadow-emerald-500/20 font-bold scale-[1.02]"
                      : "bg-rose-500 text-white shadow-md shadow-rose-500/20 font-bold scale-[1.02]"
                    : "bg-white/[0.04] text-slate-300 border border-white/10 hover:border-white/20 hover:bg-white/[0.08]"
                }`}
              >
                {isPinned && (
                  <Pin
                    className={`h-3 w-3 ${
                      isSelected
                        ? flowType === "income"
                          ? "text-slate-950 fill-current"
                          : "text-white fill-current"
                        : "text-amber-400 fill-current"
                    }`}
                  />
                )}
                <span>{cat.name}</span>
                {isSelected && <Check className="h-3.5 w-3.5 stroke-[2.5]" />}
              </button>
            );
          })}
        </div>

        {/* Expandable All Categories Dropdown */}
        {showAllCategories && (
          <div className="mt-2 rounded-2xl border border-white/10 bg-slate-900/90 p-3 space-y-2 animate-in fade-in duration-200">
            <div className="flex items-center justify-between pb-1 border-b border-white/10">
              <span className="text-[10px] font-mono uppercase text-slate-400">
                Complete Category Registry
              </span>
              <span className="text-[10px] text-slate-500">Tap pin to favorite</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-48 overflow-y-auto pr-1">
              {availableCategories.map((catName) => {
                const isSelected = selectedCategory.toLowerCase() === catName.toLowerCase();
                const isPinned = pinnedSet.has(catName.toLowerCase());

                return (
                  <div
                    key={catName}
                    className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                      isSelected
                        ? "bg-white/15 text-white font-bold border border-white/20"
                        : "text-slate-300 hover:bg-white/5"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCategory(catName);
                        setShowAllCategories(false);
                      }}
                      className="text-left truncate flex-1 cursor-pointer"
                    >
                      {catName}
                    </button>
                    <button
                      type="button"
                      title={isPinned ? "Unpin category" : "Pin category"}
                      onClick={(e) => handleTogglePinCategory(catName, isPinned, e)}
                      className="p-1 text-slate-500 hover:text-amber-400 cursor-pointer ml-1"
                    >
                      <Pin
                        className={`h-3 w-3 ${
                          isPinned ? "text-amber-400 fill-amber-400" : "opacity-40"
                        }`}
                      />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Hidden input to pass selectedCategory to server action */}
      <input type="hidden" name="category" value={selectedCategory} />

      {/* ========================================================================= */}
      {/* 3. FAVORITE TEMPLATES & ROUTINE TRANSACTION REPLAY (Tier 3)               */}
      {/* ========================================================================= */}
      {(currentTemplates.length > 0 || currentRepeatables.length > 0) && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Bookmark className="h-3 w-3 text-cyan-400" />
              <span>1-Tap Templates & Routine Subscriptions</span>
            </label>
            <span className="text-[10px] font-mono text-slate-500">TODAY AUTO-DEFAULT</span>
          </div>

          <div className="flex gap-2.5 overflow-x-auto pb-2 scrollbar-none snap-x">
            {/* User Custom Saved Templates */}
            {currentTemplates.map((template) => (
              <div
                key={template.id}
                onClick={() => handleApplyTemplate(template)}
                className="snap-start shrink-0 min-w-[170px] max-w-[210px] rounded-2xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.07] hover:border-white/20 p-3 space-y-2 transition-all cursor-pointer group shadow-sm"
              >
                <div className="flex items-start justify-between gap-1">
                  <span className="text-xs font-bold text-white truncate max-w-[130px]">
                    {template.name}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      title={template.isFavorite ? "Unfavorite" : "Favorite"}
                      onClick={(e) => handleToggleFavorite(template.id, template.isFavorite, e)}
                      className="text-slate-500 hover:text-amber-400 cursor-pointer"
                    >
                      <Star
                        className={`h-3.5 w-3.5 ${
                          template.isFavorite ? "text-amber-400 fill-amber-400" : ""
                        }`}
                      />
                    </button>
                    <button
                      type="button"
                      title="Delete template"
                      onClick={(e) => handleDeleteTemplate(template.id, e)}
                      className="text-slate-600 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>

                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-black font-mono text-emerald-400">
                    {formatRupees(template.amountPaise ?? 0)}
                  </span>
                  <span className="text-[9px] font-mono uppercase text-slate-400 truncate max-w-[80px]">
                    {template.categoryName}
                  </span>
                </div>

                <div className="text-[10px] text-slate-400 truncate border-t border-white/5 pt-1.5 flex items-center gap-1">
                  {template.sourceId?.startsWith("card:") ? (
                    <CreditCardIcon className="h-2.5 w-2.5 text-amber-400 shrink-0" />
                  ) : (
                    <Landmark className="h-2.5 w-2.5 text-cyan-400 shrink-0" />
                  )}
                  <span className="truncate">{template.description}</span>
                </div>
              </div>
            ))}

            {/* Recent Routine Repeatables */}
            {currentRepeatables.map((routine) => (
              <div
                key={routine.id}
                onClick={() => handleApplyTemplate(routine)}
                className="snap-start shrink-0 min-w-[170px] max-w-[210px] rounded-2xl border border-dashed border-white/15 bg-white/[0.02] hover:bg-white/[0.06] hover:border-white/25 p-3 space-y-2 transition-all cursor-pointer group shadow-sm"
              >
                <div className="flex items-start justify-between gap-1">
                  <span className="text-xs font-bold text-slate-200 truncate max-w-[130px]">
                    {routine.name}
                  </span>
                  <span className="text-[9px] font-mono text-cyan-400 bg-cyan-500/10 px-1.5 py-0.5 rounded border border-cyan-500/20">
                    <Repeat className="h-2.5 w-2.5 inline mr-0.5" /> RECENT
                  </span>
                </div>

                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-black font-mono text-white">
                    {formatRupees(routine.amountPaise)}
                  </span>
                  <span className="text-[9px] font-mono uppercase text-slate-400 truncate max-w-[80px]">
                    {routine.categoryName}
                  </span>
                </div>

                <div className="text-[10px] text-slate-400 truncate border-t border-white/5 pt-1.5 flex items-center gap-1">
                  {routine.sourceId?.startsWith("card:") ? (
                    <CreditCardIcon className="h-2.5 w-2.5 text-amber-400 shrink-0" />
                  ) : (
                    <Landmark className="h-2.5 w-2.5 text-cyan-400 shrink-0" />
                  )}
                  <span className="truncate">{routine.description}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. FAST SETTLEMENT AMOUNT ENTRY (Tier 4)                                  */}
      {/* ========================================================================= */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5 transition-all focus-within:border-[#4edea3]/50 focus-within:bg-white/[0.05] shadow-lg">
        <div className="flex items-center justify-between mb-2">
          <label
            htmlFor="amount"
            className="text-[10px] font-bold uppercase tracking-wider text-slate-400 cursor-pointer"
          >
            Settlement Amount
          </label>
          <div className="flex items-center gap-2">
            {amountInput && (
              <button
                type="button"
                onClick={handleClearAmount}
                className="text-[10px] font-mono font-bold text-slate-400 hover:text-rose-400 bg-white/5 px-2 py-0.5 rounded cursor-pointer transition-colors"
              >
                CLEAR
              </button>
            )}
            <span className="text-[10px] font-mono text-[#4edea3] font-semibold">INR TABULAR</span>
          </div>
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
            value={amountInput}
            onChange={(e) => setAmountInput(e.target.value)}
            placeholder="0.00"
            className="w-full bg-transparent text-2xl sm:text-4xl font-black text-white placeholder:text-slate-600 outline-none tabular-nums tracking-tight"
          />
        </div>

        {/* Quick Increment Numeric Chips */}
        <div className="mt-3 pt-3 border-t border-white/10 flex flex-wrap items-center gap-1.5 sm:gap-2">
          <span className="text-[10px] font-mono uppercase text-slate-500 mr-1 hidden sm:inline">
            Quick Add:
          </span>
          {QUICK_INCREMENTS.map((inc) => (
            <button
              key={inc.label}
              type="button"
              onClick={() => handleIncrementAmount(inc.paise)}
              className="px-2.5 py-1 rounded-lg text-xs font-mono font-bold bg-white/[0.04] hover:bg-white/[0.1] text-slate-300 hover:text-white border border-white/10 active:scale-95 transition-all cursor-pointer"
            >
              {inc.label}
            </button>
          ))}
        </div>

        {/* Live Credit Card Limit Dynamics Preview */}
        {selectedCardInfo && (
          <div className="mt-3.5 pt-3 border-t border-white/10 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-slate-400 font-medium">Card Limit Status</span>
              <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
                <span className="text-slate-400">
                  Limit: <strong className="text-white">{formatRupees(selectedCardInfo.limitPaise)}</strong>
                </span>
                <span className="text-slate-600">·</span>
                <span
                  className={
                    selectedCardInfo.availablePaise < 0
                      ? "text-rose-400 font-bold"
                      : "text-emerald-400"
                  }
                >
                  Available: <strong>{formatRupees(selectedCardInfo.availablePaise)}</strong>
                </span>
                <span className="text-slate-600">·</span>
                <span
                  className={
                    selectedCardInfo.isExceeded
                      ? "text-rose-400 font-black animate-pulse"
                      : "text-cyan-300 font-semibold"
                  }
                >
                  Projected: <strong>{formatRupees(selectedCardInfo.projectedAvailablePaise)}</strong>
                </span>
              </div>
            </div>

            {selectedCardInfo.isExceeded && (
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300 flex items-start gap-2.5 shadow-inner">
                <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold text-rose-200">
                    {selectedCardInfo.errorMessage}
                  </p>
                  <p className="text-[11px] text-rose-300/80">
                    This transaction exceeds the configured credit limit on this card. Lower the amount or record a card repayment first.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 5. DESCRIPTION / MERCHANT FIELD (Tier 5)                                  */}
      {/* ========================================================================= */}
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
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={descriptionPlaceholder}
          className="w-full bg-transparent text-sm sm:text-base font-semibold text-white placeholder:text-slate-500 outline-none"
        />
      </div>

      {/* ========================================================================= */}
      {/* 6. REMEMBERED PAYMENT SOURCE (Tier 6)                                     */}
      {/* ========================================================================= */}
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

          {/* Group: Credit Cards (Strictly available for Expenses only) */}
          {flowType === "expense" && activeCards.length > 0 && (
            <optgroup label="── Credit Cards ──" className="bg-slate-900 text-amber-300 font-bold">
              {activeCards.map((card) => (
                <option
                  key={card.id}
                  value={`card:${card.id}`}
                  className="bg-slate-900 text-amber-200 font-normal"
                >
                  💳 {card.bank_name} {card.name}{" "}
                  {card.last_four_digits ? `(••${card.last_four_digits})` : ""}
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

      {/* ========================================================================= */}
      {/* 7. DATE & OPTIONAL MEMO (Tier 7)                                          */}
      {/* ========================================================================= */}
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
            value={transactionDate}
            onChange={(e) => setTransactionDate(e.target.value)}
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
              ? "Optional context appended to ledger record."
              : "Add invoice number, receipt tag, or reimbursement note."}
          </p>
        </div>
      </div>

      {/* Optional Memo Input */}
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
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Receipt #1042, reimbursed by client, work travel"
            className="w-full bg-transparent text-sm font-medium text-white placeholder:text-slate-500 outline-none"
          />
        </div>
      )}

      {/* Save as Template Toggle */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
        <label className="flex items-center justify-between cursor-pointer">
          <div className="flex items-center gap-2">
            <Bookmark className="h-4 w-4 text-cyan-400" />
            <div>
              <p className="text-xs font-bold text-white">Save as 1-Tap Template</p>
              <p className="text-[11px] text-slate-400">
                Add to your quick favorites to pre-fill future entries in 1 tap
              </p>
            </div>
          </div>
          <input
            type="checkbox"
            name="saveAsTemplate"
            value="true"
            checked={saveAsTemplate}
            onChange={(e) => setSaveAsTemplate(e.target.checked)}
            className="h-4 w-4 rounded accent-[#4edea3] cursor-pointer"
          />
        </label>

        {saveAsTemplate && (
          <div className="pt-2 border-t border-white/10 grid grid-cols-1 sm:grid-cols-2 gap-3 animate-in fade-in duration-150">
            <div>
              <label
                htmlFor="templateName"
                className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1"
              >
                Template Name
              </label>
              <input
                id="templateName"
                name="templateName"
                type="text"
                maxLength={80}
                value={customTemplateName}
                onChange={(e) => setCustomTemplateName(e.target.value)}
                placeholder={description || "e.g. Swiggy Weekly, Rent Payment"}
                className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-1.5 text-xs text-white placeholder:text-slate-500 outline-none focus:border-cyan-400"
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer pb-1.5">
                <input
                  type="checkbox"
                  name="templateFavorite"
                  value="true"
                  checked={makeFavorite}
                  onChange={(e) => setMakeFavorite(e.target.checked)}
                  className="h-3.5 w-3.5 rounded accent-amber-400 cursor-pointer"
                />
                <span className="flex items-center gap-1">
                  <Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400" />
                  Mark as Favorite Template
                </span>
              </label>
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 8. VERIFIED SETTLEMENT ACTION BUTTON (Tier 8)                             */}
      {/* ========================================================================= */}
      <button
        type="submit"
        disabled={selectedCardInfo?.isExceeded || isSubmitting}
        className={`w-full rounded-2xl py-4 text-sm sm:text-base font-bold shadow-xl transition-all flex items-center justify-center gap-2.5 mt-3 ${
          selectedCardInfo?.isExceeded
            ? "bg-slate-800 text-slate-500 border border-white/10 opacity-70 cursor-not-allowed shadow-none"
            : isSubmitting
            ? "bg-slate-700 text-slate-300 border border-white/10 cursor-wait opacity-80"
            : flowType === "income"
            ? "bg-gradient-to-r from-[#4edea3] via-[#10b981] to-[#003824] text-[#003824] shadow-emerald-500/25 hover:brightness-110 active:scale-[0.99] cursor-pointer"
            : selectedSourceDetails.type === "card"
            ? "bg-gradient-to-r from-amber-500 via-amber-600 to-amber-700 text-slate-950 shadow-amber-500/25 hover:brightness-110 active:scale-[0.99] cursor-pointer"
            : "bg-gradient-to-r from-rose-500 via-rose-600 to-amber-600 text-white shadow-rose-500/25 hover:brightness-110 active:scale-[0.99] cursor-pointer"
        }`}
      >
        {isSubmitting ? (
          <>
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            <span>Posting to Audited Ledger...</span>
          </>
        ) : (
          <>
            <ShieldCheck className="h-5 w-5" />
            <span>
              {selectedCardInfo?.isExceeded
                ? `Limit Exceeded (by ${formatRupees(selectedCardInfo.exceededByPaise)})`
                : flowType === "income"
                ? "Record Verified Deposit (+)"
                : selectedSourceDetails.type === "card"
                ? "Record Verified Card Purchase (−)"
                : "Record Verified Debit Expense (−)"}
            </span>
          </>
        )}
      </button>
    </form>
  );
}
