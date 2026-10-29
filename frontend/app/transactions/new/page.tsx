import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Zap, Plus, ArrowDownLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";
import { logout } from "../../login/actions";
import { AuraHeader, AuraBottomNav } from "@/components/AuraNav";
import { resolveDisplayName } from "@/lib/auth/user-display";
import { getIndiaToday } from "@/lib/finance/date-ranges";
import {
  calculateCardCreditUtilization,
  buildLimitExceededMessage,
} from "@/lib/finance/card-limit-engine";
import {
  rankRecentCategories,
  resolveRememberedSource,
  getRecentRepeatableTransactions,
  DEFAULT_EXPENSE_CATEGORIES,
  DEFAULT_INCOME_CATEGORIES,
  type RawTransactionRow,
  type TransactionTemplate,
  type UserTransactionPreferences,
} from "@/lib/finance/quick-entry-engine";
import TransactionForm from "../TransactionForm";

type NewTransactionPageProps = {
  searchParams: Promise<{
    error?: string;
    created?: string;
    type?: string;
    account_id?: string;
    card_id?: string;
    source?: string;
    limit?: string;
    available?: string;
    exceeded?: string;
    amount?: string;
  }>;
};

type AccountRow = {
  id: string;
  name: string;
  account_type: "bank" | "cash";
  institution: string | null;
  opening_balance_date: string;
};

type CreditCardRow = {
  id: string;
  name: string;
  bank_name: string;
  last_four_digits: string | null;
  opening_outstanding_date: string;
  credit_limit_paise?: number | string;
  opening_outstanding_paise?: number | string;
  current_utilized_paise?: number;
  current_available_paise?: number;
};

type CategoryRow = {
  id: string;
  name: string;
};

