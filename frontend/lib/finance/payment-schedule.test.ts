import { describe, expect, it } from "vitest";
import {
  getPaymentDueStatus,
  calculateNextDueDateFromDay,
  calculateStatementProgress,
  buildUpcomingPaymentsList,
  type CreditCardStatementRecord,
  type CreditCardStatementPaymentItem,
} from "./payment-schedule";

describe("Payment Schedule & Due Date Math", () => {
  it("determines due status and labels accurately", () => {
    const today = "2026-11-10";

    // 1. Overdue: 2 days ago
    const overdue = getPaymentDueStatus("2026-11-08", today);
    expect(overdue.status).toBe("overdue");
    expect(overdue.daysDiff).toBe(-2);
    expect(overdue.label).toBe("Overdue by 2 days");

    // Overdue by 1 day (singular)
    const overdue1 = getPaymentDueStatus("2026-11-09", today);
    expect(overdue1.status).toBe("overdue");
    expect(overdue1.daysDiff).toBe(-1);
    expect(overdue1.label).toBe("Overdue by 1 day");

    // 2. Due today
    const dueToday = getPaymentDueStatus("2026-11-10", today);
    expect(dueToday.status).toBe("due_today");
    expect(dueToday.daysDiff).toBe(0);
    expect(dueToday.label).toBe("Due today");

    // 3. Due tomorrow (due soon)
    const dueTomorrow = getPaymentDueStatus("2026-11-11", today);
    expect(dueTomorrow.status).toBe("due_soon");
    expect(dueTomorrow.daysDiff).toBe(1);
    expect(dueTomorrow.label).toBe("Due tomorrow");

    // 4. Due in 4 days (due soon)
    const dueSoon = getPaymentDueStatus("2026-11-14", today);
    expect(dueSoon.status).toBe("due_soon");
    expect(dueSoon.daysDiff).toBe(4);
    expect(dueSoon.label).toBe("Due in 4 days");

    // 5. Due in 12 days (upcoming)
    const upcoming = getPaymentDueStatus("2026-11-22", today);
    expect(upcoming.status).toBe("upcoming");
    expect(upcoming.daysDiff).toBe(12);
    expect(upcoming.label).toBe("Due in 12 days");

    // 6. Paid status overrides dates
    const paid = getPaymentDueStatus("2026-11-01", today, true);
    expect(paid.status).toBe("paid");
    expect(paid.label).toBe("Paid");
  });

  it("calculates next due date from card payment_due_day correctly", () => {
    // Current date: 27 Oct 2026
    const today = "2026-10-27";

    // 1. Due day 10th (already passed this month): next due date is 10 Nov 2026
    expect(calculateNextDueDateFromDay(10, today)).toBe("2026-11-10");

    // 2. Due day 30th (still to come this month): due date is 30 Oct 2026
    expect(calculateNextDueDateFromDay(30, today)).toBe("2026-10-30");

    // 3. Due day today (27th): due date is today 27 Oct 2026
    expect(calculateNextDueDateFromDay(27, today)).toBe("2026-10-27");

    // 4. Year wrap: from 15 Dec 2026, due day 5th -> 5 Jan 2027
    expect(calculateNextDueDateFromDay(5, "2026-12-15")).toBe("2027-01-05");

    // 5. Month length clamping: 31st due day in November (which has 30 days) -> 30 Nov
    expect(calculateNextDueDateFromDay(31, "2026-11-01")).toBe("2026-11-30");

    // 6. February non-leap year (2027) 31st -> 28 Feb
    expect(calculateNextDueDateFromDay(31, "2027-02-01")).toBe("2027-02-28");
  });
});

