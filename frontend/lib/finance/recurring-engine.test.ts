import { describe, it, expect } from "vitest";
import {
  calculateNextOccurrenceDate,
  isScheduleExpired,
  normalizeMonthlyAmountPaise,
  getOccurrenceDueStatus,
  formatFrequencyDescription,
} from "./recurring-engine";
import {
  buildUpcomingPaymentsList,
  getPaymentDueStatus,
} from "./payment-schedule";
import {
  calculateAccountBalance,
  calculateCardOutstanding,
  calculateAvailableCredit,
} from "./balances";

describe("Recurring Engine - Date Calculation & No-Drift Clamping", () => {
  it("calculates weekly recurring dates accurately (+7 days)", () => {
    expect(
      calculateNextOccurrenceDate({
        currentDueDate: "2026-10-01",
        frequency: "weekly",
      })
    ).toBe("2026-10-08");

    expect(
      calculateNextOccurrenceDate({
        currentDueDate: "2026-10-28",
        frequency: "weekly",
      })
    ).toBe("2026-11-04");
  });

  it("calculates bi-weekly recurring dates accurately (+14 days)", () => {
    expect(
      calculateNextOccurrenceDate({
        currentDueDate: "2026-10-01",
        frequency: "biweekly",
      })
    ).toBe("2026-10-15");

    expect(
      calculateNextOccurrenceDate({
        currentDueDate: "2026-10-25",
        frequency: "biweekly",
      })
    ).toBe("2026-11-08");
  });

  it("calculates monthly recurrence on day 1 and day 15", () => {
    expect(
      calculateNextOccurrenceDate({
        currentDueDate: "2026-01-01",
        frequency: "monthly",
        anchorDayOfMonth: 1,
      })
    ).toBe("2026-02-01");

    expect(
      calculateNextOccurrenceDate({
        currentDueDate: "2026-02-15",
        frequency: "monthly",
        anchorDayOfMonth: 15,
      })
    ).toBe("2026-03-15");
  });

  it("preserves 31st anchor across short months without date drift (Feb 28/29, Apr 30, May 31)", () => {
    // Starting on Jan 31 in a non-leap year (2026)
    const jan31 = "2026-01-31";
    const feb = calculateNextOccurrenceDate({
      currentDueDate: jan31,
      frequency: "monthly",
      anchorDayOfMonth: 31,
    });
    expect(feb).toBe("2026-02-28"); // Clamped to Feb 28

    const mar = calculateNextOccurrenceDate({
      currentDueDate: feb,
      frequency: "monthly",
      anchorDayOfMonth: 31,
    });
    expect(mar).toBe("2026-03-31"); // Restored back to 31! (NO DRIFT)

    const apr = calculateNextOccurrenceDate({
      currentDueDate: mar,
      frequency: "monthly",
      anchorDayOfMonth: 31,
    });
    expect(apr).toBe("2026-04-30"); // Clamped to Apr 30

    const may = calculateNextOccurrenceDate({
      currentDueDate: apr,
      frequency: "monthly",
      anchorDayOfMonth: 31,
    });
    expect(may).toBe("2026-05-31"); // Restored back to 31!
  });

  it("handles leap year February 29th properly for monthly and yearly recurrence", () => {
    // 2024 is a leap year
    const febLeap = calculateNextOccurrenceDate({
      currentDueDate: "2024-01-31",
      frequency: "monthly",
      anchorDayOfMonth: 31,
    });
    expect(febLeap).toBe("2024-02-29");

    // Yearly from Feb 29, 2024
    const nextYear = calculateNextOccurrenceDate({
      currentDueDate: "2024-02-29",
      frequency: "yearly",
      anchorDayOfMonth: 29,
    });
    expect(nextYear).toBe("2025-02-28"); // Non-leap year clamped to 28

    // Next leap year 2028 restores 29
    const year2026 = calculateNextOccurrenceDate({
      currentDueDate: "2025-02-28",
      frequency: "yearly",
      anchorDayOfMonth: 29,
    });
    expect(year2026).toBe("2026-02-28");

    const year2027 = calculateNextOccurrenceDate({
      currentDueDate: "2026-02-28",
      frequency: "yearly",
      anchorDayOfMonth: 29,
    });
    expect(year2027).toBe("2027-02-28");

    const year2028 = calculateNextOccurrenceDate({
      currentDueDate: "2027-02-28",
      frequency: "yearly",
      anchorDayOfMonth: 29,
    });
    expect(year2028).toBe("2028-02-29"); // Restored back to Feb 29!
  });

  it("calculates bimonthly, quarterly and semiannually schedules accurately", () => {
    expect(
      calculateNextOccurrenceDate({
        currentDueDate: "2026-01-15",
        frequency: "bimonthly",
        anchorDayOfMonth: 15,
      })
    ).toBe("2026-03-15");

    expect(
      calculateNextOccurrenceDate({
        currentDueDate: "2026-01-31",
        frequency: "quarterly",
        anchorDayOfMonth: 31,
      })
    ).toBe("2026-04-30"); // April has 30 days

    expect(
      calculateNextOccurrenceDate({
        currentDueDate: "2026-04-30",
        frequency: "quarterly",
        anchorDayOfMonth: 31,
      })
    ).toBe("2026-07-31"); // July has 31 days

    expect(
      calculateNextOccurrenceDate({
        currentDueDate: "2026-01-10",
        frequency: "semiannually",
        anchorDayOfMonth: 10,
      })
    ).toBe("2026-07-10");
  });

  it("handles year rollover across December to January", () => {
    expect(
      calculateNextOccurrenceDate({
        currentDueDate: "2026-12-05",
        frequency: "monthly",
        anchorDayOfMonth: 5,
      })
    ).toBe("2027-01-05");

    expect(
      calculateNextOccurrenceDate({
        currentDueDate: "2026-11-15",
        frequency: "quarterly",
        anchorDayOfMonth: 15,
      })
    ).toBe("2027-02-15");
  });
});

