import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Wallet,
  Landmark,
  CreditCard,
  TrendingUp,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowLeftRight,
  Zap,
  ChevronRight,
  Percent,
  PieChart,
  AlertTriangle,
  Receipt,
  Sparkles,
  Plus,
  Handshake,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { fetchMoneyTrackerMetrics } from "@/lib/finance/money-tracker-data";
import {
  calculateAccountBalance,
  separateAccountBalances,
  partitionDebtsForLiabilities,
  calculateNetWorth,
} from "@/lib/finance/balances";
import type {
  FinancialAccount,
  Transaction,
} from "@/lib/finance/types";
import { logout } from "./login/actions";
import { AuraHeader, AuraBottomNav } from "@/components/AuraNav";
import { resolveDisplayName } from "@/lib/auth/user-display";
import { DashboardNetWorth } from "./DashboardNetWorth";
import UpcomingPaymentsCenter from "./UpcomingPaymentsCenter";
import { buildUpcomingPaymentsList } from "@/lib/finance/payment-schedule";
import { fetchUserPendingOccurrences } from "@/lib/finance/recurring-data";
import {
  type CategoryBudget,
  calculateMonthlyBudgets,
  getCurrentMonthKey,
} from "@/lib/finance/budget-engine";
import { type TransactionRecord } from "@/lib/finance/date-ranges";
import DashboardLoading from "./loading";

type TransactionType =
  | "income"
  | "expense"
  | "transfer"
  | "card_purchase"
  | "card_payment"
  | "money_lent"
  | "repayment_received"
  | "money_borrowed"
  | "repayment_paid";

type AccountRow = {
  id: string;
  name: string;
  account_type: "bank" | "cash";
  institution: string | null;
  opening_balance_paise: number | string;
  opening_balance_date: string;
  is_archived: boolean;
};

type TransactionRow = {
  id: string;
  transaction_date: string;
  description?: string;
  amount_paise: number | string;
  transaction_type: TransactionType;
  account_id: string | null;
  from_account_id: string | null;
  to_account_id: string | null;
  credit_card_id: string | null;
  category_id: string | null;
};

type CreditCardRow = {
  id: string;
  name: string;
  bank_name: string;
  last_four_digits: string | null;
  credit_limit_paise: number | string;
  opening_outstanding_paise: number | string;
  opening_outstanding_date: string;
  statement_day: number | null;
  payment_due_day: number | null;
};

type EmiDebtRow = {
  id: string;
  name: string;
  lender_name: string;
  debt_type: string;
  linked_credit_card_id: string | null;
  status: "active" | "foreclosed" | "closed";
  emi_amount_paise: number | string;
  current_outstanding_principal_paise: number | string;
  original_principal_paise?: number | string;
  annual_interest_rate_basis_points?: number | string | null;
  total_tenure_months?: number;
  installments_paid_before_tracking?: number;
  first_emi_due_date?: string;
  outstanding_as_of_date: string;
  next_due_date: string | null;
};

type EmiPaymentRow = {
  debt_id: string;
  payment_date: string;
  installment_number: number | null;
  amount_paise: number | string;
  principal_component_paise: number | string | null;
  interest_component_paise: number | string | null;
  payment_kind: string;
};

type StatementRow = {
  id: string;
  user_id: string;
  credit_card_id: string;
  statement_date: string;
  payment_due_date: string;
  statement_balance_paise: number | string;
  minimum_due_paise?: number | string | null;
  is_settled?: boolean | null;
  settled_at?: string | null;
  notes?: string | null;
};

type TransactionLoadResult = {
  rows: TransactionRow[];
  failed: boolean;
};

function formatRupees(paise: number | string): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(paise) / 100);
}

function indiaDate(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value])
  );

  return `${values.year}-${values.month}-${values.day}`;
}

function toFinancialAccount(row: AccountRow): FinancialAccount {
  return {
    id: row.id,
    name: row.name,
    type: row.account_type,
    institution: row.institution ?? undefined,
    openingBalancePaise: Number(row.opening_balance_paise),
    openingBalanceDate: row.opening_balance_date,
    isArchived: row.is_archived,
  };
}

function toFinancialTransaction(row: TransactionRow): Transaction {
  const base = {
    id: row.id,
    date: row.transaction_date,
    description: row.description ?? "",
    amountPaise: Number(row.amount_paise),
  };

  switch (row.transaction_type) {
    case "income":
      return {
        ...base,
        type: "income",
        accountId: row.account_id!,
        categoryId: row.category_id!,
      };

    case "expense":
      return {
        ...base,
        type: "expense",
        accountId: row.account_id!,
        categoryId: row.category_id!,
      };

    case "transfer":
      return {
        ...base,
        type: "transfer",
        fromAccountId: row.from_account_id!,
        toAccountId: row.to_account_id!,
      };

    case "card_purchase":
      return {
        ...base,
        type: "card_purchase",
        creditCardId: row.credit_card_id!,
        categoryId: row.category_id!,
      };

    case "card_payment":
      return {
        ...base,
        type: "card_payment",
        fromAccountId: row.from_account_id!,
        creditCardId: row.credit_card_id!,
      };

    case "money_lent":
      return {
        ...base,
        type: "money_lent",
        accountId: row.account_id!,
      };

    case "repayment_received":
      return {
        ...base,
        type: "repayment_received",
        accountId: row.account_id!,
      };

    case "money_borrowed":
      return {
        ...base,
        type: "money_borrowed",
        accountId: row.account_id!,
      };

    case "repayment_paid":
      return {
        ...base,
        type: "repayment_paid",
        accountId: row.account_id!,
      };
  }
}