describe("Credit Card Statement Settlement & Partial Payment Math", () => {
  const sampleStatement: CreditCardStatementRecord = {
    id: "stmt-icici-nov",
    userId: "user-1",
    creditCardId: "card-icici",
    statementDate: "2026-10-15",
    paymentDueDate: "2026-11-06",
    statementBalancePaise: 1_500_000, // ₹15,000.00
    minimumDuePaise: 75_000, // ₹750.00
    isSettled: false,
  };

  it("tracks unpaid statement when no payments have been made", () => {
    const progress = calculateStatementProgress(sampleStatement, []);
    expect(progress.paidPaise).toBe(0);
    expect(progress.remainingPaise).toBe(1_500_000);
    expect(progress.isFullyPaid).toBe(false);
    expect(progress.isPartiallyPaid).toBe(false);
  });

  it("tracks partial payments accurately without prematurely marking as paid", () => {
    const payments = [
      {
        creditCardId: "card-icici",
        amountPaise: 500_000, // ₹5,000 payment
        date: "2026-10-20",
      },
    ];

    const progress = calculateStatementProgress(sampleStatement, payments);
    expect(progress.paidPaise).toBe(500_000);
    expect(progress.remainingPaise).toBe(1_000_000); // ₹10,000 left
    expect(progress.isFullyPaid).toBe(false);
    expect(progress.isPartiallyPaid).toBe(true);
  });

  it("marks statement as fully settled when payments meet or exceed the bill", () => {
    const payments = [
      {
        creditCardId: "card-icici",
        amountPaise: 500_000, // ₹5,000
        date: "2026-10-20",
      },
      {
        creditCardId: "card-icici",
        amountPaise: 1_000_000, // ₹10,000
        date: "2026-11-04",
      },
    ];

    const progress = calculateStatementProgress(sampleStatement, payments);
    expect(progress.paidPaise).toBe(1_500_000);
    expect(progress.remainingPaise).toBe(0);
    expect(progress.isFullyPaid).toBe(true);
    expect(progress.isPartiallyPaid).toBe(false);
  });

  it("ignores payments made before the statement closing date", () => {
    const payments = [
      {
        creditCardId: "card-icici",
        amountPaise: 1_500_000,
        date: "2026-10-10", // Prior cycle payment (before 2026-10-15)
      },
    ];

    const progress = calculateStatementProgress(sampleStatement, payments);
    expect(progress.paidPaise).toBe(0);
    expect(progress.remainingPaise).toBe(1_500_000);
    expect(progress.isFullyPaid).toBe(false);
  });

  it("ignores payments on a different credit card", () => {
    const payments = [
      {
        creditCardId: "card-hdfc",
        amountPaise: 1_500_000,
        date: "2026-10-25",
      },
    ];

    const progress = calculateStatementProgress(sampleStatement, payments);
    expect(progress.paidPaise).toBe(0);
    expect(progress.remainingPaise).toBe(1_500_000);
  });
});