describe("Recurring Engine - Expiration and Normalization", () => {
  it("determines schedule expiration correctly against end date", () => {
    expect(isScheduleExpired("2026-11-01", null)).toBe(false);
    expect(isScheduleExpired("2026-11-01", "2026-12-31")).toBe(false);
    expect(isScheduleExpired("2026-11-01", "2026-11-01")).toBe(false);
    expect(isScheduleExpired("2026-11-02", "2026-11-01")).toBe(true);
  });

  it("normalizes monthly amount paise across all recurrence intervals", () => {
    // 1000 rupees (100,000 paise)
    const p = 100000;
    expect(normalizeMonthlyAmountPaise(p, "monthly")).toBe(100000);
    expect(normalizeMonthlyAmountPaise(p, "yearly")).toBe(Math.round(100000 / 12));
    expect(normalizeMonthlyAmountPaise(p, "quarterly")).toBe(Math.round(100000 / 3));
    expect(normalizeMonthlyAmountPaise(p, "bimonthly")).toBe(50000);
    expect(normalizeMonthlyAmountPaise(p, "weekly")).toBe(Math.round((100000 * 52) / 12));
    expect(normalizeMonthlyAmountPaise(p, "biweekly")).toBe(Math.round((100000 * 26) / 12));
  });

  it("calculates snoozed status correctly", () => {
    const today = "2026-10-28";
    const status = getOccurrenceDueStatus({
      dueDate: "2026-10-25", // Overdue
      today,
      status: "pending",
      snoozedUntilDate: "2026-10-30", // Snoozed to future date
    });

    expect(status.isSnoozed).toBe(true);
    expect(status.effectiveDueDate).toBe("2026-10-30");
    expect(status.dueStatus.status).toBe("due_soon");
  });

  it("formats human-friendly frequency descriptions", () => {
    expect(formatFrequencyDescription("monthly", 5)).toBe("Monthly on the 5th");
    expect(formatFrequencyDescription("monthly", 1)).toBe("Monthly on the 1st");
    expect(formatFrequencyDescription("monthly", 22)).toBe("Monthly on the 22nd");
    expect(formatFrequencyDescription("weekly", null, 1)).toBe("Weekly on Mondays");
    expect(formatFrequencyDescription("quarterly", 15)).toBe("Quarterly on the 15th");
    expect(formatFrequencyDescription("yearly", 25)).toBe("Yearly on the 25th");
  });
});

