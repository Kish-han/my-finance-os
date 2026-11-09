"use client";

import { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeftRight,
  ArrowRight,
  Calendar,
  FileText,
  AlertTriangle,
  ShieldCheck,
  ChevronDown,
} from "lucide-react";
import { createTransfer } from "../actions";

export type AccountRow = {
  id: string;
  name: string;
  account_type: "bank" | "cash";
  institution: string | null;
  opening_balance_date: string;
  available_balance_paise?: number;
};

type TransferFormProps = {
  accounts: AccountRow[];
  today: string;
  returnTo?: string;
};

const QUICK_AMOUNTS = [
  { label: "+1,000", value: 1000 },
  { label: "+5,000", value: 5000 },
  { label: "+10,000", value: 10000 },
  { label: "+25,000", value: 25000 },
  { label: "+50,000", value: 50000 },
];

const COMMON_DESCRIPTIONS = [
  "Savings Allocation",
  "ATM Cash Withdrawal",
  "Cash Deposit to Bank",
  "Emergency Fund Transfer",
  "Account Rebalancing",
  "Monthly Allowance",
];

export default function TransferForm({
  accounts,
  today,
  returnTo = "/transactions/transfer",
}: TransferFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [fromAccountId, setFromAccountId] = useState<string>(
    accounts[0]?.id ?? ""
  );
  const [toAccountId, setToAccountId] = useState<string>(
    accounts[1]?.id ?? ""
  );
  const [amountInput, setAmountInput] = useState<string>("");
  const [description, setDescription] = useState<string>("Account Transfer");
  const [transactionDate, setTransactionDate] = useState<string>(today);
  const [notes, setNotes] = useState<string>("");
  const [feeInput, setFeeInput] = useState<string>("");
  const [showFee, setShowFee] = useState<boolean>(false);
  const [allowOverdraft, setAllowOverdraft] = useState<boolean>(false);
  const [clientError, setClientError] = useState<string | null>(null);

  const fromAccount = useMemo(
    () => accounts.find((a) => a.id === fromAccountId),
    [accounts, fromAccountId]
  );
  const toAccount = useMemo(
    () => accounts.find((a) => a.id === toAccountId),
    [accounts, toAccountId]
  );

  const parsedPaise = useMemo(() => {
    const raw = Number(amountInput.trim());
    if (!Number.isFinite(raw) || raw <= 0) return 0;
    return Math.round(raw * 100);
  }, [amountInput]);

  const parsedFeePaise = useMemo(() => {
    const raw = Number(feeInput.trim());
    if (!Number.isFinite(raw) || raw <= 0) return 0;
    return Math.round(raw * 100);
  }, [feeInput]);

  const isSameAccount = fromAccountId === toAccountId && Boolean(fromAccountId);

  const fromAvailablePaise = fromAccount?.available_balance_paise ?? null;
  const isOverdraft =
    fromAvailablePaise !== null &&
    parsedPaise > 0 &&
    parsedPaise + parsedFeePaise > fromAvailablePaise;

  function handleQuickIncrement(inc: number) {
    const current = Number(amountInput.trim()) || 0;
    setAmountInput(String(current + inc));
    setClientError(null);
  }

  function handleSwapAccounts() {
    setFromAccountId(toAccountId);
    setToAccountId(fromAccountId);
    setClientError(null);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setClientError(null);

    if (!fromAccountId || !toAccountId) {
      setClientError("Please select both source and destination accounts.");
      return;
    }

    if (fromAccountId === toAccountId) {
      setClientError("Source and destination accounts cannot be the same.");
      return;
    }

    if (parsedPaise <= 0) {
      setClientError("Please enter a valid positive transfer amount.");
      return;
    }

    if (!transactionDate || transactionDate > today) {
      setClientError("Transfer date cannot be in the future.");
      return;
    }

    if (
      (fromAccount && transactionDate < fromAccount.opening_balance_date) ||
      (toAccount && transactionDate < toAccount.opening_balance_date)
    ) {
      setClientError(
        "Transfer date cannot be earlier than an account's opening balance date."
      );
      return;
    }

    if (!description.trim()) {
      setClientError("Please provide a description for this transfer.");
      return;
    }

    if (fromAccount?.account_type === "cash" && isOverdraft) {
      setClientError(
        `Insufficient available balance in physical cash wallet (${fromAccount.name}). Physical cash cannot be overdrawn.`
      );
      return;
    }

    if (isOverdraft && !allowOverdraft) {
      setClientError(
        `Insufficient available balance in ${fromAccount?.name || "source account"}. Enable 'Authorize Overdraft / Historical Catch-up' below if you have an active overdraft facility or are entering past records.`
      );
      return;
    }

    const form = e.currentTarget;
    const formData = new FormData(form);

    startTransition(async () => {
      try {
        const result = await createTransfer(formData);
        if (!result.success) {
          setClientError(result.error);
        } else {
          router.push(result.redirectTo);
          router.refresh();
        }
      } catch (err: unknown) {
        // Next.js redirect throws an error that is handled by the framework
        if (
          err &&
          typeof err === "object" &&
          "message" in err &&
          typeof (err as { message: unknown }).message === "string" &&
          (err as { message: string }).message.includes("NEXT_REDIRECT")
        ) {
          throw err;
        }
        setClientError("Failed to record transfer. Please try again.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <input type="hidden" name="returnTo" value={returnTo} />

      {/* Client Error Notice */}
      {clientError && (
        <div
          role="alert"
          className="rounded-2xl border border-rose-500/30 bg-rose-950/40 p-4 text-xs font-semibold text-rose-300 backdrop-blur-xl animate-in fade-in duration-200 flex items-center gap-2.5"
        >
          <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
          <span>{clientError}</span>
        </div>
      )}

      {/* Account Route Selection (From -> To with Swap) */}
      <div className="space-y-3">
        <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
          <ArrowLeftRight className="h-3.5 w-3.5 text-[#4edea3]" />
          <span>Transfer Route</span>
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-center gap-3">
          {/* Source Account */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-medium text-[var(--foreground-muted)]">
              From Account (Debit)
            </span>
            <div className="relative">
              <select
                name="fromAccountId"
                value={fromAccountId}
                onChange={(e) => {
                  setFromAccountId(e.target.value);
                  setClientError(null);
                }}
                className="w-full rounded-xl bg-white/70 dark:bg-white/[0.04] border border-slate-300/80 dark:border-white/10 px-3.5 py-2.5 text-xs font-bold text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[#10b981] dark:focus:ring-[#4edea3]/40 focus:border-transparent transition-all appearance-none cursor-pointer pr-9"
              >
                {accounts.map((acc) => (
                  <option
                    key={`from-${acc.id}`}
                    value={acc.id}
                    className="bg-[var(--background)] text-[var(--foreground)]"
                  >
                    {acc.name} ({acc.account_type === "cash" ? "Cash Wallet" : acc.institution || "Bank"})
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--foreground-subtle)]" />
            </div>
            {fromAccount?.available_balance_paise !== undefined && (
              <p className="text-[10px] font-mono text-[var(--foreground-muted)] pt-0.5">
                Available:{" "}
                <span className={`font-bold ${fromAccount.available_balance_paise >= 0 ? "text-emerald-700 dark:text-[#4edea3]" : "text-rose-600 dark:text-rose-400"}`}>
                  ₹{(fromAccount.available_balance_paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </p>
            )}
          </div>

          {/* Swap Button */}
          <div className="flex sm:flex-col items-center justify-center pt-2 sm:pt-4">
            <button
              type="button"
              onClick={handleSwapAccounts}
              title="Swap source and destination"
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-200/70 dark:bg-white/5 border border-slate-300/80 dark:border-white/10 text-[var(--foreground-muted)] hover:text-emerald-700 dark:hover:text-[#4edea3] hover:bg-slate-300/70 dark:hover:bg-white/10 transition-all cursor-pointer active:scale-95"
            >
              <ArrowLeftRight className="h-4 w-4" />
            </button>
          </div>

          {/* Destination Account */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-medium text-[var(--foreground-muted)]">
              To Account (Credit)
            </span>
            <div className="relative">
              <select
                name="toAccountId"
                value={toAccountId}
                onChange={(e) => {
                  setToAccountId(e.target.value);
                  setClientError(null);
                }}
                className={`w-full rounded-xl bg-white/70 dark:bg-white/[0.04] border ${
                  isSameAccount
                    ? "border-rose-500/50 text-rose-600 dark:text-rose-300 ring-1 ring-rose-500/30"
                    : "border-slate-300/80 dark:border-white/10 text-[var(--foreground)] focus:ring-2 focus:ring-[#10b981] dark:focus:ring-[#4edea3]/40"
                } px-3.5 py-2.5 text-xs font-bold focus:outline-none transition-all appearance-none cursor-pointer pr-9`}
              >
                {accounts.map((acc) => (
                  <option
                    key={`to-${acc.id}`}
                    value={acc.id}
                    className="bg-[var(--background)] text-[var(--foreground)]"
                  >
                    {acc.name} ({acc.account_type === "cash" ? "Cash Wallet" : acc.institution || "Bank"})
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--foreground-subtle)]" />
            </div>
            {toAccount?.available_balance_paise !== undefined && (
              <p className="text-[10px] font-mono text-[var(--foreground-muted)] pt-0.5">
                Available:{" "}
                <span className={`font-bold ${toAccount.available_balance_paise >= 0 ? "text-[var(--foreground)]" : "text-rose-600 dark:text-rose-400"}`}>
                  ₹{(toAccount.available_balance_paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </p>
            )}
          </div>
        </div>

        {isSameAccount && (
          <p className="text-[11px] font-semibold text-rose-400 animate-in fade-in">
            Source and destination accounts must be different.
          </p>
        )}
      </div>

      {/* Amount Input */}
      <div className="space-y-2">
        <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center justify-between">
          <span>Amount (INR)</span>
          <span className="text-[10px] font-mono text-[#4edea3]">ZERO NET WORTH IMPACT</span>
        </label>

        <div className="relative">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg font-black text-[var(--foreground-subtle)]">
            ₹
          </span>
          <input
            type="number"
            name="amount"
            step="0.01"
            min="0.01"
            required
            placeholder="0.00"
            value={amountInput}
            onChange={(e) => {
              setAmountInput(e.target.value);
              setClientError(null);
            }}
            className="w-full rounded-2xl bg-white/70 dark:bg-white/[0.04] border border-slate-300/80 dark:border-white/10 py-3.5 pl-9 pr-4 text-xl sm:text-2xl font-black text-[var(--foreground)] placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-[#10b981] dark:focus:ring-[#4edea3]/40 transition-all"
          />
        </div>

        {/* Quick Increment Pills */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          {QUICK_AMOUNTS.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => handleQuickIncrement(item.value)}
              className="rounded-lg bg-slate-200/70 dark:bg-white/5 hover:bg-slate-300/70 dark:hover:bg-white/10 border border-slate-300/80 dark:border-white/10 px-2.5 py-1 text-[11px] font-bold text-[var(--foreground)] transition-all cursor-pointer active:scale-95"
            >
              {item.label}
            </button>
          ))}
          {amountInput && (
            <button
              type="button"
              onClick={() => setAmountInput("")}
              className="rounded-lg bg-slate-200/70 dark:bg-white/5 hover:bg-rose-500/20 border border-slate-300/80 dark:border-white/10 px-2 py-1 text-[10px] font-medium text-[var(--foreground-muted)] hover:text-rose-500 transition-all cursor-pointer"
            >
              Clear
            </button>
          )}
        </div>

        {/* Explicit Overdraft Warning & Override Toggle */}
        {isOverdraft && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-950/40 p-4 space-y-2 text-xs backdrop-blur-md animate-in fade-in">
            <div className="flex items-center gap-2 text-amber-300 font-bold">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
              <span>Insufficient Available Balance Warning</span>
            </div>
            <p className="text-slate-300 text-[11px] leading-relaxed">
              Requested transfer of{" "}
              <strong className="text-white">₹{(parsedPaise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</strong>{" "}
              exceeds the available balance in{" "}
              <strong className="text-white">{fromAccount?.name}</strong> (
              <span className="font-mono text-amber-300">
                ₹{((fromAvailablePaise ?? 0) / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </span>
              ).
            </p>
            {fromAccount?.account_type === "cash" ? (
              <p className="text-[11px] text-rose-400 font-semibold pt-1">
                Physical cash wallets cannot be overdrawn. Deposit cash into this wallet or select a bank account.
              </p>
            ) : (
              <label className="flex items-start gap-2.5 pt-1.5 cursor-pointer text-amber-200 hover:text-white transition-colors">
                <input
                  type="checkbox"
                  name="allowOverdraft"
                  checked={allowOverdraft}
                  onChange={(e) => {
                    setAllowOverdraft(e.target.checked);
                    setClientError(null);
                  }}
                  className="mt-0.5 rounded border-amber-500/40 bg-black/40 text-emerald-500 focus:ring-0 cursor-pointer h-4 w-4"
                />
                <span className="text-[11px] font-semibold leading-tight">
                  Authorize Overdraft / Historical Catch-up Entry
                  <span className="block text-[10px] text-slate-400 font-normal">
                    Check if this bank account has an active overdraft facility or if you are entering backdated records.
                  </span>
                </span>
              </label>
            )}
          </div>
        )}
      </div>

      {/* Transfer Description */}
      <div className="space-y-2">
        <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
          <FileText className="h-3.5 w-3.5 text-slate-400" />
          <span>Description</span>
        </label>

        <input
          type="text"
          name="description"
          maxLength={160}
          required
          placeholder="e.g. Savings Allocation"
          value={description}
          onChange={(e) => {
            setDescription(e.target.value);
            setClientError(null);
          }}
          className="w-full rounded-xl bg-white/[0.04] border border-white/10 px-3.5 py-2.5 text-xs font-semibold text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-[#4edea3]/40 focus:border-[#4edea3] transition-all"
        />

        {/* Common Description Suggestions */}
        <div className="flex flex-wrap items-center gap-1.5">
          {COMMON_DESCRIPTIONS.map((desc) => (
            <button
              key={desc}
              type="button"
              onClick={() => setDescription(desc)}
              className={`rounded-lg px-2.5 py-1 text-[10px] font-semibold transition-all cursor-pointer ${
                description === desc
                  ? "bg-[#4edea3]/20 text-[#4edea3] border border-[#4edea3]/40"
                  : "bg-white/5 hover:bg-white/10 text-slate-400 hover:text-slate-200 border border-white/10"
              }`}
            >
              {desc}
            </button>
          ))}
        </div>
      </div>

      {/* Date & Optional Notes in Two-Column Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Date */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 text-slate-400" />
            <span>Transfer Date</span>
          </label>
          <input
            type="date"
            name="transactionDate"
            max={today}
            required
            value={transactionDate}
            onChange={(e) => {
              setTransactionDate(e.target.value);
              setClientError(null);
            }}
            className="w-full rounded-xl bg-white/[0.04] border border-white/10 px-3.5 py-2.5 text-xs font-bold text-white focus:outline-none focus:ring-2 focus:ring-[#4edea3]/40 focus:border-[#4edea3] transition-all"
          />
        </div>

        {/* Optional Notes */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-300">
            Notes / Reference (Optional)
          </label>
          <input
            type="text"
            name="notes"
            maxLength={100}
            placeholder="e.g. UTR / Ref #123456"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-xl bg-white/[0.04] border border-white/10 px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-[#4edea3]/40 focus:border-[#4edea3] transition-all"
          />
        </div>
      </div>

      {/* Optional Transfer Fee Toggle */}
      <div className="pt-1 border-t border-white/10">
        {!showFee ? (
          <button
            type="button"
            onClick={() => setShowFee(true)}
            className="text-[11px] font-semibold text-slate-400 hover:text-[#4edea3] transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <span>+ Add Transfer Fee / Bank Charge (if applicable)</span>
          </button>
        ) : (
          <div className="space-y-2 pt-2 animate-in fade-in">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Transfer Fee (Recorded as Bank Charge Expense)
              </label>
              <button
                type="button"
                onClick={() => {
                  setShowFee(false);
                  setFeeInput("");
                }}
                className="text-[10px] text-slate-500 hover:text-slate-300"
              >
                Remove Fee
              </button>
            </div>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                ₹
              </span>
              <input
                type="number"
                name="feeAmount"
                step="0.01"
                min="0"
                placeholder="0.00 (e.g. 15 for IMPS charge)"
                value={feeInput}
                onChange={(e) => setFeeInput(e.target.value)}
                className="w-full rounded-xl bg-white/[0.04] border border-white/10 py-2 pl-7 pr-3 text-xs font-bold text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-[#4edea3]/40 focus:border-[#4edea3] transition-all"
              />
            </div>
          </div>
        )}
      </div>

      {/* Transfer Preview Card */}
      {parsedPaise > 0 && fromAccount && toAccount && !isSameAccount && (
        <div className="rounded-2xl border border-cyan-500/20 bg-cyan-950/20 p-4 space-y-2.5 animate-in fade-in backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-cyan-400" />
            <span className="text-[11px] font-bold text-cyan-300 uppercase tracking-wider">
              Transfer Telemetry Preview
            </span>
          </div>

          <div className="flex items-center justify-between text-xs py-1">
            <div className="flex items-center gap-2">
              <span className="text-slate-400">Debit:</span>
              <span className="font-bold text-white">{fromAccount.name}</span>
            </div>
            <ArrowRight className="h-3.5 w-3.5 text-cyan-400" />
            <div className="flex items-center gap-2">
              <span className="text-slate-400">Credit:</span>
              <span className="font-bold text-white">{toAccount.name}</span>
            </div>
          </div>

          {parsedFeePaise > 0 && (
            <div className="text-[11px] text-amber-400/90 border-t border-white/5 pt-2 flex items-center justify-between">
              <span>Transfer Fee (Bank Charge Expense):</span>
              <strong className="font-mono">₹{(parsedFeePaise / 100).toFixed(2)}</strong>
            </div>
          )}

          <div className="text-[11px] text-slate-400 border-t border-white/10 pt-2 flex items-center justify-between">
            <span>
              Net Worth Impact: <strong className="text-emerald-400">₹0.00 (Zero)</strong>
            </span>
            <span>
              Excluded from Budgets: <strong className="text-cyan-400">Yes</strong>
            </span>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={isPending || isSameAccount}
          className="w-full sm:flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 py-3 text-xs font-black uppercase tracking-wider text-slate-950 shadow-lg shadow-emerald-500/20 hover:brightness-110 active:scale-95 disabled:opacity-50 disabled:pointer-events-none transition-all cursor-pointer"
        >
          {isPending ? (
            <div className="flex items-center gap-2">
              <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-950 border-t-transparent" />
              <span>Recording Transfer...</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <ArrowLeftRight className="h-4 w-4" />
              <span>Execute Transfer</span>
            </div>
          )}
        </button>

        <button
          type="button"
          onClick={() => router.back()}
          disabled={isPending}
          className="w-full sm:w-auto rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 px-5 py-3 text-xs font-bold text-slate-300 hover:text-white transition-all cursor-pointer"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
