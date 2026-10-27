import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ScheduledEmiForm from "./ScheduledEmiForm";
import type { LoanOption, AccountOption, CardOption } from "./ScheduledEmiForm";
import {
  generateAmortizationSchedule,
  getEmiCategory,
  isLoanEligibleForAmortization,
} from "@/lib/finance/amortization";
import {
  ArrowLeft,
  Calendar,
  Receipt,
  Zap,
} from "lucide-react";

type SearchParams = Promise<{
  debt_id?: string;
  created?: string;
  error?: string;
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

async function PaymentsContent({
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

  type CreditCardOptionRow = {
    id: string;
    name: string;
    bank_name: string;
    last_four_digits: string | null;
  };

  const [debtResult, accountResult, paymentResult, cardResult] = await Promise.all([
    supabase
      .from("emi_debts")
      .select(
        "id,name,debt_type,lender_name,linked_credit_card_id,payment_account_id,original_principal_paise,current_outstanding_principal_paise,outstanding_as_of_date,annual_interest_rate_basis_points,interest_method,total_tenure_months,installments_paid_before_tracking,emi_amount_paise,first_emi_due_date,next_due_date,status"
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),

    supabase
      .from("accounts")
      .select("id,name,account_type,institution")
      .eq("user_id", userId)
      .eq("is_archived", false)
      .order("name"),

    supabase
      .from("emi_payments")
      .select(
        "id,debt_id,payment_date,installment_number,payment_kind,amount_paise,principal_component_paise,interest_component_paise,payment_method,notes"
      )
      .eq("user_id", userId)
      .order("payment_date", { ascending: false }),

    supabase
      .from("credit_cards")
      .select("id,name,bank_name,last_four_digits")
      .eq("user_id", userId)
      .eq("is_archived", false)
      .order("name"),
  ]);

  const allDebts = (debtResult.data ?? []) as unknown as EmiDebtRow[];
  const activeDebts = allDebts.filter((d) => d.status === "active");
  const accounts = (accountResult.data ?? []) as unknown as AccountRow[];
  const payments = (paymentResult.data ?? []) as unknown as PaymentRow[];
  const cards = (cardResult.data ?? []) as unknown as CreditCardOptionRow[];

  const debtMap = new Map(allDebts.map((d) => [d.id, d.name]));

  // Pre-calculate loan options with exact next installment number and split
  const loanOptions: LoanOption[] = activeDebts.map((debt) => {
    const category = getEmiCategory(debt);
    const debtPayments = payments.filter((p) => p.debt_id === debt.id);

    let nextInstallmentNumber =
      debt.installments_paid_before_tracking +
      debtPayments.filter((p) => p.payment_kind === "scheduled_emi").length +
      1;

    let expectedPrincipalRupees: string | undefined;
    let expectedInterestRupees: string | undefined;
    let outstandingRupees: string | undefined;

    if (category === "loan_emi" && isLoanEligibleForAmortization(debt)) {
      const schedule = generateAmortizationSchedule({
        principalPaise: numeric(debt.original_principal_paise),
        annualInterestRateBasisPoints: numeric(
          debt.annual_interest_rate_basis_points
        ),
        totalTenureMonths: debt.total_tenure_months,
        firstEmiDate: debt.first_emi_due_date,
        emiAmountPaise: numeric(debt.emi_amount_paise),
        installmentsPaidBeforeTracking: debt.installments_paid_before_tracking,
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
      });

      if (schedule.nextDueInstallment) {
        nextInstallmentNumber = schedule.nextDueInstallment.installmentNumber;
        expectedPrincipalRupees = (
          schedule.nextDueInstallment.principalPaise / 100
        ).toFixed(2);
        expectedInterestRupees = (
          schedule.nextDueInstallment.interestPaise / 100
        ).toFixed(2);
      }
      outstandingRupees = (schedule.remainingPrincipalPaise / 100).toFixed(2);
    } else {
      outstandingRupees = (
        numeric(debt.current_outstanding_principal_paise) / 100
      ).toFixed(2);
    }

    return {
      id: debt.id,
      label: `${debt.name}${debt.lender_name ? ` · ${debt.lender_name}` : ""}`,
      emiRupees: (numeric(debt.emi_amount_paise) / 100).toFixed(2),
      nextInstallmentNumber: Math.min(
        debt.total_tenure_months,
        nextInstallmentNumber
      ),
      totalTenureMonths: debt.total_tenure_months,
      nextDueDate: debt.next_due_date,
      category,
      linkedCreditCardId: debt.linked_credit_card_id ?? null,
      expectedPrincipalRupees,
      expectedInterestRupees,
      outstandingRupees,
    };
  });

  const accountOptions: AccountOption[] = accounts.map((a) => ({
    id: a.id,
    label: `${a.name}${a.institution ? ` · ${a.institution}` : ""}`,
  }));

  const cardOptions: CardOption[] = cards.map((c) => ({
    id: c.id,
    label: `${c.bank_name} ${c.name}${c.last_four_digits ? ` (••${c.last_four_digits})` : ""}`,
  }));

  const today = todayInIndia();

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 px-4 py-4 sm:px-6 pb-20">
      {/* Top Heading */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Link
              href="/emi"
              className="text-slate-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
              Record EMI Payment
            </h1>
          </div>
          <p className="mt-0.5 text-xs text-slate-400">
            Log an installment payment and update your loan ledger with verified principal reduction
          </p>
        </div>

        <Link
          href="/emi/schedule"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-cyan-300 hover:text-cyan-200"
        >
          <Calendar className="h-3.5 w-3.5" />
          <span>View Full Schedule</span>
        </Link>
      </div>

      {/* Notifications */}
      {params.created === "1" && (
        <div
          role="status"
          className="flex items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-950/40 px-5 py-4 text-xs sm:text-sm font-semibold text-emerald-300 shadow-xl backdrop-blur-xl animate-float-slow"
        >
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
            <Zap className="h-4 w-4" />
          </div>
          <p>
            Payment recorded successfully. Your loan ledger and remaining principal balance have been updated.
          </p>
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

      {/* Form Card */}
      <section className="aura-panel p-6 sm:p-8 space-y-6">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-400 ring-1 ring-cyan-500/30">
            <Receipt className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold tracking-tight text-white">
              Log Scheduled Installment
            </h2>
            <p className="text-xs text-slate-400">
              For reducing-balance loans, principal and interest splits are calculated automatically from your schedule.
            </p>
          </div>
        </div>

        {loanOptions.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-8 text-center">
            <p className="text-sm font-semibold text-white">No active loans found</p>
            <p className="mt-1 text-xs text-slate-400">
              Add a loan on the Loans Overview page before recording installment payments.
            </p>
            <Link
              href="/emi"
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-4 py-2 text-xs font-bold text-slate-950"
            >
              <span>Add Loan</span>
            </Link>
          </div>
        ) : (
          <ScheduledEmiForm
            loans={loanOptions}
            accounts={accountOptions}
            cards={cardOptions}
            today={today}
            defaultDebtId={params.debt_id}
          />
        )}
      </section>

      {/* Payment History Table */}
      {payments.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
            <h2 className="text-base sm:text-lg font-bold tracking-tight text-white">
              Recorded EMI Payments ({payments.length})
            </h2>
          </div>

          <div className="aura-panel overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs whitespace-nowrap">
                <thead>
                  <tr className="border-b border-white/10 bg-white/[0.04] text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Loan / EMI</th>
                    <th className="px-4 py-3 text-center">Installment</th>
                    <th className="px-4 py-3 text-right">Amount Paid</th>
                    <th className="px-4 py-3 text-right text-emerald-400">Principal</th>
                    <th className="px-4 py-3 text-right text-amber-300">Interest</th>
                    <th className="px-4 py-3">Method</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 font-medium">
                  {payments.map((payment) => (
                    <tr key={payment.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3 text-slate-200">
                        {dateLabel(payment.payment_date)}
                      </td>
                      <td className="px-4 py-3 font-semibold text-white">
                        {debtMap.get(payment.debt_id) ?? "Loan"}
                      </td>
                      <td className="px-4 py-3 text-center font-bold text-slate-300">
                        {payment.installment_number ? `#${payment.installment_number}` : "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-white tabular-nums">
                        {money(payment.amount_paise)}
                      </td>
                      <td className="px-4 py-3 text-right text-emerald-400 tabular-nums">
                        {payment.principal_component_paise != null
                          ? money(payment.principal_component_paise)
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-right text-amber-300/90 tabular-nums">
                        {payment.interest_component_paise != null
                          ? money(payment.interest_component_paise)
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-400">
                        {payment.payment_method === "bank_debit"
                          ? "Bank Debit"
                          : payment.payment_method === "foreclosure"
                          ? "Foreclosure Payoff"
                          : payment.payment_method === "billed_to_credit_card"
                          ? "Card Billed"
                          : "Manual"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

export default function PaymentsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-5xl px-4 py-16 text-center text-sm text-slate-400">
          <div className="mx-auto h-5 w-5 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
          <p className="mt-3">Loading payments...</p>
        </div>
      }
    >
      <PaymentsContent searchParams={searchParams} />
    </Suspense>
  );
}