describe("Upcoming Payments Center Aggregation & Ordering", () => {
  const cards = [
    {
      id: "card-icici",
      name: "Rubyx",
      bank_name: "ICICI Bank",
      last_four_digits: "4321",
      payment_due_day: 6,
      statement_day: 15,
    },
    {
      id: "card-hdfc",
      name: "Millennia",
      bank_name: "HDFC Bank",
      last_four_digits: "8899",
      payment_due_day: 10,
      statement_day: 20,
    },
  ];

  it("orders overdue payments first, followed by upcoming payments in earliest-due order", () => {
    const today = "2026-11-08";

    // ICICI due 6 Nov (Overdue by 2 days, ₹15,000)
    // HDFC due 10 Nov (Due in 2 days, ₹8,500)
    const statements: CreditCardStatementRecord[] = [
      {
        id: "stmt-hdfc",
        userId: "user-1",
        creditCardId: "card-hdfc",
        statementDate: "2026-10-20",
        paymentDueDate: "2026-11-10",
        statementBalancePaise: 850_000, // ₹8,500
        minimumDuePaise: 50_000,
        isSettled: false,
      },
      {
        id: "stmt-icici",
        userId: "user-1",
        creditCardId: "card-icici",
        statementDate: "2026-10-15",
        paymentDueDate: "2026-11-06",
        statementBalancePaise: 1_500_000, // ₹15,000
        minimumDuePaise: 75_000,
        isSettled: false,
      },
    ];

    // Standalone car loan due 12 Nov (Monthly EMI ₹12,451)
    const debts = [
      {
        id: "loan-car",
        name: "Car Loan",
        lender_name: "HDFC Bank",
        debt_type: "vehicle_loan",
        linked_credit_card_id: null,
        emi_amount_paise: 1_245_100, // ₹12,451
        next_due_date: "2026-11-12",
        status: "active",
        original_principal_paise: 50_000_000,
        annual_interest_rate_basis_points: 850,
        total_tenure_months: 48,
        installments_paid_before_tracking: 12,
        first_emi_due_date: "2025-11-12",
      },
    ];

    const result = buildUpcomingPaymentsList({
      today,
      cards,
      statements,
      cardPaymentTransactions: [],
      debts,
      debtPayments: [],
    });

    expect(result.activePayments).toHaveLength(3);

    // 1st: Overdue ICICI (due 6 Nov)
    expect(result.activePayments[0].title).toContain("ICICI Bank Rubyx");
    expect(result.activePayments[0].dueStatus.status).toBe("overdue");
    expect(result.activePayments[0].amountPaise).toBe(1_500_000);

    // 2nd: Due soon HDFC (due 10 Nov)
    expect(result.activePayments[1].title).toContain("HDFC Bank Millennia");
    expect(result.activePayments[1].dueStatus.status).toBe("due_soon");
    expect(result.activePayments[1].amountPaise).toBe(850_000);

    // 3rd: Upcoming Car Loan (due 12 Nov)
    expect(result.activePayments[2].title).toBe("Car Loan");
    expect(result.activePayments[2].dueDate).toBe("2026-11-12");
    expect(result.activePayments[2].amountPaise).toBe(1_245_100);
  });

  it("handles multiple card statements due on the exact same date", () => {
    const today = "2026-11-01";
    const sameDueDate = "2026-11-10";

    const statements: CreditCardStatementRecord[] = [
      {
        id: "s1",
        userId: "u1",
        creditCardId: "card-icici",
        statementDate: "2026-10-15",
        paymentDueDate: sameDueDate,
        statementBalancePaise: 1_200_000,
        minimumDuePaise: null,
        isSettled: false,
      },
      {
        id: "s2",
        userId: "u1",
        creditCardId: "card-hdfc",
        statementDate: "2026-10-20",
        paymentDueDate: sameDueDate,
        statementBalancePaise: 800_000,
        minimumDuePaise: null,
        isSettled: false,
      },
    ];

    const result = buildUpcomingPaymentsList({
      today,
      cards,
      statements,
      cardPaymentTransactions: [],
      debts: [],
      debtPayments: [],
    });

    expect(result.activePayments).toHaveLength(2);
    // Both cards must be displayed together when due on the same date
    expect(result.activePayments.map((p) => p.dueDate)).toEqual([
      sameDueDate,
      sameDueDate,
    ]);
  });

  it("strictly separates statement amount due from total card outstanding and includes billed EMIs", () => {
    const today = "2026-11-01";

    // User's specific scenario: Card has ₹15,000 statement due (₹10,000 normal + ₹5,000 EMI component)
    // Total card outstanding might be ₹22,000 (with unbilled transactions)
    const statements: CreditCardStatementRecord[] = [
      {
        id: "stmt-exact",
        userId: "u1",
        creditCardId: "card-icici",
        statementDate: "2026-10-15",
        paymentDueDate: "2026-11-06",
        statementBalancePaise: 1_500_000, // ₹15,000 exact statement amount
        minimumDuePaise: 75_000,
        isSettled: false,
        notes: "Includes ₹10,000 normal transactions + ₹5,000 microwave EMI installment",
      },
    ];

    const result = buildUpcomingPaymentsList({
      today,
      cards: [cards[0]],
      statements,
      cardPaymentTransactions: [],
      debts: [],
      debtPayments: [],
    });

    const activeItem = result.activePayments[0] as CreditCardStatementPaymentItem;
    expect(activeItem.amountPaise).toBe(1_500_000); // Exactly ₹15,000 (NOT ₹10,000, NOT ₹20,000)
    expect(activeItem.notes).toContain("Includes ₹10,000 normal transactions + ₹5,000 microwave EMI");
  });

  it("EXCLUDES credit-card-linked EMIs from appearing as duplicate standalone bank payments", () => {
    const today = "2026-11-01";

    const debts = [
      // 1. Standalone personal loan: MUST appear as an upcoming payment
      {
        id: "loan-personal",
        name: "Personal Loan",
        lender_name: "SBI",
        debt_type: "personal_loan",
        linked_credit_card_id: null,
        emi_amount_paise: 500_000, // ₹5,000
        next_due_date: "2026-11-15",
        status: "active",
        original_principal_paise: 10_000_000,
        annual_interest_rate_basis_points: 1000,
        total_tenure_months: 24,
        installments_paid_before_tracking: 0,
        first_emi_due_date: "2026-11-15",
      },
      // 2. Credit Card EMI by debt_type: MUST NOT appear as separate payment
      {
        id: "emi-phone",
        name: "iPhone EMI",
        lender_name: "Apple Store",
        debt_type: "credit_card_emi",
        linked_credit_card_id: "card-icici",
        emi_amount_paise: 400_000,
        next_due_date: "2026-11-06",
        status: "active",
        original_principal_paise: 8_000_000,
        annual_interest_rate_basis_points: 0,
        total_tenure_months: 6,
        installments_paid_before_tracking: 0,
        first_emi_due_date: "2026-11-06",
      },
      // 3. Card-linked EMI by linked_credit_card_id: MUST NOT appear as separate payment
      {
        id: "emi-fridge",
        name: "Refrigerator EMI",
        lender_name: "Reliance Digital",
        debt_type: "consumer_durable_emi",
        linked_credit_card_id: "card-hdfc",
        emi_amount_paise: 300_000,
        next_due_date: "2026-11-10",
        status: "active",
        original_principal_paise: 3_000_000,
        annual_interest_rate_basis_points: 0,
        total_tenure_months: 6,
        installments_paid_before_tracking: 0,
        first_emi_due_date: "2026-11-10",
      },
    ];

    const result = buildUpcomingPaymentsList({
      today,
      cards: [],
      statements: [],
      cardPaymentTransactions: [],
      debts,
      debtPayments: [],
    });

    // Only the standalone personal loan must appear!
    expect(result.activePayments).toHaveLength(1);
    expect(result.activePayments[0].title).toBe("Personal Loan");
    expect(result.activePayments[0].amountPaise).toBe(500_000);
  });

  it("removes fully paid statements from active queue and preserves them in settled history", () => {
    const today = "2026-11-05";

    const statements: CreditCardStatementRecord[] = [
      {
        id: "stmt-paid",
        userId: "u1",
        creditCardId: "card-icici",
        statementDate: "2026-10-15",
        paymentDueDate: "2026-11-06",
        statementBalancePaise: 1_500_000,
        minimumDuePaise: 75_000,
        isSettled: false,
      },
    ];

    // Card repayment recorded for the full statement amount
    const cardPayments = [
      {
        creditCardId: "card-icici",
        amountPaise: 1_500_000,
        date: "2026-11-04",
      },
    ];

    const result = buildUpcomingPaymentsList({
      today,
      cards: [cards[0]],
      statements,
      cardPaymentTransactions: cardPayments,
      debts: [],
      debtPayments: [],
    });

    expect(result.activePayments).toHaveLength(0);
    expect(result.settledPayments).toHaveLength(1);
    expect(result.settledPayments[0].title).toContain("ICICI Bank Rubyx");
    expect(result.settledPayments[0].isPaid).toBe(true);
  });

  it("shows next due date reminder when statement is not yet recorded for a configured card", () => {
    const today = "2026-10-27";

    const result = buildUpcomingPaymentsList({
      today,
      cards: [
        {
          id: "card-axis",
          name: "Ace",
          bank_name: "Axis Bank",
          last_four_digits: "1234",
          payment_due_day: 15,
          statement_day: 25,
        },
      ],
      statements: [],
      cardPaymentTransactions: [],
      debts: [],
      debtPayments: [],
    });

    expect(result.activePayments).toHaveLength(1);
    const item = result.activePayments[0];
    expect(item.kind).toBe("credit_card_reminder");
    expect(item.title).toContain("Axis Bank Ace");
    expect(item.subtitle).toBe("Statement Pending");
    expect(item.dueDate).toBe("2026-11-15");
    expect(item.amountPaise).toBe(0); // Never fabricate a number
  });
});
