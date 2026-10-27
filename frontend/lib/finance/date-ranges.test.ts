import { describe, it, expect } from "vitest";
import {
  resolveDateRangeBounds,
  generateBuckets,
  aggregateTransactionRange,
  getIndiaToday,
  type TransactionRecord,
} from "./date-ranges";

describe("date-ranges utilities", () => {
  // Use a fixed reference date: Wednesday, 2026-10-28 12:00:00 UTC
  // In IST (+5:30), that is 2026-10-28 17:30:00
  const refDate = new Date(Date.UTC(2026, 9, 28, 12, 0, 0));

  it("calculates today in India correctly", () => {
    const today = getIndiaToday(refDate);
    expect(today).toBe("2026-10-28");
  });

  describe("resolveDateRangeBounds", () => {
    it("resolves this_week starting on Monday and ending on Sunday with day interval", () => {
      const bounds = resolveDateRangeBounds("this_week", { referenceDate: refDate });
      // 2026-10-28 is Wednesday. Monday is 2026-10-26, Sunday is 2026-11-01
      expect(bounds.startDate).toBe("2026-10-26");
      expect(bounds.endDate).toBe("2026-11-01");
      expect(bounds.interval).toBe("day");
    });

    it("resolves this_month from 1st to last day of month with day interval", () => {
      const bounds = resolveDateRangeBounds("this_month", { referenceDate: refDate });
      expect(bounds.startDate).toBe("2026-10-01");
      expect(bounds.endDate).toBe("2026-10-31");
      expect(bounds.interval).toBe("day");
    });

    it("resolves last_6_months covering 6 calendar months with month interval", () => {
      const bounds = resolveDateRangeBounds("last_6_months", { referenceDate: refDate });
      // Oct (10) - 5 = May (05)
      expect(bounds.startDate).toBe("2026-05-01");
      expect(bounds.endDate).toBe("2026-10-31");
      expect(bounds.interval).toBe("month");
    });

    it("resolves this_year from Jan 1 to Dec 31 with month interval", () => {
      const bounds = resolveDateRangeBounds("this_year", { referenceDate: refDate });
      expect(bounds.startDate).toBe("2026-01-01");
      expect(bounds.endDate).toBe("2026-12-31");
      expect(bounds.interval).toBe("month");
    });

    it("resolves all_time from earliest date to today", () => {
      const bounds = resolveDateRangeBounds("all_time", {
        referenceDate: refDate,
        allTimeEarliest: "2025-06-15",
      });
      expect(bounds.startDate).toBe("2025-06-15");
      expect(bounds.endDate).toBe("2026-10-28");
      expect(bounds.interval).toBe("month");
    });

    it("resolves custom range and auto-adapts interval", () => {
      // 7 days -> day interval
      const boundsShort = resolveDateRangeBounds("custom", {
        referenceDate: refDate,
        customStart: "2026-10-01",
        customEnd: "2026-10-07",
      });
      expect(boundsShort.interval).toBe("day");

      // 45 days -> week interval
      const boundsMedium = resolveDateRangeBounds("custom", {
        referenceDate: refDate,
        customStart: "2026-08-01",
        customEnd: "2026-09-15",
      });
      expect(boundsMedium.interval).toBe("week");

      // 180 days -> month interval
      const boundsLong = resolveDateRangeBounds("custom", {
        referenceDate: refDate,
        customStart: "2026-01-01",
        customEnd: "2026-07-01",
      });
      expect(boundsLong.interval).toBe("month");
    });

    it("auto-swaps custom range if start is after end", () => {
      const bounds = resolveDateRangeBounds("custom", {
        referenceDate: refDate,
        customStart: "2026-10-30",
        customEnd: "2026-10-01",
      });
      expect(bounds.startDate).toBe("2026-10-01");
      expect(bounds.endDate).toBe("2026-10-30");
    });
  });

  describe("generateBuckets", () => {
    it("generates correct number of daily buckets", () => {
      const buckets = generateBuckets("2026-10-26", "2026-10-30", "day");
      expect(buckets).toHaveLength(5);
      expect(buckets[0].key).toBe("2026-10-26");
      expect(buckets[4].key).toBe("2026-10-30");
    });

    it("generates correct monthly buckets", () => {
      const buckets = generateBuckets("2026-05-01", "2026-10-31", "month");
      expect(buckets).toHaveLength(6);
      expect(buckets[0].key).toBe("2026-05");
      expect(buckets[5].key).toBe("2026-10");
    });
  });

  describe("aggregateTransactionRange financial rules", () => {
    const mockTransactions: TransactionRecord[] = [
      {
        id: "1",
        transaction_date: "2026-10-26",
        description: "Salary",
        amount_paise: 10000000, // 1,00,000 INR
        transaction_type: "income",
      },
      {
        id: "2",
        transaction_date: "2026-10-27",
        description: "Rent",
        amount_paise: 2500000, // 25,000 INR
        transaction_type: "expense",
      },
      {
        id: "3",
        transaction_date: "2026-10-27",
        description: "Electronics on Card",
        amount_paise: 1500000, // 15,000 INR
        transaction_type: "card_purchase",
      },
      {
        id: "4",
        transaction_date: "2026-10-28",
        description: "Pay Credit Card Bill",
        amount_paise: 1500000, // 15,000 INR
        transaction_type: "card_payment", // should NOT double count as expense
      },
      {
        id: "5",
        transaction_date: "2026-10-28",
        description: "Transfer to Savings",
        amount_paise: 2000000, // 20,000 INR
        transaction_type: "transfer", // should NOT count as expense or income
      },
      {
        id: "6",
        transaction_date: "2026-04-10",
        description: "Old Income",
        amount_paise: 5000000,
        transaction_type: "income", // outside this_week range
      },
    ];

    it("aggregates this_week correctly without double counting card payments or transfers", () => {
      const summary = aggregateTransactionRange(mockTransactions, "this_week", {
        referenceDate: refDate,
      });

      // Income = 1,00,000 INR (10000000 paise)
      expect(summary.totalIncomePaise).toBe(10000000);
      expect(summary.incomeCount).toBe(1);

      // Expense = Rent (2500000) + Card Purchase (1500000) = 4000000 paise
      // Card Payment and Transfer must NOT be added to expense!
      expect(summary.totalExpensePaise).toBe(4000000);
      expect(summary.expenseCount).toBe(2);

      // Net = 10000000 - 4000000 = 6000000 paise
      expect(summary.netCashflowPaise).toBe(6000000);

      // Total transaction count within range = 5 (all except the 2026-04-10 one)
      expect(summary.transactionCount).toBe(5);
      expect(summary.transferCount).toBe(2); // 1 transfer + 1 card payment

      // Savings rate = (6000000 / 10000000) * 100 = 60%
      expect(summary.savingsRatePct).toBe(60);
    });

    it("handles zero transactions cleanly without division by zero", () => {
      const summary = aggregateTransactionRange([], "this_month", {
        referenceDate: refDate,
      });

      expect(summary.totalIncomePaise).toBe(0);
      expect(summary.totalExpensePaise).toBe(0);
      expect(summary.netCashflowPaise).toBe(0);
      expect(summary.transactionCount).toBe(0);
      expect(summary.savingsRatePct).toBe(0);
      expect(summary.buckets.length).toBe(31);
    });
  });
});
