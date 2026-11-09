import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ArrowLeftRight, Zap, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { logout } from "../../login/actions";
import { AuraHeader, AuraBottomNav } from "@/components/AuraNav";
import { resolveDisplayName } from "@/lib/auth/user-display";
import { getIndiaToday } from "@/lib/finance/date-ranges";
import { calculateAccountBalance } from "@/lib/finance/balances";
import type { FinancialAccount, Transaction } from "@/lib/finance/types";
import { Badge } from "@/components/ui/badge";
import TransferForm, { type AccountRow } from "./TransferForm";

type TransferPageProps = {
  searchParams: Promise<{
    error?: string;
    created?: string;
  }>;
};

const ERROR_MESSAGES: Record<string, string> = {
  "invalid-input":
    "Check the amount, date, description and accounts. Amounts must be positive and future dates are not allowed.",
  "same-transfer-accounts":
    "Source and destination accounts cannot be the same account.",
  "invalid-accounts":
    "One or both selected accounts are invalid or not active.",
  "date-before-opening":
    "Transfer date cannot be earlier than an account's opening balance date.",
  "invalid-amount": "Enter a valid positive amount.",
  "insufficient-funds":
    "Insufficient available balance in the source account. Check 'Allow Overdraft' if this is an authorized overdraft facility or historical catch-up entry.",
  "save-failed": "We couldn't save the transfer. Please try again.",
  "unauthenticated": "Session expired. Please sign in again.",
};