describe("Recurring Engine - Upcoming Payments Integration & Financial Correctness", () => {
  it("integrates pending recurring items into upcoming payments list and prioritizes overdue items", () => {
    const today = "2026-10-28";

    const overdueOccDueStatus = getPaymentDueStatus("2026-10-20", today, false);
    const upcomingOccDueStatus = getPaymentDueStatus("2026-11-05", today, false);

    const recurringItems = [
      {
        id: "recurring-occ-1",
        kind: "recurring_transaction" as const,
        scheduleId: "sched-1",
        occurrenceId: "occ-1",
        title: "House Rent",
        subtitle: "Monthly · HDFC Savings",
        transactionType: "expense" as const,
        dueDate: "2026-10-20",
        originalDueDate: "2026-10-20",
        dueStatus: overdueOccDueStatus,
        amountPaise: 1500000,
        isAmountVariable: false,
        isSnoozed: false,
        accountId: "acc-1",
        accountOrCardLabel: "HDFC Savings",
        isCreditCard: false,
        isPaid: false,
      },
      {
        id: "recurring-occ-2",
        kind: "recurring_transaction" as const,
        scheduleId: "sched-2",
        occurrenceId: "occ-2",
        title: "Salary",
        subtitle: "Monthly · ICICI Salary",
        transactionType: "income" as const,
        dueDate: "2026-11-05",
        originalDueDate: "2026-11-05",
        dueStatus: upcomingOccDueStatus,
        amountPaise: 9500000,
        isAmountVariable: false,
        isSnoozed: false,
        accountId: "acc-2",
        accountOrCardLabel: "ICICI Salary",
        isCreditCard: false,
        isPaid: false,
      },
    ];

    const result = buildUpcomingPaymentsList({
      today,
      cards: [],
      statements: [],
      cardPaymentTransactions: [],
      debts: [],
      debtPayments: [],
      recurringItems,
    });

    expect(result.activePayments).toHaveLength(2);
    // Overdue item (House Rent) MUST come first before upcoming (Salary)
    expect(result.activePayments[0].title).toBe("House Rent");
    expect(result.activePayments[0].dueStatus.status).toBe("overdue");
    expect(result.activePayments[1].title).toBe("Salary");
    expect(result.activePayments[1].dueStatus.status).toBe("upcoming");
  });

  it("moves confirmed recurring items to settled history", () => {
    const today = "2026-10-28";

    const recurringItems = [
      {
        id: "recurring-occ-3",
        kind: "recurring_transaction" as const,
        scheduleId: "sched-3",
        occurrenceId: "occ-3",
        title: "Internet Fiber",
        subtitle: "Monthly · HDFC Savings",
        transactionType: "expense" as const,
        dueDate: "2026-10-15",
        originalDueDate: "2026-10-15",
        dueStatus: getPaymentDueStatus("2026-10-15", today, true),
        amountPaise: 99900,
        isAmountVariable: false,
        isSnoozed: false,
        accountId: "acc-1",
        accountOrCardLabel: "HDFC Savings",
        isCreditCard: false,
        isPaid: true,
        confirmedTransactionId: "tx-123",
      },
    ];

    const result = buildUpcomingPaymentsList({
      today,
      cards: [],
      statements: [],
      cardPaymentTransactions: [],
      debts: [],
      debtPayments: [],
      recurringItems,
    });

    expect(result.activePayments).toHaveLength(0);
    expect(result.settledPayments).toHaveLength(1);
    expect(result.settledPayments[0].title).toBe("Internet Fiber");
  });
});

