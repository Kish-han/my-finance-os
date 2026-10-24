import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import ForeclosureQuoteForm from "./ForeclosureQuoteForm";

type DebtRow = {
  id: string;
  name: string;
  lender_name: string | null;
  debt_type: string;
  status: string;
  current_outstanding_principal_paise: number | string;
  outstanding_as_of_date: string;
};

type PaymentRow = {
  debt_id: string;
  payment_date: string;
  principal_component_paise: number | string | null;
};

type QuoteRow = {
  id: string;
  debt_id: string;
  quote_date: string;
  valid_until: string;
  outstanding_principal_paise: number | string;
  foreclosure_charges_paise: number | string;
  tax_paise: number | string;
  other_charges_paise: number | string;
  waivers_paise: number | string;
  total_payoff_paise: number | string;
  source: string;
  notes: string | null;
  created_at: string;
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

function dateLabel(date: string | null | undefined): string {
  if (!date) return "Not set";

  const parsed = new Date(`${date}T00:00:00`);

  if (Number.isNaN(parsed.getTime())) return date;

  return parsed.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatLabel(value: string): string {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getTodayInIndia(): string {
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

function estimatePrincipal(
  debt: DebtRow,
  payments: PaymentRow[],
): number {
  if (debt.status === "foreclosed" || debt.status === "closed") {
    return 0;
  }

  const principalPaidAfterSnapshot = payments
    .filter(
      (payment) =>
        payment.debt_id === debt.id &&
        payment.payment_date > debt.outstanding_as_of_date,
    )
    .reduce(
      (total, payment) =>
        total + numeric(payment.principal_component_paise),
      0,
    );

  return Math.max(
    0,
    numeric(debt.current_outstanding_principal_paise) -
      principalPaidAfterSnapshot,
  );
}

function QuoteComparison({
  quotes,
  today,
}: {
  quotes: QuoteRow[];
  today: string;
}) {
  if (quotes.length === 0) return null;

  const latest = quotes[0];
  const previous = quotes[1];

  const latestTotal = numeric(latest.total_payoff_paise);
  const previousTotal = previous
    ? numeric(previous.total_payoff_paise)
    : null;

  const difference =
    previousTotal === null ? null : latestTotal - previousTotal;

  const expiryMessage =
    latest.source === "estimate"
      ? latest.valid_until < today
        ? "Review date has passed"
        : "Estimated amount · review date set"
      : latest.valid_until < today
        ? "Lender quote expired"
        : latest.valid_until === today
          ? "Lender quote valid through today"
          : "Within stated validity date";

  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm font-semibold text-slate-900">
        Latest vs previous quote
      </p>

      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <p className="text-xs text-slate-500">Latest total</p>
          <p className="mt-1 font-semibold text-slate-950">
            {money(latestTotal)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {dateLabel(latest.quote_date)}
          </p>
        </div>

        <div>
          <p className="text-xs text-slate-500">Previous total</p>
          <p className="mt-1 font-semibold text-slate-950">
            {previousTotal === null ? "No previous quote" : money(previousTotal)}
          </p>
          {previous && (
            <p className="mt-1 text-xs text-slate-500">
              {dateLabel(previous.quote_date)}
            </p>
          )}
        </div>

        <div>
          <p className="text-xs text-slate-500">Change in total</p>
          {difference === null ? (
            <p className="mt-1 font-medium text-slate-700">
              Save another quote to compare
            </p>
          ) : difference < 0 ? (
            <p className="mt-1 font-semibold text-emerald-700">
              Lower by {money(Math.abs(difference))}
            </p>
          ) : difference > 0 ? (
            <p className="mt-1 font-semibold text-rose-700">
              Higher by {money(difference)}
            </p>
          ) : (
            <p className="mt-1 font-semibold text-slate-700">
              No change
            </p>
          )}
        </div>
      </div>

      <p className="mt-3 text-xs text-slate-500">
        {expiryMessage}. Comparison is between the two most recently saved
        records, which may be lender quotes or your own estimates.
      </p>
    </div>
  );
}

async function ForeclosureContent({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await connection();

  const params = await searchParams;
  const supabase = await createClient();

  const [debtResult, paymentResult, quoteResult] = await Promise.all([
    supabase
      .from("emi_debts")
      .select(
        "id,name,lender_name,debt_type,status,current_outstanding_principal_paise,outstanding_as_of_date",
      )
      .order("name"),

    supabase
      .from("emi_payments")
      .select("debt_id,payment_date,principal_component_paise")
      .order("payment_date"),

    supabase
      .from("emi_foreclosure_quotes")
      .select(
        "id,debt_id,quote_date,valid_until,outstanding_principal_paise,foreclosure_charges_paise,tax_paise,other_charges_paise,waivers_paise,total_payoff_paise,source,notes,created_at",
      )
      .order("quote_date", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);

  const debts = (debtResult.data ?? []) as unknown as DebtRow[];
  const payments = (paymentResult.data ?? []) as unknown as PaymentRow[];
  const quotes = (quoteResult.data ?? []) as unknown as QuoteRow[];

  const today = getTodayInIndia();
  const activeDebts = debts.filter((debt) => debt.status === "active");

  const loans = activeDebts.map((debt) => ({
    id: debt.id,
    label: `${debt.name}${debt.lender_name ? ` · ${debt.lender_name}` : ""}`,
    outstandingPrincipalRupees: (
      estimatePrincipal(debt, payments) / 100
    ).toFixed(2),
  }));

  const debtNames = new Map(
    debts.map((debt) => [
      debt.id,
      `${debt.name}${debt.lender_name ? ` · ${debt.lender_name}` : ""}`,
    ]),
  );

  // Group quotes per loan, with most recent quote first in each group.
  const quoteGroups = new Map<string, QuoteRow[]>();

  for (const quote of quotes) {
    const existing = quoteGroups.get(quote.debt_id) ?? [];
    existing.push(quote);
    quoteGroups.set(quote.debt_id, existing);
  }

  const groupedQuotes = Array.from(quoteGroups.entries()).map(
    ([debtId, loanQuotes]) => ({
      debtId,
      loanName: debtNames.get(debtId) ?? "Loan",
      quotes: loanQuotes,
    }),
  );

  const loadError =
    debtResult.error || paymentResult.error || quoteResult.error;

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 px-4 py-6 sm:px-6">
      <header className="space-y-3">
        <div className="flex flex-wrap gap-4 text-sm font-medium">
          <Link href="/emi" className="text-blue-700 hover:underline">
            ← EMI overview
          </Link>
          <Link
            href="/emi/payments"
            className="text-blue-700 hover:underline"
          >
            EMI payments
          </Link>
        </div>

        <div>
          <p className="text-sm font-medium tracking-wide text-slate-500">
            MY FINANCE OS
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">
            Foreclosure calculator
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Estimate how much you need to close a loan early, then compare
            saved payoff figures over time.
          </p>
        </div>
      </header>

      {params.created === "1" && (
        <div
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"
        >
          Foreclosure quote saved successfully.
        </div>
      )}

      {params.error && (
        <div
          role="alert"
          className="break-words rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          {params.error}
        </div>
      )}

      {loadError && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          Some loan or quote information could not be loaded. Refresh the page
          and check your Supabase connection if the problem continues.
        </div>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
        <h2 className="text-xl font-semibold text-slate-950">
          Calculate a payoff amount
        </h2>

        <p className="mt-2 text-sm leading-6 text-slate-600">
          Select a loan to fill in its estimated remaining principal. You can
          change that amount to match the lender's current figure. Add
          foreclosure charges, taxes and other adjustments to calculate the
          total.
        </p>

        {activeDebts.length === 0 ? (
          <div className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
            You don't have an active loan yet. Add one on the{" "}
            <Link href="/emi" className="font-medium text-blue-700 underline">
              EMI overview
            </Link>{" "}
            first.
          </div>
        ) : (
          <ForeclosureQuoteForm loans={loans} today={today} />
        )}
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-950">
            Quote comparison by loan
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Each comparison uses the two most recent saved quote records for
            that loan.
          </p>
        </div>

        {groupedQuotes.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
            No quotes saved yet. Save a quote above to start tracking changes.
          </div>
        ) : (
          groupedQuotes.map((group) => (
            <article
              key={group.debtId}
              className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"
            >
              <h3 className="text-lg font-semibold text-slate-950">
                {group.loanName}
              </h3>

              <QuoteComparison quotes={group.quotes} today={today} />

              <details className="mt-4">
                <summary className="cursor-pointer text-sm font-medium text-blue-700">
                  View all {group.quotes.length} saved quote
                  {group.quotes.length === 1 ? "" : "s"}
                </summary>

                <div className="mt-3 space-y-3">
                  {group.quotes.map((quote) => (
                    <div
                      key={quote.id}
                      className="rounded-xl border border-slate-200 p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-slate-950">
                            {money(quote.total_payoff_paise)}
                          </p>
                          <p className="mt-1 text-sm text-slate-500">
                            Quote date: {dateLabel(quote.quote_date)}
                          </p>
                          <p className="text-sm text-slate-500">
                            Valid until / review by:{" "}
                            {dateLabel(quote.valid_until)}
                          </p>
                        </div>
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700">
                          {formatLabel(quote.source)}
                        </span>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                        <div>
                          <p className="text-xs text-slate-500">Principal</p>
                          <p className="mt-1 font-medium text-slate-900">
                            {money(quote.outstanding_principal_paise)}
                          </p>
                        </div>

                        <div>
                          <p className="text-xs text-slate-500">
                            Foreclosure charges
                          </p>
                          <p className="mt-1 font-medium text-slate-900">
                            {money(quote.foreclosure_charges_paise)}
                          </p>
                        </div>

                        <div>
                          <p className="text-xs text-slate-500">Taxes</p>
                          <p className="mt-1 font-medium text-slate-900">
                            {money(quote.tax_paise)}
                          </p>
                        </div>

                        <div>
                          <p className="text-xs text-slate-500">
                            Other charges
                          </p>
                          <p className="mt-1 font-medium text-slate-900">
                            {money(quote.other_charges_paise)}
                          </p>
                        </div>

                        <div>
                          <p className="text-xs text-slate-500">
                            Waiver / discount
                          </p>
                          <p className="mt-1 font-medium text-slate-900">
                            −{money(quote.waivers_paise)}
                          </p>
                        </div>
                      </div>

                      {quote.notes && (
                        <p className="mt-3 whitespace-pre-wrap text-sm text-slate-600">
                          {quote.notes}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </details>
            </article>
          ))
        )}
      </section>
    </main>
  );
}

export default function ForeclosurePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-4xl px-4 py-10 text-sm text-slate-500">
          Loading foreclosure calculator…
        </main>
      }
    >
      <ForeclosureContent searchParams={searchParams} />
    </Suspense>
  );
}