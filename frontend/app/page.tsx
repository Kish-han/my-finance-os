import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { calculateAccountBalance } from "@/lib/finance/balances";
import type {
  FinancialAccount,
  Transaction,
} from "@/lib/finance/types";
import { logout } from "./login/actions";

type TransactionType =
  | "income"
  | "expense"
  | "transfer"
  | "card_purchase"
  | "card_payment";

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
  description: string;
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
  status: "active" | "foreclosed" | "closed";
  emi_amount_paise: number | string;
  current_outstanding_principal_paise: number | string;
  outstanding_as_of_date: string;
  next_due_date: string | null;
};

type EmiPaymentRow = {
  debt_id: string;
  payment_date: string;
  principal_component_paise: number | string | null;
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

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
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
    description: row.description,
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
  }
}

async function loadTransactions(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<TransactionLoadResult> {
  const allRows: TransactionRow[] = [];
  const pageSize = 500;

  // Fetch all pages so old transactions are not silently omitted
  // from account balance calculations.
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from("transactions")
      .select(
        "id, transaction_date, description, amount_paise, transaction_type, account_id, from_account_id, to_account_id, credit_card_id, category_id"
      )
      .eq("user_id", userId)
      .order("transaction_date", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) {
      return { rows: [], failed: true };
    }

    const batch = (data ?? []) as unknown as TransactionRow[];
    allRows.push(...batch);

    if (batch.length < pageSize) {
      return { rows: allRows, failed: false };
    }
  }
}

function calculateCardOutstanding(
  card: CreditCardRow,
  transactions: TransactionRow[]
): number {
  let outstanding = Number(card.opening_outstanding_paise);

  for (const transaction of transactions) {
    if (transaction.transaction_date < card.opening_outstanding_date) {
      continue;
    }

    const amount = Number(transaction.amount_paise);

    if (
      transaction.transaction_type === "card_purchase" &&
      transaction.credit_card_id === card.id
    ) {
      outstanding += amount;
    } else if (
      transaction.transaction_type === "card_payment" &&
      transaction.credit_card_id === card.id
    ) {
      outstanding -= amount;
    }
  }

  // This shows debt outstanding, not any credit balance from an overpayment.
  return Math.max(0, outstanding);
}