async function loadTransactions(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<TransactionLoadResult> {
  const { data, error } = await supabase
    .from("transactions")
    .select(
      "id, description, transaction_date, amount_paise, transaction_type, account_id, from_account_id, to_account_id, credit_card_id, category_id"
    )
    .eq("user_id", userId)
    .order("transaction_date", { ascending: false });

  if (error || !data) {
    return { rows: [], failed: true };
  }

  return {
    rows: data as unknown as TransactionRow[],
    failed: false,
  };
}

function calculateCardOutstanding(
  card: CreditCardRow,
  transactions: TransactionRow[]
): number {
  let outstanding = Number(card.opening_outstanding_paise);

  for (const transaction of transactions) {
    if (
      transaction.credit_card_id !== card.id ||
      transaction.transaction_date < card.opening_outstanding_date
    ) {
      continue;
    }

    const amount = Number(transaction.amount_paise);

    if (transaction.transaction_type === "card_purchase") {
      outstanding += amount;
    } else if (transaction.transaction_type === "card_payment") {
      outstanding -= amount;
    }
  }

  return Math.max(0, outstanding);
}

function calculateEmiPrincipal(
  debt: EmiDebtRow,
  payments: EmiPaymentRow[]
): number {
  let outstanding = Number(debt.current_outstanding_principal_paise);

  for (const payment of payments) {
    if (
      payment.debt_id === debt.id &&
      payment.payment_date > debt.outstanding_as_of_date
    ) {
      outstanding -= Number(payment.principal_component_paise ?? 0);
    }
  }

  return Math.max(0, outstanding);
}

async function DashboardContent({
  searchParams,
}: {
  searchParams?: Promise<{
    error?: string;
    statement_saved?: string;
    payment_recorded?: string;
  }>;
}) {
  // All personal financial information must load at request time.
  await connection();
  const params = searchParams ? await searchParams : {};

  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/login");
  }

  const userId = user.id;
  const indiaToday = indiaDate();

  const [
    accountsResult,
    cardsResult,
    debtsResult,
    paymentsResult,
    statementRows,
    transactionResult,
    budgetRows,
    categoryRows,
    moneyTrackerResult,
  ] = await Promise.all([
    supabase
      .from("accounts")
      .select(
        "id, name, account_type, institution, opening_balance_paise, opening_balance_date, is_archived"
      )
      .eq("user_id", userId)
      .eq("is_archived", false)
      .order("name", { ascending: true }),

    supabase
      .from("credit_cards")
      .select(
        "id, name, bank_name, last_four_digits, credit_limit_paise, opening_outstanding_paise, opening_outstanding_date, statement_day, payment_due_day"
      )
      .eq("user_id", userId)
      .eq("is_archived", false)
      .order("name", { ascending: true }),

    supabase
      .from("emi_debts")
      .select(
        "id, name, lender_name, debt_type, linked_credit_card_id, linked_transaction_id, purchase_mode, status, emi_amount_paise, current_outstanding_principal_paise, original_principal_paise, annual_interest_rate_basis_points, total_tenure_months, installments_paid_before_tracking, first_emi_due_date, outstanding_as_of_date, next_due_date"
      )
      .eq("user_id", userId)
      .eq("status", "active")
      .order("next_due_date", { ascending: true, nullsFirst: false }),

    supabase
      .from("emi_payments")
      .select(
        "debt_id, payment_date, installment_number, amount_paise, principal_component_paise, interest_component_paise, payment_kind"
      )
      .eq("user_id", userId)
      .order("payment_date", { ascending: true }),

    (async (): Promise<StatementRow[]> => {
      try {
        const { data, error } = await supabase
          .from("credit_card_statements")
          .select(
            "id, user_id, credit_card_id, statement_date, payment_due_date, statement_balance_paise, minimum_due_paise, is_settled, settled_at, notes"
          )
          .eq("user_id", userId)
          .order("payment_due_date", { ascending: true });
        if (error) return [];
        return (data ?? []) as unknown as StatementRow[];
      } catch {
        return [];
      }
    })(),

    loadTransactions(supabase, userId),

    (async (): Promise<CategoryBudget[]> => {
      try {
        const { data, error } = await supabase
          .from("category_budgets")
          .select("*")
          .eq("user_id", userId)
          .eq("is_active", true);
        if (error) return [];
        return (data ?? []) as unknown as CategoryBudget[];
      } catch {
        return [];
      }
    })(),

    (async (): Promise<{ id: string; name: string }[]> => {
      try {
        const { data, error } = await supabase
          .from("categories")
          .select("id, name")
          .eq("user_id", userId)
          .eq("is_archived", false);
        if (error) return [];
        return (data ?? []) as unknown as { id: string; name: string }[];
      } catch {
        return [];
      }
    })(),

    fetchMoneyTrackerMetrics(supabase),
  ]);

  const accountRows =
    (accountsResult.data ?? []) as unknown as AccountRow[];

  const cardRows =
    (cardsResult.data ?? []) as unknown as CreditCardRow[];

  const pendingRecurringResult = await fetchUserPendingOccurrences(
    supabase,
    userId,
    indiaToday,
    accountRows,
    cardRows
  );

  const moneyTrackerMetrics = moneyTrackerResult;

  const debtRows =
    (debtsResult.data ?? []) as unknown as EmiDebtRow[];

  const emiPaymentRows =
    (paymentsResult.data ?? []) as unknown as EmiPaymentRow[];

  const transactionRows = transactionResult.rows;

  const currentMonthKey = getCurrentMonthKey();
  const categoryMap = new Map<string, string>();
  for (const cat of categoryRows) {
    categoryMap.set(cat.id, cat.name);
  }

  const budgetOverview = calculateMonthlyBudgets(
    budgetRows,
    transactionRows as unknown as TransactionRecord[],
    categoryMap,
    currentMonthKey
  );

  const urgentBudget =
    budgetOverview.categorySummaries.find((c) => c.isOverspent) ||
    budgetOverview.categorySummaries.find((c) => c.status === "warning_80") ||
    budgetOverview.categorySummaries.find((c) => c.status === "warning_50");

  const financeTransactions: Transaction[] =
    transactionRows.map(toFinancialTransaction);

  const accountModels = accountRows.map(toFinancialAccount);

  const accountBalances = accountModels.map((account) => ({
    account,
    balancePaise: calculateAccountBalance(
      account,
      financeTransactions
    ),
  }));

  const canCalculateBankBalances =
    !accountsResult.error && !transactionResult.failed;

  const canCalculateMonthlyActivity = !transactionResult.failed;

  const canCalculateCardBalances =
    !cardsResult.error && !transactionResult.failed;

  const canCalculateEmiBalances =
    !debtsResult.error && !paymentsResult.error;

  const {
    bankAccounts: bankAccountBalances,
    cashAccounts: cashAccountBalances,
    totalBankBalancesPaise,
    totalCashInHandPaise,
    totalLiquidPaise: totalBankCashPaise,
  } = separateAccountBalances(accountBalances);

  const cardBalances = cardRows.map((card) => ({
    card,
    outstandingPaise: calculateCardOutstanding(
      card,
      transactionRows
    ),
  }));

  const totalCardOutstandingPaise = cardBalances.reduce(
    (total, item) => total + item.outstandingPaise,
    0
  );

  const monthStart = `${indiaToday.slice(0, 7)}-01`;

  const monthTransactions = transactionRows.filter(
    (transaction) => transaction.transaction_date >= monthStart
  );

  const monthlyIncomePaise = monthTransactions
    .filter((transaction) => transaction.transaction_type === "income")
    .reduce(
      (total, transaction) => total + Number(transaction.amount_paise),
      0
    );

  // Card repayments and transfers are not new expenses.
  const monthlyExpensesPaise = monthTransactions
    .filter(
      (transaction) =>
        transaction.transaction_type === "expense" ||
        transaction.transaction_type === "card_purchase"
    )
    .reduce(
      (total, transaction) => total + Number(transaction.amount_paise),
      0
    );

  const activeEmis = debtRows.map((debt) => ({
    debt,
    debtType: debt.debt_type,
    linkedCreditCardId: debt.linked_credit_card_id,
    outstandingPaise: calculateEmiPrincipal(debt, emiPaymentRows),
  }));

  // Separate standalone term loans from credit-card linked EMIs.
  // Card-linked EMIs are already represented within the card's revolving debt liability.
  // Only standalone term loans constitute independent loan liabilities to prevent double counting.
  const {
    standaloneLoans,
    totalStandaloneLoanPaise: totalStandaloneLoanPrincipalPaise,
  } = partitionDebtsForLiabilities(activeEmis);

  const personalReceivablesPaise =
    moneyTrackerMetrics?.outstandingReceivablesPaise ?? 0;
  const personalPayablesPaise =
    moneyTrackerMetrics?.outstandingPayablesPaise ?? 0;

  const { totalAssetsPaise, totalLiabilitiesPaise, netWorthPaise } = calculateNetWorth({
    liquidAssetsPaise: totalBankCashPaise,
    cardOutstandingPaise: totalCardOutstandingPaise,
    standaloneLoanPrincipalPaise: totalStandaloneLoanPrincipalPaise,
    personalReceivablesPaise,
    personalPayablesPaise,
  });

  const upcomingCardOptions = cardRows.map((c) => {
    const cb = cardBalances.find((b) => b.card.id === c.id);
    return {
      id: c.id,
      label: `${c.bank_name} ${c.name}${c.last_four_digits ? ` (••${c.last_four_digits})` : ""}`,
      name: c.name,
      bank_name: c.bank_name,
      last_four_digits: c.last_four_digits,
      paymentDueDay: c.payment_due_day,
      statementDay: c.statement_day,
      outstandingPaise: cb ? cb.outstandingPaise : 0,
    };
  });

  const upcomingAccountOptions = accountBalances.map(({ account, balancePaise }) => ({
    id: account.id,
    label: `${account.name}${account.institution ? ` · ${account.institution}` : ""}`,
    name: account.name,
    account_type: account.type,
    institution: account.institution,
    balancePaise,
  }));

  const { activePayments, settledPayments } = buildUpcomingPaymentsList({
    today: indiaToday,
    recurringItems: pendingRecurringResult.pendingItems,
    cards: cardRows.map((c) => ({
      id: c.id,
      name: c.name,
      bank_name: c.bank_name,
      last_four_digits: c.last_four_digits,
      payment_due_day: c.payment_due_day,
      statement_day: c.statement_day,
      opening_outstanding_paise: c.opening_outstanding_paise,
      opening_outstanding_date: c.opening_outstanding_date,
    })),
    statements: (statementRows ?? []).map((s) => ({
      id: s.id,
      userId: s.user_id,
      creditCardId: s.credit_card_id,
      statementDate: s.statement_date,
      paymentDueDate: s.payment_due_date,
      statementBalancePaise: Number(s.statement_balance_paise),
      minimumDuePaise: s.minimum_due_paise ? Number(s.minimum_due_paise) : null,
      isSettled: Boolean(s.is_settled),
      settledAt: s.settled_at,
      notes: s.notes,
    })),
    cardPaymentTransactions: transactionRows
      .filter((t) => t.transaction_type === "card_payment" && t.credit_card_id)
      .map((t) => ({
        amountPaise: Number(t.amount_paise),
        date: t.transaction_date,
        creditCardId: t.credit_card_id!,
      })),
    debts: debtRows.map((d) => ({
      ...d,
      original_principal_paise: d.original_principal_paise ?? d.current_outstanding_principal_paise,
      annual_interest_rate_basis_points: d.annual_interest_rate_basis_points ?? null,
      total_tenure_months: d.total_tenure_months ?? 12,
      installments_paid_before_tracking: d.installments_paid_before_tracking ?? 0,
      first_emi_due_date: d.first_emi_due_date ?? indiaToday,
    })),
    debtPayments: emiPaymentRows.map((p) => ({
      debt_id: p.debt_id,
      payment_date: p.payment_date,
      installment_number: p.installment_number ?? null,
      amount_paise: p.amount_paise ?? 0,
      principal_component_paise: p.principal_component_paise,
      interest_component_paise: p.interest_component_paise ?? null,
      payment_kind: p.payment_kind ?? "scheduled_emi",
    })),
    allTransactions: transactionRows.map((t) => ({
      id: t.id,
      date: t.transaction_date,
      amountPaise: t.amount_paise,
      type: t.transaction_type,
      creditCardId: t.credit_card_id,
    })),
  });

  const hasQueryError =
    Boolean(accountsResult.error) ||
    Boolean(cardsResult.error) ||
    Boolean(debtsResult.error) ||
    Boolean(paymentsResult.error) ||
    transactionResult.failed;

  const userEmail = user.email || "Private Client";
  const displayName = resolveDisplayName(user);

  const recentTransactions = transactionRows.slice(0, 5);

  const liquidityRunwayMonths =
    monthlyExpensesPaise > 0
      ? (totalBankCashPaise / monthlyExpensesPaise).toFixed(1)
      : null;

  const debtToAssetRatio =
    totalBankCashPaise > 0
      ? Math.round((totalLiabilitiesPaise / totalBankCashPaise) * 100)
      : totalLiabilitiesPaise > 0
      ? 100
      : 0;

  const savingsRatePct =
    monthlyIncomePaise > 0
      ? Math.round(
          ((monthlyIncomePaise - monthlyExpensesPaise) / monthlyIncomePaise) * 100
        )
      : null;

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)] lg:pl-64 pt-20 pb-36 relative overflow-hidden selection:bg-[#4edea3]/30 selection:text-[#4edea3] transition-colors duration-300">
      {/* Atmospheric ambient liquid glass glow orbs */}
      <div className="pointer-events-none absolute -top-40 left-1/4 h-[500px] w-[500px] rounded-full bg-[#10b981]/10 blur-[130px] animate-pulse-glow" />
      <div
        className="pointer-events-none absolute top-1/3 -right-40 h-[600px] w-[600px] rounded-full bg-[#3b82f6]/10 blur-[150px] animate-pulse-glow"
        style={{ animationDelay: "2s" }}
      />
      <div
        className="pointer-events-none absolute bottom-1/4 -left-40 h-[500px] w-[500px] rounded-full bg-[#8b5cf6]/10 blur-[140px] animate-pulse-glow"
        style={{ animationDelay: "4s" }}
      />

      {/* Top Contextual Header */}
      <AuraHeader
        sectionTitle="Wealth Overview"
        userEmail={userEmail}
        displayName={displayName}
        signOutAction={logout}
      />

      <div className="relative z-10 mx-auto max-w-5xl px-3 sm:px-6 space-y-6">
        {/* Banner Feedback Notifications */}
        {params.statement_saved === "1" && (
          <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-950/40 px-5 py-4 text-xs sm:text-sm font-semibold text-emerald-300 shadow-xl backdrop-blur-xl animate-float-slow">
            <Zap className="h-4 w-4 text-emerald-400 shrink-0" />
            <p>Credit card statement saved successfully. Your upcoming payment schedule has been updated.</p>
          </div>
        )}

        {params.payment_recorded === "1" && (
          <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-950/40 px-5 py-4 text-xs sm:text-sm font-semibold text-emerald-300 shadow-xl backdrop-blur-xl animate-float-slow">
            <Zap className="h-4 w-4 text-emerald-400 shrink-0" />
            <p>Credit card payment recorded successfully. Bank and credit card ledgers have been updated.</p>
          </div>
        )}

        {params.error && (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-950/40 p-4 text-xs sm:text-sm font-semibold text-rose-300 backdrop-blur-xl">
            {params.error}
          </div>
        )}

        {hasQueryError && (
          <section
            role="alert"
            className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs font-medium text-amber-200 shadow-xl"
          >
            Some financial records could not be loaded. Totals depending on those records may be unavailable.
          </section>
        )}

        {/* 2. High-Level Net Worth & Financial Summary */}
        <section>
          <DashboardNetWorth
            netWorthPaise={netWorthPaise}
            totalAssetsPaise={totalAssetsPaise}
            totalLiabilitiesPaise={totalLiabilitiesPaise}
            availableBalancePaise={totalBankCashPaise}
            personalReceivablesPaise={personalReceivablesPaise}
            personalPayablesPaise={personalPayablesPaise}
            canCalculate={
              canCalculateBankBalances &&
              canCalculateCardBalances &&
              canCalculateEmiBalances
            }
            accountsCount={accountRows.length}
            cardsCount={cardRows.length}
            debtsCount={standaloneLoans.length}
            userEmail={userEmail}
            displayName={displayName}
          />
        </section>

        {/* Tactical 4-Column Quick Actions */}
        <section className="grid grid-cols-4 gap-2 sm:gap-4">
          <Link
            href="/transactions/new?type=income"
            className="group flex flex-col items-center justify-center p-2.5 sm:p-4 rounded-2xl aura-panel hover:border-emerald-500/40 hover:-translate-y-0.5 active:scale-[0.97] transition-all shadow-lg text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#10b981] dark:focus-visible:ring-[#4edea3]"
          >
            <div className="flex h-9 w-9 sm:h-11 sm:w-11 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-700 dark:text-[#4edea3] border border-emerald-500/30 group-hover:scale-105 transition-transform">
              <ArrowDownLeft className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            <span className="mt-1.5 sm:mt-2 text-[11px] sm:text-xs font-bold text-[var(--foreground)] tracking-wide">Deposit</span>
            <span className="text-[10px] text-[var(--foreground-muted)] hidden sm:block">Add Capital</span>
          </Link>

          <Link
            href="/transactions/new?type=expense"
            className="group flex flex-col items-center justify-center p-2.5 sm:p-4 rounded-2xl aura-panel hover:border-rose-500/40 hover:-translate-y-0.5 active:scale-[0.97] transition-all shadow-lg text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
          >
            <div className="flex h-9 w-9 sm:h-11 sm:w-11 items-center justify-center rounded-xl bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30 group-hover:scale-105 transition-transform">
              <ArrowUpRight className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            <span className="mt-1.5 sm:mt-2 text-[11px] sm:text-xs font-bold text-[var(--foreground)] tracking-wide">Expense</span>
            <span className="text-[10px] text-[var(--foreground-muted)] hidden sm:block">Record Spend</span>
          </Link>

          <Link
            href="/transactions/transfer"
            className="group flex flex-col items-center justify-center p-2.5 sm:p-4 rounded-2xl aura-panel hover:border-cyan-400/40 hover:-translate-y-0.5 active:scale-[0.97] transition-all shadow-lg text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
          >
            <div className="flex h-9 w-9 sm:h-11 sm:w-11 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border border-cyan-500/30 group-hover:scale-105 transition-transform">
              <ArrowLeftRight className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            <span className="mt-1.5 sm:mt-2 text-[11px] sm:text-xs font-bold text-[var(--foreground)] tracking-wide">Transfer</span>
            <span className="text-[10px] text-[var(--foreground-muted)] hidden sm:block">Move Funds</span>
          </Link>

          <Link
            href="/cards"
            className="group flex flex-col items-center justify-center p-2.5 sm:p-4 rounded-2xl aura-panel hover:border-amber-400/40 hover:-translate-y-0.5 active:scale-[0.97] transition-all shadow-lg text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
          >
            <div className="flex h-9 w-9 sm:h-11 sm:w-11 items-center justify-center rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 group-hover:scale-105 transition-transform">
              <CreditCard className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            <span className="mt-1.5 sm:mt-2 text-[11px] sm:text-xs font-bold text-[var(--foreground)] tracking-wide">Cards</span>
            <span className="text-[10px] text-[var(--foreground-muted)] hidden sm:block">Revolving</span>
          </Link>
        </section>

        {/* 3. Separate Cash in Hand & Bank Balances Metrics */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-600 dark:bg-[#4edea3] shadow-[0_0_8px_rgba(78,222,163,0.8)]" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--foreground-muted)]">
                Liquid Reserves
              </h2>
            </div>
            <Link
              href="/accounts"
              className="text-xs font-semibold text-emerald-700 dark:text-[#4edea3] hover:underline transition-colors flex items-center gap-1"
            >
              <span>Manage Accounts</span>
              <ChevronRight className="h-3 w-3" />
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 sm:gap-4">
            {/* Cash in Hand */}
            <div className="aura-panel p-4 sm:p-5 flex flex-col justify-between hover:border-emerald-500/40 transition-all rounded-3xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
                    <Wallet className="h-5 w-5" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--foreground-subtle)] block">
                      Physical Currency
                    </span>
                    <h3 className="text-sm sm:text-base font-bold text-[var(--foreground)]">Cash in Hand</h3>
                  </div>
                </div>
                <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                  {cashAccountBalances.length} {cashAccountBalances.length === 1 ? "wallet" : "wallets"}
                </span>
              </div>

              <div className="mt-4 pt-3 border-t border-[var(--surface-panel-border)] flex items-baseline justify-between">
                <span className="text-2xl sm:text-3xl font-black text-[var(--foreground)] tabular-nums drop-shadow-sm truncate">
                  {canCalculateBankBalances
                    ? formatRupees(totalCashInHandPaise)
                    : "Unavailable"}
                </span>
                <span className="text-xs text-[var(--foreground-muted)] shrink-0 ml-2">Total cash</span>
              </div>
            </div>

            {/* Bank Balances */}
            <div className="aura-panel p-4 sm:p-5 flex flex-col justify-between hover:border-emerald-500/40 transition-all rounded-3xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-700 dark:text-[#4edea3] border border-emerald-500/30">
                    <Landmark className="h-5 w-5" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--foreground-subtle)] block">
                      Institutional Deposits
                    </span>
                    <h3 className="text-sm sm:text-base font-bold text-[var(--foreground)]">Bank Balances</h3>
                  </div>
                </div>
                <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 dark:text-[#4edea3]">
                  {bankAccountBalances.length} {bankAccountBalances.length === 1 ? "account" : "accounts"}
                </span>
              </div>

              <div className="mt-4 pt-3 border-t border-[var(--surface-panel-border)] flex items-baseline justify-between">
                <span className="text-2xl sm:text-3xl font-black text-[var(--foreground)] tabular-nums drop-shadow-sm truncate">
                  {canCalculateBankBalances
                    ? formatRupees(totalBankBalancesPaise)
                    : "Unavailable"}
                </span>
                <span className="text-xs text-[var(--foreground-muted)] shrink-0 ml-2">Bank reserves</span>
              </div>
            </div>
          </div>
        </section>

        {/* 4. Liabilities & Monthly Financial Flow Matrix */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-cyan-600 dark:bg-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.8)]" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--foreground-muted)]">
                Liabilities & Monthly Flow
              </h2>
            </div>
            <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--foreground-subtle)]">
              AUDITED TELEMETRY
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 sm:gap-4">
            {/* Credit Card Outstanding */}
            <div className="aura-panel p-4 sm:p-5 flex flex-col justify-between hover:border-amber-400/40 transition-all rounded-3xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-300 flex items-center justify-center border border-amber-500/30">
                    <CreditCard className="h-4 w-4" />
                  </div>
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                    Card Liabilities
                  </span>
                </div>
                <span className="text-[10px] font-mono uppercase text-[var(--foreground-subtle)]">
                  {cardRows.length} {cardRows.length === 1 ? "card" : "cards"}
                </span>
              </div>
              <div className="mt-3">
                <span className="text-xl sm:text-2xl font-black text-amber-700 dark:text-amber-300 tabular-nums block truncate">
                  {canCalculateCardBalances
                    ? formatRupees(totalCardOutstandingPaise)
                    : "Unavailable"}
                </span>
                <p className="mt-1 text-[11px] text-[var(--foreground-muted)]">
                  Revolving dues (excludes double-counted EMI)
                </p>
              </div>
            </div>

            {/* Standalone Loan Principal */}
            <div className="aura-panel p-4 sm:p-5 flex flex-col justify-between hover:border-cyan-400/40 transition-all rounded-3xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-xl bg-cyan-500/15 text-cyan-700 dark:text-cyan-400 flex items-center justify-center border border-cyan-500/30">
                    <Percent className="h-4 w-4" />
                  </div>
                  <span className="text-xs font-bold uppercase tracking-wider text-cyan-700 dark:text-cyan-400">
                    Loan Principal
                  </span>
                </div>
                <span className="text-[10px] font-mono uppercase text-[var(--foreground-subtle)]">
                  {standaloneLoans.length} {standaloneLoans.length === 1 ? "loan" : "loans"}
                </span>
              </div>
              <div className="mt-3">
                <span className="text-xl sm:text-2xl font-black text-cyan-700 dark:text-cyan-300 tabular-nums block truncate">
                  {canCalculateEmiBalances
                    ? formatRupees(totalStandaloneLoanPrincipalPaise)
                    : "Unavailable"}
                </span>
                <p className="mt-1 text-[11px] text-[var(--foreground-muted)]">
                  Standalone loan principal liability
                </p>
              </div>
            </div>

            {/* Monthly Net Flow */}
            <div className="aura-panel p-4 sm:p-5 flex flex-col justify-between hover:border-[#8b5cf6]/40 transition-all rounded-3xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-xl bg-purple-500/15 text-purple-700 dark:text-purple-300 flex items-center justify-center border border-purple-500/30">
                    <TrendingUp className="h-4 w-4" />
                  </div>
                  <span className="text-xs font-bold uppercase tracking-wider text-purple-700 dark:text-purple-300">
                    Monthly Net Flow
                  </span>
                </div>
                <span className="text-[10px] font-mono uppercase text-[var(--foreground-subtle)]">
                  THIS MONTH
                </span>
              </div>
              <div className="mt-3">
                <span
                  className={`text-xl sm:text-2xl font-black tabular-nums block truncate ${
                    !canCalculateMonthlyActivity
                      ? "text-[var(--foreground-subtle)]"
                      : monthlyIncomePaise >= monthlyExpensesPaise
                      ? "text-emerald-700 dark:text-[#4edea3]"
                      : "text-rose-700 dark:text-rose-400"
                  }`}
                >
                  {canCalculateMonthlyActivity
                    ? formatRupees(monthlyIncomePaise - monthlyExpensesPaise)
                    : "Unavailable"}
                </span>
                <div className="mt-1 flex items-center justify-between text-[11px] text-[var(--foreground-muted)]">
                  <span className="text-emerald-700 dark:text-[#4edea3]">+{formatRupees(monthlyIncomePaise)}</span>
                  <span className="text-rose-700 dark:text-rose-400">−{formatRupees(monthlyExpensesPaise)}</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Compact Monthly Budget Summary (if budgets configured) */}
        {budgetOverview.categoriesCount > 0 && (
          <section className="aura-card-obsidian rounded-3xl p-5 sm:p-6 border border-[var(--surface-panel-border)] shadow-xl relative overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[var(--surface-panel-border)]">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-500/30">
                  <PieChart className="h-4.5 w-4.5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm sm:text-base font-bold text-[var(--foreground)]">
                      Monthly Budget Summary
                    </h2>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-200/70 dark:bg-white/5 border border-slate-300/80 dark:border-white/10 text-[var(--foreground-muted)]">
                      {budgetOverview.monthLabel}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--foreground-muted)]">
                    {budgetOverview.categoriesCount} active {budgetOverview.categoriesCount === 1 ? "category" : "categories"} tracked
                  </p>
                </div>
              </div>

              <Link
                href="/budgets"
                className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 dark:text-[#4edea3] hover:underline transition-colors self-start sm:self-auto cursor-pointer"
              >
                <span>Manage Budgets</span>
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <span className="text-[11px] font-medium text-[var(--foreground-muted)]">Total Budget</span>
                <p className="text-xl sm:text-2xl font-black text-[var(--foreground)] tabular-nums mt-0.5">
                  {formatRupees(budgetOverview.totalBudgetPaise)}
                </p>
              </div>

              <div>
                <span className="text-[11px] font-medium text-[var(--foreground-muted)]">Actual Spending</span>
                <p className="text-xl sm:text-2xl font-black text-[var(--foreground)] tabular-nums mt-0.5">
                  {formatRupees(budgetOverview.totalActualSpendingPaise)}
                </p>
                <div className="mt-1.5 h-1.5 w-full rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      budgetOverview.overallPercentageUsed > 100
                        ? "bg-rose-500"
                        : budgetOverview.overallPercentageUsed >= 80
                        ? "bg-amber-400"
                        : "bg-emerald-500"
                    }`}
                    style={{ width: `${Math.min(100, budgetOverview.overallPercentageUsed)}%` }}
                  />
                </div>
              </div>

              <div>
                <span className="text-[11px] font-medium text-[var(--foreground-muted)]">
                  {budgetOverview.totalOverspentPaise > 0 ? "Total Overspent" : "Remaining Buffer"}
                </span>
                <p
                  className={`text-xl sm:text-2xl font-black tabular-nums mt-0.5 ${
                    budgetOverview.totalOverspentPaise > 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-700 dark:text-[#4edea3]"
                  }`}
                >
                  {budgetOverview.totalOverspentPaise > 0
                    ? `−${formatRupees(budgetOverview.totalOverspentPaise)}`
                    : `+${formatRupees(budgetOverview.totalRemainingPaise)}`}
                </p>
              </div>
            </div>

            {/* Most Urgent Alert Highlight (if any) */}
            {urgentBudget && (
              <div
                className={`mt-4 pt-3 border-t border-[var(--surface-panel-border)] flex items-center justify-between text-xs rounded-2xl px-3.5 py-2.5 ${
                  urgentBudget.isOverspent
                    ? "bg-rose-500/10 text-rose-800 dark:text-rose-300 border border-rose-500/20"
                    : urgentBudget.status === "warning_80"
                    ? "bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-500/20"
                    : "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border border-emerald-500/20"
                }`}
              >
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>
                    <strong>{urgentBudget.categoryName}:</strong>{" "}
                    {urgentBudget.isOverspent
                      ? `Exceeded by ${formatRupees(urgentBudget.overspentPaise)}`
                      : `${Math.round(urgentBudget.percentageUsed)}% used (${formatRupees(urgentBudget.actualSpendingPaise)} / ${formatRupees(urgentBudget.budgetPaise)})`}
                  </span>
                </div>
                <Link
                  href="/budgets"
                  className="font-bold underline hover:opacity-80 shrink-0 ml-2"
                >
                  View Details
                </Link>
              </div>
            )}
          </section>
        )}

        {/* 5. Compact Upcoming Payments Queue */}
        <UpcomingPaymentsCenter
          activePayments={activePayments}
          settledPayments={settledPayments}
          cards={upcomingCardOptions}
          accounts={upcomingAccountOptions}
          today={indiaToday}
        />

        {/* Personal Lending & Money Tracker Status */}
        {moneyTrackerMetrics && (
          <section className="aura-card-obsidian rounded-3xl p-5 sm:p-6 border border-[var(--surface-card-border)] space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-700 dark:text-[#4edea3] border border-emerald-500/25">
                  <Handshake className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[var(--foreground)]">
                    Personal Lending & Debt (Money Tracker)
                  </h3>
                  <p className="text-[11px] text-[var(--foreground-subtle)]">
                    Bilateral informal loans, receivables and payables
                  </p>
                </div>
              </div>

              <Link
                href="/money-tracker"
                className="text-xs font-bold text-emerald-700 dark:text-[#4edea3] hover:underline flex items-center gap-1"
              >
                <span>Open Tracker</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-2">
              <div className="p-3.5 rounded-2xl bg-slate-100/60 dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/10">
                <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--foreground-subtle)] block">
                  Personal Receivables
                </span>
                <span className="text-lg font-black font-mono text-emerald-700 dark:text-[#4edea3] tabular-nums mt-0.5 block">
                  {formatRupees(personalReceivablesPaise)}
                </span>
                <span className="text-[10px] text-[var(--foreground-subtle)] block mt-0.5">
                  {moneyTrackerMetrics.activeGivenCount} active borrower(s)
                </span>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-100/60 dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/10">
                <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--foreground-subtle)] block">
                  Personal Payables
                </span>
                <span className="text-lg font-black font-mono text-cyan-700 dark:text-cyan-400 tabular-nums mt-0.5 block">
                  {formatRupees(personalPayablesPaise)}
                </span>
                <span className="text-[10px] text-[var(--foreground-subtle)] block mt-0.5">
                  {moneyTrackerMetrics.activeTakenCount} active creditor(s)
                </span>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-100/60 dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/10">
                <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--foreground-subtle)] block">
                  Net Lending Position
                </span>
                <span
                  className={`text-lg font-black font-mono tabular-nums mt-0.5 block ${
                    personalReceivablesPaise >= personalPayablesPaise
                      ? "text-emerald-700 dark:text-[#4edea3]"
                      : "text-cyan-700 dark:text-cyan-400"
                  }`}
                >
                  {personalReceivablesPaise < personalPayablesPaise ? "−" : "+"}
                  {formatRupees(Math.abs(personalReceivablesPaise - personalPayablesPaise))}
                </span>
                <span className="text-[10px] text-[var(--foreground-subtle)] block mt-0.5">
                  {personalReceivablesPaise >= personalPayablesPaise ? "Net Creditor" : "Net Debtor"}
                </span>
              </div>
            </div>
          </section>
        )}

        {/* 6. Strategic Financial Intelligence & Insights (Section 5.H) */}
        <section className="aura-card-obsidian rounded-3xl p-5 sm:p-6 border relative overflow-hidden space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-emerald-500/15 text-[#4edea3] ring-1 ring-emerald-500/30">
                <Sparkles className="h-4.5 w-4.5" />
              </div>
              <div>
                <h2 className="text-sm sm:text-base font-bold text-[var(--foreground)]">
                  Financial Telemetry Insights
                </h2>
                <p className="text-xs text-[var(--foreground-muted)]">
                  Computed directly from your verified balances and transaction flow
                </p>
              </div>
            </div>
            <span className="text-[10px] font-mono uppercase tracking-widest text-[#4edea3] font-bold">
              AUDITED TELEMETRY
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-1">
            {/* Liquidity Runway */}
            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.07] space-y-1">
              <span className="text-[11px] font-semibold text-[var(--foreground-subtle)] uppercase tracking-wider block">
                Liquidity Runway
              </span>
              <p className="text-xl sm:text-2xl font-black text-[var(--foreground)] tabular-nums">
                {liquidityRunwayMonths !== null ? `${liquidityRunwayMonths} mo` : "Infinite buffer"}
              </p>
              <p className="text-[11px] text-[var(--foreground-muted)]">
                {liquidityRunwayMonths !== null
                  ? `Liquid reserves support ${liquidityRunwayMonths} months at current burn rate`
                  : "No outflow recorded this billing cycle"}
              </p>
            </div>

            {/* Debt to Asset Solvency */}
            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.07] space-y-1">
              <span className="text-[11px] font-semibold text-[var(--foreground-subtle)] uppercase tracking-wider block">
                Debt-to-Asset Solvency
              </span>
              <p className={`text-xl sm:text-2xl font-black tabular-nums ${
                debtToAssetRatio > 60 ? "text-rose-400" : debtToAssetRatio > 35 ? "text-amber-400" : "text-[#4edea3]"
              }`}>
                {debtToAssetRatio}%
              </p>
              <p className="text-[11px] text-[var(--foreground-muted)]">
                {debtToAssetRatio <= 35
                  ? "Conservative leverage (< 35% safe limit)"
                  : debtToAssetRatio <= 60
                  ? "Moderate leverage across credit cards & loans"
                  : "Elevated debt relative to liquid assets"}
              </p>
            </div>

            {/* Monthly Capital Retention (Savings Rate) */}
            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.07] space-y-1">
              <span className="text-[11px] font-semibold text-[var(--foreground-subtle)] uppercase tracking-wider block">
                Monthly Capital Retention
              </span>
              <p className={`text-xl sm:text-2xl font-black tabular-nums ${
                savingsRatePct !== null && savingsRatePct >= 20
                  ? "text-[#4edea3]"
                  : savingsRatePct !== null && savingsRatePct >= 0
                  ? "text-amber-400"
                  : "text-rose-400"
              }`}>
                {savingsRatePct !== null ? `${savingsRatePct}%` : "—"}
              </p>
              <p className="text-[11px] text-[var(--foreground-muted)]">
                {savingsRatePct !== null && savingsRatePct > 0
                  ? "Net savings retained from this month's inflow"
                  : savingsRatePct !== null && savingsRatePct < 0
                  ? "Expenses exceed inflow this month"
                  : "Awaiting incoming capital entries"}
              </p>
            </div>
          </div>
        </section>

        {/* 7. Recent Transactions Ledger (Section 5.G) */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-[#4edea3]" />
              <h2 className="text-sm sm:text-base font-bold text-[var(--foreground)]">
                Recent Ledger Activity
              </h2>
            </div>
            <Link
              href="/transactions"
              className="text-xs font-semibold text-[#4edea3] hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>View Full Ledger</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {recentTransactions.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-300/80 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.02] p-8 text-center backdrop-blur-md">
              <Receipt className="h-8 w-8 mx-auto text-emerald-600 dark:text-emerald-400/60" />
              <h3 className="mt-2 text-sm font-bold text-[var(--foreground)]">No transactions recorded</h3>
              <p className="text-xs text-[var(--foreground-muted)] mt-0.5">
                Record your first deposit, expense, or transfer to populate the financial ledger.
              </p>
              <Link
                href="/transactions/new"
                className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 dark:from-emerald-500 dark:to-teal-500 text-white dark:text-slate-950 font-bold text-xs"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Entry</span>
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {recentTransactions.map((tx) => {
                const isIncome = tx.transaction_type === "income";
                const isTransfer = tx.transaction_type === "transfer";
                const isCardRepayment = tx.transaction_type === "card_payment";
                const catName =
                  categoryMap.get(tx.category_id ?? "") ||
                  (isTransfer ? "Internal Transfer" : isCardRepayment ? "Card Payment" : "General");

                return (
                  <div
                    key={tx.id}
                    className="aura-panel p-3.5 sm:p-4 rounded-2xl flex items-center justify-between gap-3 group hover:border-emerald-500/30 transition-all"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                          isIncome
                            ? "bg-emerald-500/15 text-emerald-700 dark:text-[#4edea3] border border-emerald-500/30"
                            : isTransfer || isCardRepayment
                            ? "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border border-cyan-500/30"
                            : "bg-slate-200/60 dark:bg-white/5 text-[var(--foreground-muted)] border border-slate-300/60 dark:border-white/10"
                        }`}
                      >
                        {isIncome ? (
                          <ArrowDownLeft className="h-4 w-4" />
                        ) : isTransfer ? (
                          <ArrowLeftRight className="h-4 w-4" />
                        ) : isCardRepayment ? (
                          <CreditCard className="h-4 w-4" />
                        ) : (
                          <ArrowUpRight className="h-4 w-4" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs sm:text-sm font-bold text-[var(--foreground)] truncate group-hover:text-emerald-700 dark:group-hover:text-[#4edea3] transition-colors">
                          {tx.description || catName}
                        </p>
                        <p className="text-[11px] text-[var(--foreground-muted)] flex items-center gap-1.5">
                          <span>{catName}</span>
                          <span>·</span>
                          <span className="font-mono text-[10px] text-[var(--foreground-subtle)]">{tx.transaction_date}</span>
                        </p>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span
                        className={`text-sm sm:text-base font-black tabular-nums ${
                          isIncome
                            ? "text-emerald-700 dark:text-[#4edea3]"
                            : isTransfer || isCardRepayment
                            ? "text-cyan-700 dark:text-cyan-300"
                            : "text-[var(--foreground)]"
                        }`}
                      >
                        {isIncome ? "+" : isTransfer || isCardRepayment ? "" : "−"}
                        {formatRupees(tx.amount_paise)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* 6. Minimal Shortcuts to Dedicated Management Areas */}
        <section className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-slate-400" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--foreground-muted)]">
                Management Modules
              </h2>
            </div>
            <span className="text-[10px] text-[var(--foreground-subtle)]">
              Dedicated workspaces
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
            <Link
              href="/accounts"
              className="aura-panel group p-4 sm:p-5 rounded-2xl hover:border-emerald-500/40 hover:-translate-y-0.5 transition-all flex items-center justify-between"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 group-hover:scale-105 transition-transform">
                  <Landmark className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-[var(--foreground)] group-hover:text-emerald-700 dark:group-hover:text-emerald-300 transition-colors truncate">
                    Accounts & Reserves
                  </h3>
                  <p className="text-[11px] text-[var(--foreground-muted)] truncate">
                    {accountRows.length} {accountRows.length === 1 ? "account" : "accounts"} & wallets
                  </p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-[var(--foreground-subtle)] group-hover:text-emerald-600 dark:group-hover:text-emerald-300 group-hover:translate-x-0.5 transition-all shrink-0 ml-2" />
            </Link>

            <Link
              href="/budgets"
              className="aura-panel group p-4 sm:p-5 rounded-2xl hover:border-purple-500/40 hover:-translate-y-0.5 transition-all flex items-center justify-between"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30 group-hover:scale-105 transition-transform">
                  <PieChart className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-[var(--foreground)] group-hover:text-purple-700 dark:group-hover:text-purple-300 transition-colors truncate">
                    Budgets & Limits
                  </h3>
                  <p className="text-[11px] text-[var(--foreground-muted)] truncate">
                    {budgetOverview.categoriesCount} {budgetOverview.categoriesCount === 1 ? "category" : "categories"} tracked
                  </p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-[var(--foreground-subtle)] group-hover:text-purple-600 dark:group-hover:text-purple-300 group-hover:translate-x-0.5 transition-all shrink-0 ml-2" />
            </Link>

            <Link
              href="/cards"
              className="aura-panel group p-4 sm:p-5 rounded-2xl hover:border-amber-500/40 hover:-translate-y-0.5 transition-all flex items-center justify-between"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 group-hover:scale-105 transition-transform">
                  <CreditCard className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-[var(--foreground)] group-hover:text-amber-700 dark:group-hover:text-amber-300 transition-colors truncate">
                    Cards & Billing
                  </h3>
                  <p className="text-[11px] text-[var(--foreground-muted)] truncate">
                    {cardRows.length} credit lines
                  </p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-[var(--foreground-subtle)] group-hover:text-amber-600 dark:group-hover:text-amber-300 group-hover:translate-x-0.5 transition-all shrink-0 ml-2" />
            </Link>

            <Link
              href="/emi"
              className="aura-panel group p-4 sm:p-5 rounded-2xl hover:border-cyan-500/40 hover:-translate-y-0.5 transition-all flex items-center justify-between"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-700 dark:text-cyan-400 border border-cyan-500/30 group-hover:scale-105 transition-transform">
                  <Percent className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-[var(--foreground)] group-hover:text-cyan-700 dark:group-hover:text-cyan-300 transition-colors truncate">
                    Loans & Amortization
                  </h3>
                  <p className="text-[11px] text-[var(--foreground-muted)] truncate">
                    {standaloneLoans.length} active term loans
                  </p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-[var(--foreground-subtle)] group-hover:text-cyan-600 dark:group-hover:text-cyan-300 group-hover:translate-x-0.5 transition-all shrink-0 ml-2" />
            </Link>

            <Link
              href="/transactions"
              className="aura-panel group p-4 sm:p-5 rounded-2xl hover:border-indigo-500/40 hover:-translate-y-0.5 transition-all flex items-center justify-between"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30 group-hover:scale-105 transition-transform">
                  <ArrowLeftRight className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-[var(--foreground)] group-hover:text-indigo-700 dark:group-hover:text-indigo-300 transition-colors truncate">
                    Transactions & Ledger
                  </h3>
                  <p className="text-[11px] text-[var(--foreground-muted)] truncate">
                    Analysis & full history
                  </p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-[var(--foreground-subtle)] group-hover:text-indigo-600 dark:group-hover:text-indigo-300 group-hover:translate-x-0.5 transition-all shrink-0 ml-2" />
            </Link>
          </div>
        </section>

        <p className="pt-6 text-center text-xs leading-5 text-slate-500">
          AURA Wealth · Private financial telemetry. Calculations computed from verified database records.
        </p>
      </div>

      {/* Floating Bottom Navigation */}
      <AuraBottomNav />
    </main>
  );
}

export default function Home(props: {
  searchParams?: Promise<{
    error?: string;
    statement_saved?: string;
    payment_recorded?: string;
  }>;
}) {
  return (
    <Suspense fallback={<DashboardLoading />}>
      <DashboardContent searchParams={props.searchParams} />
    </Suspense>
  );
}
