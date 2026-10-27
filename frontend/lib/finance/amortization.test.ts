import { describe, expect, it } from "vitest";
import {
  calculateStandardEmiPaise,
  generateAmortizationSchedule,
  addMonthsPreservingDay,
  isLeapYear,
  daysInMonth,
  getEmiCategory,
  isLoanEligibleForAmortization,
} from "./amortization";

describe("Amortization Calculation Engine", () => {
  describe("Standard Reference Loan (₹2,50,000 at 14.5% for 36 months)", () => {
    const referenceInput = {
      principalPaise: 25_000_000, // ₹2,50,000
      annualInterestRateBasisPoints: 1450, // 14.5%
      totalTenureMonths: 36,
      firstEmiDate: "2026-01-10",
      asOfDate: "2026-01-01",
    };

    it("calculates monthly EMI of approximately ₹8,605", () => {
      const emiPaise = calculateStandardEmiPaise(
        referenceInput.principalPaise,
        referenceInput.annualInterestRateBasisPoints,
        referenceInput.totalTenureMonths
      );

      // 860515 paise = ₹8,605.15
      expect(emiPaise).toBeGreaterThanOrEqual(860_500);
      expect(emiPaise).toBeLessThanOrEqual(860_600);
      expect(Math.round(emiPaise / 100)).toBe(8605);
    });

    it("computes exact first installment principal and interest split", () => {
      const schedule = generateAmortizationSchedule(referenceInput);

      expect(schedule.isValid).toBe(true);
      expect(schedule.installments).toHaveLength(36);

      const first = schedule.installments[0];
      expect(first.installmentNumber).toBe(1);
      expect(first.openingPrincipalPaise).toBe(25_000_000);

      // Standard calculated EMI: 860524 paise (₹8,605.24)
      // Monthly interest: 25000000 * (0.145 / 12) = 302083 paise (₹3,020.83)
      expect(first.interestPaise).toBe(302_083);

      // Principal repayment = EMI - Interest = 860524 - 302083 = 558441 paise (₹5,584.41)
      expect(first.principalPaise).toBe(558_441);
      expect(first.closingPrincipalPaise).toBe(25_000_000 - 558_441);
    });

    it("exhibits increasing principal repayment and decreasing interest over tenure", () => {
      const schedule = generateAmortizationSchedule(referenceInput);

      for (let i = 0; i < schedule.installments.length - 1; i++) {
        const current = schedule.installments[i];
        const next = schedule.installments[i + 1];

        expect(next.openingPrincipalPaise).toBe(current.closingPrincipalPaise);
        expect(next.interestPaise).toBeLessThan(current.interestPaise);
        expect(next.principalPaise).toBeGreaterThan(current.principalPaise);
      }
    });

    it("reconciles total principal repayments exactly to original principal with ₹0 residual balance", () => {
      const schedule = generateAmortizationSchedule(referenceInput);

      const totalPrincipalRepaid = schedule.installments.reduce(
        (acc, inst) => acc + inst.principalPaise,
        0
      );

      expect(totalPrincipalRepaid).toBe(referenceInput.principalPaise);
      expect(schedule.installments[35].closingPrincipalPaise).toBe(0);
    });

    it("respects user/lender entered EMI of ₹8,605 (860500 paise) and reconciles final installment", () => {
      const schedule = generateAmortizationSchedule({
        ...referenceInput,
        emiAmountPaise: 860_500, // ₹8,605 flat
      });

      expect(schedule.isValid).toBe(true);
      expect(schedule.installments).toHaveLength(36);

      // Verify installments 1 to 35 use the lender-stated EMI
      for (let i = 0; i < 35; i++) {
        expect(schedule.installments[i].emiAmountPaise).toBe(860_500);
      }

      // Final installment closes the residual accurately to exactly 0
      expect(schedule.installments[35].closingPrincipalPaise).toBe(0);

      const sumPrincipal = schedule.installments.reduce(
        (acc, inst) => acc + inst.principalPaise,
        0
      );
      expect(sumPrincipal).toBe(referenceInput.principalPaise);
    });
  });

  describe("Zero-Interest Loans (0% Interest Rate)", () => {
    it("splits principal equally with 0 interest across installments", () => {
      const schedule = generateAmortizationSchedule({
        principalPaise: 6_000_000, // ₹60,000
        annualInterestRateBasisPoints: 0,
        totalTenureMonths: 6,
        firstEmiDate: "2026-04-05",
      });

      expect(schedule.isValid).toBe(true);
      expect(schedule.totalProjectedInterestPaise).toBe(0);

      for (const inst of schedule.installments) {
        expect(inst.interestPaise).toBe(0);
        expect(inst.principalPaise).toBe(1_000_000);
      }

      expect(schedule.installments[5].closingPrincipalPaise).toBe(0);
      expect(schedule.totalPrincipalPaise).toBe(6_000_000);
    });

    it("adjusts odd-paise division correctly on final installment", () => {
      const schedule = generateAmortizationSchedule({
        principalPaise: 100_000, // ₹1,000
        annualInterestRateBasisPoints: 0,
        totalTenureMonths: 3,
        firstEmiDate: "2026-01-01",
      });

      expect(schedule.isValid).toBe(true);
      const sum = schedule.installments.reduce(
        (acc, inst) => acc + inst.principalPaise,
        0
      );
      expect(sum).toBe(100_000);
      expect(schedule.installments[2].closingPrincipalPaise).toBe(0);
    });
  });

  describe("Calendar & Date Progression", () => {
    it("preserves anchor day of month and handles February in common years", () => {
      // 2026 is not a leap year: Feb has 28 days
      expect(addMonthsPreservingDay("2026-01-31", 0)).toBe("2026-01-31");
      expect(addMonthsPreservingDay("2026-01-31", 1)).toBe("2026-02-28");
      expect(addMonthsPreservingDay("2026-01-31", 2)).toBe("2026-03-31");
      expect(addMonthsPreservingDay("2026-01-31", 3)).toBe("2026-04-30");
      expect(addMonthsPreservingDay("2026-01-31", 4)).toBe("2026-05-31");
    });

    it("handles February 29 in leap years", () => {
      expect(isLeapYear(2028)).toBe(true);
      expect(daysInMonth(2028, 2)).toBe(29);
      expect(addMonthsPreservingDay("2028-01-31", 1)).toBe("2028-02-29");
      expect(addMonthsPreservingDay("2028-01-31", 2)).toBe("2028-03-31");
    });
  });

  describe("Payment Tracking & Actual vs Projected Separation", () => {
    it("distinguishes paid installments from upcoming without treating projected as paid", () => {
      const schedule = generateAmortizationSchedule({
        principalPaise: 10_000_000,
        annualInterestRateBasisPoints: 1200,
        totalTenureMonths: 12,
        firstEmiDate: "2026-01-01",
        installmentsPaidBeforeTracking: 3,
        asOfDate: "2026-04-15",
      });

      expect(schedule.paidInstallmentsCount).toBe(3);
      expect(schedule.remainingInstallmentsCount).toBe(9);

      // First 3 are paid
      expect(schedule.installments[0].isPaid).toBe(true);
      expect(schedule.installments[1].isPaid).toBe(true);
      expect(schedule.installments[2].isPaid).toBe(true);

      // Installment 4 due 2026-04-01 is overdue as of 2026-04-15
      expect(schedule.installments[3].isPaid).toBe(false);
      expect(schedule.installments[3].status).toBe("overdue");

      // Installment 5 due 2026-05-01 is upcoming
      expect(schedule.installments[4].isPaid).toBe(false);
      expect(schedule.installments[4].status).toBe("upcoming");

      // Next due installment is installment 4
      expect(schedule.nextDueInstallment?.installmentNumber).toBe(4);
    });

    it("calculates repayment progress from principal repaid relative to original principal", () => {
      const schedule = generateAmortizationSchedule({
        principalPaise: 10_000_000,
        annualInterestRateBasisPoints: 1200,
        totalTenureMonths: 10,
        firstEmiDate: "2026-01-01",
        installmentsPaidBeforeTracking: 5,
        asOfDate: "2026-05-01",
      });

      const expectedPrincipalRepaid = schedule.installments
        .slice(0, 5)
        .reduce((sum, inst) => sum + inst.principalPaise, 0);

      const expectedPct = Math.round(
        (expectedPrincipalRepaid / 10_000_000) * 100
      );

      expect(schedule.repaymentProgressPercent).toBe(expectedPct);
      expect(schedule.principalRepaidPaise).toBe(expectedPrincipalRepaid);
      expect(schedule.remainingPrincipalPaise).toBe(
        10_000_000 - expectedPrincipalRepaid
      );
    });
  });

  describe("Validation & Error Safety", () => {
    it("safely handles non-positive principal", () => {
      const result = generateAmortizationSchedule({
        principalPaise: 0,
        annualInterestRateBasisPoints: 1200,
        totalTenureMonths: 12,
        firstEmiDate: "2026-01-01",
      });

      expect(result.isValid).toBe(false);
      expect(result.errorMessage).toBeDefined();
      expect(result.installments).toHaveLength(0);
    });

    it("safely handles negative interest rate", () => {
      const result = generateAmortizationSchedule({
        principalPaise: 1_000_000,
        annualInterestRateBasisPoints: -100,
        totalTenureMonths: 12,
        firstEmiDate: "2026-01-01",
      });

      expect(result.isValid).toBe(false);
      expect(result.errorMessage).toBeDefined();
    });

    it("safely handles zero tenure", () => {
      const result = generateAmortizationSchedule({
        principalPaise: 1_000_000,
        annualInterestRateBasisPoints: 1200,
        totalTenureMonths: 0,
        firstEmiDate: "2026-01-01",
      });

      expect(result.isValid).toBe(false);
      expect(result.errorMessage).toBeDefined();
    });

    it("safely handles invalid date format", () => {
      const result = generateAmortizationSchedule({
        principalPaise: 1_000_000,
        annualInterestRateBasisPoints: 1200,
        totalTenureMonths: 12,
        firstEmiDate: "invalid-date",
      });

      expect(result.isValid).toBe(false);
      expect(result.errorMessage).toBeDefined();
    });
  });

  describe("EMI Type Separation & Safeguards", () => {
    it("distinguishes loan EMI from credit card EMI correctly", () => {
      expect(
        getEmiCategory({
          debtType: "personal_loan",
        })
      ).toBe("loan_emi");

      expect(
        getEmiCategory({
          debtType: "vehicle_loan",
        })
      ).toBe("loan_emi");

      expect(
        getEmiCategory({
          debtType: "credit_card_emi",
          linkedCreditCardId: "card-123",
        })
      ).toBe("credit_card_emi");

      expect(
        getEmiCategory({
          debt_type: "credit_card_emi",
        })
      ).toBe("credit_card_emi");

      expect(
        getEmiCategory({
          debt_type: "external_loan",
          linked_credit_card_id: "card-456",
        })
      ).toBe("credit_card_emi");
    });

    it("verifies amortization eligibility only for loan EMIs with valid terms", () => {
      // Valid loan EMI
      expect(
        isLoanEligibleForAmortization({
          debt_type: "personal_loan",
          annual_interest_rate_basis_points: 1450,
          total_tenure_months: 36,
          first_emi_due_date: "2026-01-10",
        })
      ).toBe(true);

      // Credit card EMI must NOT be eligible for loan amortization
      expect(
        isLoanEligibleForAmortization({
          debt_type: "credit_card_emi",
          linked_credit_card_id: "card-1",
          annual_interest_rate_basis_points: 1450,
          total_tenure_months: 12,
          first_emi_due_date: "2026-01-10",
        })
      ).toBe(false);

      // Missing or incomplete terms
      expect(
        isLoanEligibleForAmortization({
          debt_type: "personal_loan",
          annual_interest_rate_basis_points: null,
          total_tenure_months: 36,
          first_emi_due_date: "2026-01-10",
        })
      ).toBe(false);

      expect(
        isLoanEligibleForAmortization({
          debt_type: "personal_loan",
          annual_interest_rate_basis_points: 1200,
          total_tenure_months: 0,
          first_emi_due_date: "2026-01-10",
        })
      ).toBe(false);
    });
  });

  describe("Loan Editing & Term Recalculation Safeguards", () => {
    it("recomputes future schedule when interest rate or tenure is updated while preserving historical payments", () => {
      // Original loan: ₹3,00,000 at 12% for 24 months, with 2 actual payments made
      const originalInput = {
        principalPaise: 30_000_000,
        annualInterestRateBasisPoints: 1200,
        totalTenureMonths: 24,
        firstEmiDate: "2026-01-10",
        actualPayments: [
          {
            date: "2026-01-10",
            installmentNumber: 1,
            amountPaise: 1412204, // ₹14,122.04
            principalComponentPaise: 1112204,
            interestComponentPaise: 300000,
            paymentKind: "scheduled_emi",
          },
          {
            date: "2026-02-10",
            installmentNumber: 2,
            amountPaise: 1412204,
            principalComponentPaise: 1123326,
            interestComponentPaise: 288878,
            paymentKind: "scheduled_emi",
          },
        ],
      };

      const originalSchedule = generateAmortizationSchedule(originalInput);
      expect(originalSchedule.isValid).toBe(true);
      expect(originalSchedule.installments).toHaveLength(24);
      expect(originalSchedule.installments[0].isPaid).toBe(true);
      expect(originalSchedule.installments[1].isPaid).toBe(true);
      expect(originalSchedule.installments[0].principalPaise).toBe(1112204);
      expect(originalSchedule.installments[1].principalPaise).toBe(1123326);

      // Now suppose the loan is edited: tenure extended to 36 months and interest rate adjusted to 11.5%
      const updatedInput = {
        ...originalInput,
        annualInterestRateBasisPoints: 1150,
        totalTenureMonths: 36,
      };

      const updatedSchedule = generateAmortizationSchedule(updatedInput);
      expect(updatedSchedule.isValid).toBe(true);
      expect(updatedSchedule.installments).toHaveLength(36);

      // Crucial: Historical payments must remain exactly as recorded
      expect(updatedSchedule.installments[0].isPaid).toBe(true);
      expect(updatedSchedule.installments[0].actualPrincipalPaise).toBe(1112204);
      expect(updatedSchedule.installments[0].actualInterestPaise).toBe(300000);
      expect(updatedSchedule.installments[1].isPaid).toBe(true);
      expect(updatedSchedule.installments[1].actualPrincipalPaise).toBe(1123326);
      expect(updatedSchedule.installments[1].actualInterestPaise).toBe(288878);
      expect(updatedSchedule.principalRepaidPaise).toBe(1112204 + 1123326);

      // Future installments reflect the updated terms
      expect(updatedSchedule.installments[2].isPaid).toBe(false);
      expect(updatedSchedule.installments[35].closingPrincipalPaise).toBe(0);
    });

    it("handles outstanding principal snapshot adjustments correctly", () => {
      // Editing snapshot to account for pre-tracking payments
      const snapshotSchedule = generateAmortizationSchedule({
        principalPaise: 50_000_000,
        annualInterestRateBasisPoints: 1000,
        totalTenureMonths: 60,
        firstEmiDate: "2026-01-05",
        installmentsPaidBeforeTracking: 12,
      });

      expect(snapshotSchedule.isValid).toBe(true);
      expect(snapshotSchedule.installments).toHaveLength(60);
      // First 12 installments should be marked as paid
      for (let i = 0; i < 12; i++) {
        expect(snapshotSchedule.installments[i].isPaid).toBe(true);
      }
      expect(snapshotSchedule.installments[12].isPaid).toBe(false);
      expect(snapshotSchedule.paidInstallmentsCount).toBe(12);
      expect(snapshotSchedule.remainingInstallmentsCount).toBe(48);
    });

    it("safeguards against invalid edited parameters", () => {
      // Negative principal
      expect(
        generateAmortizationSchedule({
          principalPaise: -500_000,
          annualInterestRateBasisPoints: 1200,
          totalTenureMonths: 24,
          firstEmiDate: "2026-01-10",
        }).isValid
      ).toBe(false);

      // Negative interest rate
      expect(
        generateAmortizationSchedule({
          principalPaise: 500_000,
          annualInterestRateBasisPoints: -100,
          totalTenureMonths: 24,
          firstEmiDate: "2026-01-10",
        }).isValid
      ).toBe(false);

      // Zero tenure
      expect(
        generateAmortizationSchedule({
          principalPaise: 500_000,
          annualInterestRateBasisPoints: 1200,
          totalTenureMonths: 0,
          firstEmiDate: "2026-01-10",
        }).isValid
      ).toBe(false);
    });
  });
});
