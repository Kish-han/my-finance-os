import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createEmiDebt } from "./actions";

type AccountRow = {
  id: string;
  name: string;
  account_type: string;
  institution: string | null;
};

type CardRow = {
  id: string;
  name: string;
  bank_name: string | null;
  last_four_digits: string | null;
};

type EmiDebtRow = {
  id: string;
  name: string;
  debt_type: string;
  lender_name: string | null;
  linked_credit_card_id: string | null;
  payment_account_id: string | null;
  original_principal_paise: number | string;
  current_outstanding_principal_paise: number | string;
  outstanding_as_of_date: string;
  annual_interest_rate_basis_points: number | string | null;
  interest_method: string;
  total_tenure_months: number;
  installments_paid_before_tracking: number;
  emi_amount_paise: number | string;
  first_emi_due_date: string;
  next_due_date: string | null;
  status: string;
  notes: string | null;
};

type PaymentRow = {
  id: string;
  debt_id: string;
  payment_date: string;
  installment_number: number | null;
  payment_kind: string;
  amount_paise: number | string;
  principal_component_paise: number | string | null;
  interest_component_paise: number | string | null;
  payment_method: string;
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
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

/**
 * The recorded outstanding principal is the starting snapshot.
 * Subtract principal components recorded after that snapshot.
 * Do not guess principal amounts when the breakdown was not entered.
 */
function calculateEstimatedPrincipal(
  debt: EmiDebtRow,
  payments: PaymentRow[],
): number {
  if (debt.status === "foreclosed" || debt.status === "closed") {
    return 0;
  }

  const principalRepaidAfterSnapshot = payments
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
      principalRepaidAfterSnapshot,
  );
}

function countRecordedInstallments(
  debt: EmiDebtRow,
  payments: PaymentRow[],
): number {
  const laterScheduledPayments = payments.filter(
    (payment) =>
      payment.debt_id === debt.id &&
      payment.payment_kind === "scheduled_emi" &&
      payment.payment_date > debt.outstanding_as_of_date,
  ).length;

  return (
    debt.installments_paid_before_tracking + laterScheduledPayments
  );
}

function countPaymentsWithoutPrincipalBreakdown(
  debt: EmiDebtRow,
  payments: PaymentRow[],
): number {
  return payments.filter(
    (payment) =>
      payment.debt_id === debt.id &&
      payment.payment_date > debt.outstanding_as_of_date &&
      payment.payment_kind !== "fee_only" &&
      payment.principal_component_paise == null,
  ).length;
}

