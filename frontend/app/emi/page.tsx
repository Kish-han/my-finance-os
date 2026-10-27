import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  Percent,
  Plus,
  ArrowRight,
  Clock,
  Landmark,
  CreditCard,
  Zap,
  AlertTriangle,
  Receipt,
  CheckCircle2,
  Calendar,
  Pencil,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import AddEmiDebtForm from "./AddEmiDebtForm";
import { getEmiCategory } from "@/lib/finance/amortization";
import {
  extractAdditionalCharges,
  stripChargesFromNotes,
} from "@/lib/finance/emi-charges";

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
  additional_charges_paise?: number | string | null;
  charge_description?: string | null;
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
  updated?: string;
  foreclosed?: string;
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

function todayIndia(): string {
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
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [debtResult, accountResult, cardResult, paymentResult] =
    await Promise.all([
      supabase
        .from("emi_debts")
        .select("*")
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
    <div className="mx-auto w-full max-w-5xl space-y-8 px-4 py-4 sm:px-6 pb-16">
      {/* Status Notifications */}
      {params.created === "1" && (
        <div
          role="status"
          className="flex items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-950/40 px-5 py-4 text-xs sm:text-sm font-semibold text-emerald-300 shadow-xl backdrop-blur-xl animate-float-slow"
        >
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
            <Zap className="h-4 w-4" />
          </div>
          <p>Your loan was registered successfully.</p>
        </div>
      )}

      {params.updated === "1" && (
        <div
          role="status"
          className="flex items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-950/40 px-5 py-4 text-xs sm:text-sm font-semibold text-emerald-300 shadow-xl backdrop-blur-xl animate-float-slow"
        >
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
            <CheckCircle2 className="h-4 w-4" />
          </div>
          <p>Loan details updated successfully. The repayment schedule has been refreshed.</p>
        </div>
      )}

      {params.foreclosed === "1" && (
        <div
          role="status"
          className="flex items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-950/40 px-5 py-4 text-xs sm:text-sm font-semibold text-emerald-300 shadow-xl backdrop-blur-xl animate-float-slow"
        >
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
            <Zap className="h-4 w-4" />
          </div>
          <p>Loan settled and foreclosed successfully. Payoff settlement has been recorded into your ledger and remaining principal set to zero.</p>
        </div>
      )}

      {params.error && (
        <div
          role="alert"
          className="rounded-2xl border border-rose-500/30 bg-rose-950/40 p-4 text-sm font-semibold text-rose-300 backdrop-blur-xl"
        >
          {params.error}
        </div>
      )}

      {loadError && (
        <div
          role="alert"
          className="rounded-2xl border border-rose-500/30 bg-rose-950/40 p-4 text-sm font-semibold text-rose-300 backdrop-blur-xl"
        >
          Some loan or payment data could not be loaded. Refresh the page or check your Supabase connection.
        </div>
      )}

      {/* Hero KPIs */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="aura-panel p-5 space-y-2 hover:border-slate-500/40 transition-all">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 shrink-0 rounded-full bg-slate-400" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Active Loans
            </span>
          </div>
          <p className="text-3xl sm:text-4xl font-black tracking-tight text-white tabular-nums">
            {activeDebts.length}
          </p>
          <p className="text-xs text-slate-400">Active credit commitments</p>
        </div>

        <div className="aura-panel p-5 space-y-2 hover:border-cyan-400/40 transition-all">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 shrink-0 rounded-full bg-cyan-400 animate-pulse" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-cyan-300">
              Outstanding Principal
            </span>
          </div>
          <p className="text-3xl sm:text-4xl font-black tracking-tight text-cyan-300 tabular-nums">
            {money(totalOutstanding)}
          </p>
          <p className="text-xs text-slate-400">Estimated remaining principal</p>
        </div>

        <div className="aura-panel p-5 space-y-2 hover:border-[#4edea3]/40 transition-all">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 shrink-0 rounded-full bg-[#4edea3]" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#4edea3]">
              Monthly Commitments
            </span>
          </div>
          <p className="text-3xl sm:text-4xl font-black tracking-tight text-white tabular-nums">
            {money(totalMonthlyEmi)}
          </p>
          <p className="text-xs text-slate-400">Scheduled monthly outlay</p>
        </div>
      </section>

      {/* Add Loan / EMI Form Module */}
      <section className="aura-panel p-6 sm:p-8 space-y-6">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-400 ring-1 ring-cyan-500/30">
            <Plus className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold tracking-tight text-white">
              Add a Loan or EMI
            </h2>
            <p className="text-xs text-slate-400">
              Select whether you are registering an amortized term loan or a credit card statement EMI.
            </p>
          </div>
        </div>

        <AddEmiDebtForm
          accounts={accounts}
          cards={cards}
          today={todayIndia()}
        />
      </section>

      {/* Loans Grid Showcase */}
      <section className="space-y-4">
        <div className="flex items-center gap-2.5">
          <div className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
          <h2 className="text-base sm:text-lg font-bold tracking-tight text-white">
            Recorded Loans ({debts.length})
          </h2>
        </div>

        {/* Guidance Banner */}
        <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-4 text-xs text-slate-300 backdrop-blur-md flex items-start gap-3">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 mt-0.5">
            <Receipt className="h-3.5 w-3.5" />
          </div>
          <div className="space-y-1.5 leading-relaxed">
            <p className="font-semibold text-white">Managing loan and EMI payments in AURA Wealth</p>
            <div className="text-slate-400 space-y-1">
              <p>
                <strong className="text-white">Standalone Loans:</strong> Record monthly installments via{" "}
                <Link href="/emi/payments" className="text-cyan-300 underline underline-offset-2 hover:text-cyan-200">
                  Record Payment
                </Link>{" "}
                to automatically apply reducing-balance principal amortization. For total early payoff, click <strong className="text-white">Foreclose</strong>.
              </p>
              <p>
                <strong className="text-white">Credit Card EMIs:</strong> The initial purchase was already recorded as an expense on your card. Monthly installments billed to the statement should be settled through{" "}
                <Link href="/cards/activity" className="text-purple-300 underline underline-offset-2 hover:text-purple-200">
                  Credit Card Repayment
                </Link>{" "}
                when paying your card bill, avoiding duplicate expense logging.
              </p>
            </div>
          </div>
        </div>

        {debts.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.02] p-10 text-center backdrop-blur-md">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-400 ring-1 ring-cyan-500/30">
              <Percent className="h-7 w-7" />
            </div>
            <h3 className="mt-4 text-base font-bold text-white">No loans added yet</h3>
            <p className="mt-1 text-xs text-slate-400 max-w-sm mx-auto">
              Add a loan using the form above to start tracking amortization, EMI payments, and early foreclosure settlements.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {debts.map((debt, idx) => {
              const category = getEmiCategory(debt);
              const isLoan = category === "loan_emi";
              const isActive = debt.status === "active";
              const charges = extractAdditionalCharges(debt);
              const displayNotes = debt.notes
                ? stripChargesFromNotes(debt.notes)
                : null;
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
                  className="aura-panel group relative overflow-hidden p-6 transition-all duration-300 hover:scale-[1.01] hover:border-cyan-400/40"
                  style={{ animationDelay: `${idx * 0.4}s` }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-bold text-white group-hover:text-cyan-300 transition-colors">
                          {debt.name}
                        </h3>
                        <Link
                          href={`/emi/edit?debt_id=${debt.id}`}
                          className="flex h-6 w-6 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-400 hover:text-white hover:border-cyan-400/50 hover:bg-white/10 transition-all"
                          title="Edit Loan"
                        >
                          <Pencil className="h-3 w-3" />
                        </Link>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-400">
                        {debt.lender_name || formatLabel(debt.debt_type)}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge
                        variant="outline"
                        className={`text-[10px] uppercase font-bold tracking-wider ${
                          isLoan
                            ? "border-cyan-500/40 text-cyan-300 bg-cyan-950/30"
                            : "border-purple-500/40 text-purple-300 bg-purple-950/30"
                        }`}
                      >
                        {isLoan ? "Loan EMI" : "Card EMI"}
                      </Badge>
                      <Badge
                        variant={isActive ? "cyan" : "outline"}
                        className="text-[10px] uppercase font-bold tracking-wider"
                      >
                        {formatLabel(debt.status)}
                      </Badge>
                    </div>
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Remaining Principal
                      </p>
                      <p className="mt-1 text-xl font-black text-cyan-300 tabular-nums">
                        {money(estimatedPrincipal)}
                      </p>
                    </div>

                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Monthly EMI
                      </p>
                      <p className="mt-1 text-xl font-black text-white tabular-nums">
                        {money(debt.emi_amount_paise)}
                      </p>
                    </div>

                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Original Principal
                      </p>
                      <p className="mt-0.5 text-xs font-semibold text-slate-300 tabular-nums">
                        {money(debt.original_principal_paise)}
                      </p>
                    </div>

                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Interest Rate
                      </p>
                      <p className="mt-0.5 text-xs font-semibold text-slate-300 tabular-nums">
                        {debt.annual_interest_rate_basis_points == null
                          ? "Not specified"
                          : `${(
                              numeric(debt.annual_interest_rate_basis_points) / 100
                            ).toFixed(2)}%`}
                      </p>
                    </div>
                  </div>

                  {/* Amortization Progress Meter */}
                  <div className="mt-5 border-t border-white/10 pt-3">
                    <div className="flex justify-between text-xs text-slate-400 mb-1.5">
                      <span>Tenure Progress</span>
                      <span className="font-semibold text-white">
                        {Math.min(paid, debt.total_tenure_months)} of {debt.total_tenure_months} months
                      </span>
                    </div>

                    <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-teal-400 transition-all duration-500"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>

                  <div className="mt-4 space-y-1 text-xs text-slate-400 border-t border-white/10 pt-3">
                    <p className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-slate-500" />
                      <span>Next due date: <strong className="text-white">{dateLabel(debt.next_due_date)}</strong></span>
                    </p>

                    {debt.payment_account_id && (
                      <p className="flex items-center gap-1.5">
                        <Landmark className="h-3.5 w-3.5 text-slate-500" />
                        <span>Paying account: {accountNames.get(debt.payment_account_id) ?? "Linked account"}</span>
                      </p>
                    )}

                    {debt.linked_credit_card_id && (
                      <p className="flex items-center gap-1.5">
                        <CreditCard className="h-3.5 w-3.5 text-slate-500" />
                        <span>Linked credit card: {cardNames.get(debt.linked_credit_card_id) ?? "Linked card"}</span>
                      </p>
                    )}
                  </div>

                  {charges.hasCharges && (
                    <div className="mt-4 flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          Additional Charges
                        </span>
                        {charges.description && (
                          <span className="rounded-md bg-white/5 px-2 py-0.5 text-[11px] font-medium text-slate-300 border border-white/10">
                            {charges.description}
                          </span>
                        )}
                      </div>
                      <span className="font-bold text-white tabular-nums">
                        {money(charges.chargesPaise)}
                      </span>
                    </div>
                  )}

                  {unknownBreakdowns > 0 && (
                    <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs leading-5 text-amber-300">
                      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
                      <p>
                        {unknownBreakdowns} payment{unknownBreakdowns === 1 ? "" : "s"} recorded after snapshot without principal breakdown. Add principal amount for exact balance tracking.
                      </p>
                    </div>
                  )}

                  {displayNotes && (
                    <p className="mt-3 text-xs text-slate-400 italic bg-white/5 p-2.5 rounded-xl border border-white/5">
                      &ldquo;{displayNotes}&rdquo;
                    </p>
                  )}

                  {isActive ? (
                    <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {isLoan ? (
                        <Link
                          href={`/emi/schedule?debt_id=${debt.id}`}
                          className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-cyan-500 via-teal-500 to-emerald-500 px-3 py-2.5 text-xs font-bold text-slate-950 shadow-md shadow-cyan-500/20 transition-all hover:brightness-110 active:scale-[0.99]"
                        >
                          <Calendar className="h-3.5 w-3.5" />
                          <span>Schedule</span>
                        </Link>
                      ) : (
                        <Link
                          href="/cards"
                          className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-purple-600 px-3 py-2.5 text-xs font-bold text-white shadow-md shadow-purple-600/20 transition-all hover:bg-purple-500 active:scale-[0.99]"
                        >
                          <CreditCard className="h-3.5 w-3.5" />
                          <span>Card Details</span>
                        </Link>
                      )}

                      <Link
                        href={`/emi/edit?debt_id=${debt.id}`}
                        className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs font-bold text-slate-300 transition-all hover:bg-white/10 hover:text-white active:scale-[0.99]"
                      >
                        <Pencil className="h-3.5 w-3.5 text-cyan-400" />
                        <span>Edit Loan</span>
                      </Link>

                      <Link
                        href={`/emi/foreclosure?debt_id=${debt.id}`}
                        className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs font-bold text-slate-300 transition-all hover:bg-white/10 hover:text-rose-300 active:scale-[0.99]"
                      >
                        <span>Foreclose</span>
                        <ArrowRight className="h-3 w-3" />
                      </Link>
                    </div>
                  ) : (
                    <div className="mt-5 flex items-center justify-between gap-2 border border-emerald-500/30 bg-emerald-950/20 p-2.5 rounded-xl">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        <span>Foreclosed · Settled in Full</span>
                      </div>
                      <Link
                        href={`/emi/edit?debt_id=${debt.id}`}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400 hover:text-white"
                      >
                        <Pencil className="h-3 w-3" />
                        <span>Edit</span>
                      </Link>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Footer */}
      <p className="pt-4 text-center text-xs leading-5 text-slate-500">
        AURA Wealth · Private financial telemetry. Calculations computed from verified database records.
      </p>
    </div>
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
        <div className="mx-auto max-w-5xl px-4 py-16 text-center text-sm text-slate-400">
          <div className="mx-auto h-5 w-5 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
          <p className="mt-3">Loading loans...</p>
        </div>
      }
    >
      <EmiPageData searchParams={searchParams} />
    </Suspense>
  );
}
