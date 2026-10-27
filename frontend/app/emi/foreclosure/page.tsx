import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SimpleForeclosureForm from "./SimpleForeclosureForm";
import type { LoanOption, AccountOption } from "./SimpleForeclosureForm";
import { ArrowLeft, Percent, AlertTriangle } from "lucide-react";

type SearchParams = Promise<{
  debt_id?: string;
  error?: string;
}>;

type EmiDebtRow = {
  id: string;
  name: string;
  lender_name: string | null;
  debt_type: string;
  status: string;
  current_outstanding_principal_paise: number | string;
  original_principal_paise: number | string;
  emi_amount_paise: number | string;
  outstanding_as_of_date: string;
};

type PaymentRow = {
  debt_id: string;
  payment_date: string;
  principal_component_paise: number | string | null;
};

type AccountRow = {
  id: string;
  name: string;
  account_type: string;
  institution: string | null;
  opening_balance_date: string;
};

function todayInIndia(): string {
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

function calculateEstimatedPrincipal(
  debt: EmiDebtRow,
  payments: PaymentRow[]
): number {
  if (debt.status === "foreclosed" || debt.status === "closed") {
    return 0;
  }

  const principalRepaidAfterSnapshot = payments
    .filter(
      (payment) =>
        payment.debt_id === debt.id &&
        payment.payment_date > debt.outstanding_as_of_date
    )
    .reduce(
      (total, payment) => total + Number(payment.principal_component_paise ?? 0),
      0
    );

  return Math.max(
    0,
    Number(debt.current_outstanding_principal_paise) -
      principalRepaidAfterSnapshot
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

  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();

  const userId = claimsData?.claims?.sub;

  if (claimsError || typeof userId !== "string" || !userId) {
    redirect("/login");
  }

  const [debtResult, accountResult, paymentResult] = await Promise.all([
    supabase
      .from("emi_debts")
      .select(
        "id, name, lender_name, debt_type, status, current_outstanding_principal_paise, original_principal_paise, emi_amount_paise, outstanding_as_of_date"
      )
      .eq("user_id", userId)
      .eq("status", "active")
      .order("name"),

    supabase
      .from("accounts")
      .select("id, name, account_type, institution, opening_balance_date")
      .eq("user_id", userId)
      .eq("is_archived", false)
      .order("name"),

    supabase
      .from("emi_payments")
      .select("debt_id, payment_date, principal_component_paise")
      .eq("user_id", userId),
  ]);

  const activeDebts = (debtResult.data ?? []) as unknown as EmiDebtRow[];
  const accounts = (accountResult.data ?? []) as unknown as AccountRow[];
  const payments = (paymentResult.data ?? []) as unknown as PaymentRow[];

  const loanOptions: LoanOption[] = activeDebts.map((debt) => ({
    id: debt.id,
    name: debt.name,
    lender_name: debt.lender_name,
    debt_type: debt.debt_type,
    original_principal_paise: debt.original_principal_paise,
    estimated_principal_paise: calculateEstimatedPrincipal(debt, payments),
    outstanding_as_of_date: debt.outstanding_as_of_date,
    emi_amount_paise: debt.emi_amount_paise,
  }));

  const accountOptions: AccountOption[] = accounts.map((acc) => ({
    id: acc.id,
    name: acc.name,
    account_type: acc.account_type,
    institution: acc.institution,
    opening_balance_date: acc.opening_balance_date,
  }));

  const today = todayInIndia();

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-4 sm:px-6">
      {/* Top back navigation */}
      <div className="flex items-center justify-between">
        <Link
          href="/emi"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Loans Overview</span>
        </Link>
        <span className="text-[10px] font-mono uppercase tracking-widest text-cyan-400">
          Foreclosure Settlement
        </span>
      </div>

      {params.error && (
        <div
          role="alert"
          className="flex items-center gap-3 rounded-2xl border border-rose-500/30 bg-rose-950/40 p-4 text-xs sm:text-sm font-semibold text-rose-300 backdrop-blur-xl"
        >
          <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
          <p>{params.error}</p>
        </div>
      )}

      {loanOptions.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.02] p-10 text-center backdrop-blur-md space-y-4">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-400 ring-1 ring-cyan-500/30">
            <Percent className="h-7 w-7" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">
              No Active Loans Available for Foreclosure
            </h3>
            <p className="mt-1 text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
              All your registered loans are either already foreclosed, fully amortized, or no active loans have been created yet.
            </p>
          </div>
          <div>
            <Link
              href="/emi"
              className="inline-flex items-center justify-center rounded-2xl bg-gradient-to-r from-cyan-500 via-teal-500 to-emerald-500 px-6 py-3 text-xs font-bold text-slate-950 shadow-lg shadow-cyan-500/20 transition-all hover:brightness-110 active:scale-95"
            >
              Return to Loans
            </Link>
          </div>
        </div>
      ) : accounts.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-amber-500/20 bg-amber-500/5 p-10 text-center backdrop-blur-md space-y-4">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/30">
            <AlertTriangle className="h-7 w-7" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">
              No Payment Account Available
            </h3>
            <p className="mt-1 text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
              You must have at least one active bank or cash account registered to record the settlement payoff expense.
            </p>
          </div>
          <div>
            <Link
              href="/accounts"
              className="inline-flex items-center justify-center rounded-2xl bg-gradient-to-r from-cyan-500 via-teal-500 to-emerald-500 px-6 py-3 text-xs font-bold text-slate-950 shadow-lg shadow-cyan-500/20 transition-all hover:brightness-110 active:scale-95"
            >
              Add a Bank or Cash Account
            </Link>
          </div>
        </div>
      ) : (
        <SimpleForeclosureForm
          loans={loanOptions}
          accounts={accountOptions}
          initialDebtId={params.debt_id}
          today={today}
        />
      )}
    </div>
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
        <div className="mx-auto max-w-4xl px-4 py-16 text-center text-sm text-slate-400">
          <div className="mx-auto h-5 w-5 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
          <p className="mt-3">Loading foreclosure details...</p>
        </div>
      }
    >
      <ForeclosureContent searchParams={searchParams} />
    </Suspense>
  );
}
