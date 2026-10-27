import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  generateAmortizationSchedule,
  getEmiCategory,
  isLoanEligibleForAmortization,
} from "@/lib/finance/amortization";
import {
  extractAdditionalCharges,
  stripChargesFromNotes,
} from "@/lib/finance/emi-charges";
import {
  ArrowLeft,
  Calendar,
  CreditCard,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Receipt,
  ArrowRight,
  TrendingDown,
  Info,
  Pencil,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import DebtScheduleSelector from "./DebtScheduleSelector";

type SearchParams = Promise<{
  debt_id?: string;
}>;

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

type CardRow = {
  id: string;
  name: string;
  bank_name: string | null;
  last_four_digits: string | null;
};

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
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

async function RepaymentScheduleContent({
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

  if (claimsError || !userId) {
    redirect("/login");
  }

  const [debtResult, paymentResult, cardResult] = await Promise.all([
    supabase
      .from("emi_debts")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),

    supabase
      .from("emi_payments")
      .select(
        "id,debt_id,payment_date,installment_number,payment_kind,amount_paise,principal_component_paise,interest_component_paise,payment_method"
      )
      .eq("user_id", userId)
      .order("payment_date", { ascending: true }),

    supabase
      .from("credit_cards")
      .select("id,name,bank_name,last_four_digits")
      .eq("user_id", userId)
      .eq("is_archived", false),
  ]);

  const debts = (debtResult.data ?? []) as unknown as EmiDebtRow[];
  const payments = (paymentResult.data ?? []) as unknown as PaymentRow[];
  const cards = (cardResult.data ?? []) as unknown as CardRow[];

  const cardMap = new Map(
    cards.map((c) => [
      c.id,
      `${c.name}${c.last_four_digits ? ` (···· ${c.last_four_digits})` : ""}`,
    ])
  );

  if (debts.length === 0) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-400 ring-1 ring-cyan-500/30">
          <Calendar className="h-7 w-7" />
        </div>
        <h2 className="mt-4 text-lg font-bold text-white">No Loans Registered</h2>
        <p className="mt-1 text-xs text-slate-400 max-w-sm mx-auto">
          Add an amortized personal or vehicle loan on the Loans Overview page to generate your repayment schedule.
        </p>
        <Link
          href="/emi"
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-5 py-2.5 text-xs font-bold text-slate-950 transition-all hover:bg-cyan-400"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Loans Overview</span>
        </Link>
      </div>
    );
  }

  // Find targeted debt or default to first loan EMI (or first debt)
  const selectedDebt =
    debts.find((d) => d.id === params.debt_id) ??
    debts.find((d) => getEmiCategory(d) === "loan_emi") ??
    debts[0];

  const category = getEmiCategory(selectedDebt);
  const isEligible = isLoanEligibleForAmortization(selectedDebt);

  const debtCharges = extractAdditionalCharges(selectedDebt);
  const displayNotes = selectedDebt.notes
    ? stripChargesFromNotes(selectedDebt.notes)
    : null;

  const debtPayments = payments.filter((p) => p.debt_id === selectedDebt.id);

  // Generate schedule if eligible
  const schedule = isEligible
    ? generateAmortizationSchedule({
        principalPaise: numeric(selectedDebt.original_principal_paise),
        annualInterestRateBasisPoints: numeric(
          selectedDebt.annual_interest_rate_basis_points
        ),
        totalTenureMonths: selectedDebt.total_tenure_months,
        firstEmiDate: selectedDebt.first_emi_due_date,
        emiAmountPaise: numeric(selectedDebt.emi_amount_paise),
        installmentsPaidBeforeTracking:
          selectedDebt.installments_paid_before_tracking,
        actualPayments: debtPayments.map((p) => ({
          date: p.payment_date,
          installmentNumber: p.installment_number,
          amountPaise: numeric(p.amount_paise),
          principalComponentPaise:
            p.principal_component_paise != null
              ? numeric(p.principal_component_paise)
              : null,
          interestComponentPaise:
            p.interest_component_paise != null
              ? numeric(p.interest_component_paise)
              : null,
          paymentKind: p.payment_kind,
        })),
      })
    : null;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-4 sm:px-6 pb-20">
      {/* Top Bar & Loan Selector */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Link
              href="/emi"
              className="text-slate-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
              Repayment Schedule
            </h1>
          </div>
          <p className="mt-0.5 text-xs text-slate-400">
            Installment-by-installment monthly amortization forecast and actual settlement ledger
          </p>
        </div>

        {/* Loan Dropdown Switcher */}
        {debts.length > 1 && (
          <DebtScheduleSelector
            debts={debts.map((d) => ({
              id: d.id,
              name: d.name,
              lenderName: d.lender_name,
            }))}
            selectedDebtId={selectedDebt.id}
          />
        )}
      </div>

      {/* Credit Card EMI Notice Branch */}
      {category === "credit_card_emi" ? (
        <div className="aura-panel p-6 sm:p-8 space-y-6">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-purple-400/30 bg-purple-500/10 text-purple-400">
              <CreditCard className="h-6 w-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-bold text-white">{selectedDebt.name}</h2>
                <Badge variant="outline" className="border-purple-500/30 text-purple-300 bg-purple-950/30">
                  Credit Card EMI
                </Badge>
                <Badge variant="outline" className="border-white/10 text-slate-300">
                  {formatLabel(selectedDebt.status)}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-slate-400">
                Linked to {cardMap.get(selectedDebt.linked_credit_card_id ?? "") ?? "Credit Card"}
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-purple-500/20 bg-purple-950/20 p-5 text-xs text-slate-300 space-y-2">
            <p className="font-semibold text-purple-200 flex items-center gap-2">
              <Info className="h-4 w-4 text-purple-400" />
              Statement-Billed Repayment Model
            </p>
            <p className="text-slate-400 leading-relaxed">
              This commitment is a Credit Card EMI billed directly to your credit card monthly statement by your card issuer. Unlike amortized term loans, card installments are billed as statement line-items. Reducing-balance amortization does not apply to this card conversion.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-[10px] font-bold uppercase text-slate-400">Converted Amount</p>
              <p className="mt-1 text-lg font-black text-white tabular-nums">
                {money(selectedDebt.original_principal_paise)}
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-[10px] font-bold uppercase text-slate-400">Monthly EMI</p>
              <p className="mt-1 text-lg font-black text-purple-300 tabular-nums">
                {money(selectedDebt.emi_amount_paise)}
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-[10px] font-bold uppercase text-slate-400">Total Tenure</p>
              <p className="mt-1 text-lg font-black text-white tabular-nums">
                {selectedDebt.total_tenure_months} months
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-[10px] font-bold uppercase text-slate-400">Next Statement Due</p>
              <p className="mt-1 text-sm font-bold text-white">
                {dateLabel(selectedDebt.next_due_date)}
              </p>
            </div>
          </div>

          {debtCharges.hasCharges && (
            <div className="flex items-center justify-between rounded-xl border border-purple-500/30 bg-purple-950/20 px-4 py-3 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-purple-300">
                  Additional Charges
                </span>
                {debtCharges.description && (
                  <span className="rounded-md bg-purple-500/20 px-2 py-0.5 text-[11px] font-semibold text-purple-200 border border-purple-500/30">
                    {debtCharges.description}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="font-black text-white tabular-nums text-sm">
                  {money(debtCharges.chargesPaise)}
                </span>
                <span className="text-[10px] text-purple-300/70">
                  (Card conversion fee)
                </span>
              </div>
            </div>
          )}

          {displayNotes && (
            <p className="text-xs text-slate-400 italic bg-white/5 p-3 rounded-xl border border-white/5">
              &ldquo;{displayNotes}&rdquo;
            </p>
          )}

          <div className="flex flex-wrap gap-3 pt-2">
            <Link
              href={`/emi/edit?debt_id=${selectedDebt.id}`}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-bold text-slate-300 transition-all hover:bg-white/10"
            >
              <Pencil className="h-3.5 w-3.5" />
              <span>Edit EMI</span>
            </Link>
            <Link
              href="/cards"
              className="inline-flex items-center gap-2 rounded-xl bg-purple-600 px-5 py-2.5 text-xs font-bold text-white transition-all hover:bg-purple-500"
            >
              <CreditCard className="h-4 w-4" />
              <span>View Credit Cards</span>
            </Link>
            <Link
              href={`/emi/foreclosure?debt_id=${selectedDebt.id}`}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-5 py-2.5 text-xs font-bold text-slate-300 transition-all hover:bg-white/10"
            >
              <span>Foreclose / Close EMI</span>
            </Link>
          </div>
        </div>
      ) : !isEligible || !schedule || !schedule.isValid ? (
        /* Incomplete Loan Terms Notice */
        <div className="aura-panel p-6 sm:p-8 space-y-4">
          <div className="flex items-center gap-3 text-amber-400">
            <AlertTriangle className="h-6 w-6" />
            <h2 className="text-base font-bold text-white">Incomplete Loan Amortization Terms</h2>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            To generate a mathematically verified reducing-balance schedule, this loan requires an annual interest rate, loan tenure in months, and a valid first EMI date.
          </p>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-xs text-slate-400 space-y-1">
            <p><strong>Loan:</strong> {selectedDebt.name}</p>
            <p><strong>Lender:</strong> {selectedDebt.lender_name || "Not specified"}</p>
            <p><strong>Interest Rate:</strong> {selectedDebt.annual_interest_rate_basis_points ? `${numeric(selectedDebt.annual_interest_rate_basis_points) / 100}%` : "Missing"}</p>
            <p><strong>Tenure:</strong> {selectedDebt.total_tenure_months ? `${selectedDebt.total_tenure_months} months` : "Missing"}</p>
          </div>
          <Link
            href={`/emi/edit?debt_id=${selectedDebt.id}`}
            className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-5 py-2.5 text-xs font-bold text-slate-950"
          >
            <span>Update Loan Terms</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      ) : (
        /* Standard Amortization Schedule View */
        <div className="space-y-6">
          {/* Loan Header Card with Authority Badges */}
          <div className="aura-panel p-6 sm:p-7 space-y-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <h2 className="text-lg sm:text-xl font-black text-white">
                    {selectedDebt.name}
                  </h2>
                  <Badge variant="cyan" className="text-[10px] uppercase font-bold tracking-wider">
                    {formatLabel(selectedDebt.status)}
                  </Badge>
                  <Badge variant="outline" className="border-cyan-500/30 bg-cyan-950/30 text-cyan-300 text-[10px] uppercase font-bold">
                    {selectedDebt.lender_name || formatLabel(selectedDebt.debt_type)}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  First EMI Date: <strong className="text-slate-300">{dateLabel(schedule.firstEmiDate)}</strong> · Method: <strong className="text-slate-300">Monthly Reducing Balance</strong>
                </p>
              </div>

              {/* Action buttons */}
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/emi/edit?debt_id=${selectedDebt.id}`}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold text-slate-300 transition-all hover:bg-white/10 active:scale-[0.99]"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  <span>Edit Loan</span>
                </Link>

                <Link
                  href={`/emi/payments?debt_id=${selectedDebt.id}`}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 px-4 py-2 text-xs font-bold text-slate-950 shadow-md shadow-cyan-500/20 transition-all hover:brightness-110 active:scale-[0.99]"
                >
                  <Receipt className="h-3.5 w-3.5" />
                  <span>Record Payment</span>
                </Link>

                <Link
                  href={`/emi/foreclosure?debt_id=${selectedDebt.id}`}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold text-slate-300 transition-all hover:bg-white/10 active:scale-[0.99]"
                >
                  <span>Foreclose</span>
                  <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </div>

            {/* Disclaimer & Authority Banner */}
            <div className="rounded-xl border border-cyan-500/20 bg-cyan-950/20 px-4 py-3 text-xs text-cyan-300 flex items-start gap-2.5">
              <Info className="h-4 w-4 shrink-0 text-cyan-400 mt-0.5" />
              <div className="space-y-0.5">
                <p className="font-semibold text-white">
                  Estimated Schedule · Standard Monthly Reducing Balance
                </p>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Calculated using nominal monthly compounding. Actual lender figures may vary marginally depending on specific day-count conventions (such as 30/360 or Actual/365), holiday shifts, or processing fees.
                </p>
              </div>
            </div>

            {/* 10 Core Loan Overview KPIs */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5 pt-2">
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5 space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Original Principal
                </span>
                <p className="text-base font-black text-white tabular-nums">
                  {money(schedule.originalPrincipalPaise)}
                </p>
                <span className="text-[10px] text-slate-500">Contract amount</span>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5 space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Interest Rate
                </span>
                <p className="text-base font-black text-cyan-300 tabular-nums">
                  {schedule.annualInterestRatePercent.toFixed(2)}% p.a.
                </p>
                <span className="text-[10px] text-slate-500">Nominal reducing</span>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5 space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Total Tenure
                </span>
                <p className="text-base font-black text-white tabular-nums">
                  {schedule.totalTenureMonths} Mos
                </p>
                <span className="text-[10px] text-slate-500">
                  {schedule.paidInstallmentsCount} paid · {schedule.remainingInstallmentsCount} left
                </span>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5 space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Monthly EMI
                </span>
                <p className="text-base font-black text-[#4edea3] tabular-nums">
                  {money(schedule.monthlyEmiPaise)}
                </p>
                <span className="text-[10px] text-slate-500">Scheduled outlay</span>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5 space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Next Due Date
                </span>
                <p className="text-base font-black text-white tabular-nums">
                  {schedule.nextDueInstallment ? dateLabel(schedule.nextDueInstallment.dueDate) : "Completed"}
                </p>
                <span className="text-[10px] text-slate-500">
                  {schedule.nextDueInstallment ? `EMI #${schedule.nextDueInstallment.installmentNumber}` : "All paid"}
                </span>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5 space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Projected Interest
                </span>
                <p className="text-base font-black text-amber-300 tabular-nums">
                  {money(schedule.totalProjectedInterestPaise)}
                </p>
                <span className="text-[10px] text-slate-500">Total over tenure</span>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5 space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Total Repayment
                </span>
                <p className="text-base font-black text-white tabular-nums">
                  {money(schedule.totalProjectedRepaymentPaise)}
                </p>
                <span className="text-[10px] text-slate-500">Principal + interest</span>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5 space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Principal Repaid
                </span>
                <p className="text-base font-black text-emerald-400 tabular-nums">
                  {money(schedule.principalRepaidPaise)}
                </p>
                <span className="text-[10px] text-slate-500">Actual confirmed</span>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5 space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Remaining Principal
                </span>
                <p className="text-base font-black text-cyan-300 tabular-nums">
                  {money(schedule.remainingPrincipalPaise)}
                </p>
                <span className="text-[10px] text-slate-500">Current balance</span>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5 space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Principal Progress
                </span>
                <p className="text-base font-black text-cyan-400 tabular-nums">
                  {schedule.repaymentProgressPercent}%
                </p>
                <span className="text-[10px] text-slate-500">Repaid of principal</span>
              </div>
            </div>

            {debtCharges.hasCharges && (
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Additional Charges (One-Time / Upfront)
                  </span>
                  {debtCharges.description && (
                    <span className="rounded-md bg-white/5 px-2 py-0.5 text-[11px] font-medium text-slate-300 border border-white/10">
                      {debtCharges.description}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-black text-white tabular-nums text-sm">
                    {money(debtCharges.chargesPaise)}
                  </span>
                  <span className="text-[10px] text-slate-500">
                    (Excluded from reducing-balance principal & interest)
                  </span>
                </div>
              </div>
            )}

            {displayNotes && (
              <p className="text-xs text-slate-400 italic bg-white/5 p-3 rounded-xl border border-white/5">
                &ldquo;{displayNotes}&rdquo;
              </p>
            )}

            {/* Principal Amortization Progress Meter */}
            <div className="border-t border-white/10 pt-4 space-y-2">
              <div className="flex justify-between text-xs text-slate-400">
                <span>Principal Repayment Progress</span>
                <span className="font-semibold text-white">
                  {money(schedule.principalRepaidPaise)} repaid of {money(schedule.originalPrincipalPaise)} ({schedule.repaymentProgressPercent}%)
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-teal-400 to-[#4edea3] transition-all duration-500"
                  style={{ width: `${schedule.repaymentProgressPercent}%` }}
                />
              </div>
            </div>
          </div>

          {/* Upcoming Installment Card & Cumulative Interest Breakdown */}
          {schedule.nextDueInstallment && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="aura-panel p-5 space-y-3 border-cyan-500/30 bg-cyan-950/20">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-cyan-400" />
                    <span className="text-xs font-bold text-cyan-300 uppercase tracking-wider">
                      Upcoming Installment #{schedule.nextDueInstallment.installmentNumber}
                    </span>
                  </div>
                  <Badge variant="cyan" className="text-[10px] uppercase font-bold">
                    Due {dateLabel(schedule.nextDueInstallment.dueDate)}
                  </Badge>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-1 text-center">
                  <div className="rounded-lg bg-white/5 p-2">
                    <span className="text-[10px] text-slate-400 uppercase">Total EMI</span>
                    <p className="text-sm font-black text-white tabular-nums">
                      {money(schedule.nextDueInstallment.emiAmountPaise)}
                    </p>
                  </div>
                  <div className="rounded-lg bg-emerald-500/10 p-2 border border-emerald-500/20">
                    <span className="text-[10px] text-emerald-300 uppercase">Principal Split</span>
                    <p className="text-sm font-black text-emerald-300 tabular-nums">
                      {money(schedule.nextDueInstallment.principalPaise)}
                    </p>
                  </div>
                  <div className="rounded-lg bg-amber-500/10 p-2 border border-amber-500/20">
                    <span className="text-[10px] text-amber-300 uppercase">Interest Split</span>
                    <p className="text-sm font-black text-amber-300 tabular-nums">
                      {money(schedule.nextDueInstallment.interestPaise)}
                    </p>
                  </div>
                </div>

                <p className="text-[11px] text-slate-400">
                  Closing principal after this installment will reduce to{" "}
                  <strong className="text-white">{money(schedule.nextDueInstallment.closingPrincipalPaise)}</strong>.
                </p>
              </div>

              <div className="aura-panel p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <TrendingDown className="h-4 w-4 text-emerald-400" />
                    <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                      Cumulative Cost Analysis
                    </span>
                  </div>
                  <span className="text-xs text-slate-400">
                    {schedule.remainingInstallmentsCount} installments remaining
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div className="rounded-lg bg-white/5 p-2.5 space-y-0.5">
                    <span className="text-[10px] text-slate-400 uppercase">Interest Paid To Date</span>
                    <p className="text-sm font-black text-white tabular-nums">
                      {money(schedule.interestPaidPaise)}
                    </p>
                  </div>

                  <div className="rounded-lg bg-white/5 p-2.5 space-y-0.5">
                    <span className="text-[10px] text-slate-400 uppercase">Future Projected Interest</span>
                    <p className="text-sm font-black text-amber-300 tabular-nums">
                      {money(schedule.remainingProjectedInterestPaise)}
                    </p>
                  </div>
                </div>

                <p className="text-[11px] text-slate-400">
                  Foreclosing today saves approximately{" "}
                  <strong className="text-[#4edea3]">{money(schedule.remainingProjectedInterestPaise)}</strong> in future interest.
                </p>
              </div>
            </div>
          )}

          {/* Full Installment Amortization Table */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
                <h3 className="text-base font-bold text-white tracking-tight">
                  Complete Installment Schedule ({schedule.installments.length} Months)
                </h3>
              </div>
              <span className="text-xs text-slate-400 hidden sm:inline">
                Scroll horizontally on small screens
              </span>
            </div>

            <div className="aura-panel overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs whitespace-nowrap">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/[0.04] text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      <th className="px-4 py-3 text-center">EMI #</th>
                      <th className="px-4 py-3">Due Date</th>
                      <th className="px-4 py-3 text-right">Scheduled EMI</th>
                      <th className="px-4 py-3 text-right text-emerald-400">Principal</th>
                      <th className="px-4 py-3 text-right text-amber-300">Interest</th>
                      <th className="px-4 py-3 text-right text-cyan-300">Closing Balance</th>
                      <th className="px-4 py-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-medium">
                    {schedule.installments.map((inst) => {
                      const isNext =
                        schedule.nextDueInstallment?.installmentNumber ===
                        inst.installmentNumber;

                      return (
                        <tr
                          key={inst.installmentNumber}
                          className={`transition-colors ${
                            isNext
                              ? "bg-cyan-500/10 font-bold"
                              : inst.isPaid
                              ? "bg-white/[0.01] hover:bg-white/[0.03]"
                              : "hover:bg-white/[0.02]"
                          }`}
                        >
                          <td className="px-4 py-3 text-center font-bold text-slate-300">
                            #{inst.installmentNumber}
                          </td>
                          <td className="px-4 py-3 text-slate-200">
                            {dateLabel(inst.dueDate)}
                          </td>
                          <td className="px-4 py-3 text-right text-white tabular-nums font-semibold">
                            {money(inst.emiAmountPaise)}
                          </td>
                          <td className="px-4 py-3 text-right text-emerald-400 tabular-nums">
                            {money(inst.principalPaise)}
                          </td>
                          <td className="px-4 py-3 text-right text-amber-300/90 tabular-nums">
                            {money(inst.interestPaise)}
                          </td>
                          <td className="px-4 py-3 text-right text-cyan-300 tabular-nums font-bold">
                            {money(inst.closingPrincipalPaise)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {inst.isPaid ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-500/30">
                                <CheckCircle2 className="h-3 w-3" />
                                <span>Paid</span>
                              </span>
                            ) : inst.status === "due" ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-cyan-500/20 px-2.5 py-0.5 text-[10px] font-bold text-cyan-300 border border-cyan-400/40 animate-pulse">
                                <Clock className="h-3 w-3" />
                                <span>Due Today</span>
                              </span>
                            ) : inst.status === "overdue" ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/20 px-2.5 py-0.5 text-[10px] font-bold text-rose-300 border border-rose-500/40">
                                <AlertTriangle className="h-3 w-3" />
                                <span>Overdue</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-2.5 py-0.5 text-[10px] font-semibold text-slate-400 border border-white/5">
                                <span>Upcoming</span>
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

export default function RepaymentSchedulePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-5xl px-4 py-16 text-center text-sm text-slate-400">
          <div className="mx-auto h-5 w-5 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
          <p className="mt-3">Generating repayment schedule...</p>
        </div>
      }
    >
      <RepaymentScheduleContent searchParams={searchParams} />
    </Suspense>
  );
}
