/**
 * Reusable Monthly Reducing-Balance Loan Amortization Engine
 *
 * Implements standard monthly reducing-balance amortization schedules:
 * - Integer paise arithmetic to prevent floating-point drift.
 * - Accurate periodic interest: round(openingPrincipal * (annualRate / 12)).
 * - Exact final-installment reconciliation to eliminate residual paise.
 * - Preserves calendar anchor days across month ends and leap years.
 * - Distinguishes actual recorded payments from projected future installments.
 */

export type EmiCategory = "loan_emi" | "credit_card_emi";

/**
 * Distinguishes between Loan EMI (advanced reducing-balance schedule)
 * and Credit Card EMI (existing workflow).
 */
export function getEmiCategory(debt: {
  debtType?: string;
  debt_type?: string;
  linkedCreditCardId?: string | null;
  linked_credit_card_id?: string | null;
}): EmiCategory {
  const type = debt.debtType ?? debt.debt_type ?? "";
  const linkedCard = debt.linkedCreditCardId ?? debt.linked_credit_card_id;

  if (type === "credit_card_emi" || Boolean(linkedCard)) {
    return "credit_card_emi";
  }

  return "loan_emi";
}

/**
 * Determines whether a debt record has the necessary information
 * to generate a reducing-balance amortization schedule.
 */
export function isLoanEligibleForAmortization(debt: {
  debtType?: string;
  debt_type?: string;
  linkedCreditCardId?: string | null;
  linked_credit_card_id?: string | null;
  annualInterestRateBasisPoints?: number | null;
  annual_interest_rate_basis_points?: number | string | null;
  totalTenureMonths?: number | null;
  total_tenure_months?: number | string | null;
  firstEmiDueDate?: string | null;
  first_emi_due_date?: string | null;
}): boolean {
  const category = getEmiCategory(debt);
  if (category !== "loan_emi") return false;

  const rateBps = Number(
    debt.annualInterestRateBasisPoints ??
      debt.annual_interest_rate_basis_points ??
      NaN
  );
  const tenure = Number(
    debt.totalTenureMonths ?? debt.total_tenure_months ?? NaN
  );
  const firstDate =
    debt.firstEmiDueDate ?? debt.first_emi_due_date ?? "";

  return (
    Number.isFinite(rateBps) &&
    rateBps >= 0 &&
    Number.isInteger(tenure) &&
    tenure >= 1 &&
    /^\d{4}-\d{2}-\d{2}$/.test(firstDate)
  );
}

export interface LoanAmortizationInput {
  principalPaise: number;
  annualInterestRateBasisPoints: number; // e.g. 1450 = 14.5%
  totalTenureMonths: number;
  firstEmiDate: string; // ISO date string YYYY-MM-DD
  emiAmountPaise?: number; // Optional lender-provided monthly EMI override
  installmentsPaidBeforeTracking?: number;
  asOfDate?: string; // Optional snapshot/reference date (defaults to today)
  actualPayments?: Array<{
    date: string;
    installmentNumber?: number | null;
    amountPaise: number;
    principalComponentPaise?: number | null;
    interestComponentPaise?: number | null;
    paymentKind: string;
  }>;
  scheduleSource?: "calculated_reducing_balance" | "lender_authoritative";
}

export interface AmortizationInstallment {
  installmentNumber: number;
  dueDate: string;
  openingPrincipalPaise: number;
  emiAmountPaise: number;
  principalPaise: number;
  interestPaise: number;
  closingPrincipalPaise: number;
  status: "paid" | "due" | "overdue" | "upcoming";
  isPaid: boolean;
  actualPaymentDate?: string;
  actualAmountPaise?: number;
  actualPrincipalPaise?: number;
  actualInterestPaise?: number;
}

export interface AmortizationSchedule {
  isValid: boolean;
  errorMessage?: string;
  scheduleSource: "calculated_reducing_balance" | "lender_authoritative";
  originalPrincipalPaise: number;
  annualInterestRatePercent: number;
  annualInterestRateBasisPoints: number;
  totalTenureMonths: number;
  monthlyEmiPaise: number;
  firstEmiDate: string;
  totalPrincipalPaise: number;
  totalProjectedInterestPaise: number;
  totalProjectedRepaymentPaise: number;
  principalRepaidPaise: number;
  remainingPrincipalPaise: number;
  interestPaidPaise: number;
  remainingProjectedInterestPaise: number;
  paidInstallmentsCount: number;
  remainingInstallmentsCount: number;
  repaymentProgressPercent: number;
  nextDueInstallment: AmortizationInstallment | null;
  installments: AmortizationInstallment[];
}

