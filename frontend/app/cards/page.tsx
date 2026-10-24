
import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createCreditCard } from "./actions";

type CardsPageProps = {
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
  credit_limit_paise: number | string;
  opening_outstanding_paise: number | string;
  opening_outstanding_date: string;
  statement_day: number | null;
  payment_due_day: number | null;
};

type CardTransactionRow = {
  transaction_date: string;
  amount_paise: number | string;
  transaction_type: "card_purchase" | "card_payment" | string;
  credit_card_id: string | null;
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

function ordinalDay(day: number | null): string {
  if (day === null) return "Not set";

  const lastTwoDigits = day % 100;

  let suffix = "th";

  if (lastTwoDigits < 11 || lastTwoDigits > 13) {
    if (day % 10 === 1) suffix = "st";
    else if (day % 10 === 2) suffix = "nd";
    else if (day % 10 === 3) suffix = "rd";
  }

  return `${day}${suffix}`;
}

function calculateOutstanding(
  card: CreditCardRow,
  transactions: CardTransactionRow[]
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

async function CardsContent({ searchParams }: CardsPageProps) {
  await connection();

  const params = await searchParams;
  const supabase = await createClient();

  const { data: authData, error: authError } =
    await supabase.auth.getClaims();

  const userId = authData?.claims?.sub;

  if (authError || typeof userId !== "string") {
    redirect("/login");
  }

  const [cardsResult, transactionsResult] = await Promise.all([
    supabase
      .from("credit_cards")
      .select(
        "id, name, bank_name, last_four_digits, credit_limit_paise, opening_outstanding_paise, opening_outstanding_date, statement_day, payment_due_day"
      )
      .eq("user_id", userId)
      .eq("is_archived", false)
      .order("created_at", { ascending: false }),

    supabase
      .from("transactions")
      .select(
        "transaction_date, amount_paise, transaction_type, credit_card_id"
      )
      .eq("user_id", userId)
      .in("transaction_type", ["card_purchase", "card_payment"])
      .order("transaction_date", { ascending: true }),
  ]);

  const cards =
    (cardsResult.data ?? []) as unknown as CreditCardRow[];

  const transactions =
    (transactionsResult.data ?? []) as unknown as CardTransactionRow[];

  const errorMessages: Record<string, string> = {
    "invalid-input":
      "Check the card name, bank, last four digits, balance, limit and dates.",
    "save-failed":
      "We couldn't save the card. Check your database connection and try again.",
  };

  const canCalculateBalances =
    !cardsResult.error && !transactionsResult.error;

  const totalLimitPaise = cards.reduce(
    (total, card) => total + Number(card.credit_limit_paise),
    0
  );

  const totalOutstandingPaise = canCalculateBalances
    ? cards.reduce(
        (total, card) =>
          total + calculateOutstanding(card, transactions),
        0
      )
    : 0;

  const totalAvailablePaise =
    totalLimitPaise - totalOutstandingPaise;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900">
      <div className="mx-auto max-w-xl space-y-6 pb-10">
        <header className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-violet-600">
              My Finance OS
            </p>
            <h1 className="mt-1 text-2xl font-bold">
              Credit cards
            </h1>
          </div>

          <Link
            href="/"
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-100"
          >
            Dashboard
          </Link>
        </header>

        {params.created === "1" && (
          <p
            role="status"
            className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800"
          >
            Credit card saved successfully.
          </p>
        )}

        {params.error && (
          <p
            role="alert"
            className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700"
          >
            {errorMessages[params.error] ?? "Something went wrong."}
          </p>
        )}

        {cardsResult.error && (
          <p
            role="alert"
            className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700"
          >
            Couldn't load your credit cards.
          </p>
        )}

        {transactionsResult.error && (
          <p
            role="alert"
            className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900"
          >
            Card records loaded, but outstanding balances cannot be
            calculated until transaction history is available.
          </p>
        )}

        <section className="rounded-3xl bg-slate-900 p-5 text-white sm:p-6">
          <p className="text-sm text-slate-300">
            Total card outstanding
          </p>

          <h2 className="mt-2 text-3xl font-bold tracking-tight">
            {canCalculateBalances
              ? formatRupees(totalOutstandingPaise)
              : "Unavailable"}
          </h2>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-white/10 p-4">
              <p className="text-xs text-slate-300">
                Combined credit limits
              </p>
              <p className="mt-2 text-lg font-semibold">
                {formatRupees(totalLimitPaise)}
              </p>
            </div>

            <div className="rounded-2xl bg-white/10 p-4">
              <p className="text-xs text-slate-300">
                Available credit
              </p>
              <p className="mt-2 text-lg font-semibold">
                {canCalculateBalances
                  ? formatRupees(totalAvailablePaise)
                  : "Unavailable"}
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold">Add a credit card</h2>

          <p className="mt-1 text-sm leading-5 text-slate-500">
            Record the card's opening balance and credit limit. Never
            enter your full card number, CVV or PIN.
          </p>

          <form action={createCreditCard} className="mt-5 space-y-4">
            <div>
              <label
                htmlFor="name"
                className="mb-2 block text-sm font-medium"
              >
                Card name
              </label>
              <input
                id="name"
                name="name"
                required
                maxLength={80}
                placeholder="e.g. Neo RuPay"
                className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-violet-500"
              />
            </div>

            <div>
              <label
                htmlFor="bankName"
                className="mb-2 block text-sm font-medium"
              >
                Issuing bank
              </label>
              <input
                id="bankName"
                name="bankName"
                required
                maxLength={100}
                placeholder="e.g. Axis Bank"
                className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-violet-500"
              />
            </div>

            <div>
              <label
                htmlFor="lastFourDigits"
                className="mb-2 block text-sm font-medium"
              >
                Last four digits (optional)
              </label>
              <input
                id="lastFourDigits"
                name="lastFourDigits"
                inputMode="numeric"
                pattern="[0-9]{4}"
                maxLength={4}
                placeholder="1234"
                className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-violet-500"
              />
            </div>

            <div>
              <label
                htmlFor="creditLimit"
                className="mb-2 block text-sm font-medium"
              >
                Credit limit (₹)
              </label>
              <input
                id="creditLimit"
                name="creditLimit"
                type="number"
                inputMode="decimal"
                min="0.01"
                step="0.01"
                required
                placeholder="e.g. 100000"
                className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-violet-500"
              />
            </div>

            <div>
              <label
                htmlFor="openingOutstanding"
                className="mb-2 block text-sm font-medium"
              >
                Current outstanding at opening date (₹)
              </label>
              <input
                id="openingOutstanding"
                name="openingOutstanding"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                required
                defaultValue="0"
                className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-violet-500"
              />
            </div>

            <div>
              <label
                htmlFor="openingOutstandingDate"
                className="mb-2 block text-sm font-medium"
              >
                Outstanding balance as of
              </label>
              <input
                id="openingOutstandingDate"
                name="openingOutstandingDate"
                type="date"
                required
                max={indiaToday()}
                defaultValue={indiaToday()}
                className="w-full rounded-xl border border-slate-200 px-4 py-3"
              />
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Starting debt before recorded card activity on or after
                this date.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="statementDay"
                  className="mb-2 block text-sm font-medium"
                >
                  Statement day (optional)
                </label>
                <input
                  id="statementDay"
                  name="statementDay"
                  type="number"
                  min="1"
                  max="31"
                  placeholder="e.g. 24"
                  className="w-full rounded-xl border border-slate-200 px-3 py-3"
                />
              </div>

              <div>
                <label
                  htmlFor="paymentDueDay"
                  className="mb-2 block text-sm font-medium"
                >
                  Payment due day (optional)
                </label>
                <input
                  id="paymentDueDay"
                  name="paymentDueDay"
                  type="number"
                  min="1"
                  max="31"
                  placeholder="e.g. 12"
                  className="w-full rounded-xl border border-slate-200 px-3 py-3"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full rounded-xl bg-violet-600 py-3.5 font-semibold text-white hover:bg-violet-700"
            >
              Save credit card
            </button>
          </form>
        </section>

        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-bold">Your cards</h2>
            <p className="mt-1 text-sm text-slate-500">
              Balances, limits and monthly payment dates.
            </p>
          </div>

          {cards.length === 0 && !cardsResult.error ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center">
              <p className="font-semibold">No cards added yet</p>
              <p className="mt-1 text-sm text-slate-500">
                Add a card using the form above.
              </p>
            </div>
          ) : (
            cards.map((card) => {
              const outstanding = canCalculateBalances
                ? calculateOutstanding(card, transactions)
                : null;

              const limit = Number(card.credit_limit_paise);
              const available =
                outstanding === null ? null : limit - outstanding;

              return (
                <article
                  key={card.id}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
                >
                  {/* Card name and bank */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-lg font-bold tracking-tight">
                        {card.name}
                      </h3>
                      <p className="mt-1 text-sm text-slate-500">
                        {card.bank_name}
                        {card.last_four_digits
                          ? ` · •••• ${card.last_four_digits}`
                          : ""}
                      </p>
                    </div>

                    <span className="shrink-0 rounded-full bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700">
                      Credit card
                    </span>
                  </div>

                  {/* Outstanding and limit */}
                  <div className="mt-5 grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs font-medium text-slate-500">
                        Outstanding balance
                      </p>
                      <p className="mt-1.5 text-lg font-bold text-slate-900">
                        {outstanding === null
                          ? "Unavailable"
                          : formatRupees(outstanding)}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs font-medium text-slate-500">
                        Total credit limit
                      </p>
                      <p className="mt-1.5 text-lg font-bold text-slate-900">
                        {formatRupees(limit)}
                      </p>
                    </div>
                  </div>

                  {/* Available credit */}
                  <div className="mt-4 rounded-xl bg-emerald-50 px-4 py-3">
                    <p className="text-xs font-medium text-emerald-800">
                      Available credit
                    </p>
                    <p className="mt-1 text-lg font-bold text-emerald-800">
                      {available === null
                        ? "Unavailable"
                        : formatRupees(available)}
                    </p>
                  </div>

                  {/* Clear statement and due date details */}
                  <div className="mt-5">
                    <h4 className="text-sm font-semibold text-slate-800">
                      Monthly billing schedule
                    </h4>

                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <div className="flex items-center gap-2">
                          <span
                            aria-hidden="true"
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-700"
                          >
                            ▦
                          </span>
                          <p className="text-xs font-medium leading-4 text-slate-500">
                            Statement date
                          </p>
                        </div>

                        <p className="mt-3 text-xl font-bold text-slate-900">
                          {ordinalDay(card.statement_day)}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          of every month
                        </p>
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <div className="flex items-center gap-2">
                          <span
                            aria-hidden="true"
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700"
                          >
                            ✓
                          </span>
                          <p className="text-xs font-medium leading-4 text-slate-500">
                            Payment due date
                          </p>
                        </div>

                        <p className="mt-3 text-xl font-bold text-slate-900">
                          {ordinalDay(card.payment_due_day)}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          of every month
                        </p>
                      </div>
                    </div>

                    <p className="mt-3 text-xs leading-5 text-slate-500">
                      The statement date is when your monthly bill is
                      generated. The payment due date is the deadline
                      to pay that bill. Check your latest statement
                      for the exact calendar dates.
                    </p>
                  </div>

                  <div className="mt-4 border-t border-slate-100 pt-3">
                    <p className="text-xs text-slate-400">
                      Opening balance recorded on{" "}
                      {card.opening_outstanding_date}
                    </p>
                  </div>
                </article>
              );
            })
          )}
        </section>
      </div>
    </main>
  );
}

export default function CardsPage({ searchParams }: CardsPageProps) {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-slate-50 p-6">
          <p className="text-sm text-slate-500">
            Loading credit cards...
          </p>
        </main>
      }
    >
      <CardsContent searchParams={searchParams} />
    </Suspense>
  );
}