function calculateEmiPrincipal(
  debt: EmiDebtRow,
  payments: EmiPaymentRow[]
): number {
  let outstanding = Number(
    debt.current_outstanding_principal_paise
  );

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

function transactionLabel(type: TransactionType): string {
  switch (type) {
    case "income":
      return "Income";
    case "expense":
      return "Expense";
    case "transfer":
      return "Transfer";
    case "card_purchase":
      return "Card purchase";
    case "card_payment":
      return "Card repayment";
  }
}

function transactionSign(type: TransactionType): string {
  switch (type) {
    case "income":
      return "+";
    case "expense":
    case "card_purchase":
    case "card_payment":
      return "−";
    case "transfer":
      return "↔ ";
  }
}

function AmountCard({
  label,
  amount,
  note,
}: {
  label: string;
  amount: string;
  note: string;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-3 break-words text-xl font-bold tracking-tight sm:text-2xl">
        {amount}
      </p>
      <p className="mt-2 text-xs leading-5 text-slate-500">{note}</p>
    </section>
  );
}

async function DashboardContent() {
  // All personal financial information must load at request time.
  await connection();

  const supabase = await createClient();

  const { data: authData, error: authError } =
    await supabase.auth.getClaims();

  const userId = authData?.claims?.sub;

  if (authError || typeof userId !== "string") {
    redirect("/login");
  }

  const [
    accountsResult,
    cardsResult,
    debtsResult,
    paymentsResult,
    transactionResult,
  ] = await Promise.all([
    supabase
      .from("accounts")
      .select(
        "id, name, account_type, institution, opening_balance_paise, opening_balance_date, is_archived"
      )
      .eq("user_id", userId)
      .eq("is_archived", false)
      .order("created_at", { ascending: false }),

    supabase
      .from("credit_cards")
      .select(
        "id, name, bank_name, last_four_digits, credit_limit_paise, opening_outstanding_paise, opening_outstanding_date, statement_day, payment_due_day"
      )
      .eq("user_id", userId)
      .eq("is_archived", false)
      .order("created_at", { ascending: false }),

    supabase
      .from("emi_debts")
      .select(
        "id, name, lender_name, debt_type, status, emi_amount_paise, current_outstanding_principal_paise, outstanding_as_of_date, next_due_date"
      )
      .eq("user_id", userId)
      .eq("status", "active")
      .order("created_at", { ascending: false }),

    supabase
      .from("emi_payments")
      .select("debt_id, payment_date, principal_component_paise")
      .eq("user_id", userId)
      .order("payment_date", { ascending: true }),

    loadTransactions(supabase, userId),
  ]);

  const accountRows =
    (accountsResult.data ?? []) as unknown as AccountRow[];

  const cardRows =
    (cardsResult.data ?? []) as unknown as CreditCardRow[];

  const debtRows =
    (debtsResult.data ?? []) as unknown as EmiDebtRow[];

  const emiPaymentRows =
    (paymentsResult.data ?? []) as unknown as EmiPaymentRow[];

  const transactionRows = transactionResult.rows;

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

  const totalBankCashPaise = accountBalances.reduce(
    (total, item) => total + item.balancePaise,
    0
  );

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

  const indiaToday = indiaDate();
  const monthStart = `${indiaToday.slice(0, 7)}-01`;

  const monthLabel = new Intl.DateTimeFormat("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(new Date(`${indiaToday}T12:00:00+05:30`));

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
    outstandingPaise: calculateEmiPrincipal(debt, emiPaymentRows),
  }));

  const totalEmiPrincipalPaise = activeEmis.reduce(
    (total, item) => total + item.outstandingPaise,
    0
  );

  const monthlyEmiCommitmentPaise = debtRows.reduce(
    (total, debt) => total + Number(debt.emi_amount_paise),
    0
  );

  const nextEmi = debtRows
    .filter(
      (debt) =>
        debt.next_due_date && debt.next_due_date >= indiaToday
    )
    .sort((a, b) =>
      (a.next_due_date ?? "").localeCompare(b.next_due_date ?? "")
    )[0];

  const recentTransactions = [...transactionRows]
    .sort((a, b) =>
      b.transaction_date.localeCompare(a.transaction_date)
    )
    .slice(0, 5);

  const hasQueryError =
    Boolean(accountsResult.error) ||
    Boolean(cardsResult.error) ||
    Boolean(debtsResult.error) ||
    Boolean(paymentsResult.error) ||
    transactionResult.failed;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-5xl px-4 pb-10 sm:px-6">
        <header className="flex items-center justify-between gap-3 py-5">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-violet-600">
              Your personal finance
            </p>
            <h1 className="mt-1 text-xl font-bold tracking-tight sm:text-2xl">
              My Finance OS
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/accounts"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-100"
            >
              Accounts
            </Link>

            <form action={logout}>
              <button
                type="submit"
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-100"
              >
                Sign out
              </button>
            </form>
          </div>
        </header>

        {hasQueryError && (
          <section
            role="alert"
            className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900"
          >
            Some financial records could not be loaded. Totals depending
            on those records may be unavailable. Check the database
            connection and access policies before relying on these figures.
          </section>
        )}

        <section className="relative overflow-hidden rounded-3xl bg-slate-900 p-5 text-white sm:p-8">
          <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-violet-500/20 blur-3xl" />

          <div className="relative">
            <p className="text-sm text-slate-300">
              Total bank &amp; cash balances
            </p>

            <h2 className="mt-3 break-words text-3xl font-bold tracking-tight sm:text-4xl">
              {canCalculateBankBalances
                ? formatRupees(totalBankCashPaise)
                : "Unavailable"}
            </h2>

            <p className="mt-2 text-sm leading-5 text-slate-400">
              {accountRows.length} active{" "}
              {accountRows.length === 1 ? "account" : "accounts"} ·{" "}
              Calculated from opening balances and recorded transactions
            </p>

            <div className="mt-6 grid grid-cols-2 gap-3 border-t border-white/10 pt-5">
              <div className="rounded-2xl bg-white/10 p-4">
                <p className="text-sm text-slate-300">Income this month</p>
                <p className="mt-2 break-words text-lg font-bold sm:text-xl">
                  {canCalculateMonthlyActivity
                    ? formatRupees(monthlyIncomePaise)
                    : "Unavailable"}
                </p>
              </div>

              <div className="rounded-2xl bg-white/10 p-4">
                <p className="text-sm text-slate-300">Spent this month</p>
                <p className="mt-2 break-words text-lg font-bold sm:text-xl">
                  {canCalculateMonthlyActivity
                    ? formatRupees(monthlyExpensesPaise)
                    : "Unavailable"}
                </p>
              </div>
            </div>
          </div>
        </section>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <AmountCard
            label="Credit-card outstanding"
            amount={
              canCalculateCardBalances
                ? formatRupees(totalCardOutstandingPaise)
                : "Unavailable"
            }
            note={
              canCalculateCardBalances
                ? `${cardRows.length} active ${cardRows.length === 1 ? "card" : "cards"} tracked`
                : "Card data could not be loaded"
            }
          />

          <AmountCard
            label="Active EMI principal"
            amount={
              canCalculateEmiBalances
                ? formatRupees(totalEmiPrincipalPaise)
                : "Unavailable"
            }
            note={
              canCalculateEmiBalances
                ? `${activeEmis.length} active ${activeEmis.length === 1 ? "EMI plan" : "EMI plans"}`
                : "EMI data could not be loaded"
            }
          />
        </div>

        <section className="mt-7">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">Your accounts</h2>
              <p className="mt-1 text-sm text-slate-500">
                Bank balances and cash wallets
              </p>
            </div>

            <Link
              href="/accounts"
              className="text-sm font-semibold text-violet-700 hover:text-violet-900"
            >
              Manage
            </Link>
          </div>

          <div className="mt-4 space-y-3">
            {accountsResult.error ? (
              <div className="rounded-2xl border border-rose-200 bg-white p-4 text-sm text-rose-700">
                Accounts couldn't be loaded.
              </div>
            ) : accountBalances.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-5">
                <p className="font-semibold">No accounts added yet</p>
                <p className="mt-1 text-sm leading-5 text-slate-500">
                  Add your first bank account or cash wallet to begin.
                </p>
                <Link
                  href="/accounts"
                  className="mt-3 inline-block text-sm font-semibold text-violet-700"
                >
                  Add an account →
                </Link>
              </div>
            ) : (
              accountBalances.map(({ account, balancePaise }) => (
                <article
                  key={account.id}
                  className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-700">
                    {account.type === "bank" ? "▤" : "₹"}
                  </div>

                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-semibold">
                      {account.name}
                    </h3>
                    <p className="mt-1 truncate text-xs text-slate-500">
                      {account.institution || "Personal account"} ·{" "}
                      {account.type === "bank" ? "Bank" : "Cash"}
                    </p>
                  </div>

                  <p className="shrink-0 text-right text-sm font-bold">
                    {canCalculateBankBalances
                      ? formatRupees(balancePaise)
                      : "Unavailable"}
                  </p>
                </article>
              ))
            )}
          </div>
        </section>

        <section className="mt-7">
          <div>
            <h2 className="text-lg font-bold">Credit cards</h2>
            <p className="mt-1 text-sm text-slate-500">
              Outstanding balances and limits
            </p>
          </div>

          <div className="mt-4 space-y-3">
            {cardsResult.error || transactionResult.failed ? (
              <div className="rounded-2xl border border-rose-200 bg-white p-4 text-sm text-rose-700">
                Credit-card balances couldn't be calculated.
              </div>
            ) : cardBalances.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-5">
                <p className="font-semibold">No credit cards tracked yet</p>
                <p className="mt-1 text-sm leading-5 text-slate-500">
                  We'll add card registration, credit limits, statement
                  dates and due-date tracking next.
                </p>
              </div>
            ) : (
              cardBalances.map(({ card, outstandingPaise }) => (
                <article
                  key={card.id}
                  className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-semibold">{card.name}</h3>
                      <p className="mt-1 text-sm text-slate-500">
                        {card.bank_name}
                        {card.last_four_digits
                          ? ` · •••• ${card.last_four_digits}`
                          : ""}
                      </p>
                    </div>
                    <p className="shrink-0 text-sm font-bold">
                      {formatRupees(outstandingPaise)}
                    </p>
                  </div>

                  <div className="mt-3 flex justify-between gap-3 text-xs text-slate-500">
                    <span>Credit limit</span>
                    <span>{formatRupees(card.credit_limit_paise)}</span>
                  </div>

                  {card.payment_due_day && (
                    <p className="mt-2 text-xs text-slate-500">
                      Usual payment due day: {card.payment_due_day}
                    </p>
                  )}
                </article>
              ))
            )}
          </div>
        </section>

        <section className="mt-7">
          <div>
            <h2 className="text-lg font-bold">EMI commitments</h2>
            <p className="mt-1 text-sm text-slate-500">
              Active loans and repayments
            </p>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <AmountCard
              label="Monthly EMI total"
              amount={
                canCalculateEmiBalances
                  ? formatRupees(monthlyEmiCommitmentPaise)
                  : "Unavailable"
              }
              note="Scheduled payments for active plans"
            />

            <AmountCard
              label="Next EMI due"
              amount={
                canCalculateEmiBalances
                  ? nextEmi?.next_due_date
                    ? formatDate(nextEmi.next_due_date)
                    : "Not set"
                  : "Unavailable"
              }
              note={nextEmi?.name ?? "No upcoming EMI date recorded"}
            />
          </div>

          <div className="mt-3 space-y-3">
            {debtsResult.error || paymentsResult.error ? (
              <div className="rounded-2xl border border-rose-200 bg-white p-4 text-sm text-rose-700">
                EMI information couldn't be loaded.
              </div>
            ) : activeEmis.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-5">
                <p className="font-semibold">No EMI plans recorded yet</p>
                <p className="mt-1 text-sm leading-5 text-slate-500">
                  Your EMI manager will include tenure, instalments paid,
                  interest, outstanding principal and foreclosure details.
                </p>
              </div>
            ) : (
              activeEmis.map(({ debt, outstandingPaise }) => (
                <article
                  key={debt.id}
                  className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-semibold">{debt.name}</h3>
                      <p className="mt-1 text-sm text-slate-500">
                        {debt.lender_name}
                      </p>
                    </div>
                    <p className="shrink-0 text-sm font-bold">
                      {formatRupees(outstandingPaise)}
                    </p>
                  </div>

                  <div className="mt-3 flex justify-between gap-3 text-sm">
                    <span className="text-slate-500">Monthly EMI</span>
                    <span className="font-medium">
                      {formatRupees(debt.emi_amount_paise)}
                    </span>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>

        <section className="mt-7">
          <div>
            <h2 className="text-lg font-bold">Recent transactions</h2>
            <p className="mt-1 text-sm text-slate-500">
              Income, spending, transfers and card activity
            </p>
          </div>

          <div className="mt-4 space-y-3">
            {transactionResult.failed ? (
              <div className="rounded-2xl border border-rose-200 bg-white p-4 text-sm text-rose-700">
                Transactions couldn't be loaded.
              </div>
            ) : recentTransactions.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-5">
                <p className="font-semibold">No transactions recorded yet</p>
                <p className="mt-1 text-sm leading-5 text-slate-500">
                  Your dashboard will calculate income and spending when
                  you start recording transactions.
                </p>
              </div>
            ) : (
              recentTransactions.map((transaction) => {
                const isIncome =
                  transaction.transaction_type === "income";
                const isTransfer =
                  transaction.transaction_type === "transfer";

                return (
                  <article
                    key={transaction.id}
                    className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-lg">
                      {isIncome ? "↙" : isTransfer ? "⇄" : "↗"}
                    </div>

                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-sm font-semibold">
                        {transaction.description}
                      </h3>
                      <p className="mt-1 text-xs text-slate-500">
                        {transactionLabel(transaction.transaction_type)}{" "}
                        · {formatDate(transaction.transaction_date)}
                      </p>
                    </div>

                    <p
                      className={`shrink-0 text-right text-sm font-bold ${
                        isIncome ? "text-emerald-600" : "text-slate-900"
                      }`}
                    >
                      {transactionSign(transaction.transaction_type)}
                      {formatRupees(transaction.amount_paise)}
                    </p>
                  </article>
                );
              })
            )}
          </div>
        </section>

        <p className="mt-8 text-center text-xs leading-5 text-slate-400">
          My Finance OS · Figures are calculated from saved records.
          Card-linked EMI balances are displayed separately until their
          relationship is reconciled for net-worth calculations.
        </p>
      </div>
    </main>
  );
}

export default function Home() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-slate-50 p-6">
          <p className="text-sm text-slate-500">
            Loading your financial overview...
          </p>
        </main>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}