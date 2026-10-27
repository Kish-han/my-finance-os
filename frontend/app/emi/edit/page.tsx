import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import EditEmiDebtForm from "./EditEmiDebtForm";
import { ArrowLeft, AlertTriangle, Pencil } from "lucide-react";

type SearchParams = Promise<{
  debt_id?: string;
  error?: string;
}>;

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

async function EditLoanContent({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await connection();
  const params = await searchParams;
  const debtId = params.debt_id;

  const supabase = await createClient();
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;

  if (claimsError || !userId) {
    redirect("/login");
  }

  if (!debtId) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-400">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h2 className="mt-4 text-base font-bold text-white">No Loan Specified</h2>
        <p className="mt-1 text-xs text-slate-400">
          Please select a loan from the Loans Overview page to edit its terms.
        </p>
        <Link
          href="/emi"
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-4 py-2 text-xs font-bold text-slate-950"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Loans</span>
        </Link>
      </div>
    );
  }

  const [debtResult, accountResult, cardResult] = await Promise.all([
    supabase
      .from("emi_debts")
      .select("*")
      .eq("id", debtId)
      .eq("user_id", userId)
      .maybeSingle(),

    supabase
      .from("accounts")
      .select("id,name,account_type,institution")
      .eq("user_id", userId)
      .eq("is_archived", false)
      .order("name"),

    supabase
      .from("credit_cards")
      .select("id,name,bank_name,last_four_digits")
      .eq("user_id", userId)
      .eq("is_archived", false)
      .order("name"),
  ]);

  const debt = debtResult.data;
  const accounts = accountResult.data ?? [];
  const cards = cardResult.data ?? [];

  if (!debt) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-400">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h2 className="mt-4 text-base font-bold text-white">Loan Not Found</h2>
        <p className="mt-1 text-xs text-slate-400">
          The requested loan does not exist or you do not have permission to view it.
        </p>
        <Link
          href="/emi"
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-4 py-2 text-xs font-bold text-slate-950"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Loans</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-4 sm:px-6 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Link
              href="/emi"
              className="text-slate-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
              Edit Commitment
            </h1>
          </div>
          <p className="mt-0.5 text-xs text-slate-400">
            Modify terms for <strong className="text-slate-200">{debt.name}</strong> without affecting payment history
          </p>
        </div>

        <Link
          href={`/emi/schedule?debt_id=${debt.id}`}
          className="text-xs font-bold text-cyan-300 hover:text-cyan-200 transition-colors hidden sm:inline"
        >
          View Repayment Schedule →
        </Link>
      </div>

      {/* Error alert */}
      {params.error && (
        <div
          role="alert"
          className="rounded-2xl border border-rose-500/30 bg-rose-950/40 p-4 text-xs font-semibold text-rose-300 backdrop-blur-xl"
        >
          {params.error === "invalid-input"
            ? "Invalid input values. Please check all monetary figures, tenure, interest rate and dates."
            : params.error === "invalid-link"
            ? "Selected payment account or linked credit card is invalid."
            : params.error === "unauthorized-loan"
            ? "You are not authorized to edit this loan."
            : "Failed to save loan changes. Please try again."}
        </div>
      )}

      {/* Edit Form */}
      <section className="aura-panel p-6 sm:p-8 space-y-6">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-400 ring-1 ring-cyan-500/30">
            <Pencil className="h-3.5 w-3.5" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold tracking-tight text-white">
              Edit Loan Details
            </h2>
            <p className="text-xs text-slate-400">
              All current values are prefilled below. Adjust values and save to update your loan profile and schedule.
            </p>
          </div>
        </div>

        <EditEmiDebtForm
          debt={debt}
          accounts={accounts}
          cards={cards}
          today={indiaToday()}
        />
      </section>
    </div>
  );
}

export default function EditLoanPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-5xl px-4 py-16 text-center text-sm text-slate-400">
          <div className="mx-auto h-5 w-5 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
          <p className="mt-3">Loading loan details...</p>
        </div>
      }
    >
      <EditLoanContent searchParams={searchParams} />
    </Suspense>
  );
}