async function TransferContent({ searchParams }: TransferPageProps) {
  await connection();
  const params = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/login");
  }

  const userId = user.id;
  const userEmail = user.email || "Private Client";
  const displayName = resolveDisplayName(user);
  const today = getIndiaToday();

  // Load accounts and transactions in parallel to calculate live available balances
  const [accountsResult, transactionsResult] = await Promise.all([
    supabase
      .from("accounts")
      .select("id, name, account_type, institution, opening_balance_date, opening_balance_paise")
      .eq("user_id", userId)
      .eq("is_archived", false)
      .order("name"),
    supabase
      .from("transactions")
      .select("id, transaction_date, amount_paise, transaction_type, account_id, from_account_id, to_account_id, credit_card_id")
      .eq("user_id", userId),
  ]);

  const rawTxs = transactionsResult.data ?? [];
  const mappedTxs: Transaction[] = rawTxs.map((t) => ({
    id: t.id,
    date: t.transaction_date,
    description: "",
    amountPaise: Number(t.amount_paise) || 0,
    type: t.transaction_type,
    accountId: t.account_id ?? "",
    fromAccountId: t.from_account_id ?? "",
    toAccountId: t.to_account_id ?? "",
    creditCardId: t.credit_card_id ?? "",
    categoryId: "",
  } as unknown as Transaction));

  const accounts: AccountRow[] = (accountsResult.data ?? []).map((acc) => {
    const finAcc: FinancialAccount = {
      id: acc.id,
      name: acc.name,
      type: acc.account_type,
      institution: acc.institution || undefined,
      openingBalancePaise: Number(acc.opening_balance_paise) || 0,
      openingBalanceDate: acc.opening_balance_date,
      isArchived: false,
    };
    const balance = calculateAccountBalance(finAcc, mappedTxs);
    return {
      id: acc.id,
      name: acc.name,
      account_type: acc.account_type,
      institution: acc.institution,
      opening_balance_date: acc.opening_balance_date,
      available_balance_paise: balance,
    };
  });

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)] pt-20 pb-36 lg:pl-64 relative overflow-hidden selection:bg-[#4edea3]/30 selection:text-[#4edea3] transition-colors">
      {/* Atmospheric lights */}
      <div className="pointer-events-none fixed -left-32 top-10 h-96 w-96 rounded-full bg-[#10b981]/10 blur-[150px] animate-pulse-glow" />
      <div
        className="pointer-events-none fixed -right-32 top-1/4 h-[30rem] w-[30rem] rounded-full bg-[#8b5cf6]/10 blur-[160px] animate-pulse-glow"
        style={{ animationDelay: "2s" }}
      />
      <div
        className="pointer-events-none fixed bottom-10 left-1/3 h-80 w-80 rounded-full bg-cyan-500/10 blur-[130px] animate-pulse-glow"
        style={{ animationDelay: "4s" }}
      />

      <AuraHeader
        sectionTitle="Internal Transfer"
        userEmail={userEmail}
        displayName={displayName}
        signOutAction={logout}
      />

      <div className="relative mx-auto max-w-2xl px-4 sm:px-6 space-y-6">
        {/* Breadcrumb */}
        <div className="flex items-center justify-between">
          <Link
            href="/transactions"
            className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors group"
          >
            <ArrowLeft className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform" />
            <span>Back to Transactions</span>
          </Link>
          <span className="text-[10px] font-mono uppercase tracking-widest text-emerald-700 dark:text-[#4edea3] font-bold">
            ACCOUNT TRANSFER
          </span>
        </div>

        {/* Title */}
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 shrink-0 rounded-full bg-emerald-600 dark:bg-[#4edea3] animate-pulse" />
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-emerald-700 dark:text-[#4edea3]">
              INTERNAL FUND MOVEMENT
            </span>
          </div>
          <h1 className="mt-1 text-2xl sm:text-3xl font-black tracking-tight text-[var(--foreground)]">
            Transfer Between Accounts
          </h1>
          <p className="mt-1 text-xs text-[var(--foreground-muted)]">
            Move money between your bank accounts and cash wallets. Transfers
            are excluded from income, expense and budget analytics.
          </p>
        </div>

        {/* Success state */}
        {params.created === "1" && (
          <div
            role="status"
            className="rounded-2xl border border-emerald-500/30 bg-emerald-950/40 p-5 backdrop-blur-xl shadow-xl space-y-3 animate-in fade-in duration-300"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 text-[#4edea3] ring-1 ring-emerald-500/30">
                <Zap className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">
                  Transfer Recorded Successfully
                </h3>
                <p className="text-xs text-emerald-300/80">
                  Both account balances have been updated in your ledger.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Link
                href="/transactions"
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-2 text-xs font-bold text-slate-950 shadow-md hover:brightness-110 active:scale-95 transition-all"
              >
                View in Transaction History →
              </Link>
              <Link
                href="/transactions/transfer"
                className="inline-flex items-center gap-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 px-3.5 py-2 text-xs font-bold text-white active:scale-95 transition-all"
              >
                <Plus className="h-3.5 w-3.5 text-[#4edea3]" />
                <span>Record Another</span>
              </Link>
            </div>
          </div>
        )}

        {/* Error state */}
        {params.error && (
          <div
            role="alert"
            className="rounded-2xl border border-rose-500/30 bg-rose-950/40 p-4 text-xs font-semibold text-rose-300 backdrop-blur-xl animate-in fade-in duration-200"
          >
            {ERROR_MESSAGES[params.error] ?? "Something went wrong saving the transfer."}
          </div>
        )}

        {/* Need at least 2 accounts */}
        {accounts.length < 2 ? (
          <div className="aura-panel p-8 text-center space-y-4">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <ArrowLeftRight className="h-7 w-7" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                Two accounts needed for a transfer
              </h3>
              <p className="mt-1 text-xs text-slate-400 max-w-sm mx-auto">
                You need at least two active bank accounts or cash wallets to
                record an internal transfer.
              </p>
            </div>
            <Link
              href="/accounts"
              className="inline-flex items-center gap-2 rounded-xl bg-[#4edea3] px-5 py-2.5 text-xs font-bold text-slate-950 hover:brightness-110 transition-all"
            >
              Manage Accounts →
            </Link>
          </div>
        ) : (
          <section className="aura-panel p-6 sm:p-8 space-y-6">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-2">
                <span className="flex h-2 w-2 rounded-full bg-[#4edea3] animate-pulse" />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Transfer Parameters
                </span>
              </div>
              <Badge variant="outline" className="text-[10px] border-white/10 text-slate-400">
                INR · INTERNAL
              </Badge>
            </div>

            <TransferForm accounts={accounts} today={today} />
          </section>
        )}

        <p className="pt-6 text-center text-xs leading-5 text-slate-500">
          AURA Wealth · Internal transfers do not affect income or expense totals.
        </p>
      </div>

      <AuraBottomNav />
    </main>
  );
}

export default function TransferPage({ searchParams }: TransferPageProps) {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-[#10141a] p-6 text-slate-400">
          <div className="flex items-center gap-3">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#4edea3] border-t-transparent" />
            <p className="text-sm font-mono tracking-wider text-slate-300">
              Loading transfer form...
            </p>
          </div>
        </main>
      }
    >
      <TransferContent searchParams={searchParams} />
    </Suspense>
  );
}
