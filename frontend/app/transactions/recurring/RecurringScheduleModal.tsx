"use client";

import { useState } from "react";
import {
  X,
  Sparkles,
  ArrowRight,
  Info,
} from "lucide-react";
import {
  type RecurrenceFrequency,
  type RecurringScheduleRecord,
  FREQUENCY_LABELS,
} from "@/lib/finance/recurring-engine";
import {
  createRecurringSchedule,
  updateRecurringSchedule,
} from "./actions";

interface AccountOption {
  id: string;
  name: string;
  account_type: "bank" | "cash";
  institution: string | null;
}

interface CreditCardOption {
  id: string;
  name: string;
  bank_name: string;
  last_four_digits: string | null;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  accounts: AccountOption[];
  creditCards: CreditCardOption[];
  categories: string[];
  today: string;
  scheduleToEdit?: RecurringScheduleRecord | null;
  returnTo?: string;
}

export function RecurringScheduleModal({
  isOpen,
  onClose,
  accounts,
  creditCards,
  categories,
  today,
  scheduleToEdit,
  returnTo = "/transactions/recurring",
}: Props) {
  const isEditing = Boolean(scheduleToEdit);

  const [flowType, setFlowType] = useState<"income" | "expense">(
    scheduleToEdit?.transactionType || "expense"
  );

  const initialSourceId = scheduleToEdit?.creditCardId
    ? `card:${scheduleToEdit.creditCardId}`
    : scheduleToEdit?.accountId
    ? `account:${scheduleToEdit.accountId}`
    : accounts[0]?.id
    ? `account:${accounts[0].id}`
    : "";

  const [sourceId, setSourceId] = useState(initialSourceId);
  const [frequency, setFrequency] = useState<RecurrenceFrequency>(
    scheduleToEdit?.frequency || "monthly"
  );
  const [startDate, setStartDate] = useState(scheduleToEdit?.startDate || today);
  const [dayOfMonth, setDayOfMonth] = useState<string>(
    scheduleToEdit?.dayOfMonth ? String(scheduleToEdit.dayOfMonth) : "1"
  );
  const [isAmountVariable, setIsAmountVariable] = useState(
    scheduleToEdit?.isAmountVariable || false
  );

  if (!isOpen) return null;

  const isCardSelected = sourceId.startsWith("card:");

  function handleFlowTypeChange(newType: "income" | "expense") {
    setFlowType(newType);
    if (newType === "income" && isCardSelected) {
      // Auto-switch to first bank/cash account
      const firstAcc = accounts[0];
      if (firstAcc) setSourceId(`account:${firstAcc.id}`);
    }
  }

  const bankAccounts = accounts.filter((a) => a.account_type === "bank");
  const cashAccounts = accounts.filter((a) => a.account_type === "cash");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg rounded-3xl border border-white/10 bg-[#141922] p-6 sm:p-7 shadow-2xl text-[#dfe2eb] max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-500/15 text-purple-400 border border-purple-500/30">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                {isEditing ? "Edit Recurring Rule" : "New Recurring Schedule"}
              </h3>
              <p className="text-xs text-slate-400">
                Automated expected occurrences and reminders
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Notice on Statement & Loan Exclusions */}
        <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-cyan-500/20 bg-cyan-950/20 p-3 text-xs text-cyan-300">
          <Info className="h-4 w-4 shrink-0 mt-0.5" />
          <p>
            Credit card statement bills and loan EMIs are already tracked automatically in Cards and Loans. Use Recurring for subscriptions, rent, salary, utilities, and regular payments.
          </p>
        </div>

        <form
          action={isEditing ? updateRecurringSchedule : createRecurringSchedule}
          className="mt-5 space-y-4"
        >
          <input type="hidden" name="returnTo" value={returnTo} />
          {isEditing && (
            <input type="hidden" name="scheduleId" value={scheduleToEdit!.id} />
          )}

          {/* Type Toggle: Expense vs Income */}
          {!isEditing ? (
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                Transaction Direction
              </label>
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-white/5 p-1 border border-white/10">
                <button
                  type="button"
                  onClick={() => handleFlowTypeChange("expense")}
                  className={`flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all ${
                    flowType === "expense"
                      ? "bg-rose-500 text-white shadow-md"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Expense Outflow (−)
                </button>
                <button
                  type="button"
                  onClick={() => handleFlowTypeChange("income")}
                  className={`flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all ${
                    flowType === "income"
                      ? "bg-emerald-500 text-slate-950 shadow-md font-black"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Income Inflow (+)
                </button>
              </div>
              <input type="hidden" name="transactionType" value={flowType} />
            </div>
          ) : (
            <input type="hidden" name="transactionType" value={flowType} />
          )}

          {/* Name / Description */}
          <div>
            <label
              htmlFor="sched-name"
              className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5"
            >
              Schedule Name *
            </label>
            <input
              id="sched-name"
              name="name"
              required
              maxLength={160}
              defaultValue={scheduleToEdit?.name || ""}
              placeholder="e.g. Salary, House Rent, Netflix, Electricity Bill"
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-slate-500 outline-none focus:border-purple-400 focus:bg-white/10 focus:ring-2 focus:ring-purple-400/20"
            />
          </div>

          {/* Amount (₹) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="sched-amount"
                className="text-xs font-bold uppercase tracking-wider text-slate-400"
              >
                Expected Amount (₹) *
              </label>
              <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  name="isAmountVariable"
                  checked={isAmountVariable}
                  onChange={(e) => setIsAmountVariable(e.target.checked)}
                  className="rounded border-white/20 bg-white/5 text-purple-500 focus:ring-purple-400"
                />
                <span>Variable bill (check each time)</span>
              </label>
            </div>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">
                ₹
              </span>
              <input
                id="sched-amount"
                name="amount"
                type="number"
                inputMode="decimal"
                min="0.01"
                step="0.01"
                required
                defaultValue={
                  scheduleToEdit ? (scheduleToEdit.amountPaise / 100).toFixed(2) : ""
                }
                placeholder="15000"
                className="w-full rounded-xl border border-white/10 bg-white/5 pl-8 pr-4 py-2.5 text-sm font-bold tabular-nums text-white placeholder:text-slate-500 outline-none focus:border-purple-400 focus:bg-white/10 focus:ring-2 focus:ring-purple-400/20"
              />
            </div>
          </div>

          {/* Payment Source */}
          <div>
            <label
              htmlFor="sched-source"
              className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5"
            >
              {flowType === "income" ? "Deposit Destination *" : "Payment Method / Source *"}
            </label>
            <select
              id="sched-source"
              name="sourceId"
              required
              value={sourceId}
              onChange={(e) => setSourceId(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white outline-none focus:border-purple-400 focus:bg-white/10 focus:ring-2 focus:ring-purple-400/20"
            >
              <option value="" disabled className="bg-slate-900 text-slate-400">
                Select account or card
              </option>

              {bankAccounts.length > 0 && (
                <optgroup label="── Bank Accounts ──" className="bg-slate-900 font-bold text-emerald-400">
                  {bankAccounts.map((acc) => (
                    <option key={acc.id} value={`account:${acc.id}`} className="bg-slate-900 text-white font-normal">
                      {acc.name} {acc.institution ? `· ${acc.institution}` : ""}
                    </option>
                  ))}
                </optgroup>
              )}

              {cashAccounts.length > 0 && (
                <optgroup label="── Cash Wallets ──" className="bg-slate-900 font-bold text-amber-400">
                  {cashAccounts.map((acc) => (
                    <option key={acc.id} value={`account:${acc.id}`} className="bg-slate-900 text-white font-normal">
                      {acc.name} (Physical Cash)
                    </option>
                  ))}
                </optgroup>
              )}

              {flowType === "expense" && creditCards.length > 0 && (
                <optgroup label="── Credit Cards ──" className="bg-slate-900 font-bold text-purple-400">
                  {creditCards.map((card) => (
                    <option key={card.id} value={`card:${card.id}`} className="bg-slate-900 text-white font-normal">
                      {card.bank_name} {card.name} {card.last_four_digits ? `(••${card.last_four_digits})` : ""}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>

            {isCardSelected && (
              <p className="mt-1.5 text-[11px] text-purple-300">
                💳 Billed as a credit card purchase when confirmed. Will increase card debt without deducting from bank balances.
              </p>
            )}
          </div>

          {/* Category */}
          <div>
            <label
              htmlFor="sched-cat"
              className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5"
            >
              Category *
            </label>
            <input
              id="sched-cat"
              name="category"
              list="recurring-category-list"
              required
              maxLength={60}
              defaultValue={scheduleToEdit?.categoryName || (flowType === "income" ? "Salary" : "Housing & Rent")}
              placeholder="e.g. Housing & Rent, Subscriptions, Utilities"
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-slate-500 outline-none focus:border-purple-400 focus:bg-white/10 focus:ring-2 focus:ring-purple-400/20"
            />
            <datalist id="recurring-category-list">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>

          {/* Recurrence Frequency & Timing */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="sched-freq"
                className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5"
              >
                Frequency *
              </label>
              <select
                id="sched-freq"
                name="frequency"
                value={frequency}
                onChange={(e) => setFrequency(e.target.value as RecurrenceFrequency)}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white outline-none focus:border-purple-400 focus:bg-white/10 focus:ring-2 focus:ring-purple-400/20"
              >
                {(Object.keys(FREQUENCY_LABELS) as RecurrenceFrequency[]).map((f) => (
                  <option key={f} value={f} className="bg-slate-900 text-white">
                    {FREQUENCY_LABELS[f]}
                  </option>
                ))}
              </select>
            </div>

            {["monthly", "bimonthly", "quarterly", "semiannually", "yearly"].includes(frequency) ? (
              <div>
                <label
                  htmlFor="sched-day"
                  className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5"
                >
                  Day of Month (1–31)
                </label>
                <input
                  id="sched-day"
                  name="dayOfMonth"
                  type="number"
                  min="1"
                  max="31"
                  value={dayOfMonth}
                  onChange={(e) => setDayOfMonth(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold tabular-nums text-white outline-none focus:border-purple-400 focus:bg-white/10 focus:ring-2 focus:ring-purple-400/20"
                />
              </div>
            ) : (
              <div>
                <label
                  htmlFor="sched-start"
                  className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5"
                >
                  First Due Date *
                </label>
                <input
                  id="sched-start"
                  name="startDate"
                  type="date"
                  required
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white outline-none focus:border-purple-400 focus:bg-white/10 focus:ring-2 focus:ring-purple-400/20"
                />
              </div>
            )}
          </div>

          {/* Dates: Start Date & End Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="sched-start-dt"
                className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5"
              >
                Schedule Start Date *
              </label>
              <input
                id="sched-start-dt"
                name="startDate"
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white outline-none focus:border-purple-400 focus:bg-white/10 focus:ring-2 focus:ring-purple-400/20"
              />
            </div>
            <div>
              <label
                htmlFor="sched-end-dt"
                className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5"
              >
                End Date (Optional)
              </label>
              <input
                id="sched-end-dt"
                name="endDate"
                type="date"
                min={startDate}
                defaultValue={scheduleToEdit?.endDate || ""}
                placeholder="No end date"
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white outline-none focus:border-purple-400 focus:bg-white/10 focus:ring-2 focus:ring-purple-400/20"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label
              htmlFor="sched-notes"
              className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5"
            >
              Notes (Optional)
            </label>
            <input
              id="sched-notes"
              name="notes"
              maxLength={120}
              defaultValue={scheduleToEdit?.notes || ""}
              placeholder="e.g. Account number, customer ID or memo"
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-slate-500 outline-none focus:border-purple-400 focus:bg-white/10 focus:ring-2 focus:ring-purple-400/20"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-400 hover:to-indigo-400 text-white text-xs font-bold shadow-lg shadow-purple-500/25 transition-all active:scale-95 cursor-pointer"
            >
              <span>{isEditing ? "Save Changes" : "Create Schedule"}</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