/**
 * Calculates standard monthly EMI in paise using standard reducing-balance formula:
 * E = P * [r * (1 + r)^n] / [(1 + r)^n - 1]
 */
export function calculateStandardEmiPaise(
  principalPaise: number,
  annualInterestRateBasisPoints: number,
  totalTenureMonths: number
): number {
  if (
    !Number.isFinite(principalPaise) ||
    principalPaise <= 0 ||
    !Number.isFinite(totalTenureMonths) ||
    totalTenureMonths <= 0
  ) {
    return 0;
  }

  // Zero interest loan: simple equal distribution
  if (
    !Number.isFinite(annualInterestRateBasisPoints) ||
    annualInterestRateBasisPoints <= 0
  ) {
    return Math.round(principalPaise / totalTenureMonths);
  }

  const annualRateDecimal = annualInterestRateBasisPoints / 10_000;
  const monthlyRate = annualRateDecimal / 12;

  const compoundingFactor = Math.pow(1 + monthlyRate, totalTenureMonths);
  if (!Number.isFinite(compoundingFactor) || compoundingFactor <= 1) {
    return Math.round(principalPaise / totalTenureMonths);
  }

  const emi =
    (principalPaise * (monthlyRate * compoundingFactor)) /
    (compoundingFactor - 1);

  return Math.round(emi);
}

/**
 * Advance a date string (YYYY-MM-DD) by given number of months, preserving the day of month.
 * Handles month-end clamping (e.g. Jan 31 -> Feb 28/29 -> Mar 31).
 */
export function addMonthsPreservingDay(
  startDateStr: string,
  monthsToAdd: number
): string {
  const parts = startDateStr.split("-").map((v) => Number.parseInt(v, 10));
  if (parts.length !== 3 || parts.some((p) => Number.isNaN(p))) {
    return startDateStr;
  }

  const [startYear, startMonth, startDay] = parts;

  // Total month index (0-based)
  const totalMonths = (startYear * 12) + (startMonth - 1) + monthsToAdd;
  const targetYear = Math.floor(totalMonths / 12);
  const targetMonth = (totalMonths % 12) + 1; // 1-based (1-12)

  // Maximum days in target month
  const maxDays = daysInMonth(targetYear, targetMonth);
  const targetDay = Math.min(startDay, maxDays);

  const mm = String(targetMonth).padStart(2, "0");
  const dd = String(targetDay).padStart(2, "0");

  return `${targetYear}-${mm}-${dd}`;
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  switch (month) {
    case 2:
      return isLeapYear(year) ? 29 : 28;
    case 4:
    case 6:
    case 9:
    case 11:
      return 30;
    default:
      return 31;
  }
}

