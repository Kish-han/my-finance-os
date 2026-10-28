import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  createCardPayment,
  createCardPurchase,
} from "./actions";
import {
  CreditCard,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowLeft,
  ShoppingBag,
  Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

type ActivityPageProps = {
  searchParams: Promise<{
    error?: string;
    created?: string;
    card_id?: string;
  }>;
};

type CreditCardRow = {
  id: string;
  name: string;
  bank_name: string;
  last_four_digits: string | null;
  opening_outstanding_paise: number | string;
  opening_outstanding_date: string;
  credit_limit_paise: number | string;
};

type AccountRow = {
  id: string;
  name: string;
  institution: string | null;
  account_type: "bank" | "cash";
  opening_balance_date: string;
};

type CardActivityRow = {
  id: string;
  transaction_date: string;
  description: string;
  amount_paise: number | string;
  transaction_type: "card_purchase" | "card_payment" | string;
  credit_card_id: string | null;
  from_account_id: string | null;
};

function formatRupees(paise: number | string): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(paise) / 100);
}

function indiaToday(): string {
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

function displayDate(value: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}

function calculateOutstanding(
  card: CreditCardRow,
  activities: CardActivityRow[]
): number {
  let outstanding = Number(card.opening_outstanding_paise);

  for (const activity of activities) {
    if (
      activity.credit_card_id !== card.id ||
      activity.transaction_date < card.opening_outstanding_date
    ) {
      continue;
    }

    const amount = Number(activity.amount_paise);

    if (activity.transaction_type === "card_purchase") {
      outstanding += amount;
    } else if (activity.transaction_type === "card_payment") {
      outstanding -= amount;
    }
  }

  return Math.max(0, outstanding);
}

async function loadCardActivity(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<{ rows: CardActivityRow[]; failed: boolean }> {
  const rows: CardActivityRow[] = [];
  const pageSize = 1000;

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from("transactions")
      .select(
        "id, transaction_date, description, amount_paise, transaction_type, credit_card_id, from_account_id"
      )
      .eq("user_id", userId)
      .in("transaction_type", ["card_purchase", "card_payment"])
      .order("transaction_date", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) {
      return { rows: [], failed: true };
    }

    const batch = (data ?? []) as unknown as CardActivityRow[];
    rows.push(...batch);

    if (batch.length < pageSize) {
      return { rows, failed: false };
    }
  }
}

async function ActivityContent({
  searchParams,
}: ActivityPageProps) {
  await connection();

  const params = await searchParams;
  const supabase = await createClient();

  const { data: authData, error: authError } =
    await supabase.auth.getClaims();

  const userId = authData?.claims?.sub;

  if (authError || typeof userId !== "string") {
    redirect("/login");
  }

  const [cardsResult, accountsResult, activityResult] =
    await Promise.all([
      supabase
        .from("credit_cards")
        .select(
          "id, name, bank_name, last_four_digits, opening_outstanding_paise, opening_outstanding_date, credit_limit_paise"
        )
        .eq("user_id", userId)
        .eq("is_archived", false)
        .order("name"),

      supabase
        .from("accounts")
        .select(
          "id, name, institution, account_type, opening_balance_date"
        )
        .eq("user_id", userId)
        .eq("is_archived", false)
        .order("name"),

      loadCardActivity(supabase, userId),
    ]);

  const cards =
    (cardsResult.data ?? []) as unknown as CreditCardRow[];

  const accounts =
    (accountsResult.data ?? []) as unknown as AccountRow[];

  const activities = activityResult.rows;

  const errorMessages: Record<string, string> = {
    "invalid-input":
      "Check the description, amount, card, account and date.",
    "invalid-card-or-date":
      "The selected card or account is invalid, or the transaction date is before its recorded opening date.",
    "payment-exceeds-outstanding":
      "The repayment is greater than the recorded card outstanding balance.",
    "save-failed":
      "We couldn't save the activity. Please check the database connection and try again.",
  };

  const canCalculate =
    !cardsResult.error && !activityResult.failed;

  const outstandingByCard = new Map(
    cards.map((card) => [
      card.id,
      calculateOutstanding(card, activities),
    ])
  );

  const sortedActivities = [...activities]
    .sort((a, b) => {
      const dateOrder = b.transaction_date.localeCompare(
        a.transaction_date
      );

      return dateOrder || b.id.localeCompare(a.id);
    })
    .slice(0, 20);

  const cardNames = new Map(
    cards.map((card) => [card.id, card.name])
  );

  const accountNames = new Map(
    accounts.map((account) => [
      account.id,
      account.name,
    ])
  );

  const earliestAccountOpeningDate =
    accounts.length > 0
      ? accounts.reduce(
          (earliest, account) =>
            account.opening_balance_date < earliest
              ? account.opening_balance_date
              : earliest,
          accounts[0].opening_balance_date
        )
      : "";

  const accountsError = Boolean(accountsResult.error);
  const cardsError = Boolean(cardsResult.error);
  const activityError = activityResult.failed;

  return (
    <main className="relative min-h-screen bg-[#07090e] px-4 py-8 text-slate-100 selection:bg-amber-500/30 selection:text-amber-200">
      {/* Ambient glowing lighting */}
      <div className="pointer-events-none fixed -left-32 top-10 h-96 w-96 rounded-full bg-rose-500/10 blur-[130px] animate-pulse-glow" />
      <div className="pointer-events-none fixed -right-32 top-1/4 h-[30rem] w-[30rem] rounded-full bg-emerald-500/10 blur-[140px] animate-pulse-glow" style={{ animationDelay: "2s" }} />
      <div className="pointer-events-none fixed bottom-10 left-1/3 h-80 w-80 rounded-full bg-amber-500/10 blur-[120px] animate-pulse-glow" style={{ animationDelay: "4s" }} />

      <div className="relative mx-auto max-w-4xl space-y-8">
        {/* Apple-style floating frosted pill nav */}
        <header className="sticky top-4 z-40 flex items-center justify-between rounded-full border border-white/10 bg-[#0e131f]/75 px-5 py-2.5 backdrop-blur-2xl shadow-2xl shadow-black/50 transition-all">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 via-amber-500 to-amber-700 text-slate-950 shadow-lg shadow-amber-500/30 ring-1 ring-white/40">
              <CreditCard className="h-4 w-4" />
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400">
                REVOLVING CREDIT LEDGER
              </span>
              <h1 className="text-sm font-black tracking-tight text-white sm:text-base">
                Card Activity
              </h1>
            </div>
          </div>

          <nav className="flex items-center gap-2">
            <Link
              href="/cards"
              className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-xs font-medium text-slate-300 backdrop-blur-md transition-all hover:border-amber-400/40 hover:bg-white/10 hover:text-white"
            >
              <span>My Cards</span>
            </Link>

            <div className="h-4 w-px bg-white/10" />

            <Link
              href="/"
              className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-xs font-medium text-slate-300 backdrop-blur-md transition-all hover:border-white/20 hover:bg-white/10 hover:text-white"
            >
              <ArrowLeft className="h-3 w-3" />
              <span>Dashboard</span>
            </Link>
          </nav>
        </header>

        {/* Status notifications */}
        {params.created === "purchase" && (
          <div
            role="status"
            className="flex items-center gap-3 rounded-2xl border border-rose-500/30 bg-rose-950/40 px-5 py-4 text-xs sm:text-sm font-semibold text-rose-300 shadow-xl backdrop-blur-xl animate-float-slow"
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-rose-500/20 text-rose-400">
              <ArrowUpRight className="h-4 w-4" />
            </div>
            <p>Card purchase recorded. Debt increased; bank balances preserved.</p>
          </div>
        )}

        {params.created === "payment" && (
          <div
            role="status"
            className="flex items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-950/40 px-5 py-4 text-xs sm:text-sm font-semibold text-emerald-300 shadow-xl backdrop-blur-xl animate-float-slow"
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
              <ArrowDownLeft className="h-4 w-4" />
            </div>
            <p>Card repayment recorded successfully. Debt reduced from paying account.</p>
          </div>
        )}

        {params.error && (
          <div
            role="alert"
            className="rounded-2xl border border-rose-500/30 bg-rose-950/40 p-4 text-sm font-semibold text-rose-300 backdrop-blur-xl"
          >
            {errorMessages[params.error] ?? "Something went wrong."}
          </div>
        )}

        {(cardsError || accountsError || activityError) && (
          <div
            role="alert"
            className="rounded-2xl border border-amber-500/30 bg-amber-950/40 p-4 text-sm text-amber-300 backdrop-blur-xl"
          >
            Some data could not be loaded. Check connection before recording a repayment so the outstanding balance can be verified correctly.
          </div>
        )}

        {/* Floating Hero Outstanding Card */}
        <section className="relative overflow-hidden rounded-[2.5rem] border border-amber-500/20 bg-gradient-to-br from-[#121626]/90 via-[#0a0d16]/90 to-[#07090e]/95 p-7 sm:p-9 shadow-2xl cred-glow-amber animate-float-slow backdrop-blur-2xl">
          <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-amber-500/20 blur-3xl" />
          <div className="pointer-events-none absolute -left-20 -bottom-20 h-64 w-64 rounded-full bg-rose-500/15 blur-3xl" />

          <div className="relative z-10 space-y-4">
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-300">
                Total Outstanding Across Cards
              </span>
            </div>

            <div className="text-4xl sm:text-6xl font-black tracking-tight text-white tabular-nums">
              {canCalculate
                ? formatRupees(
                    cards.reduce(
                      (total, card) =>
                        total + (outstandingByCard.get(card.id) ?? 0),
                      0
                    )
                  )
                : "Unavailable"}
            </div>

            <p className="text-xs sm:text-sm text-slate-400">
              Computed from card opening balances, recorded purchases, and verified repayments.
            </p>
          </div>
        </section>

        {/* Dual Actions Grid: Purchase & Repayment Forms */}
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
          {/* Card Purchase Form (Spends credit limit) */}
          <section className="apple-panel p-6 sm:p-7 space-y-5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-500/15 text-rose-400 ring-1 ring-rose-500/30">
                <ShoppingBag className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-base font-bold tracking-tight text-white">
                  Record Card Purchase
                </h2>
                <p className="text-xs text-slate-400">
                  Increases revolving debt. Doesn&apos;t deduct bank cash.
                </p>
              </div>
            </div>

            {cardsError ? (
              <p className="text-sm text-rose-400">Credit cards couldn&apos;t be loaded.</p>
            ) : cards.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-6 text-center">
                <p className="text-xs font-semibold text-slate-300">
                  Add a credit card before recording a purchase.
                </p>
                <Link
                  href="/cards"
                  className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 transition-all hover:bg-amber-400"
                >
                  Add a credit card →
                </Link>
              </div>
            ) : (
              <form action={createCardPurchase} className="space-y-4">
                <div>
                  <label
                    htmlFor="purchase-card"
                    className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300"
                  >
                    Credit card
                  </label>
                  <select
                    id="purchase-card"
                    name="creditCardId"
                    required
                    defaultValue={params.card_id ?? ""}
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition-all focus:border-rose-400 focus:bg-white/10 focus:ring-4 focus:ring-rose-400/20"
                  >
                    <option value="" disabled className="bg-slate-900 text-slate-400">
                      Choose a card
                    </option>
                    {cards.map((card) => (
                      <option key={card.id} value={card.id} className="bg-slate-900 text-white">
                        {card.name} · {card.bank_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="purchase-amount"
                    className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300"
                  >
                    Amount (₹)
                  </label>
                  <input
                    id="purchase-amount"
                    name="amount"
                    type="number"
                    inputMode="decimal"
                    min="0.01"
                    step="0.01"
                    required
                    placeholder="e.g. 1500"
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold tabular-nums text-white placeholder:text-slate-500 outline-none transition-all focus:border-rose-400 focus:bg-white/10 focus:ring-4 focus:ring-rose-400/20"
                  />
                </div>

                <div>
                  <label
                    htmlFor="purchase-description"
                    className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300"
                  >
                    What did you buy?
                  </label>
                  <input
                    id="purchase-description"
                    name="description"
                    required
                    maxLength={160}
                    placeholder="e.g. Flight tickets, Groceries"
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none transition-all focus:border-rose-400 focus:bg-white/10 focus:ring-4 focus:ring-rose-400/20"
                  />
                </div>

                <div>
                  <label
                    htmlFor="purchase-category"
                    className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300"
                  >
                    Spending category
                  </label>
                  <input
                    id="purchase-category"
                    name="category"
                    required
                    maxLength={60}
                    placeholder="e.g. Travel, Food & dining"
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none transition-all focus:border-rose-400 focus:bg-white/10 focus:ring-4 focus:ring-rose-400/20"
                  />
                </div>

                <div>
                  <label
                    htmlFor="purchase-date"
                    className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300"
                  >
                    Purchase date
                  </label>
                  <input
                    id="purchase-date"
                    name="transactionDate"
                    type="date"
                    required
                    max={indiaToday()}
                    defaultValue={indiaToday()}
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition-all focus:border-rose-400 focus:bg-white/10 focus:ring-4 focus:ring-rose-400/20"
                  />
                </div>

                <button
                  type="submit"
                  disabled={accountsError || cardsError || activityError}
                  className="w-full rounded-xl bg-gradient-to-r from-rose-600 via-rose-500 to-rose-700 py-3.5 text-sm font-bold text-white shadow-lg shadow-rose-950/40 transition-all hover:brightness-110 active:scale-[0.99] disabled:opacity-50 cursor-pointer"
                >
                  Save Card Purchase
                </button>
              </form>
            )}
          </section>

          {/* Card Repayment Form (Clears card debt via account) */}
          <section className="apple-panel p-6 sm:p-7 space-y-5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30">
                <Wallet className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-base font-bold tracking-tight text-white">
                  Record Card Repayment
                </h2>
                <p className="text-xs text-slate-400">
                  Deducts bank cash and eliminates card debt.
                </p>
              </div>
            </div>

            {cardsError || accountsError ? (
              <p className="text-sm text-rose-400">Cards or accounts couldn&apos;t be loaded.</p>
            ) : cards.length === 0 || accounts.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-6 text-center space-y-3">
                <p className="text-xs font-semibold text-slate-300">
                  Add a credit card and bank account before recording a repayment.
                </p>
                <div className="flex justify-center gap-2">
                  {cards.length === 0 && (
                    <Link
                      href="/cards"
                      className="rounded-full bg-amber-500 px-3.5 py-1.5 text-xs font-bold text-slate-950"
                    >
                      Add Card →
                    </Link>
                  )}
                  {accounts.length === 0 && (
                    <Link
                      href="/accounts"
                      className="rounded-full bg-emerald-500 px-3.5 py-1.5 text-xs font-bold text-slate-950"
                    >
                      Add Account →
                    </Link>
                  )}
                </div>
              </div>
            ) : (
              <form action={createCardPayment} className="space-y-4">
                <div>
                  <label
                    htmlFor="payment-card"
                    className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300"
                  >
                    Credit card to pay
                  </label>
                  <select
                    id="payment-card"
                    name="creditCardId"
                    required
                    defaultValue={params.card_id ?? ""}
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition-all focus:border-emerald-400 focus:bg-white/10 focus:ring-4 focus:ring-emerald-400/20"
                  >
                    <option value="" disabled className="bg-slate-900 text-slate-400">
                      Choose a card
                    </option>
                    {cards.map((card) => (
                      <option key={card.id} value={card.id} className="bg-slate-900 text-white">
                        {card.name} · Debt {formatRupees(outstandingByCard.get(card.id) ?? 0)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="payment-account"
                    className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300"
                  >
                    Pay from bank / cash wallet
                  </label>
                  <select
                    id="payment-account"
                    name="fromAccountId"
                    required
                    defaultValue=""
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition-all focus:border-emerald-400 focus:bg-white/10 focus:ring-4 focus:ring-emerald-400/20"
                  >
                    <option value="" disabled className="bg-slate-900 text-slate-400">
                      Choose payment source
                    </option>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id} className="bg-slate-900 text-white">
                        {account.name} {account.institution ? ` · ${account.institution}` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="payment-amount"
                    className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300"
                  >
                    Amount paid (₹)
                  </label>
                  <input
                    id="payment-amount"
                    name="amount"
                    type="number"
                    inputMode="decimal"
                    min="0.01"
                    step="0.01"
                    required
                    placeholder="e.g. 5000"
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold tabular-nums text-white placeholder:text-slate-500 outline-none transition-all focus:border-emerald-400 focus:bg-white/10 focus:ring-4 focus:ring-emerald-400/20"
                  />
                </div>

                <div>
                  <label
                    htmlFor="payment-description"
                    className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300"
                  >
                    Description
                  </label>
                  <input
                    id="payment-description"
                    name="description"
                    maxLength={160}
                    defaultValue="Credit card repayment"
                    required
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none transition-all focus:border-emerald-400 focus:bg-white/10 focus:ring-4 focus:ring-emerald-400/20"
                  />
                </div>

                <div>
                  <label
                    htmlFor="payment-date"
                    className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300"
                  >
                    Payment date
                  </label>
                  <input
                    id="payment-date"
                    name="transactionDate"
                    type="date"
                    min={earliestAccountOpeningDate || undefined}
                    max={indiaToday()}
                    defaultValue={indiaToday()}
                    required
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition-all focus:border-emerald-400 focus:bg-white/10 focus:ring-4 focus:ring-emerald-400/20"
                  />
                </div>

                <button
                  type="submit"
                  disabled={accountsError || cardsError || activityError}
                  className="w-full rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 py-3.5 text-sm font-bold text-white shadow-lg shadow-emerald-950/40 transition-all hover:brightness-110 active:scale-[0.99] disabled:opacity-50 cursor-pointer"
                >
                  Save Card Repayment
                </button>
              </form>
            )}
          </section>
        </div>

        {/* Recent Card Activity Section */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
              <h2 className="text-base sm:text-lg font-bold tracking-tight text-white">
                Recent Activity ({sortedActivities.length})
              </h2>
            </div>
          </div>

          {activityError ? (
            <div className="rounded-2xl border border-rose-500/30 bg-rose-950/40 p-4 text-sm text-rose-300 backdrop-blur-xl">
              Card activity couldn&apos;t be loaded.
            </div>
          ) : sortedActivities.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.02] p-10 text-center backdrop-blur-md">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/30">
                <CreditCard className="h-7 w-7" />
              </div>
              <h3 className="mt-4 text-base font-bold text-white">No card activity yet</h3>
              <p className="mt-1 text-xs text-slate-400">
                Saved card purchases and repayments will be streamed here.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {sortedActivities.map((activity) => {
                const isPurchase = activity.transaction_type === "card_purchase";

                return (
                  <article
                    key={activity.id}
                    className="apple-panel group flex items-center justify-between gap-4 p-4 transition-all duration-300 hover:scale-[1.01] hover:border-amber-400/30"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
                          isPurchase
                            ? "bg-rose-500/15 text-rose-400 ring-1 ring-rose-500/30"
                            : "bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30"
                        }`}
                      >
                        {isPurchase ? (
                          <ArrowUpRight className="h-5 w-5" />
                        ) : (
                          <ArrowDownLeft className="h-5 w-5" />
                        )}
                      </div>

                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-white group-hover:text-amber-300 transition-colors">
                          {activity.description}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-400">
                          {isPurchase ? "Card purchase" : "Card repayment"} · {displayDate(activity.transaction_date)}
                        </p>
                        <p className="mt-0.5 truncate text-[11px] text-slate-500">
                          {cardNames.get(activity.credit_card_id ?? "") ?? "Credit card"}
                          {!isPurchase && activity.from_account_id
                            ? ` · Paid from ${accountNames.get(activity.from_account_id) ?? "Bank account"}`
                            : ""}
                        </p>
                      </div>
                    </div>

                    <div className="shrink-0 text-right">
                      <p
                        className={`text-base font-black tabular-nums ${
                          isPurchase ? "text-slate-100" : "text-emerald-400"
                        }`}
                      >
                        {isPurchase ? "+" : "−"}
                        {formatRupees(activity.amount_paise)}
                      </p>
                      <Badge
                        variant={isPurchase ? "rose" : "emerald"}
                        className="mt-1 text-[9px] uppercase px-1.5 py-0"
                      >
                        {isPurchase ? "Debit Outflow" : "Settled"}
                      </Badge>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {/* Footer */}
        <p className="pt-4 text-center text-xs leading-5 text-slate-500">
          My Finance OS · Credit Card telemetry computed from verified database records.
        </p>
      </div>
    </main>
  );
}

export default function CardActivityPage({
  searchParams,
}: ActivityPageProps) {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-[#07090e] p-6 text-slate-400">
          <div className="flex items-center gap-3">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
            <p className="text-sm">Loading card activity...</p>
          </div>
        </main>
      }
    >
      <ActivityContent searchParams={searchParams} />
    </Suspense>
  );
}
