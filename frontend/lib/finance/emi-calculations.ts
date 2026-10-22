
import type {
  EmiDebt,
  EmiPaymentRecord,
  ForeclosureQuote,
} from "./types";

function paymentsForDebt(
  debt: EmiDebt,
  payments: EmiPaymentRecord[]
): EmiPaymentRecord[] {
  return payments.filter((payment) => payment.debtId === debt.id);
}

// The opening count includes instalments paid before tracking began.
// Each subsequent EMI payment should be recorded once.
export function calculateInstallmentsCompleted(
  debt: EmiDebt,
  payments: EmiPaymentRecord[]
): number {
  const newInstallments = paymentsForDebt(debt, payments).filter(
    (payment) =>
      payment.date > debt.outstandingAsOfDate &&
      payment.paymentMethod !== "foreclosure"
  ).length;

  return Math.min(
    debt.totalTenureMonths,
    debt.installmentsPaidBeforeTracking + newInstallments
  );
}

export function calculateRemainingInstallments(
  debt: EmiDebt,
  payments: EmiPaymentRecord[]
): number {
  return Math.max(
    0,
    debt.totalTenureMonths -
      calculateInstallmentsCompleted(debt, payments)
  );
}

// Total of the remaining scheduled EMI payments.
// This is NOT the same as the remaining principal.
export function calculateScheduledRemainingPaymentsPaise(
  debt: EmiDebt,
  payments: EmiPaymentRecord[]
): number {
  return (
    calculateRemainingInstallments(debt, payments) *
    debt.emiAmountPaise
  );
}

// Sum of interest portions actually recorded in payment history.
// This does not estimate missing or future interest.
export function calculateRecordedInterestPaise(
  debt: EmiDebt,
  payments: EmiPaymentRecord[]
): number {
  return paymentsForDebt(debt, payments).reduce(
    (total, payment) =>
      total + (payment.interestComponentPaise ?? 0),
    0
  );
}

// Adjust a principal snapshot using later recorded principal payments.
export function calculateEstimatedOutstandingPrincipalPaise(
  debt: EmiDebt,
  payments: EmiPaymentRecord[]
): number {
  const principalRepaidSinceSnapshot = paymentsForDebt(
    debt,
    payments
  )
    .filter(
      (payment) =>
        payment.date > debt.outstandingAsOfDate &&
        payment.paymentMethod !== "foreclosure"
    )
    .reduce(
      (total, payment) =>
        total + (payment.principalComponentPaise ?? 0),
      0
    );

  return Math.max(
    0,
    debt.currentOutstandingPrincipalPaise -
      principalRepaidSinceSnapshot
  );
}

// Calculates a total from a foreclosure quote's components.
// The result is only as reliable as the quote or estimates supplied.
export function calculateForeclosureTotalPaise(
  quote: Pick<
    ForeclosureQuote,
    | "outstandingPrincipalPaise"
    | "foreclosureChargesPaise"
    | "taxPaise"
    | "otherChargesPaise"
    | "waiversPaise"
  >
): number {
  return Math.max(
    0,
    quote.outstandingPrincipalPaise +
      quote.foreclosureChargesPaise +
      quote.taxPaise +
      quote.otherChargesPaise -
      quote.waiversPaise
  );
}