function getTodayIndia(): string {
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

/**
 * Validates loan input parameters.
 */
export function validateLoanAmortizationInput(
  input: LoanAmortizationInput
): { isValid: boolean; error?: string } {
  if (
    !Number.isFinite(input.principalPaise) ||
    !Number.isSafeInteger(input.principalPaise) ||
    input.principalPaise <= 0
  ) {
    return {
      isValid: false,
      error: "Original loan principal must be a positive integer in paise.",
    };
  }

  if (
    !Number.isFinite(input.annualInterestRateBasisPoints) ||
    input.annualInterestRateBasisPoints < 0 ||
    input.annualInterestRateBasisPoints > 100_00 // Max 100%
  ) {
    return {
      isValid: false,
      error: "Annual interest rate must be between 0% and 100%.",
    };
  }

  if (
    !Number.isFinite(input.totalTenureMonths) ||
    !Number.isInteger(input.totalTenureMonths) ||
    input.totalTenureMonths < 1 ||
    input.totalTenureMonths > 600
  ) {
    return {
      isValid: false,
      error: "Total loan tenure must be an integer between 1 and 600 months.",
    };
  }

  if (
    !input.firstEmiDate ||
    !/^\d{4}-\d{2}-\d{2}$/.test(input.firstEmiDate)
  ) {
    return {
      isValid: false,
      error: "First EMI date must be a valid date in YYYY-MM-DD format.",
    };
  }

  const parsedFirstDate = new Date(`${input.firstEmiDate}T00:00:00Z`);
  if (
    Number.isNaN(parsedFirstDate.getTime()) ||
    parsedFirstDate.toISOString().slice(0, 10) !== input.firstEmiDate
  ) {
    return {
      isValid: false,
      error: "First EMI date is invalid.",
    };
  }

  return { isValid: true };
}

/**
 * Generates full monthly reducing-balance amortization schedule.
 */
export function generateAmortizationSchedule(
  input: LoanAmortizationInput
): AmortizationSchedule {
  const validation = validateLoanAmortizationInput(input);
  if (!validation.isValid) {
    return {
      isValid: false,
      errorMessage: validation.error,
      scheduleSource: input.scheduleSource ?? "calculated_reducing_balance",
      originalPrincipalPaise: input.principalPaise ?? 0,
      annualInterestRatePercent: (input.annualInterestRateBasisPoints ?? 0) / 100,
      annualInterestRateBasisPoints: input.annualInterestRateBasisPoints ?? 0,
      totalTenureMonths: input.totalTenureMonths ?? 0,
      monthlyEmiPaise: 0,
      firstEmiDate: input.firstEmiDate ?? "",
      totalPrincipalPaise: 0,
      totalProjectedInterestPaise: 0,
      totalProjectedRepaymentPaise: 0,
      principalRepaidPaise: 0,
      remainingPrincipalPaise: 0,
      interestPaidPaise: 0,
      remainingProjectedInterestPaise: 0,
      paidInstallmentsCount: 0,
      remainingInstallmentsCount: 0,
      repaymentProgressPercent: 0,
      nextDueInstallment: null,
      installments: [],
    };
  }

  const {
    principalPaise,
    annualInterestRateBasisPoints,
    totalTenureMonths,
    firstEmiDate,
  } = input;

  const scheduleSource =
    input.scheduleSource ?? "calculated_reducing_balance";
  const installmentsPaidBeforeTracking = Math.min(
    totalTenureMonths,
    Math.max(0, input.installmentsPaidBeforeTracking ?? 0)
  );

  const asOfDate = input.asOfDate || getTodayIndia();

  // If user or lender supplied a specific emiAmountPaise > 0, respect it.
  // Otherwise calculate standard monthly EMI using the formula.
  const calculatedEmi = calculateStandardEmiPaise(
    principalPaise,
    annualInterestRateBasisPoints,
    totalTenureMonths
  );

  const regularEmiPaise =
    input.emiAmountPaise && input.emiAmountPaise > 0
      ? input.emiAmountPaise
      : calculatedEmi;

  const annualRateDecimal = annualInterestRateBasisPoints / 10_000;
  const monthlyRate = annualRateDecimal / 12;

  const actualPayments = (input.actualPayments ?? []).filter(
    (p) => p.paymentKind === "scheduled_emi" || p.paymentKind === "extra_principal"
  );

  // Map recorded payments by installment number or order
  const paymentsByInstallment = new Map<
    number,
    (typeof actualPayments)[number]
  >();

  for (const payment of actualPayments) {
    if (
      payment.installmentNumber != null &&
      payment.installmentNumber >= 1 &&
      payment.installmentNumber <= totalTenureMonths
    ) {
      paymentsByInstallment.set(payment.installmentNumber, payment);
    }
  }

  const installments: AmortizationInstallment[] = [];
  let currentOpeningPrincipal = principalPaise;

  let totalProjectedInterest = 0;
  let totalProjectedRepayment = 0;
  let cumulativePrincipalRepaid = 0;
  let cumulativeInterestPaid = 0;
  let paidCount = 0;

  for (let i = 1; i <= totalTenureMonths; i++) {
    const isLastInstallment = i === totalTenureMonths;
    const dueDate = addMonthsPreservingDay(firstEmiDate, i - 1);

    // Interest for this installment
    const interestPaise =
      annualInterestRateBasisPoints === 0
        ? 0
        : Math.round(currentOpeningPrincipal * monthlyRate);

    let principalRepaymentPaise: number;
    let emiAmountForInstallment: number;

    if (isLastInstallment) {
      // Final installment reconciliation: repay exactly all remaining principal
      principalRepaymentPaise = currentOpeningPrincipal;
      emiAmountForInstallment = principalRepaymentPaise + interestPaise;
    } else {
      const scheduledPrincipal = regularEmiPaise - interestPaise;
      // Guarantee principal repayment is non-negative and doesn't exceed opening principal
      principalRepaymentPaise = Math.max(
        0,
        Math.min(currentOpeningPrincipal, scheduledPrincipal)
      );
      emiAmountForInstallment = principalRepaymentPaise + interestPaise;
    }

    const closingPrincipalPaise = Math.max(
      0,
      currentOpeningPrincipal - principalRepaymentPaise
    );

    // Determine status of this installment
    const hasRecordedPayment = paymentsByInstallment.get(i);
    const isPaidBeforeTracking = i <= installmentsPaidBeforeTracking;
    const isPaid = Boolean(hasRecordedPayment) || isPaidBeforeTracking;

    let status: "paid" | "due" | "overdue" | "upcoming";
    if (isPaid) {
      status = "paid";
    } else if (dueDate === asOfDate) {
      status = "due";
    } else if (dueDate < asOfDate) {
      status = "overdue";
    } else {
      status = "upcoming";
    }

    if (isPaid) {
      paidCount++;
      const actualPrincipal =
        hasRecordedPayment?.principalComponentPaise != null
          ? Number(hasRecordedPayment.principalComponentPaise)
          : principalRepaymentPaise;
      const actualInterest =
        hasRecordedPayment?.interestComponentPaise != null
          ? Number(hasRecordedPayment.interestComponentPaise)
          : interestPaise;

      cumulativePrincipalRepaid += actualPrincipal;
      cumulativeInterestPaid += actualInterest;
    }

    totalProjectedInterest += interestPaise;
    totalProjectedRepayment += emiAmountForInstallment;

    installments.push({
      installmentNumber: i,
      dueDate,
      openingPrincipalPaise: currentOpeningPrincipal,
      emiAmountPaise: emiAmountForInstallment,
      principalPaise: principalRepaymentPaise,
      interestPaise,
      closingPrincipalPaise,
      status,
      isPaid,
      actualPaymentDate: hasRecordedPayment?.date,
      actualAmountPaise: hasRecordedPayment?.amountPaise,
      actualPrincipalPaise: hasRecordedPayment?.principalComponentPaise ?? undefined,
      actualInterestPaise: hasRecordedPayment?.interestComponentPaise ?? undefined,
    });

    currentOpeningPrincipal = closingPrincipalPaise;
  }

  const remainingPrincipalPaise = Math.max(
    0,
    principalPaise - cumulativePrincipalRepaid
  );

  const remainingProjectedInterestPaise = Math.max(
    0,
    totalProjectedInterest - cumulativeInterestPaid
  );

  const repaymentProgressPercent =
    principalPaise > 0
      ? Math.min(
          100,
          Math.round((cumulativePrincipalRepaid / principalPaise) * 100)
        )
      : 0;

  const nextDueInstallment =
    installments.find((inst) => !inst.isPaid) ?? null;

  return {
    isValid: true,
    scheduleSource,
    originalPrincipalPaise: principalPaise,
    annualInterestRatePercent: annualInterestRateBasisPoints / 100,
    annualInterestRateBasisPoints,
    totalTenureMonths,
    monthlyEmiPaise: regularEmiPaise,
    firstEmiDate,
    totalPrincipalPaise: principalPaise,
    totalProjectedInterestPaise: totalProjectedInterest,
    totalProjectedRepaymentPaise: totalProjectedRepayment,
    principalRepaidPaise: cumulativePrincipalRepaid,
    remainingPrincipalPaise,
    interestPaidPaise: cumulativeInterestPaid,
    remainingProjectedInterestPaise,
    paidInstallmentsCount: paidCount,
    remainingInstallmentsCount: totalTenureMonths - paidCount,
    repaymentProgressPercent,
    nextDueInstallment,
    installments,
  };
}
