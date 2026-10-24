
import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  createCardPayment,
  createCardPurchase,
} from "./actions";

type ActivityPageProps = {
  searchParams: Promise<{
    error?: string;
    created?: string;
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
  const pageSize = 500;

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

  const latestAccountOpeningDate =
    accounts.length > 0
      ? accounts.reduce(
          (latest, account) =>
            account.opening_balance_date > latest
              ? account.opening_balance_date
              : latest,
          accounts[0].opening_balance_date
        )
      : "";

  const accountsError = Boolean(accountsResult.error);
  const cardsError = Boolean(cardsResult.error);
  const activityError = activityResult.failed;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900">
      <div className="mx-auto max-w-xl space-y-6 pb-10">
        <header className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-violet-600">
              My Finance OS
            </p>
            <h1 className="mt-1 text-2xl font-bold">
              Card activity
            </h1>
          </div>

          <Link
            href="/cards"
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium"
          >
            My cards
          </Link>
        </header>

        {params.created === "purchase" && (
          <p
            role="status"
            className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800"
          >
            Card purchase saved successfully.
          </p>
        )}

        {params.created === "payment" && (
          <p
            role="status"
            className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800"
          >
            Card repayment saved successfully.
          </p>
        )}

        {params.error && (
          <p
            role="alert"
            className="rounded-xl bg-rose-50 p-3 text-sm leading-5 text-rose-700"
          >
            {errorMessages[params.error] ?? "Something went wrong."}
          </p>
        )}

        {(cardsError || accountsError || activityError) && (
          <p
            role="alert"
            className="rounded-xl bg-amber-50 p-3 text-sm leading-5 text-amber-900"
          >
            Some data could not be loaded. Check the connection before
            recording a repayment, so the outstanding balance can be
            verified correctly.
          </p>
        )}

        <section className="rounded-3xl bg-slate-900 p-5 text-white sm:p-6">
          <p className="text-sm text-slate-300">
            Total recorded card outstanding
          </p>

          <h2 className="mt-2 text-3xl font-bold tracking-tight">
            {canCalculate
              ? formatRupees(
                  cards.reduce(
                    (total, card) =>
                      total + (outstandingByCard.get(card.id) ?? 0),
                    0
                  )
                )
              : "Unavailable"}
          </h2>

          <p className="mt-2 text-sm leading-5 text-slate-400">
            Calculated from opening balances, card purchases and repayments.
          </p>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold">
            Record a card purchase
          </h2>

          <p className="mt-1 text-sm leading-5 text-slate-500">
            Use this when you buy something with your credit card.
            It increases card debt and spending, but does not directly
            reduce your bank balance.
          </p>

          {cardsError ? (
            <p className="mt-4 text-sm text-rose-700">
              Credit cards couldn't be loaded.
            </p>
          ) : cards.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">
              Add a credit card before recording a purchase.
            </p>
          ) : (
            <form
              action={createCardPurchase}
              className="mt-5 space-y-4"
            >
              <div>
                <label
                  htmlFor="purchase-card"
                  className="mb-2 block text-sm font-medium"
                >
                  Credit card
                </label>

                <select
                  id="purchase-card"
                  name="creditCardId"
                  required
                  defaultValue=""
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3"
                >
                  <option value="" disabled>
                    Choose a card
                  </option>

                  {cards.map((card) => (
                    <option key={card.id} value={card.id}>
                      {card.name} · {card.bank_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="purchase-amount"
                  className="mb-2 block text-sm font-medium"
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
                  placeholder="e.g. 500"
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-lg outline-none focus:border-violet-500"
                />
              </div>

              <div>
                <label
                  htmlFor="purchase-description"
                  className="mb-2 block text-sm font-medium"
                >
                  What did you buy?
                </label>

                <input
                  id="purchase-description"
                  name="description"
                  required
                  maxLength={160}
                  placeholder="e.g. Groceries"
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-violet-500"
                />
              </div>

              <div>
                <label
                  htmlFor="purchase-category"
                  className="mb-2 block text-sm font-medium"
                >
                  Spending category
                </label>

                <input
                  id="purchase-category"
                  name="category"
                  required
                  maxLength={60}
                  placeholder="e.g. Food & dining"
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-violet-500"
                />
              </div>

              <div>
                <label
                  htmlFor="purchase-date"
                  className="mb-2 block text-sm font-medium"
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
                  className="w-full rounded-xl border border-slate-200 px-4 py-3"
                />
              </div>

              <button
                type="submit"
                disabled={
                  accountsError ||
                  cardsError ||
                  activityError
                }
                className="w-full rounded-xl bg-violet-600 py-3.5 font-semibold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Save card purchase
              </button>
            </form>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold">
            Record a card repayment
          </h2>

          <p className="mt-1 text-sm leading-5 text-slate-500">
            Use this when you pay your card bill from a bank account
            or cash wallet. It reduces bank money and card debt, but
            isn't counted as a second expense.
          </p>

          {cardsError || accountsError ? (
            <p className="mt-4 text-sm text-rose-700">
              Cards or accounts couldn't be loaded.
            </p>
          ) : cards.length === 0 || accounts.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">
              Add a card and a bank or cash account before recording
              a repayment.
            </p>
          ) : (
            <form
              action={createCardPayment}
              className="mt-5 space-y-4"
            >
              <div>
                <label
                  htmlFor="payment-card"
                  className="mb-2 block text-sm font-medium"
                >
                  Credit card
                </label>

                <select
                  id="payment-card"
                  name="creditCardId"
                  required
                  defaultValue=""
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3"
                >
                  <option value="" disabled>
                    Choose a card
                  </option>

                  {cards.map((card) => (
                    <option key={card.id} value={card.id}>
                      {card.name} · Outstanding{" "}
                      {formatRupees(
                        outstandingByCard.get(card.id) ?? 0
                      )}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="payment-account"
                  className="mb-2 block text-sm font-medium"
                >
                  Pay from
                </label>

                <select
                  id="payment-account"
                  name="fromAccountId"
                  required
                  defaultValue=""
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3"
                >
                  <option value="" disabled>
                    Choose a bank or cash account
                  </option>

                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                      {account.institution
                        ? ` · ${account.institution}`
                        : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="payment-amount"
                  className="mb-2 block text-sm font-medium"
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
                  placeholder="e.g. 500"
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-lg outline-none focus:border-violet-500"
                />
              </div>

              <div>
                <label
                  htmlFor="payment-description"
                  className="mb-2 block text-sm font-medium"
                >
                  Description
                </label>

                <input
                  id="payment-description"
                  name="description"
                  maxLength={160}
                  defaultValue="Credit card repayment"
                  required
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-violet-500"
                />
              </div>

              <div>
                <label
                  htmlFor="payment-date"
                  className="mb-2 block text-sm font-medium"
                >
                  Payment date
                </label>

                <input
                  id="payment-date"
                  name="transactionDate"
                  type="date"
                  min={latestAccountOpeningDate || undefined}
                  max={indiaToday()}
                  defaultValue={indiaToday()}
                  required
                  className="w-full rounded-xl border border-slate-200 px-4 py-3"
                />
              </div>

              <button
                type="submit"
                disabled={
                  accountsError ||
                  cardsError ||
                  activityError
                }
                className="w-full rounded-xl border border-slate-200 bg-white py-3.5 font-semibold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Save card repayment
              </button>
            </form>
          )}
        </section>

        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-bold">Recent card activity</h2>
            <p className="mt-1 text-sm text-slate-500">
              Purchases and repayments saved in your database.
            </p>
          </div>

          {activityError ? (
            <p className="rounded-xl border border-rose-200 bg-white p-4 text-sm text-rose-700">
              Card activity couldn't be loaded.
            </p>
          ) : sortedActivities.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-5 text-center">
              <p className="font-semibold">No card activity yet</p>
              <p className="mt-1 text-sm text-slate-500">
                Saved purchases and repayments will appear here.
              </p>
            </div>
          ) : (
            sortedActivities.map((activity) => {
              const isPurchase =
                activity.transaction_type === "card_purchase";

              return (
                <article
                  key={activity.id}
                  className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <div
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                      isPurchase
                        ? "bg-rose-50 text-rose-700"
                        : "bg-emerald-50 text-emerald-700"
                    }`}
                  >
                    {isPurchase ? "↗" : "↙"}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">
                      {activity.description}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {isPurchase ? "Card purchase" : "Card repayment"}
                      {" · "}
                      {displayDate(activity.transaction_date)}
                    </p>
                    <p className="mt-1 truncate text-xs text-slate-400">
                      {cardNames.get(activity.credit_card_id ?? "") ??
                        "Credit card"}
                      {!isPurchase && activity.from_account_id
                        ? ` · Paid from ${
                            accountNames.get(activity.from_account_id) ??
                            "Bank account"
                          }`
                        : ""}
                    </p>
                  </div>

                  <p className="shrink-0 text-sm font-bold">
                    {isPurchase ? "+" : "−"}
                    {formatRupees(activity.amount_paise)}
                  </p>
                </article>
              );
            })
          )}
        </section>
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
        <main className="min-h-screen bg-slate-50 p-6">
          <p className="text-sm text-slate-500">
            Loading card activity...
          </p>
        </main>
      }
    >
      <ActivityContent searchParams={searchParams} />
    </Suspense>
  );
}
