"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  X,
  CreditCard,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  ShieldAlert,
  Loader2,
} from "lucide-react";
import { updateTransaction } from "./actions";
import {
  detectSignificantTransactionChange,
  type SignificantChangeItem,
} from "@/lib/finance/transaction-edits";
import type { AccountOption, CreditCardOption, CategoryOption } from "./TransactionAnalysisView";
import type { TransactionRecord } from "@/lib/finance/date-ranges";

interface EditTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: TransactionRecord | null;
  accounts: AccountOption[];
  creditCards: CreditCardOption[];
  categories: CategoryOption[];
  availableCategories: string[];
  today: string;
  onSuccess?: () => void;
}

interface FormContentProps {
  transaction: TransactionRecord;
  accounts: AccountOption[];
  creditCards: CreditCardOption[];
  categories: CategoryOption[];
  availableCategories: string[];
  today: string;
  onClose: () => void;
  onSuccess?: () => void;
}

function EditTransactionFormContent({
  transaction,
  accounts,
  creditCards,
  categories,
  availableCategories,
  today,
  onClose,
  onSuccess,
}: FormContentProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Maps for lookups
  const cardNames = useMemo(
    () =>
      new Map(
        creditCards.map((c) => [
          c.id,
          `${c.name}${c.last_four_digits ? ` (••${c.last_four_digits})` : ""}`,
        ])
      ),
    [creditCards]
  );

  const accountNames = useMemo(
    () =>
      new Map(
        accounts.map((a) => [
          a.id,
          `${a.name} (${a.account_type === "cash" ? "Cash" : a.institution || "Bank"})`,
        ])
      ),
    [accounts]
  );

  const categoryMap = useMemo(
    () => new Map(categories.map((c) => [c.id, c.name])),
    [categories]
  );

  // Compute initial values directly from props
  const initialCategory = useMemo(() => {
    if (transaction.category_id && categoryMap.has(transaction.category_id)) {
      return categoryMap.get(transaction.category_id) || "";
    }
    return availableCategories[0] || "Other";
  }, [transaction.category_id, categoryMap, availableCategories]);

  const initialAmountFormatted = useMemo(() => {
    const raw = (Number(transaction.amount_paise) / 100).toFixed(2);
    return raw.endsWith(".00") ? raw.slice(0, -3) : raw;
  }, [transaction.amount_paise]);

  // Form Fields State initialized cleanly without useEffect
  const [description, setDescription] = useState(transaction.description || "");
  const [amountInput, setAmountInput] = useState(initialAmountFormatted);
  const [transactionDate, setTransactionDate] = useState(transaction.transaction_date || "");
  const [transactionType, setTransactionType] = useState<
    "income" | "expense" | "transfer" | "card_purchase" | "card_payment"
  >(transaction.transaction_type);
  const [accountId, setAccountId] = useState(
    transaction.account_id || accounts[0]?.id || ""
  );
  const [fromAccountId, setFromAccountId] = useState(
    transaction.from_account_id || accounts[0]?.id || ""
  );
  const [toAccountId, setToAccountId] = useState(
    transaction.to_account_id ||
      accounts.find((a) => a.id !== transaction.from_account_id)?.id ||
      ""
  );
  const [creditCardId, setCreditCardId] = useState(
    transaction.credit_card_id || creditCards[0]?.id || ""
  );
  const [categoryName, setCategoryName] = useState(initialCategory);

  // Confirmation & Error State
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [stagedChanges, setStagedChanges] = useState<SignificantChangeItem[]>([]);
  const [confirmationExplanation, setConfirmationExplanation] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  // Validate form client-side before attempting save or confirmation
  function validateCurrentForm(): boolean {
    setFormError(null);

    const desc = description.trim();
    if (!desc) {
      setFormError("Description cannot be empty.");
      return false;
    }
    if (desc.length > 160) {
      setFormError("Description must be 160 characters or fewer.");
      return false;
    }

    const num = Number(amountInput.trim());
    if (isNaN(num) || num <= 0) {
      setFormError("Enter a valid positive transaction amount.");
      return false;
    }

    if (!transactionDate) {
      setFormError("Transaction date is required.");
      return false;
    }

    if (transactionDate > today) {
      setFormError("Transaction date cannot be in the future.");
      return false;
    }

    if ((transactionType === "income" || transactionType === "expense") && !accountId) {
      setFormError("Please select an account for this transaction.");
      return false;
    }

    if (transactionType === "card_purchase" && !creditCardId) {
      setFormError("Please select a credit card for this purchase.");
      return false;
    }

    if (transactionType === "card_payment") {
      if (!fromAccountId) {
        setFormError("Please select the paying bank or cash account.");
        return false;
      }
      if (!creditCardId) {
        setFormError("Please select the credit card being repaid.");
        return false;
      }
    }

    if (transactionType === "transfer") {
      if (!fromAccountId || !toAccountId) {
        setFormError("Both source and destination accounts are required.");
        return false;
      }
      if (fromAccountId === toAccountId) {
        setFormError("Source and destination accounts must be different.");
        return false;
      }
    }

    return true;
  }

  // Handle clicking "Save Changes"
  function handleSaveClick(e: React.FormEvent) {
    e.preventDefault();
    if (!validateCurrentForm()) return;

    const parsedPaise = Math.round(Number(amountInput.trim()) * 100);

    const editedSummary = {
      amountPaise: parsedPaise,
      transactionType,
      accountId: transactionType === "income" || transactionType === "expense" ? accountId : null,
      fromAccountId:
        transactionType === "transfer" || transactionType === "card_payment" ? fromAccountId : null,
      toAccountId: transactionType === "transfer" ? toAccountId : null,
      creditCardId:
        transactionType === "card_purchase" || transactionType === "card_payment"
          ? creditCardId
          : null,
      transactionDate,
    };

    const originalSummary = {
      amountPaise: transaction.amount_paise,
      transactionType: transaction.transaction_type,
      accountId: transaction.account_id,
      fromAccountId: transaction.from_account_id,
      toAccountId: transaction.to_account_id,
      creditCardId: transaction.credit_card_id,
      transactionDate: transaction.transaction_date,
    };

    const detection = detectSignificantTransactionChange(
      originalSummary,
      editedSummary,
      cardNames,
      accountNames
    );

    if (detection.isSignificant) {
      setStagedChanges(detection.changes);
      setConfirmationExplanation(detection.explanation);
      setShowConfirmation(true);
    } else {
      // Harmless text edit (description, category) -> execute save immediately
      executeSave();
    }
  }

  // Perform the actual database update via Server Action
  function executeSave() {
    startTransition(async () => {
      setFormError(null);
      const fd = new FormData();
      fd.append("transactionId", transaction.id);
      fd.append("description", description.trim());
      fd.append("amount", amountInput.trim());
      fd.append("transactionDate", transactionDate);
      fd.append("transactionType", transactionType);

      if (transactionType === "income" || transactionType === "expense") {
        fd.append("accountId", accountId);
      } else if (transactionType === "card_purchase") {
        fd.append("creditCardId", creditCardId);
      } else if (transactionType === "card_payment") {
        fd.append("fromAccountId", fromAccountId);
        fd.append("creditCardId", creditCardId);
      } else if (transactionType === "transfer") {
        fd.append("fromAccountId", fromAccountId);
        fd.append("toAccountId", toAccountId);
      }

      if (categoryName.trim()) {
        fd.append("category", categoryName.trim());
      }

      const result = await updateTransaction(fd);

      if (!result.success) {
        setFormError(result.error);
        setShowConfirmation(false);
      } else {
        router.refresh();
        if (onSuccess) onSuccess();
        onClose();
      }
    });
  }

  const isCardPurchase = transactionType === "card_purchase";

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15 text-[#4edea3] border border-emerald-500/30">
            <CreditCard className="h-5 w-5" />
          </div>
          <div>
            <h2 id="edit-tx-heading" className="text-base sm:text-lg font-bold text-white">
              Edit Transaction
            </h2>
            <p className="text-[11px] text-slate-400">
              Correct values in place · Balances recalculate automatically
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors cursor-pointer"
          title="Close edit modal"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Inline Error Banner */}
      {formError && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-950/40 p-3.5 text-xs text-rose-300 flex items-start gap-2.5">
          <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
          <p className="leading-relaxed">{formError}</p>
        </div>
      )}

      {/* CONFIRMATION SCREEN (When significant changes to cards, accounts, or amounts are detected) */}
      {showConfirmation ? (
        <div className="space-y-4 animate-in fade-in zoom-in-95 duration-200">
          <div className="rounded-2xl border border-amber-500/30 bg-amber-950/30 p-4 space-y-2">
            <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
              <ShieldAlert className="h-4 w-4 shrink-0" />
              <span>Confirm Balance & Ledger Changes</span>
            </div>
            <p className="text-xs text-amber-200/90 leading-relaxed">
              {confirmationExplanation}
            </p>
          </div>

          {/* List of changes */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] divide-y divide-white/10 overflow-hidden">
            {stagedChanges.map((change, idx) => (
              <div key={idx} className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <span className="font-bold text-slate-400 uppercase tracking-wider text-[10px]">
                  {change.label}
                </span>
                <div className="flex items-center gap-2 font-mono">
                  <span className="text-slate-400 line-through truncate max-w-[130px]">
                    {change.oldValue}
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 text-[#4edea3] shrink-0" />
                  <span className="text-[#4edea3] font-bold truncate max-w-[150px]">
                    {change.newValue}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Confirmation actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setShowConfirmation(false)}
              disabled={isPending}
              className="px-4 py-2.5 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-xs font-bold text-slate-300 transition-colors cursor-pointer"
            >
              Back to Editing
            </button>
            <button
              type="button"
              onClick={executeSave}
              disabled={isPending}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-xs font-bold text-slate-950 shadow-md shadow-emerald-500/25 hover:brightness-110 active:scale-95 transition-all cursor-pointer"
            >
              {isPending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Applying Changes...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5 stroke-[2.5]" />
                  <span>Confirm & Save</span>
                </>
              )}
            </button>
          </div>
        </div>
      ) : (
        /* REGULAR EDIT FORM */
        <form onSubmit={handleSaveClick} className="space-y-4">
          {/* Transaction Type Selector */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Transaction Type
            </label>
            <select
              value={transactionType}
              onChange={(e) =>
                setTransactionType(
                  e.target.value as "income" | "expense" | "transfer" | "card_purchase" | "card_payment"
                )
              }
              className="w-full rounded-xl bg-white/5 border border-white/15 px-3 py-2 text-xs font-semibold text-white focus:outline-none focus:border-[#4edea3] cursor-pointer"
            >
              <option value="expense" className="bg-[#181c22]">Expense (−)</option>
              <option value="income" className="bg-[#181c22]">Income (+)</option>
              <option value="card_purchase" className="bg-[#181c22]">Credit Card Purchase</option>
              <option value="card_payment" className="bg-[#181c22]">Credit Card Repayment</option>
              <option value="transfer" className="bg-[#181c22]">Internal Transfer</option>
            </select>
          </div>

          {/* Description / Merchant */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Description / Merchant
            </label>
            <input
              type="text"
              value={description}
              maxLength={160}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Swiggy, Amazon, Salary credit"
              className="w-full rounded-xl bg-white/5 border border-white/15 px-3.5 py-2.5 text-xs sm:text-sm text-white focus:outline-none focus:border-[#4edea3]"
              required
            />
          </div>

          {/* Amount and Date Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Amount (₹)
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                placeholder="e.g. 2000.00"
                className="w-full rounded-xl bg-white/5 border border-white/15 px-3.5 py-2.5 text-xs sm:text-sm font-mono text-white focus:outline-none focus:border-[#4edea3]"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Transaction Date
              </label>
              <input
                type="date"
                value={transactionDate}
                max={today}
                onChange={(e) => setTransactionDate(e.target.value)}
                className="w-full rounded-xl bg-white/5 border border-white/15 px-3.5 py-2.5 text-xs sm:text-sm font-mono text-white focus:outline-none focus:border-[#4edea3]"
                required
              />
            </div>
          </div>

          {/* CONDITIONAL SECTIONS BASED ON TRANSACTION TYPE */}

          {/* 1. Credit Card Purchase (PRIMARY USE CASE: Correct wrong card) */}
          {isCardPurchase && (
            <div className="p-3.5 rounded-2xl border border-emerald-500/30 bg-emerald-950/20 space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                  Linked Credit Card (Assigned Card)
                </label>
                <span className="text-[10px] text-emerald-300 font-medium">
                  Swap to correct card
                </span>
              </div>
              <select
                value={creditCardId}
                onChange={(e) => setCreditCardId(e.target.value)}
                className="w-full rounded-xl bg-[#10141a] border border-emerald-500/40 px-3 py-2 text-xs font-semibold text-white focus:outline-none focus:border-emerald-400 cursor-pointer"
              >
                {creditCards.map((card) => (
                  <option key={card.id} value={card.id} className="bg-[#181c22]">
                    {card.name} {card.bank_name ? `(${card.bank_name})` : ""} {card.last_four_digits ? `••${card.last_four_digits}` : ""}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-emerald-300/80 leading-normal">
                If this purchase was attributed to the wrong credit card, select the correct card above. The ₹{amountInput || "0"} balance will cleanly transfer to the new card.
              </p>
            </div>
          )}

          {/* 2. Income or Expense -> Select Account */}
          {(transactionType === "income" || transactionType === "expense") && (
            <div className="space-y-1.5">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
                {transactionType === "income" ? "Deposit Into Account" : "Paid From Account"}
              </label>
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="w-full rounded-xl bg-white/5 border border-white/15 px-3 py-2 text-xs font-semibold text-white focus:outline-none focus:border-[#4edea3] cursor-pointer"
              >
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id} className="bg-[#181c22]">
                    {acc.name} ({acc.account_type === "cash" ? "Cash" : acc.institution || "Bank"})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* 3. Card Payment -> From Account & Target Card */}
          {transactionType === "card_payment" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Paid From (Account)
                </label>
                <select
                  value={fromAccountId}
                  onChange={(e) => setFromAccountId(e.target.value)}
                  className="w-full rounded-xl bg-white/5 border border-white/15 px-3 py-2 text-xs font-semibold text-white focus:outline-none focus:border-[#4edea3] cursor-pointer"
                >
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id} className="bg-[#181c22]">
                      {acc.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Card Repaid
                </label>
                <select
                  value={creditCardId}
                  onChange={(e) => setCreditCardId(e.target.value)}
                  className="w-full rounded-xl bg-white/5 border border-white/15 px-3 py-2 text-xs font-semibold text-white focus:outline-none focus:border-[#4edea3] cursor-pointer"
                >
                  {creditCards.map((card) => (
                    <option key={card.id} value={card.id} className="bg-[#181c22]">
                      {card.name} {card.last_four_digits ? `(••${card.last_four_digits})` : ""}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* 4. Internal Transfer -> From & To Accounts */}
          {transactionType === "transfer" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  From Account
                </label>
                <select
                  value={fromAccountId}
                  onChange={(e) => setFromAccountId(e.target.value)}
                  className="w-full rounded-xl bg-white/5 border border-white/15 px-3 py-2 text-xs font-semibold text-white focus:outline-none focus:border-[#4edea3] cursor-pointer"
                >
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id} className="bg-[#181c22]">
                      {acc.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  To Account
                </label>
                <select
                  value={toAccountId}
                  onChange={(e) => setToAccountId(e.target.value)}
                  className="w-full rounded-xl bg-white/5 border border-white/15 px-3 py-2 text-xs font-semibold text-white focus:outline-none focus:border-[#4edea3] cursor-pointer"
                >
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id} className="bg-[#181c22]">
                      {acc.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Category Field */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Category
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                list="category-suggestions"
                value={categoryName}
                onChange={(e) => setCategoryName(e.target.value)}
                placeholder="Select or enter category"
                className="w-full rounded-xl bg-white/5 border border-white/15 px-3.5 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-[#4edea3]"
              />
              <datalist id="category-suggestions">
                {availableCategories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="px-4 py-2.5 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-xs font-bold text-slate-300 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-xs font-bold text-slate-950 shadow-md shadow-emerald-500/25 hover:brightness-110 active:scale-95 transition-all cursor-pointer"
            >
              {isPending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <span>Save Changes</span>
              )}
            </button>
          </div>
        </form>
      )}
    </>
  );
}

export function EditTransactionModal({
  isOpen,
  onClose,
  transaction,
  accounts,
  creditCards,
  categories,
  availableCategories,
  today,
  onSuccess,
}: EditTransactionModalProps) {
  if (!isOpen || !transaction) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200">
      <div
        className="aura-panel relative w-full max-w-lg border border-white/15 bg-[#12161f]/95 shadow-2xl rounded-3xl p-5 sm:p-7 space-y-5 my-8"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-tx-heading"
      >
        <EditTransactionFormContent
          key={transaction.id}
          transaction={transaction}
          accounts={accounts}
          creditCards={creditCards}
          categories={categories}
          availableCategories={availableCategories}
          today={today}
          onClose={onClose}
          onSuccess={onSuccess}
        />
      </div>
    </div>
  );
}
