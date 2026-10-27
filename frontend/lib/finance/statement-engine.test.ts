import { describe, expect, it } from "vitest";
import {
  constructClampedDate,
  calculateDueDateFromStatementDate,
  getBillingCycleDates,
  calculateCycleStatementAmount,
  allocatePaymentsToStatements,
  calculateCurrentCycleEstimate,
  type CardBillingConfig,
} from "./statement-engine";
import {
  buildUpcomingPaymentsList,
  type CreditCardStatementRecord,
} from "./payment-schedule";
import { generateAmortizationSchedule } from "./amortization";
import { calculateForeclosureTotalPaise } from "./emi-calculations";

describe("Credit Card Statement Calculation & Flexible Payment Engine", () => {
  const sampleCard: CardBillingConfig = {
    id: "card-icici-sapphiro",
    name: "Sapphiro World Elite",
    bankName: "ICICI Bank",
    statementDay: 15,
    paymentDueDay: 5, // Rollover to next month (5th <= 15th)
    openingOutstandingPaise: 0,
    openingOutstandingDate: "2026-01-01",
  };

  describe("1. Billing-Cycle Boundaries, Month-Ends, Leap Years & Year-Wraps", () => {
    it("handles month-end clamping (Feb 28/29, April 30, December 31)", () => {
      // 31st in April (has 30 days) -> April 30
      expect(constructClampedDate(2026, 4, 31)).toBe("2026-04-30");

      // 31st in Feb non-leap year (2027) -> Feb 28
      expect(constructClampedDate(2027, 2, 31)).toBe("2027-02-28");

      // 31st in Feb leap year (2028) -> Feb 29
      expect(constructClampedDate(2028, 2, 31)).toBe("2028-02-29");

      // Year-wrap: month 13 -> next year month 1
      expect(constructClampedDate(2026, 13, 15)).toBe("2027-01-15");

      // Negative month: month 0 -> previous year month 12
      expect(constructClampedDate(2026, 0, 15)).toBe("2025-12-15");
    });

    it("calculates cross-month due date correctly when paymentDueDay <= statementDay", () => {
      // Statement date: 15 Oct, Due day: 5 -> Due date: 5 Nov (crosses into following month)
      expect(calculateDueDateFromStatementDate("2026-10-15", 5)).toBe("2026-11-05");

      // Year wrap: Statement date: 20 Dec, Due day: 10 -> Due date: 10 Jan next year
      expect(calculateDueDateFromStatementDate("2026-12-20", 10)).toBe("2027-01-10");

      // Same month: Statement date: 5 Oct, Due day: 25 -> Due date: 25 Oct
      expect(calculateDueDateFromStatementDate("2026-10-05", 25)).toBe("2026-10-25");

      // Leap year boundary: Statement 31 Jan 2028, Due day 29 -> 29 Feb 2028
      expect(calculateDueDateFromStatementDate("2028-01-31", 29)).toBe("2028-02-29");
    });

    it("identifies cycle state (closed vs in-progress) based on as-of date", () => {
      // Card statement day is 15th
      // Case A: Today is Oct 27 (past 15th) -> Current cycle closed on Oct 15
      const cycleOct27 = getBillingCycleDates(15, 5, "2026-10-27");
      expect(cycleOct27.isCurrentCycleClosed).toBe(true);
      expect(cycleOct27.previousStatementDate).toBe("2026-09-15");
      expect(cycleOct27.currentStatementDate).toBe("2026-10-15");
      expect(cycleOct27.currentPaymentDueDate).toBe("2026-11-05");
      expect(cycleOct27.nextStatementDate).toBe("2026-11-15");

      // Case B: Today is Oct 10 (before 15th) -> Current cycle still in progress
      const cycleOct10 = getBillingCycleDates(15, 5, "2026-10-10");
      expect(cycleOct10.isCurrentCycleClosed).toBe(false);
      expect(cycleOct10.previousStatementDate).toBe("2026-08-15");
      expect(cycleOct10.currentStatementDate).toBe("2026-09-15");
      expect(cycleOct10.nextStatementDate).toBe("2026-10-15");
    });
  });

  describe("2. Statement Calculation: Purchases, Credits, Billed EMIs, and Pre-Cutoff Payments", () => {
    it("correctly calculates statement bill with purchases, refunds, and EMI installments", () => {
      const transactions = [
        // Purchase within cycle: 20 Sep 2026 (₹12,000)
        {
          id: "tx-1",
          date: "2026-09-20",
          amountPaise: 1_200_000,
          type: "card_purchase",
          creditCardId: sampleCard.id,
        },
        // Another purchase within cycle: 02 Oct 2026 (₹8,000)
        {
          id: "tx-2",
          date: "2026-10-02",
          amountPaise: 800_000,
          type: "card_purchase",
          creditCardId: sampleCard.id,
        },
        // Refund / merchant credit within cycle: 05 Oct 2026 (₹2,000)
        {
          id: "tx-3",
          date: "2026-10-05",
          amountPaise: 200_000,
          type: "card_credit",
          creditCardId: sampleCard.id,
        },
        // Purchase outside cycle: 16 Oct 2026 (₹4,000) - must NOT be in this statement!
        {
          id: "tx-4",
          date: "2026-10-16",
          amountPaise: 400_000,
          type: "card_purchase",
          creditCardId: sampleCard.id,
        },
      ];

      // Billed EMI installment: ₹5,000 billed on 01 Oct 2026
      const cardLinkedEmis = [
        {
          id: "emi-macbook",
          name: "MacBook Pro EMI",
          emiAmountPaise: 500_000,
          firstEmiDueDate: "2026-08-01",
          nextDueDate: "2026-10-01",
          totalTenureMonths: 12,
          installmentsPaidBeforeTracking: 2,
        },
      ];

      const emiPayments = [
        {
          debtId: "emi-macbook",
          paymentDate: "2026-10-01",
          amountPaise: 500_000,
          paymentMethod: "billed_to_credit_card",
        },
      ];

      const stmt = calculateCycleStatementAmount({
        card: sampleCard,
        statementDate: "2026-10-15",
        previousStatementDate: "2026-09-15",
        transactions,
        cardLinkedEmis,
        emiPayments,
      });

      // Expected calculation:
      // Purchases: ₹12,000 + ₹8,000 = ₹20,000 (2,000,000 paise)
      // Credits/Refunds: ₹2,000 (200,000 paise)
      // Billed EMI: ₹5,000 (500,000 paise)
      // Net statement: 2,000,000 + 500,000 - 200,000 = ₹23,000 (2,300,000 paise)
      expect(stmt.purchasesPaise).toBe(2_000_000);
      expect(stmt.creditsPaise).toBe(200_000);
      expect(stmt.billedEmiPaise).toBe(500_000);
      expect(stmt.statementBalancePaise).toBe(2_300_000);
      expect(stmt.paymentDueDate).toBe("2026-11-05");
      // Future purchase (tx-4) was excluded
      expect(stmt.purchasesPaise).not.toContain(400_000);
    });

    it("accounts for payments made before cutoff without double deduction", () => {
      const transactions = [
        // Purchase: 22 Sep (₹15,000)
        {
          id: "tx-1",
          date: "2026-09-22",
          amountPaise: 1_500_000,
          type: "card_purchase",
          creditCardId: sampleCard.id,
        },
        // Mid-cycle payment: 04 Oct (₹5,000)
        {
          id: "tx-pay-early",
          date: "2026-10-04",
          amountPaise: 500_000,
          type: "card_payment",
          creditCardId: sampleCard.id,
        },
      ];

      const stmt = calculateCycleStatementAmount({
        card: sampleCard,
        statementDate: "2026-10-15",
        previousStatementDate: "2026-09-15",
        transactions,
        cardLinkedEmis: [],
        emiPayments: [],
      });

      // Net statement balance: ₹15,000 - ₹5,000 = ₹10,000 (1,000,000 paise)
      expect(stmt.purchasesPaise).toBe(1_500_000);
      expect(stmt.paymentsBeforeCutoffPaise).toBe(500_000);
      expect(stmt.statementBalancePaise).toBe(1_000_000);
    });
  });

  describe("3. Flexible Payment Timing & Chronological Statement Allocation", () => {
    const issuedStatements = [
      {
        id: "stmt-sept",
        statementDate: "2026-09-15",
        paymentDueDate: "2026-10-05",
        statementBalancePaise: 1_000_000, // ₹10,000
      },
      {
        id: "stmt-oct",
        statementDate: "2026-10-15",
        paymentDueDate: "2026-11-05",
        statementBalancePaise: 1_500_000, // ₹15,000
      },
    ];

    it("allows payment between statement date and due date, settling the statement", () => {
      // Statement issued on 15 Oct, due on 05 Nov.
      // Payment made on 24 Oct (between statement date and due date) for full ₹15,000
      const payment = [{ amountPaise: 1_500_000, date: "2026-10-24" }];

      const allocations = allocatePaymentsToStatements(
        [issuedStatements[1]],
        payment
      );

      expect(allocations[0].statementId).toBe("stmt-oct");
      expect(allocations[0].paidPaise).toBe(1_500_000);
      expect(allocations[0].remainingPaise).toBe(0);
      expect(allocations[0].isFullyPaid).toBe(true);
      expect(allocations[0].isPartiallyPaid).toBe(false);
    });

    it("allows partial payment and correctly maintains unpaid balance", () => {
      // Payment of ₹6,000 against ₹15,000 bill
      const partialPayment = [{ amountPaise: 600_000, date: "2026-10-20" }];

      const allocations = allocatePaymentsToStatements(
        [issuedStatements[1]],
        partialPayment
      );

      expect(allocations[0].paidPaise).toBe(600_000);
      expect(allocations[0].remainingPaise).toBe(900_000);
      expect(allocations[0].isFullyPaid).toBe(false);
      expect(allocations[0].isPartiallyPaid).toBe(true);
    });

    it("allows payments on and after the due date", () => {
      // Payment made on due date (05 Nov)
      const onDuePayment = [{ amountPaise: 1_500_000, date: "2026-11-05" }];
      const allocDue = allocatePaymentsToStatements([issuedStatements[1]], onDuePayment);
      expect(allocDue[0].isFullyPaid).toBe(true);

      // Payment made after due date (08 Nov)
      const latePayment = [{ amountPaise: 1_500_000, date: "2026-11-08" }];
      const allocLate = allocatePaymentsToStatements([issuedStatements[1]], latePayment);
      expect(allocLate[0].isFullyPaid).toBe(true);
    });

    it("allocates a single payment covering multiple statements oldest-first", () => {
      // Sept bill: ₹10,000 (due 05 Oct)
      // Oct bill: ₹15,000 (due 05 Nov)
      // Total dues: ₹25,000
      // User pays ₹18,000 on 20 Oct:
      // Sept bill should be fully settled (₹10,000 allocated).
      // Oct bill should be partially settled (₹8,000 allocated, ₹7,000 remaining).
      const multiStatementPayment = [{ amountPaise: 1_800_000, date: "2026-10-20" }];

      const allocations = allocatePaymentsToStatements(
        issuedStatements,
        multiStatementPayment
      );

      // Sept statement (oldest due date)
      expect(allocations[0].statementId).toBe("stmt-sept");
      expect(allocations[0].paidPaise).toBe(1_000_000);
      expect(allocations[0].remainingPaise).toBe(0);
      expect(allocations[0].isFullyPaid).toBe(true);

      // Oct statement
      expect(allocations[1].statementId).toBe("stmt-oct");
      expect(allocations[1].paidPaise).toBe(800_000);
      expect(allocations[1].remainingPaise).toBe(700_000);
      expect(allocations[1].isFullyPaid).toBe(false);
      expect(allocations[1].isPartiallyPaid).toBe(true);
    });
  });

  describe("4. Current Cycle Estimation vs Total Card Outstanding vs Statement Due", () => {
    it("estimates unbilled spend during an active in-progress cycle", () => {
      const transactions = [
        // Spends made after Oct 15 cutoff
        {
          date: "2026-10-18",
          amountPaise: 500_000,
          type: "card_purchase",
          creditCardId: sampleCard.id,
        },
        {
          date: "2026-10-22",
          amountPaise: 300_000,
          type: "card_purchase",
          creditCardId: sampleCard.id,
        },
        // Mid-cycle payment
        {
          date: "2026-10-25",
          amountPaise: 200_000,
          type: "card_payment",
          creditCardId: sampleCard.id,
        },
      ];

      const estimate = calculateCurrentCycleEstimate(
        sampleCard.id,
        "2026-10-15",
        transactions
      );

      // Purchases: ₹5,000 + ₹3,000 = ₹8,000 (800,000)
      // Payments: ₹2,000 (200,000)
      // Estimated next statement: ₹6,000 (600,000)
      expect(estimate.unbilledPurchasesPaise).toBe(800_000);
      expect(estimate.unbilledPaymentsPaise).toBe(200_000);
      expect(estimate.estimatedNextStatementPaise).toBe(600_000);
    });

    it("strictly separates statement due from total card outstanding and unbilled EMI", () => {
      // Example scenario:
      // Credit card has:
      // - Issued statement due: ₹10,000
      // - Recent unbilled transactions: ₹4,000
      // - Total card outstanding in bank ledger: ₹14,000
      // - Linked EMI remaining tenure principal: ₹50,000 (unbilled principal)
      // Statement due MUST be ₹10,000, NOT ₹14,000 and NOT ₹64,000!

      const statement: CreditCardStatementRecord = {
        id: "stmt-verified",
        userId: "user-1",
        creditCardId: sampleCard.id,
        statementDate: "2026-10-15",
        paymentDueDate: "2026-11-05",
        statementBalancePaise: 1_000_000, // ₹10,000
        minimumDuePaise: 50_000,
        isSettled: false,
      };

      const result = buildUpcomingPaymentsList({
        today: "2026-10-27",
        cards: [
          {
            id: sampleCard.id,
            name: sampleCard.name,
            bank_name: sampleCard.bankName,
            last_four_digits: "4321",
            payment_due_day: sampleCard.paymentDueDay,
            statement_day: sampleCard.statementDay,
          },
        ],
        statements: [statement],
        cardPaymentTransactions: [],
        debts: [
          // Standalone car loan (MUST be included in upcoming payments)
          {
            id: "loan-car",
            name: "Car Loan",
            lender_name: "HDFC",
            debt_type: "auto_loan",
            linked_credit_card_id: null,
            emi_amount_paise: 2_500_000,
            next_due_date: "2026-11-02",
            status: "active",
            original_principal_paise: 100_000_000,
            annual_interest_rate_basis_points: 900,
            total_tenure_months: 60,
            installments_paid_before_tracking: 10,
            first_emi_due_date: "2025-01-02",
          },
          // Card-linked EMI with ₹50,000 remaining principal (MUST NOT be included as standalone bank payment)
          {
            id: "emi-iphone",
            name: "iPhone EMI",
            lender_name: null,
            debt_type: "credit_card_emi",
            linked_credit_card_id: sampleCard.id,
            emi_amount_paise: 400_000,
            next_due_date: "2026-11-05",
            status: "active",
            original_principal_paise: 5_000_000,
            annual_interest_rate_basis_points: null,
            total_tenure_months: 12,
            installments_paid_before_tracking: 2,
            first_emi_due_date: "2026-08-05",
          },
        ],
        debtPayments: [],
      });

      // 1. Credit card statement payment must be exactly ₹10,000
      const cardStmt = result.activePayments.find((p) => p.kind === "credit_card_statement");
      expect(cardStmt).toBeDefined();
      expect(cardStmt?.amountPaise).toBe(1_000_000); // ₹10,000

      // 2. Standalone car loan must be present
      const carLoan = result.activePayments.find((p) => p.kind === "standalone_loan");
      expect(carLoan).toBeDefined();
      expect(carLoan?.title).toBe("Car Loan");

      // 3. Card-linked EMI must NOT appear as a standalone payment obligation (no double-counting)
      const standaloneEmi = result.activePayments.find((p) => p.title === "iPhone EMI");
      expect(standaloneEmi).toBeUndefined();
    });
  });

  describe("5. Preservation of Loan Amortization and Foreclosure Engines", () => {
    it("preserves standalone loan amortization schedule calculation", () => {
      const schedule = generateAmortizationSchedule({
        principalPaise: 50_000_000, // ₹5,00,000
        annualInterestRateBasisPoints: 1050, // 10.5%
        totalTenureMonths: 36,
        firstEmiDate: "2026-01-05",
        emiAmountPaise: 1_625_500, // ₹16,255
        installmentsPaidBeforeTracking: 0,
        actualPayments: [],
      });

      expect(schedule.installments.length).toBe(36);
      expect(schedule.totalProjectedInterestPaise).toBeGreaterThan(0);
      expect(schedule.nextDueInstallment).toBeDefined();
      expect(schedule.nextDueInstallment?.installmentNumber).toBe(1);
    });

    it("preserves loan foreclosure quote and settlement calculations", () => {
      const totalPaise = calculateForeclosureTotalPaise({
        outstandingPrincipalPaise: 40_000_000, // ₹4,00,000
        foreclosureChargesPaise: 800_000, // ₹8,000
        taxPaise: 144_000, // ₹1,440 GST
        otherChargesPaise: 50_000, // ₹500
        waiversPaise: 200_000, // ₹2,000 waiver
      });

      // Foreclosure total: 40,000,000 + 800,000 + 144,000 + 50,000 - 200,000 = 40,794,000
      expect(totalPaise).toBe(40_794_000);
    });
  });
});
