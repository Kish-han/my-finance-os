import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { recordActualForeclosure } from "./actions";

type DebtRow = {
  id: string;
  name: string;
  lender_name: string | null;
  status: string;
  outstanding_as_of_date: string;
};

type AccountRow = {
  id: string;
  name: string;
  account_type: string;
  institution: string | null;
};

type QuoteRow = {
  id: string;
  debt_id: string;
  quote_date: string;
  valid_until: string;
  outstanding_principal_paise: number | string;
  total_payoff_paise: number | string;
  source: string;
};

type SearchParams = Promise<{
  created?: string;
  error?: string;
}>;

function numeric(value: number | string | null | undefined): number {
  return Number(value ?? 0);
}

function money(paise: number | string | null | undefined): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(numeric(paise) / 100);
}

function dateLabel(date: string): string {
  const parsed = new Date(`${date}T00:00:00`);

  if (Number.isNaN(parsed.getTime())) return date;

  return parsed.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function todayInIndia(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const part = (type: string) =>
    parts.find((item) => item.type === type)?.value ?? "";

  return `${part("year")}-${part("month")}-${part("day")}`;
}

async function SettleForeclosureContent({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await connection();

  const params = await searchParams;
  const supabase = await createClient();
  const today = todayInIndia();

  const [debtResult, accountResult, quoteResult] = await Promise.all([
    supabase
      .from("emi_debts")
      .select("id,name,lender_name,status,outstanding_as_of_date")
      .eq("status", "active")
      .order("name"),

    supabase
      .from("accounts")
      .select("id,name,account_type,institution")
      .eq("is_archived", false)
      .order("name"),

    supabase
      .from("emi_foreclosure_quotes")
      .select(
        "id,debt_id,quote_date,valid_until,outstanding_principal_paise,total_payoff_paise,source",
      )
      .eq("source", "lender_quote")
      .order("quote_date", { ascending: false }),
  ]);

  const debts = (debtResult.data ?? []) as unknown as DebtRow[];
  const accounts = (accountResult.data ?? []) as unknown as AccountRow[];
  const quotes = (quoteResult.data ?? []) as unknown as QuoteRow[];

  const debtById = new Map(debts.map((debt) => [debt.id, debt]));

  const availableQuotes = quotes.filter((quote) => {
    const debt = debtById.get(quote.debt_id);

    return (
      debt !== undefined &&
      quote.quote_date <= today &&
      quote.valid_until >= today &&
      today > debt.outstanding_as_of_date &&
      numeric(quote.total_payoff_paise) > 0
    );
  });

  const loadError =
    debtResult.error || accountResult.error || quoteResult.error;

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6 sm:px-6">
      <header className="space-y-3">
        <div className="flex flex-wrap gap-4 text-sm font-medium">
          <Link
            href="/emi"
            className="text-blue-700 hover:underline"
          >
            ← EMI overview
          </Link>
          <Link
            href="/emi/foreclosure"
            className="text-blue-700 hover:underline"
          >
            Foreclosure calculator
          </Link>
        </div>

        <div>
          <p className="text-sm font-medium tracking-wide text-slate-500">
            MY FINANCE OS
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">
            Record actual foreclosure
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Use this only after you have actually paid the lender and completed
            the loan closure payment.
          </p>
        </div>
      </header>

      {params.created === "1" && (
        <div
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"
        >
          The foreclosure payment was recorded. The amount has been entered
          as an account expense, and the loan is now marked as foreclosed.
        </div>
      )}

      {params.error && (
        <div
          role="alert"
          className="break-words rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          {params.error}
        </div>
      )}

      {loadError && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          Some data could not be loaded. Refresh the page and check your
          Supabase connection if the problem continues.
        </div>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
        <h2 className="text-xl font-semibold text-slate-950">
          Confirm your foreclosure payment
        </h2>

        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
          <strong>Important:</strong> Submitting this form permanently records
          a foreclosure expense and marks the loan as foreclosed. Do not use it
          just to test a quote or to plan a future payment.
        </div>

        {accounts.length === 0 ? (
          <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
            Add an active bank or cash account before recording a foreclosure
            payment.
          </p>
        ) : availableQuotes.length === 0 ? (
          <div className="mt-5 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">
            There are no currently valid official lender quotes for active
            loans available to record. Save a current official lender quote
            first on the{" "}
            <Link
              href="/emi/foreclosure"
              className="font-medium text-blue-700 underline"
            >
              foreclosure calculator page
            </Link>
            .
          </div>
        ) : (
          <form
            action={recordActualForeclosure}
            className="mt-5 space-y-5"
          >
            <label className="block text-sm font-medium text-slate-700">
              Which official quote was paid?
              <select
                name="quote_id"
                required
                defaultValue=""
                className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-base"
              >
                <option value="" disabled>
                  Select a valid lender quote
                </option>

                {availableQuotes.map((quote) => {
                  const debt = debtById.get(quote.debt_id)!;

                  return (
                    <option key={quote.id} value={quote.id}>
                      {debt.name}
                      {debt.lender_name ? ` · ${debt.lender_name}` : ""}
                      {" — "}
                      {money(quote.total_payoff_paise)}
                      {" · valid until "}
                      {dateLabel(quote.valid_until)}
                    </option>
                  );
                })}
              </select>
              <span className="mt-1 block text-xs font-normal text-slate-500">
                The actual recorded amount will be the total payoff saved in
                that official quote.
              </span>
            </label>

            <label className="block text-sm font-medium text-slate-700">
              Date you actually paid the lender
              <input
                name="payment_date"
                type="date"
                required
                defaultValue={today}
                max={today}
                className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-3 text-base"
              />
            </label>

            <label className="block text-sm font-medium text-slate-700">
              Which account paid the lender?
              <select
                name="payment_account_id"
                required
                defaultValue=""
                className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-base"
              >
                <option value="" disabled>
                  Select bank or cash account
                </option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                    {account.institution ? ` · ${account.institution}` : ""}
                    {` · ${account.account_type}`}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm font-medium text-slate-700">
              Payment reference or notes (optional)
              <textarea
                name="notes"
                rows={3}
                maxLength={1000}
                placeholder="For example, transaction reference or closure confirmation"
                className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-3 text-base"
              />
            </label>

            <p className="text-sm leading-6 text-slate-600">
              The app will record one expense against your selected account
              using the saved quote amount. The loan will be marked as
              foreclosed only if the payment is recorded successfully.
            </p>

            <button
              type="submit"
              className="w-full rounded-xl bg-slate-950 px-4 py-3 font-semibold text-white transition hover:bg-slate-800"
            >
              Confirm Actual Foreclosure Payment
            </button>
          </form>
        )}
      </section>
    </main>
  );
}

export default function SettleForeclosurePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-3xl px-4 py-10 text-sm text-slate-500">
          Loading foreclosure payment form…
        </main>
      }
    >
      <SettleForeclosureContent searchParams={searchParams} />
    </Suspense>
  );
}