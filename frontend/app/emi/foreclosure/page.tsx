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
        "id,debt_id,quote_date,valid_until,outstanding_principal_paise,foreclosure_charges_paise,tax_paise,other_charges_paise,waivers_paise,total_payoff_paise,source,notes",
      )
      .order("quote_date", { ascending: false }),
  ]);

  const debts = (debtResult.data ?? []) as unknown as DebtRow[];
  const payments = (paymentResult.data ?? []) as unknown as PaymentRow[];
  const quotes = (quoteResult.data ?? []) as unknown as QuoteRow[];

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
            Estimate how much you need to close a loan early, including
            foreclosure charges, taxes and waivers.
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
          Select your loan first. We’ll fill in the estimated remaining
          principal using your saved loan details and recorded repayments.
          You can change it to match a lender’s latest quote.
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
          <ForeclosureQuoteForm
            loans={loans}
            today={getTodayInIndia()}
          />
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-950">
            Saved foreclosure quotes
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Review previous figures and compare quotes for the same loan.
          </p>
        </div>

        {quotes.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
            No quotes saved yet. Your saved quotes will appear here.
          </div>
        ) : (
          <div className="space-y-3">
            {quotes.map((quote) => (
              <article
                key={quote.id}
                className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-slate-950">
                      {debtNames.get(quote.debt_id) ?? "Loan"}
                    </h3>
                    <p className="mt-1 text-sm text-slate-500">
                      Quote received: {dateLabel(quote.quote_date)}
                    </p>
                    <p className="text-sm text-slate-500">
                      Valid until / review by: {dateLabel(quote.valid_until)}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-slate-500">Total payoff</p>
                    <p className="mt-1 text-2xl font-bold text-slate-950">
                      {money(quote.total_payoff_paise)}
                    </p>
                    <span className="mt-1 inline-block rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700">
                      {formatLabel(quote.source)}
                    </span>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
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
                    <p className="text-xs text-slate-500">Taxes / GST</p>
                    <p className="mt-1 font-medium text-slate-900">
                      {money(quote.tax_paise)}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-slate-500">Other charges</p>
                    <p className="mt-1 font-medium text-slate-900">
                      {money(quote.other_charges_paise)}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-slate-500">Waiver / discount</p>
                    <p className="mt-1 font-medium text-slate-900">
                      −{money(quote.waivers_paise)}
                    </p>
                  </div>
                </div>

                {quote.notes && (
                  <p className="mt-4 whitespace-pre-wrap text-sm text-slate-600">
                    {quote.notes}
                  </p>
                )}
              </article>
            ))}
          </div>
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