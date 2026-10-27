import { describe, expect, it } from "vitest";
import type { EmiDebt, EmiPaymentRecord, ForeclosureQuote } from "./types";
import {
  calculateInstallmentsCompleted,
  calculateRemainingInstallments,
  calculateScheduledRemainingPaymentsPaise,
  calculateRecordedInterestPaise,
  calculateEstimatedOutstandingPrincipalPaise,
  calculateForeclosureTotalPaise,
} from "./emi-calculations";

const debt: EmiDebt = {
  id: "loan-1",
  name: "Example personal loan",
  debtType: "personal_loan",
  lenderName: "Example lender",
  originalPrincipalPaise: 12_000_000,
  currentOutstandingPrincipalPaise: 10_000_000,
  outstandingAsOfDate: "2026-01-31",
  annualInterestRateBasisPoints: 1450,
  interestMethod: "reducing_balance",
  totalTenureMonths: 24,
  installmentsPaidBeforeTracking: 6,
  emiAmountPaise: 500_000,
  firstEmiDueDate: "2025-08-05",
  nextDueDate: "2026-02-05",
  status: "active",
};

describe("EMI calculations", () => {
  it("calculates remaining installments", () => {
    expect(calculateRemainingInstallments(debt, [])).toBe(18);
  });

  it("counts a newly recorded installment", () => {
    const payments: EmiPaymentRecord[] = [
      {
        id: "payment-1",
        debtId: debt.id,
        date: "2026-02-05",
        amountPaise: 500_000,
        paymentMethod: "bank_debit",
        paymentKind: "scheduled_emi",
      },
    ];

    expect(calculateInstallmentsCompleted(debt, payments)).toBe(7);
    expect(calculateRemainingInstallments(debt, payments)).toBe(17);
  });

  it("calculates scheduled remaining EMI payments", () => {
    expect(
      calculateScheduledRemainingPaymentsPaise(debt, [])
    ).toBe(9_000_000);
  });

  it("sums recorded interest", () => {
    const payments: EmiPaymentRecord[] = [
      {
        id: "payment-1",
        debtId: debt.id,
        date: "2026-02-05",
        amountPaise: 500_000,
        interestComponentPaise: 80_000,
        paymentMethod: "bank_debit",
        paymentKind: "scheduled_emi",
      },
      {
        id: "payment-2",
        debtId: debt.id,
        date: "2026-03-05",
        amountPaise: 500_000,
        interestComponentPaise: 70_000,
        paymentMethod: "bank_debit",
        paymentKind: "scheduled_emi",
      },
    ];

    expect(calculateRecordedInterestPaise(debt, payments)).toBe(150_000);
  });

  it("updates principal using recorded principal repayments", () => {
    const payments: EmiPaymentRecord[] = [
      {
        id: "payment-1",
        debtId: debt.id,
        date: "2026-02-05",
        amountPaise: 500_000,
        principalComponentPaise: 400_000,
        paymentMethod: "bank_debit",
        paymentKind: "scheduled_emi",
      },
    ];

    expect(
      calculateEstimatedOutstandingPrincipalPaise(debt, payments)
    ).toBe(9_600_000);
  });

  it("calculates a foreclosure total including charges and waivers", () => {
    const quote: ForeclosureQuote = {
      id: "quote-1",
      debtId: debt.id,
      quoteDate: "2026-03-10",
      outstandingPrincipalPaise: 10_000_000,
      foreclosureChargesPaise: 200_000,
      taxPaise: 36_000,
      otherChargesPaise: 10_000,
      waiversPaise: 50_000,
      totalPayoffPaise: 10_196_000,
      source: "lender_quote",
    };

    expect(calculateForeclosureTotalPaise(quote)).toBe(10_196_000);
  });

  it("reduces principal without counting an extra repayment as an EMI", () => {
    const payments: EmiPaymentRecord[] = [
      {
        id: "extra-payment-1",
        debtId: debt.id,
        date: "2026-02-10",
        amountPaise: 1_000_000,
        principalComponentPaise: 1_000_000,
        paymentMethod: "bank_debit",
        paymentKind: "extra_principal",
      },
    ];

    expect(calculateInstallmentsCompleted(debt, payments)).toBe(6);
    expect(calculateRemainingInstallments(debt, payments)).toBe(18);
    expect(
      calculateEstimatedOutstandingPrincipalPaise(debt, payments)
    ).toBe(9_000_000);
  });

  it("returns zero outstanding principal for foreclosed or closed debt", () => {
    const foreclosedDebt: EmiDebt = {
      ...debt,
      status: "foreclosed",
    };
    const closedDebt: EmiDebt = {
      ...debt,
      status: "closed",
    };

    expect(
      calculateEstimatedOutstandingPrincipalPaise(foreclosedDebt, [])
    ).toBe(0);
    expect(
      calculateEstimatedOutstandingPrincipalPaise(closedDebt, [])
    ).toBe(0);
  });

  it("keeps ordinary EMI payment dates strictly later than the snapshot date", () => {
    // Payment on the snapshot date (2026-01-31) must NOT be counted as a new post-snapshot instalment
    const paymentOnSnapshot: EmiPaymentRecord[] = [
      {
        id: "payment-on-snapshot",
        debtId: debt.id,
        date: "2026-01-31",
        amountPaise: 500_000,
        paymentMethod: "bank_debit",
        paymentKind: "scheduled_emi",
      },
    ];

    expect(calculateInstallmentsCompleted(debt, paymentOnSnapshot)).toBe(6);
    expect(calculateRemainingInstallments(debt, paymentOnSnapshot)).toBe(18);

    // Payment strictly after snapshot date (2026-02-01) is counted
    const paymentAfterSnapshot: EmiPaymentRecord[] = [
      {
        id: "payment-after-snapshot",
        debtId: debt.id,
        date: "2026-02-01",
        amountPaise: 500_000,
        paymentMethod: "bank_debit",
        paymentKind: "scheduled_emi",
      },
    ];

    expect(calculateInstallmentsCompleted(debt, paymentAfterSnapshot)).toBe(7);
    expect(calculateRemainingInstallments(debt, paymentAfterSnapshot)).toBe(17);
  });
});
