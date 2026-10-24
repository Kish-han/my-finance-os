import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { recordEmiPayment } from "./actions";

type DebtRow = {
  id: string;
  name: string;
  lender_name: string | null;
  debt_type: string;
  current_outstanding_principal_paise: number | string;
  outstanding_as_of_date: string;
  emi_amount_paise: number | string;
  next_due_date: string | null;
  status: string;
  installments_paid_before_tracking: number;
  total_tenure_months: number;
};

type AccountRow = {
  id: string;
  name: string;
  account_type: string;
  institution: string | null;
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
  notes: string | null;
};

type SearchParams = Promise<{
  created?: string;
  error?: string;
}>;

function value(value: number | string | null | undefined): number {
  return Number(value ?? 0);
}

function money(paise: number | string | null | undefined): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(value(paise) / 100);
}

function recordedAmount(
  paise: number | string | null | undefined,
): string {
  return paise == null ? "Not entered" : money(paise);
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

function estimatedPrincipal(
  debt: DebtRow,
  payments: PaymentRow[],
): number {
  if (debt.status === "foreclosed" || debt.status === "closed") {
    return 0;
  }

  const principalPaid = payments
    .filter(
      (payment) =>
        payment.debt_id === debt.id &&
        payment.payment_date > debt.outstanding_as_of_date,
    )
    .reduce(
      (sum, payment) =>
        sum + value(payment.principal_component_paise),
      0,
    );

  return Math.max(
    0,
    value(debt.current_outstanding_principal_paise) - principalPaid,
  );
}

function completedInstallments(
  debt: DebtRow,
  payments: PaymentRow[],
): number {
  const recordedAfterSnapshot = payments.filter(
    (payment) =>
      payment.debt_id === debt.id &&
      payment.payment_kind === "scheduled_emi" &&
      payment.payment_date > debt.outstanding_as_of_date,
  ).length;

  return debt.installments_paid_before_tracking + recordedAfterSnapshot;
}

function PaymentsContent({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return <PaymentsData searchParams={searchParams} />;
}

async function PaymentsData({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await connection();

  const params = await searchParams;
  const supabase = await createClient();

  const [debtResult, accountResult, paymentResult] = await Promise.all([
    supabase
      .from("emi_debts")
      .select(
        "id,name,lender_name,debt_type,current_outstanding_principal_paise,outstanding_as_of_date,emi_amount_paise,next_due_date,status,installments_paid_before_tracking,total_tenure_months",
      )
      .order("name"),

    supabase
      .from("accounts")
      .select("id,name,account_type,institution")
      .eq("is_archived", false)
      .order("name"),

    supabase
      .from("emi_payments")
      .select(
        "id,debt_id,payment_date,installment_number,payment_kind,amount_paise,principal_component_paise,interest_component_paise,payment_method,notes",
      )
      .order("payment_date", { ascending: false }),
  ]);

  const debts = (debtResult.data ?? []) as unknown as DebtRow[];
  const accounts = (accountResult.data ?? []) as unknown as AccountRow[];
  const payments = (paymentResult.data ?? []) as unknown as PaymentRow[];

  const activeDebts = debts.filter((debt) => debt.status === "active");
  const debtNames = new Map(debts.map((debt) => [debt.id, debt.name]));

  const outstanding = activeDebts.reduce(
    (sum, debt) => sum + estimatedPrincipal(debt, payments),
    0,
  );

  const monthlyEmi = activeDebts.reduce(
    (sum, debt) => sum + value(debt.emi_amount_paise),
    0,
  );

  const loadError =
    debtResult.error || accountResult.error || paymentResult.error;

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 px-4 py-6 sm:px-6">
      <header className="space-y-3">
        <Link
          href="/emi"
          className="text-sm font-medium text-blue-700 hover:underline"
        >
          ← Back to EMI overview
        </Link>

        <div>
          <p className="text-sm font-medium tracking-wide text-slate-500">
            MY FINANCE OS
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">
            Record an EMI
          </h1>
          <p className="mt-2 text-slate-600">
            Record your usual monthly loan payment and keep track of what
            remains to be paid.
          </p>
        </div>
      </header>

      {params.created === "1" && (
        <div
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"
        >
          Your EMI payment was saved successfully.
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
          Some data could not be loaded. Refresh the page and check your
          Supabase connection if the problem continues.
        </div>
      )}

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Active loans</p>
          <p className="mt-2 text-2xl font-bold text-slate-950">
            {activeDebts.length}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">
            Estimated principal remaining
          </p>
          <p className="mt-2 text-2xl font-bold text-slate-950">
            {money(outstanding)}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Monthly EMI commitments</p>
          <p className="mt-2 text-2xl font-bold text-slate-950">
            {money(monthlyEmi)}
          </p>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
        <div className="mb-5">
          <h2 className="text-xl font-semibold text-slate-950">
            Monthly EMI details
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Fill this in after making your regular EMI payment.
          </p>
        </div>

        {activeDebts.length === 0 ? (
          <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
            You have no active loans. Add one on the{" "}
            <Link href="/emi" className="font-medium text-blue-700 underline">
              EMI overview page
            </Link>{" "}
            first.
          </div>
        ) : accounts.length === 0 ? (
          <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
            Add a bank or cash account on the Accounts page before recording an
            EMI payment.
          </div>
        ) : (
          <form action={recordEmiPayment} className="space-y-4">
            <input
              type="hidden"
              name="payment_kind"
              value="scheduled_emi"
            />
            <input
              type="hidden"
              name="payment_method"
              value="bank_debit"
            />
            <input type="hidden" name="charges_rupees" value="0" />

            <label className="block text-sm font-medium text-slate-700">
              Which loan did you pay?
              <select
                name="debt_id"
                required
                defaultValue=""
                className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-base"
              >
                <option value="" disabled>
                  Select your loan
                </option>
                {activeDebts.map((debt) => (
                  <option key={debt.id} value={debt.id}>
                    {debt.name} — EMI {money(debt.emi_amount_paise)}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium text-slate-700">
                Payment date
                <input
                  type="date"
                  name="payment_date"
                  required
                  className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-3 text-base"
                />
              </label>

              <label className="block text-sm font-medium text-slate-700">
                Which instalment number?
                <input
                  type="number"
                  name="installment_number"
                  min="1"
                  step="1"
                  required
                  placeholder="e.g. 8"
                  className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-3 text-base"
                />
                <span className="mt-1 block text-xs font-normal text-slate-500">
                  For example, enter 8 if this is your eighth EMI.
                </span>
              </label>

              <label className="block text-sm font-medium text-slate-700">
                Total amount paid (₹)
                <input
                  type="number"
                  name="amount_rupees"
                  min="0.01"
                  step="0.01"
                  required
                  placeholder="e.g. 8613"
                  className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-3 text-base"
                />
              </label>

              <label className="block text-sm font-medium text-slate-700">
                Which account paid it?
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
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <details className="rounded-xl border border-slate-200 p-4">
              <summary className="cursor-pointer text-sm font-medium text-slate-800">
                Optional: loan principal and interest breakdown
              </summary>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Your EMI includes interest and principal. If your lender
                statement shows the split, enter it here. The principal amount
                helps the app estimate how much of your loan remains. Leave
                these fields blank if you do not know the figures.
              </p>

              <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium text-slate-700">
                  Principal repaid (₹)
                  <input
                    type="number"
                    name="principal_rupees"
                    min="0"
                    step="0.01"
                    placeholder="e.g. 6000"
                    className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-3 text-base"
                  />
                </label>

                <label className="block text-sm font-medium text-slate-700">
                  Interest paid (₹)
                  <input
                    type="number"
                    name="interest_rupees"
                    min="0"
                    step="0.01"
                    placeholder="e.g. 2613"
                    className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-3 text-base"
                  />
                </label>
              </div>
            </details>

            <label className="block text-sm font-medium text-slate-700">
              Notes (optional)
              <textarea
                name="notes"
                rows={2}
                maxLength={1000}
                placeholder="Any reminder about this payment"
                className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-3 text-base"
              />
            </label>

            <div className="rounded-xl bg-slate-50 p-3 text-sm leading-6 text-slate-600">
              Saving this form records the EMI and a corresponding expense
              against the selected account. The amount is deducted from that
              account balance.
            </div>

            <button
              type="submit"
              className="w-full rounded-xl bg-slate-950 px-4 py-3 font-semibold text-white hover:bg-slate-800"
            >
              Save EMI payment
            </button>
          </form>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-950">
          Your loans
        </h2>

        {debts.length === 0 ? (
          <p className="rounded-xl border border-slate-200 p-4 text-sm text-slate-600">
            No loans added yet.
          </p>
        ) : (
          <div className="space-y-3">
            {debts.map((debt) => {
              const paid = completedInstallments(debt, payments);
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
                  className="rounded-2xl border border-slate-200 bg-white p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-slate-950">
                        {debt.name}
                      </h3>
                      <p className="mt-1 text-sm text-slate-500">
                        {debt.lender_name || debt.debt_type.replaceAll("_", " ")}
                      </p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700">
                      {debt.status}
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-slate-500">
                        Estimated principal left
                      </p>
                      <p className="mt-1 font-semibold text-slate-950">
                        {money(estimatedPrincipal(debt, payments))}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Monthly EMI</p>
                      <p className="mt-1 font-semibold text-slate-950">
                        {money(debt.emi_amount_paise)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="flex justify-between gap-3 text-xs text-slate-500">
                      <span>Instalments recorded</span>
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

                  <p className="mt-3 text-xs text-slate-500">
                    Next due date: {dateLabel(debt.next_due_date)}
                  </p>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-950">
          Recent EMI payments
        </h2>

        {payments.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
            Your recorded payments will appear here.
          </div>
        ) : (
          <div className="space-y-3">
            {payments.slice(0, 20).map((payment) => (
              <article
                key={payment.id}
                className="rounded-2xl border border-slate-200 bg-white p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-medium text-slate-950">
                      {debtNames.get(payment.debt_id) ?? "Loan"}
                    </h3>
                    <p className="mt-1 text-sm text-slate-500">
                      {dateLabel(payment.payment_date)} · Instalment{" "}
                      {payment.installment_number ?? "—"}
                    </p>
                  </div>
                  <p className="font-semibold text-slate-950">
                    {money(payment.amount_paise)}
                  </p>
                </div>

                <p className="mt-2 text-xs text-slate-500">
                  Principal: {recordedAmount(payment.principal_component_paise)}
                  {" · "}
                  Interest: {recordedAmount(payment.interest_component_paise)}
                </p>

                {payment.notes && (
                  <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">
                    {payment.notes}
                  </p>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      <footer className="pb-4">
        <Link
          href="/emi"
          className="text-sm font-medium text-blue-700 hover:underline"
        >
          ← Return to EMI overview
        </Link>
      </footer>
    </main>
  );
}

export default function EmiPaymentsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-4xl px-4 py-10 text-sm text-slate-500">
          Loading EMI payments…
        </main>
      }
    >
      <PaymentsContent searchParams={searchParams} />
    </Suspense>
  );
}