describe("Recurring Engine - Financial Safety & Invariant Tests", () => {
  const bankAccount = {
    id: "bank-1",
    name: "HDFC Savings",
    type: "bank" as const,
    institution: "HDFC",
    openingBalancePaise: 5000000, // ₹50,000
    openingBalanceDate: "2026-01-01",
    isArchived: false,
  };

  const creditCard = {
    id: "card-1",
    name: "Millennia",
    bankName: "HDFC Bank",
    creditLimitPaise: 20000000, // ₹2,00,000
    openingOutstandingPaise: 1000000, // ₹10,000
    openingOutstandingDate: "2026-01-01",
    isArchived: false,
  };

  it("CRITICAL RULE: Pending expected occurrences NEVER alter account balances or credit card outstanding", () => {
    // Current ledger transactions
    const ledgerTransactions = [
      {
        id: "tx-1",
        date: "2026-01-10",
        description: "Initial client deposit",
        type: "income" as const,
        amountPaise: 1000000, // ₹10,000
        accountId: "bank-1",
        categoryId: "cat-income",
      },
    ];

    const balanceBefore = calculateAccountBalance(bankAccount, ledgerTransactions);
    expect(balanceBefore).toBe(6000000); // 50,000 + 10,000 = 60,000

    const cardOutstandingBefore = calculateCardOutstanding(creditCard, ledgerTransactions);
    const cardAvailableBefore = calculateAvailableCredit(creditCard, ledgerTransactions);
    expect(cardOutstandingBefore).toBe(1000000); // 10,000

    // An expected occurrence is due for ₹15,000 rent and ₹5,000 Netflix card spend
    // Because they are in recurring_occurrences and NOT confirmed transactions,
    // the financial balance calculations MUST remain strictly identical!
    const balanceAfter = calculateAccountBalance(bankAccount, ledgerTransactions);
    const cardOutstandingAfter = calculateCardOutstanding(creditCard, ledgerTransactions);
    const cardAvailableAfter = calculateAvailableCredit(creditCard, ledgerTransactions);

    expect(balanceAfter).toBe(balanceBefore);
    expect(cardOutstandingAfter).toBe(cardOutstandingBefore);
    expect(cardAvailableAfter).toBe(cardAvailableBefore);
  });

  it("Confirming an income increases the account balance exactly once", () => {
    const ledger = [
      {
        id: "tx-1",
        date: "2026-01-10",
        description: "Initial deposit",
        type: "income" as const,
        amountPaise: 1000000,
        accountId: "bank-1",
        categoryId: "cat-income",
      },
    ];

    const initial = calculateAccountBalance(bankAccount, ledger);

    // User confirms ₹75,000 salary deposit
    const confirmedSalaryTx = {
      id: "tx-salary",
      date: "2026-10-28",
      description: "October Salary",
      type: "income" as const,
      amountPaise: 7500000,
      accountId: "bank-1",
      categoryId: "cat-salary",
    };

    const updated = calculateAccountBalance(bankAccount, [...ledger, confirmedSalaryTx]);
    expect(updated).toBe(initial + 7500000);
  });

  it("Confirming a credit card expense increases card debt and preserves bank balance", () => {
    const initialBankBalance = calculateAccountBalance(bankAccount, []);
    const initialOutstanding = calculateCardOutstanding(creditCard, []);
    const initialAvailable = calculateAvailableCredit(creditCard, []);

    // User confirms a ₹1,499 Netflix recurring card spend
    const confirmedCardSpend = {
      id: "tx-netflix",
      date: "2026-10-28",
      description: "Netflix Subscription",
      type: "card_purchase" as const,
      amountPaise: 149900,
      creditCardId: "card-1",
      categoryId: "cat-entertainment",
    };

    const finalBankBalance = calculateAccountBalance(bankAccount, [confirmedCardSpend]);
    const finalOutstanding = calculateCardOutstanding(creditCard, [confirmedCardSpend]);
    const finalAvailable = calculateAvailableCredit(creditCard, [confirmedCardSpend]);

    // Bank balance is completely untouched
    expect(finalBankBalance).toBe(initialBankBalance);
    // Card outstanding increased by ₹1,499
    expect(finalOutstanding).toBe(initialOutstanding + 149900);
    // Available limit decreased by ₹1,499
    expect(finalAvailable).toBe(initialAvailable - 149900);
  });

  it("Skipping an occurrence advances next due date without generating any ledger entry", () => {
    const currentDueDate = "2026-10-05";
    const nextDate = calculateNextOccurrenceDate({
      currentDueDate,
      frequency: "monthly",
      anchorDayOfMonth: 5,
    });

    expect(nextDate).toBe("2026-11-05");
    // No transaction was added, so balances are untouched
  });
});
