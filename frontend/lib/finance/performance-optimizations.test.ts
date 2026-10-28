import { describe, it, expect } from "vitest";
import {
  generateAmortizationSchedule,
  type LoanAmortizationInput,
} from "./amortization";

describe("Performance Optimizations: Amortization Memoization", () => {
  const baseInput: LoanAmortizationInput = {
    principalPaise: 500000_00, // ₹5,00,000
    annualInterestRateBasisPoints: 1200, // 12%
    totalTenureMonths: 36,
    firstEmiDate: "2026-01-01",
    emiAmountPaise: 16607_15,
    installmentsPaidBeforeTracking: 0,
  };

  it("returns cached result instance on consecutive calls with identical parameters", () => {
    const start1 = performance.now();
    const result1 = generateAmortizationSchedule(baseInput);
    const duration1 = performance.now() - start1;

    const start2 = performance.now();
    const result2 = generateAmortizationSchedule(baseInput);
    const duration2 = performance.now() - start2;

    expect(result1).toBe(result2); // Exact reference equality from memory cache
    expect(result2.isValid).toBe(true);
    expect(result2.installments.length).toBe(36);
    expect(result2.totalPrincipalPaise).toBe(500000_00);
    // Cached retrieval should be virtually instantaneous
    expect(duration2).toBeLessThanOrEqual(duration1 + 2);
  });

  it("invalidates and computes distinct results when parameters differ", () => {
    const result1 = generateAmortizationSchedule(baseInput);
    const result2 = generateAmortizationSchedule({
      ...baseInput,
      principalPaise: 600000_00,
    });

    expect(result1).not.toBe(result2);
    expect(result1.originalPrincipalPaise).toBe(500000_00);
    expect(result2.originalPrincipalPaise).toBe(600000_00);
  });

  it("handles recorded payments dynamically within cache key", () => {
    const withPaymentInput: LoanAmortizationInput = {
      ...baseInput,
      actualPayments: [
        {
          date: "2026-01-01",
          installmentNumber: 1,
          amountPaise: 16607_15,
          principalComponentPaise: 11607_15,
          interestComponentPaise: 5000_00,
          paymentKind: "scheduled_emi",
        },
      ],
    };

    const resultWithoutPayment = generateAmortizationSchedule(baseInput);
    const resultWithPayment = generateAmortizationSchedule(withPaymentInput);

    expect(resultWithoutPayment).not.toBe(resultWithPayment);
    expect(resultWithPayment.paidInstallmentsCount).toBe(1);
    expect(resultWithoutPayment.paidInstallmentsCount).toBe(0);
  });
});
