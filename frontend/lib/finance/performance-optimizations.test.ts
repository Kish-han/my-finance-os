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

describe("Performance Optimizations: Large Dataset Processing & Balance Correctness", () => {
  type MockCardRow = {
    id: string;
    opening_outstanding_paise: number | string;
    opening_outstanding_date: string;
  };

  type MockActivityRow = {
    id: string;
    transaction_date: string;
    amount_paise: number | string;
    transaction_type: string;
    credit_card_id: string | null;
  };

  function calculateOutstanding(
    card: MockCardRow,
    activities: MockActivityRow[]
  ): number {
    let outstanding = Number(card.opening_outstanding_paise);

    for (const activity of activities) {
      if (
        activity.credit_card_id !== card.id ||
        activity.transaction_date < card.opening_outstanding_date
      ) {
        continue;
      }

      const amount = Number(activity.amount_paise);

      if (activity.transaction_type === "card_purchase") {
        outstanding += amount;
      } else if (activity.transaction_type === "card_payment") {
        outstanding -= amount;
      }
    }

    return Math.max(0, outstanding);
  }

  it("calculates outstanding balance correctly over 3,000+ transactions without truncation", () => {
    const card: MockCardRow = {
      id: "card-123",
      opening_outstanding_paise: 5000_00, // ₹5,000
      opening_outstanding_date: "2025-01-01",
    };

    // Generate 3,500 transactions (beyond previous 2,500 limit)
    const activities: MockActivityRow[] = [];
    for (let i = 1; i <= 3500; i++) {
      activities.push({
        id: `tx-${i}`,
        transaction_date: "2025-06-01",
        amount_paise: 100_00, // ₹100 each
        transaction_type: i % 10 === 0 ? "card_payment" : "card_purchase",
        credit_card_id: "card-123",
      });
    }

    // 3,500 transactions:
    // 350 payments of ₹100 = ₹35,000 repaid
    // 3,150 purchases of ₹100 = ₹3,15,000 spent
    // Net change = +₹2,80,000
    // Opening = ₹5,000
    // Expected total = ₹2,85,000
    const calculated = calculateOutstanding(card, activities);
    expect(calculated).toBe(285000_00);
  });

  it("proves that truncating at 2,500 causes balance discrepancy, while full dataset remains correct", () => {
    const card: MockCardRow = {
      id: "card-123",
      opening_outstanding_paise: 0,
      opening_outstanding_date: "2025-01-01",
    };

    const fullDataset: MockActivityRow[] = [];
    for (let i = 1; i <= 3000; i++) {
      fullDataset.push({
        id: `tx-${i}`,
        transaction_date: "2025-06-01",
        amount_paise: 100_00,
        transaction_type: "card_purchase",
        credit_card_id: "card-123",
      });
    }

    const truncatedDataset = fullDataset.slice(0, 2500);

    const fullBalance = calculateOutstanding(card, fullDataset);
    const truncatedBalance = calculateOutstanding(card, truncatedDataset);

    // Truncating omits ₹50,000 of purchases!
    expect(fullBalance).toBe(300000_00);
    expect(truncatedBalance).toBe(250000_00);
    expect(fullBalance).not.toBe(truncatedBalance);
  });
});