async function EmiPageData({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await connection();

  const params = await searchParams;
  const supabase = await createClient();

  const [debtResult, accountResult, cardResult, paymentResult] =
    await Promise.all([
      supabase
        .from("emi_debts")
        .select(
          "id,name,debt_type,lender_name,linked_credit_card_id,payment_account_id,original_principal_paise,current_outstanding_principal_paise,outstanding_as_of_date,annual_interest_rate_basis_points,interest_method,total_tenure_months,installments_paid_before_tracking,emi_amount_paise,first_emi_due_date,next_due_date,status,notes",
        )
        .order("created_at", { ascending: false }),

      supabase
        .from("accounts")
        .select("id,name,account_type,institution")
        .eq("is_archived", false)
        .order("name"),

      supabase
        .from("credit_cards")
        .select("id,name,bank_name,last_four_digits")
        .eq("is_archived", false)
        .order("name"),

      supabase
        .from("emi_payments")
        .select(
          "id,debt_id,payment_date,installment_number,payment_kind,amount_paise,principal_component_paise,interest_component_paise,payment_method",
        )
        .order("payment_date", { ascending: false }),
    ]);

  const debts = (debtResult.data ?? []) as unknown as EmiDebtRow[];
  const accounts = (accountResult.data ?? []) as unknown as AccountRow[];
  const cards = (cardResult.data ?? []) as unknown as CardRow[];
  const payments = (paymentResult.data ?? []) as unknown as PaymentRow[];

  const accountNames = new Map(
    accounts.map((account) => [account.id, account.name]),
  );

  const cardNames = new Map(
    cards.map((card) => [
      card.id,
      `${card.name}${card.last_four_digits ? ` ···· ${card.last_four_digits}` : ""}`,
    ]),
  );

  const activeDebts = debts.filter((debt) => debt.status === "active");

  const totalOutstanding = activeDebts.reduce(
    (total, debt) =>
      total + calculateEstimatedPrincipal(debt, payments),
    0,
  );

  const totalMonthlyEmi = activeDebts.reduce(
    (total, debt) => total + numeric(debt.emi_amount_paise),
    0,
  );

  const loadError =
    debtResult.error ||
    accountResult.error ||
    cardResult.error ||
    paymentResult.error;

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 sm:px-6">
      <header>
        <p className="text-sm font-medium tracking-wide text-slate-500">
          MY FINANCE OS
        </p>

        <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">
          EMI & Loans
        </h1>

        <p className="mt-2 text-sm leading-6 text-slate-600">
          Manage your loans, record repayments and track estimated principal
          remaining.
        </p>
      </header>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Active loans</p>
          <p className="mt-2 text-2xl font-bold text-slate-950">
            {activeDebts.length}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">
            Estimated outstanding principal
          </p>
          <p className="mt-2 text-2xl font-bold text-slate-950">
            {money(totalOutstanding)}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Monthly EMI commitments</p>
          <p className="mt-2 text-2xl font-bold text-slate-950">
            {money(totalMonthlyEmi)}
          </p>
        </div>
      </section>

      {params.created === "1" && (
        <div
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"
        >
          Your loan was saved successfully.
        </div>
      )}

      {params.error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          {params.error}
        </div>
      )}

      {loadError && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          Some loan or payment data could not be loaded. Refresh the page and
          check your Supabase connection if the problem continues.
        </div>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <h2 className="text-lg font-semibold text-slate-950">
          Loan payments
        </h2>

        <p className="mt-1 text-sm text-slate-600">
          Record an EMI after paying it or review payments already recorded.
        </p>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/emi/payments"
            className="inline-flex items-center justify-center rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            Record EMI Payment →
          </Link>

          <Link
            href="/emi/payments"
            className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            View Payment History
          </Link>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
        <div className="mb-5">
          <h2 className="text-xl font-semibold text-slate-950">
            Add a loan
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Enter the loan details shown by your bank or lender.
          </p>
        </div>

        <form action={createEmiDebt} className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-slate-700">
              Loan name
              <input
                name="name"
                required
                maxLength={120}
                placeholder="e.g. Car Loan"
                className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-3 text-base"
              />
            </label>

            <label className="block text-sm font-medium text-slate-700">
              Loan type
              <select
                name="debt_type"
                required
                defaultValue="vehicle_loan"
                className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-base"
              >
                <option value="personal_loan">Personal loan</option>
                <option value="vehicle_loan">Vehicle loan</option>
                <option value="credit_card_emi">Credit-card EMI</option>
                <option value="consumer_durable_emi">
                  Consumer durable EMI
                </option>
                <option value="external_loan">External loan</option>
                <option value="other">Other</option>
              </select>
            </label>

            <label className="block text-sm font-medium text-slate-700">
              Bank or lender
              <input
                name="lender_name"
                maxLength={120}
                placeholder="e.g. Bank name"
                className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-3 text-base"
              />
            </label>

            <label className="block text-sm font-medium text-slate-700">
              Original loan amount (₹)
              <input
                name="original_principal_rupees"
                type="number"
                min="0.01"
                step="0.01"
                required
                placeholder="e.g. 250000"
                className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-3 text-base"
              />
            </label>

            <label className="block text-sm font-medium text-slate-700">
              Outstanding principal on snapshot date (₹)
              <input
                name="current_outstanding_principal_rupees"
                type="number"
                min="0"
                step="0.01"
                required
                placeholder="Remaining principal"
                className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-3 text-base"
              />
            </label>

            <label className="block text-sm font-medium text-slate-700">
              Balance recorded on
              <input
                name="outstanding_as_of_date"
                type="date"
                required
                className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-3 text-base"
              />
            </label>

            <label className="block text-sm font-medium text-slate-700">
              Monthly EMI (₹)
              <input
                name="emi_amount_rupees"
                type="number"
                min="0.01"
                step="0.01"
                required
                placeholder="e.g. 8613"
                className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-3 text-base"
              />
            </label>

            <label className="block text-sm font-medium text-slate-700">
              Total tenure (months)
              <input
                name="total_tenure_months"
                type="number"
                min="1"
                step="1"
                required
                placeholder="e.g. 36"
                className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-3 text-base"
              />
            </label>

            <label className="block text-sm font-medium text-slate-700">
              Instalments paid before tracking
              <input
                name="installments_paid_before_tracking"
                type="number"
                min="0"
                step="1"
                defaultValue="0"
                required
                placeholder="e.g. 8"
                className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-3 text-base"
              />
              <span className="mt-1 block text-xs font-normal text-slate-500">
                Include instalments paid before you began using this app.
              </span>
            </label>

            <label className="block text-sm font-medium text-slate-700">
              Annual interest rate (%)
              <input
                name="annual_interest_rate_percent"
                type="number"
                min="0"
                max="100"
                step="0.01"
                placeholder="e.g. 14.5"
                className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-3 text-base"
              />
            </label>

            <label className="block text-sm font-medium text-slate-700">
              Interest calculation method
              <select
                name="interest_method"
                defaultValue="unknown"
                required
                className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-base"
              >
                <option value="reducing_balance">Reducing balance</option>
                <option value="flat_rate">Flat rate</option>
                <option value="unknown">Not sure</option>
              </select>
            </label>

            <label className="block text-sm font-medium text-slate-700">
              First EMI due date
              <input
                name="first_emi_due_date"
                type="date"
                required
                className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-3 text-base"
              />
            </label>

            <label className="block text-sm font-medium text-slate-700">
              Next EMI due date
              <input
                name="next_due_date"
                type="date"
                required
                className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-3 text-base"
              />
            </label>

            <label className="block text-sm font-medium text-slate-700">
              Linked credit card (optional)
              <select
                name="linked_credit_card_id"
                defaultValue=""
                className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-base"
              >
                <option value="">No linked credit card</option>
                {cards.map((card) => (
                  <option key={card.id} value={card.id}>
                    {card.name}
                    {card.bank_name ? ` · ${card.bank_name}` : ""}
                    {card.last_four_digits
                      ? ` ···· ${card.last_four_digits}`
                      : ""}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm font-medium text-slate-700">
              EMI paying account (optional)
              <select
                name="payment_account_id"
                defaultValue=""
                className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-base"
              >
                <option value="">No linked account</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                    {account.institution ? ` · ${account.institution}` : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block text-sm font-medium text-slate-700">
            Notes (optional)
            <textarea
              name="notes"
              rows={3}
              maxLength={1000}
              placeholder="Any helpful details about this loan"
              className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-3 text-base"
            />
          </label>

          <button
            type="submit"
            className="w-full rounded-xl bg-slate-950 px-4 py-3 font-semibold text-white transition hover:bg-slate-800 sm:w-auto"
          >
            Save Loan
          </button>
        </form>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-950">
            Your loans
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Estimated balances reflect principal breakdowns you have recorded
            after each loan's snapshot date.
          </p>
        </div>

        {debts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center">
            <h3 className="font-semibold text-slate-950">
              No loans added yet
            </h3>
            <p className="mt-2 text-sm text-slate-500">
              Add a loan using the form above to start tracking repayments.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {debts.map((debt) => {
              const isActive = debt.status === "active";
              const estimatedPrincipal = calculateEstimatedPrincipal(
                debt,
                payments,
              );
              const paid = countRecordedInstallments(debt, payments);
              const unknownBreakdowns =
                countPaymentsWithoutPrincipalBreakdown(debt, payments);

              const progress =
                debt.total_tenure_months > 0
                  ? Math.min(
                      100,
                      Math.round(
                        (paid / debt.total_tenure_months) * 100,
                      ),
                    )
                  : 0;

              return (
                <article
                  key={debt.id}
                  className="rounded-2xl border border-slate-200 bg-white p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold text-slate-950">
                        {debt.name}
                      </h3>
                      <p className="mt-1 text-sm text-slate-500">
                        {debt.lender_name || formatLabel(debt.debt_type)}
                      </p>
                    </div>

                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                      {formatLabel(debt.status)}
                    </span>
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-slate-500">
                        Estimated principal remaining
                      </p>
                      <p className="mt-1 font-semibold text-slate-950">
                        {money(estimatedPrincipal)}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-slate-500">Monthly EMI</p>
                      <p className="mt-1 font-semibold text-slate-950">
                        {money(debt.emi_amount_paise)}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-slate-500">
                        Original principal
                      </p>
                      <p className="mt-1 font-medium text-slate-800">
                        {money(debt.original_principal_paise)}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-slate-500">
                        Annual interest rate
                      </p>
                      <p className="mt-1 font-medium text-slate-800">
                        {debt.annual_interest_rate_basis_points == null
                          ? "Not entered"
                          : `${(
                              numeric(
                                debt.annual_interest_rate_basis_points,
                              ) / 100
                            ).toFixed(2)}%`}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5">
                    <div className="flex justify-between gap-3 text-xs text-slate-500">
                      <span>Instalments completed</span>
                      <span>
                        {Math.min(paid, debt.total_tenure_months)} of{" "}
                        {debt.total_tenure_months}
                      </span>
                    </div>

                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-slate-800"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>

                  <div className="mt-4 space-y-1 text-sm text-slate-600">
                    <p>
                      Balance recorded on:{" "}
                      {dateLabel(debt.outstanding_as_of_date)}
                    </p>
                    <p>Next EMI due: {dateLabel(debt.next_due_date)}</p>
                    <p>
                      Interest method: {formatLabel(debt.interest_method)}
                    </p>

                    {debt.payment_account_id && (
                      <p>
                        Paying account:{" "}
                        {accountNames.get(debt.payment_account_id) ??
                          "Linked account"}
                      </p>
                    )}

                    {debt.linked_credit_card_id && (
                      <p>
                        Linked credit card:{" "}
                        {cardNames.get(debt.linked_credit_card_id) ??
                          "Linked card"}
                      </p>
                    )}
                  </div>

                  {unknownBreakdowns > 0 && (
                    <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                      {unknownBreakdowns} payment
                      {unknownBreakdowns === 1 ? "" : "s"} recorded after the
                      snapshot {unknownBreakdowns === 1 ? "has" : "have"} no
                      principal breakdown. The balance estimate has not been
                      reduced for those payments. Add the principal amount
                      from your lender's statement to improve accuracy.
                    </p>
                  )}

                  {debt.notes && (
                    <p className="mt-3 whitespace-pre-wrap text-sm text-slate-500">
                      {debt.notes}
                    </p>
                  )}

                  {isActive && (
                    <Link
                      href="/emi/payments"
                      className="mt-5 inline-flex w-full items-center justify-center rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
                    >
                      Record EMI Payment →
                    </Link>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

export default function EmiPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-5xl px-4 py-10 text-sm text-slate-500">
          Loading loans…
        </main>
      }
    >
      <EmiPageData searchParams={searchParams} />
    </Suspense>
  );
}