async function NewTransactionContent({
  searchParams,
}: NewTransactionPageProps) {
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

  // Fetch accounts, credit cards, categories, card transactions, active EMIs,
  // transaction templates, preferences, and recent transactions in parallel
  const [
    accountsResult,
    cardsResult,
    categoriesResult,
    cardTransactionsResult,
    emisResult,
    templatesResult,
    preferencesResult,
    recentTxsResult,
  ] = await Promise.all([
    supabase
      .from("accounts")
      .select("id, name, account_type, institution, opening_balance_date")
      .eq("user_id", userId)
      .eq("is_archived", false)
      .order("name"),

    supabase
      .from("credit_cards")
      .select("id, name, bank_name, last_four_digits, opening_outstanding_date, credit_limit_paise, opening_outstanding_paise")
      .eq("user_id", userId)
      .eq("is_archived", false)
      .order("name"),

    supabase
      .from("categories")
      .select("id, name")
      .eq("user_id", userId)
      .eq("is_archived", false),

    supabase
      .from("transactions")
      .select("id, transaction_date, amount_paise, transaction_type, credit_card_id")
      .eq("user_id", userId)
      .in("transaction_type", ["card_purchase", "card_payment", "card_credit"]),

    supabase
      .from("emi_debts")
      .select("id, linked_credit_card_id, current_outstanding_principal_paise, status")
      .eq("user_id", userId)
      .eq("status", "active"),

    supabase
      .from("transaction_templates")
      .select("*")
      .eq("user_id", userId)
      .order("is_favorite", { ascending: false })
      .order("usage_count", { ascending: false })
      .order("updated_at", { ascending: false }),

    supabase
      .from("user_transaction_preferences")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle(),

    supabase
      .from("transactions")
      .select("id, transaction_date, amount_paise, transaction_type, credit_card_id, account_id, description, category_id, categories(name)")
      .eq("user_id", userId)
      .order("transaction_date", { ascending: false })
      .limit(60),
  ]);

  const rawCards = (cardsResult.data ?? []) as Array<{
    id: string;
    name: string;
    bank_name: string;
    last_four_digits: string | null;
    opening_outstanding_date: string;
    credit_limit_paise: number | string;
    opening_outstanding_paise: number | string;
  }>;
  const rawTx = (cardTransactionsResult.data ?? []) as unknown as Array<{
    id: string;
    transaction_date: string;
    amount_paise: number | string;
    transaction_type: string;
    credit_card_id: string | null;
  }>;
  const rawEmis = emisResult.data ?? [];

  const accounts = (accountsResult.data ?? []) as unknown as AccountRow[];
  const creditCards: CreditCardRow[] = rawCards.map((c) => {
    const util = calculateCardCreditUtilization(c, rawTx, rawEmis);
    return {
      ...c,
      credit_limit_paise: util.creditLimitPaise,
      current_utilized_paise: util.totalUtilizedCreditPaise,
      current_available_paise: util.availableCreditPaise,
    };
  });
  const categories = (categoriesResult.data ?? []) as unknown as CategoryRow[];

  // Safely map recent transactions
  type RecentTxRow = {
    id: string;
    transaction_date: string;
    amount_paise: number | string;
    transaction_type: string;
    credit_card_id: string | null;
    account_id: string | null;
    description: string;
    category_id: string | null;
    categories: { name: string } | null;
  };
  const rawRecent = (recentTxsResult.data ?? []) as unknown as RecentTxRow[];
  const recentTransactions: RawTransactionRow[] = rawRecent.map((tx) => ({
    id: tx.id,
    transaction_date: tx.transaction_date,
    amount_paise: tx.amount_paise,
    transaction_type: tx.transaction_type,
    credit_card_id: tx.credit_card_id,
    account_id: tx.account_id,
    description: tx.description,
    category_id: tx.category_id,
    category_name: tx.categories?.name,
  }));

  // Safely parse user preferences
  type UserPrefRow = {
    last_expense_source_id?: string | null;
    last_income_source_id?: string | null;
    pinned_category_names?: string[];
  };
  const prefData = preferencesResult.data as unknown as UserPrefRow | null;
  const userPreferences: UserTransactionPreferences | null = prefData
    ? {
        lastExpenseSourceId: prefData.last_expense_source_id,
        lastIncomeSourceId: prefData.last_income_source_id,
        pinnedCategories: prefData.pinned_category_names || [],
      }
    : null;

  // Safely map templates
  type TemplateRow = {
    id: string;
    name: string;
    transaction_type: "income" | "expense";
    amount_paise: number | string;
    category_name: string;
    description?: string | null;
    source_id: string;
    account_id?: string | null;
    credit_card_id?: string | null;
    is_favorite?: boolean;
    usage_count?: number;
    last_used_at?: string | null;
    memo?: string | null;
  };
  const rawTemplates = (templatesResult.data ?? []) as unknown as TemplateRow[];
  const templates: TransactionTemplate[] = rawTemplates.map((t) => ({
    id: t.id,
    name: t.name,
    transactionType: t.transaction_type,
    amountPaise: Number(t.amount_paise),
    categoryName: t.category_name,
    description: t.description || t.name,
    sourceId: t.source_id,
    accountId: t.account_id,
    creditCardId: t.credit_card_id,
    isFavorite: Boolean(t.is_favorite),
    useCount: t.usage_count,
    lastUsedAt: t.last_used_at,
    notes: t.memo,
  }));

  // Pure engine calculations
  const activeCategoriesList = categories.map((c) => ({ id: c.id, name: c.name }));

  const rankedExpenseCategories = rankRecentCategories({
    transactionType: "expense",
    transactions: recentTransactions,
    categories: activeCategoriesList,
    pinnedCategoryNames: userPreferences?.pinnedCategories || [],
    limit: 8,
  });

  const rankedIncomeCategories = rankRecentCategories({
    transactionType: "income",
    transactions: recentTransactions,
    categories: activeCategoriesList,
    pinnedCategoryNames: userPreferences?.pinnedCategories || [],
    limit: 6,
  });

  const rememberedExpenseSourceId = resolveRememberedSource({
    transactionType: "expense",
    preferences: userPreferences,
    transactions: recentTransactions,
    accounts,
    creditCards,
  });

  const rememberedIncomeSourceId = resolveRememberedSource({
    transactionType: "income",
    preferences: userPreferences,
    transactions: recentTransactions,
    accounts,
    creditCards,
  });

  const repeatableTransactions = getRecentRepeatableTransactions({
    transactions: recentTransactions,
    accounts,
    creditCards,
    limit: 6,
    today,
  });

  const availableCategories = Array.from(
    new Set([
      ...categories.map((c) => c.name),
      ...DEFAULT_EXPENSE_CATEGORIES,
      ...DEFAULT_INCOME_CATEGORIES,
    ])
  );

  const errorMessages: Record<string, string> = {
    "invalid-input":
      "Check the amount, date, description, category and source. Amounts must be positive, and future dates aren't allowed.",
    "invalid-account-or-date":
      "Select one of your active accounts and a date on or after its opening-balance date.",
    "invalid-card-or-date":
      "Select an active credit card and a date on or after its opening outstanding date.",
    "credit-limit-exceeded": params.exceeded
      ? buildLimitExceededMessage(
          Number(params.exceeded),
          Number(params.available || 0),
          Number(params.amount || 0)
        )
      : "This transaction exceeds your available credit limit.",
    "save-failed":
      "We couldn't save the transaction. Please try again.",
  };

  const earliestDate =
    accounts.length > 0
      ? accounts.reduce(
          (earliest, account) =>
            account.opening_balance_date < earliest
              ? account.opening_balance_date
              : earliest,
          accounts[0].opening_balance_date
        )
      : undefined;

  const initialType: "income" | "expense" =
    params.card_id || (params.source && params.source.startsWith("card:"))
      ? "expense"
      : params.type === "income"
      ? "income"
      : "expense";

  const initialSourceId = params.card_id
    ? `card:${params.card_id}`
    : params.account_id
    ? `account:${params.account_id}`
    : params.source
    ? params.source
    : initialType === "income"
    ? rememberedIncomeSourceId
    : rememberedExpenseSourceId;

  return (
    <main className="min-h-screen bg-[#10141a] text-[#dfe2eb] pt-20 pb-36 relative overflow-hidden selection:bg-[#4edea3]/30 selection:text-[#4edea3]">
      {/* Obsidian Wealth ambient atmospheric lights */}
      <div className="pointer-events-none fixed -left-32 top-10 h-96 w-96 rounded-full bg-[#10b981]/10 blur-[150px] animate-pulse-glow" />
      <div
        className="pointer-events-none fixed -right-32 top-1/4 h-[30rem] w-[30rem] rounded-full bg-[#8b5cf6]/10 blur-[160px] animate-pulse-glow"
        style={{ animationDelay: "2s" }}
      />
      <div
        className="pointer-events-none fixed bottom-10 left-1/3 h-80 w-80 rounded-full bg-cyan-500/10 blur-[130px] animate-pulse-glow"
        style={{ animationDelay: "4s" }}
      />

      {/* Header */}
      <AuraHeader
        sectionTitle="Record Transaction"
        userEmail={userEmail}
        displayName={displayName}
        signOutAction={logout}
      />

      <div className="relative mx-auto max-w-2xl px-4 sm:px-6 space-y-6">
        {/* Navigation Breadcrumb Bar */}
        <div className="flex items-center justify-between">
          <Link
            href="/transactions"
            className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400 hover:text-white transition-colors group cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform" />
            <span>Back to Transactions</span>
          </Link>

          <span className="text-[10px] font-mono uppercase tracking-widest text-[#4edea3]">
            FINANCIAL TELEMETRY · ENTRY
          </span>
        </div>

        {/* Page Title Header */}
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 shrink-0 rounded-full bg-[#4edea3] animate-pulse" />
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#4edea3]">
              AUDITED DOUBLE-ENTRY LEDGER
            </span>
          </div>
          <h1 className="mt-1 text-2xl sm:text-3xl font-black tracking-tight text-white">
            Record Financial Activity
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            Post verified deposits, income credits, or expenses directly across your liquid accounts
          </p>
        </div>

        {/* Success Confirmation State */}
        {params.created === "1" && (
          <div
            role="status"
            className="rounded-2xl border border-emerald-500/30 bg-emerald-950/40 p-5 backdrop-blur-xl shadow-xl space-y-3 animate-in fade-in duration-300"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 text-[#4edea3] ring-1 ring-emerald-500/30">
                <Zap className="h-5 w-5 shrink-0" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">
                  Transaction Recorded Successfully
                </h3>
                <p className="text-xs text-emerald-300/80">
                  Your liquid balances and cashflow telemetry have been updated.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Link
                href="/transactions"
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-2 text-xs font-bold text-slate-950 shadow-md hover:brightness-110 active:scale-95 transition-all"
              >
                <span>View in Transaction History →</span>
              </Link>
              <Link
                href="/transactions/new"
                className="inline-flex items-center gap-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 px-3.5 py-2 text-xs font-bold text-white active:scale-95 transition-all"
              >
                <Plus className="h-3.5 w-3.5 text-[#4edea3]" />
                <span>Record Another</span>
              </Link>
            </div>
          </div>
        )}

        {/* Error Notification */}
        {params.error && (
          <div
            role="alert"
            className="rounded-2xl border border-rose-500/30 bg-rose-950/40 p-4 text-xs font-semibold text-rose-300 backdrop-blur-xl animate-in fade-in duration-200"
          >
            {errorMessages[params.error] ?? "Something went wrong saving the transaction."}
          </div>
        )}

        {/* Account/Card Requirement Warning */}
        {accounts.length === 0 && creditCards.length === 0 ? (
          <div className="aura-panel p-8 text-center space-y-4">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <ArrowDownLeft className="h-7 w-7" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">No active accounts or cards detected</h3>
              <p className="mt-1 text-xs text-slate-400 max-w-sm mx-auto">
                Add a bank account, cash wallet or credit card first to establish an opening balance before recording transactions.
              </p>
            </div>
            <Link
              href="/accounts"
              className="inline-flex items-center gap-2 rounded-xl bg-[#4edea3] px-5 py-2.5 text-xs font-bold text-slate-950 hover:brightness-110 transition-all"
            >
              <span>Add an Account Now →</span>
            </Link>
          </div>
        ) : (
          /* Transaction Entry Card */
          <section className="aura-panel p-6 sm:p-8 space-y-6">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-2">
                <span className="flex h-2 w-2 rounded-full bg-[#4edea3] animate-pulse" />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Transaction Entry Parameters
                </span>
              </div>
              <Badge variant="outline" className="text-[10px] border-white/10 text-slate-400">
                INR · UNIFIED LEDGER
              </Badge>
            </div>

            <TransactionForm
              accounts={accounts}
              creditCards={creditCards}
              availableCategories={availableCategories}
              rankedExpenseCategories={rankedExpenseCategories}
              rankedIncomeCategories={rankedIncomeCategories}
              templates={templates}
              repeatableTransactions={repeatableTransactions}
              rememberedExpenseSourceId={rememberedExpenseSourceId}
              rememberedIncomeSourceId={rememberedIncomeSourceId}
              pinnedCategories={userPreferences?.pinnedCategories || []}
              earliestDate={earliestDate}
              initialType={initialType}
              initialSourceId={initialSourceId}
              today={today}
              returnTo="/transactions/new"
            />
          </section>
        )}

        {/* Footer */}
        <p className="pt-6 text-center text-xs leading-5 text-slate-500">
          AURA Wealth · Private financial telemetry. Calculations computed idempotently from verified database records.
        </p>
      </div>

      {/* Floating Bottom Nav */}
      <AuraBottomNav />
    </main>
  );
}

export default function NewTransactionPage({
  searchParams,
}: NewTransactionPageProps) {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-[#10141a] p-6 text-slate-400">
          <div className="flex items-center gap-3">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#4edea3] border-t-transparent" />
            <p className="text-sm font-mono tracking-wider text-slate-300">
              Loading transaction entry...
            </p>
          </div>
        </main>
      }
    >
      <NewTransactionContent searchParams={searchParams} />
    </Suspense>
  );
}
