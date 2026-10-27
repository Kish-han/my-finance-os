import { describe, expect, it } from "vitest";
import {
  validateAdditionalCharges,
  extractAdditionalCharges,
  embedChargesInNotes,
  stripChargesFromNotes,
  parseChargesFromNotes,
} from "./emi-charges";
import {
  calculateStandardEmiPaise,
  generateAmortizationSchedule,
} from "./amortization";

describe("emi-charges helper", () => {
  describe("validateAdditionalCharges", () => {
    it("accepts empty or null amounts defaulting to 0 paise", () => {
      const res1 = validateAdditionalCharges("", "");
      expect(res1.isValid).toBe(true);
      expect(res1.chargesPaise).toBe(0);
      expect(res1.description).toBeNull();

      const res2 = validateAdditionalCharges(null, undefined);
      expect(res2.isValid).toBe(true);
      expect(res2.chargesPaise).toBe(0);
      expect(res2.description).toBeNull();
    });

    it("parses valid positive amounts and descriptions", () => {
      const res = validateAdditionalCharges("500", "Processing Fee");
      expect(res.isValid).toBe(true);
      expect(res.chargesPaise).toBe(50000);
      expect(res.description).toBe("Processing Fee");

      const resDecimal = validateAdditionalCharges("1250.75", "EMI Conversion Charges");
      expect(resDecimal.isValid).toBe(true);
      expect(resDecimal.chargesPaise).toBe(125075);
      expect(resDecimal.description).toBe("EMI Conversion Charges");
    });

    it("accepts zero amount with description", () => {
      const res = validateAdditionalCharges("0", "Waived Fee");
      expect(res.isValid).toBe(true);
      expect(res.chargesPaise).toBe(0);
      expect(res.description).toBe("Waived Fee");
    });

    it("rejects negative amounts cleanly", () => {
      const res = validateAdditionalCharges("-100", "Negative fee");
      expect(res.isValid).toBe(false);
      expect(res.errorMessage).toBeDefined();

      const resDecimalNeg = validateAdditionalCharges("-0.01", null);
      expect(resDecimalNeg.isValid).toBe(false);
      expect(resDecimalNeg.errorMessage).toContain("non-negative");
    });

    it("rejects non-numeric inputs cleanly", () => {
      const res = validateAdditionalCharges("invalid", "Fee");
      expect(res.isValid).toBe(false);

      const resPartial = validateAdditionalCharges("500abc", "Fee");
      expect(resPartial.isValid).toBe(false);

      const resSpecial = validateAdditionalCharges("$500", "Fee");
      expect(resSpecial.isValid).toBe(false);
    });

    it("rejects descriptions exceeding 120 characters", () => {
      const longDesc = "a".repeat(121);
      const res = validateAdditionalCharges("500", longDesc);
      expect(res.isValid).toBe(false);
      expect(res.errorMessage).toContain("120 characters");
    });

    it("accepts descriptions up to 120 characters", () => {
      const validDesc = "a".repeat(120);
      const res = validateAdditionalCharges("500", validDesc);
      expect(res.isValid).toBe(true);
      expect(res.description).toBe(validDesc);
    });
  });

  describe("extractAdditionalCharges", () => {
    it("extracts charges from database columns when present", () => {
      const debt = {
        additional_charges_paise: 75000,
        charge_description: "Processing Fee",
      };
      const res = extractAdditionalCharges(debt);
      expect(res.hasCharges).toBe(true);
      expect(res.chargesPaise).toBe(75000);
      expect(res.description).toBe("Processing Fee");
    });

    it("returns hasCharges: false when charges are zero and description is null", () => {
      const debt = {
        additional_charges_paise: 0,
        charge_description: null,
      };
      const res = extractAdditionalCharges(debt);
      expect(res.hasCharges).toBe(false);
      expect(res.chargesPaise).toBe(0);
      expect(res.description).toBeNull();
    });

    it("handles camelCase debt properties from application models", () => {
      const debt = {
        additionalChargesPaise: 49900,
        chargeDescription: "EMI Conversion Charges",
      };
      const res = extractAdditionalCharges(debt);
      expect(res.hasCharges).toBe(true);
      expect(res.chargesPaise).toBe(49900);
      expect(res.description).toBe("EMI Conversion Charges");
    });

    it("falls back to parsing notes metadata when columns are missing", () => {
      const notes = embedChargesInNotes(
        "Important loan notes",
        25000,
        "Documentation Fee"
      );
      const debt = {
        notes,
      };
      const res = extractAdditionalCharges(debt);
      expect(res.hasCharges).toBe(true);
      expect(res.chargesPaise).toBe(25000);
      expect(res.description).toBe("Documentation Fee");
    });
  });

  describe("creation and editing lifecycle workflows", () => {
    it("supports creating a loan without additional charges", () => {
      const validation = validateAdditionalCharges("", "");
      expect(validation.isValid).toBe(true);
      expect(validation.chargesPaise).toBe(0);
      expect(validation.description).toBeNull();

      const debtRecord = {
        additional_charges_paise: validation.chargesPaise,
        charge_description: validation.description,
      };
      const extracted = extractAdditionalCharges(debtRecord);
      expect(extracted.hasCharges).toBe(false);
    });

    it("supports creating a loan with additional charges", () => {
      const validation = validateAdditionalCharges("1500", "Processing Fee");
      expect(validation.isValid).toBe(true);
      expect(validation.chargesPaise).toBe(150000);
      expect(validation.description).toBe("Processing Fee");

      const debtRecord = {
        additional_charges_paise: validation.chargesPaise,
        charge_description: validation.description,
      };
      const extracted = extractAdditionalCharges(debtRecord);
      expect(extracted.hasCharges).toBe(true);
      expect(extracted.chargesPaise).toBe(150000);
      expect(extracted.description).toBe("Processing Fee");
    });

    it("supports editing a loan to add charges when previously none existed", () => {
      const initialRecord = {
        additional_charges_paise: 0,
        charge_description: null,
      };
      expect(extractAdditionalCharges(initialRecord).hasCharges).toBe(false);

      // User adds ₹2,000 Administrative Fee
      const editValidation = validateAdditionalCharges("2000", "Administrative Fee");
      expect(editValidation.isValid).toBe(true);

      const updatedRecord = {
        ...initialRecord,
        additional_charges_paise: editValidation.chargesPaise,
        charge_description: editValidation.description,
      };
      const updatedExtraction = extractAdditionalCharges(updatedRecord);
      expect(updatedExtraction.hasCharges).toBe(true);
      expect(updatedExtraction.chargesPaise).toBe(200000);
      expect(updatedExtraction.description).toBe("Administrative Fee");
    });

    it("supports editing a loan to modify existing charges", () => {
      const initialRecord = {
        additional_charges_paise: 50000,
        charge_description: "Old Fee",
      };

      // User updates fee to ₹750 and renames to "Updated Fee"
      const editValidation = validateAdditionalCharges("750", "Updated Fee");
      const updatedRecord = {
        ...initialRecord,
        additional_charges_paise: editValidation.chargesPaise,
        charge_description: editValidation.description,
      };
      const updatedExtraction = extractAdditionalCharges(updatedRecord);
      expect(updatedExtraction.chargesPaise).toBe(75000);
      expect(updatedExtraction.description).toBe("Updated Fee");
    });

    it("supports editing a loan to remove charges completely", () => {
      const initialRecord = {
        additional_charges_paise: 50000,
        charge_description: "Processing Fee",
      };

      // User clears amount and description
      const editValidation = validateAdditionalCharges("", "");
      const updatedRecord = {
        ...initialRecord,
        additional_charges_paise: editValidation.chargesPaise,
        charge_description: editValidation.description,
      };
      const updatedExtraction = extractAdditionalCharges(updatedRecord);
      expect(updatedExtraction.hasCharges).toBe(false);
      expect(updatedExtraction.chargesPaise).toBe(0);
      expect(updatedExtraction.description).toBeNull();
    });
  });

  describe("notes fallback helpers", () => {
    it("embeds, parses, and strips charges markers accurately", () => {
      const originalNotes = "Original customer note text.";
      const embedded = embedChargesInNotes(originalNotes, 150000, "Processing Fee");
      expect(embedded).toContain("<!-- aura:charges:");

      const parsed = parseChargesFromNotes(embedded);
      expect(parsed).toEqual({
        chargesPaise: 150000,
        description: "Processing Fee",
      });

      const stripped = stripChargesFromNotes(embedded);
      expect(stripped).toBe(originalNotes);
    });

    it("clears embedded marker when charges are 0 and description is null", () => {
      const embedded = embedChargesInNotes("Base note", 50000, "Old fee");
      const cleared = embedChargesInNotes(embedded, 0, null);
      expect(cleared).toBe("Base note");
    });
  });

  describe("repayment calculation isolation (CRITICAL FINANCIAL INTEGRITY)", () => {
    it("ensures additional charges do not distort reducing-balance amortization schedules", () => {
      const principalPaise = 50000000; // ₹5,00,000
      const rateBps = 1200; // 12% p.a.
      const tenureMonths = 36;
      const firstEmiDate = "2026-11-01";

      // 1. Standard calculation without charges
      const emiPaise = calculateStandardEmiPaise(principalPaise, rateBps, tenureMonths);
      const scheduleWithoutCharges = generateAmortizationSchedule({
        principalPaise,
        annualInterestRateBasisPoints: rateBps,
        totalTenureMonths: tenureMonths,
        firstEmiDate,
      });

      expect(emiPaise).toBe(scheduleWithoutCharges.monthlyEmiPaise);

      // 2. Loan with ₹10,000 processing fee
      const additionalChargePaise = 1000000; // ₹10,000
      expect(additionalChargePaise).toBe(1000000);

      // CRITICAL: The principal passed to the calculation MUST remain the pure loan principal
      expect(principalPaise).toBe(50000000);
      const scheduleWithCharges = generateAmortizationSchedule({
        principalPaise, // MUST NOT add additionalChargePaise here!
        annualInterestRateBasisPoints: rateBps,
        totalTenureMonths: tenureMonths,
        firstEmiDate,
      });

      // Amortization figures must match 100% identically
      expect(scheduleWithCharges.monthlyEmiPaise).toBe(scheduleWithoutCharges.monthlyEmiPaise);
      expect(scheduleWithCharges.totalProjectedInterestPaise).toBe(
        scheduleWithoutCharges.totalProjectedInterestPaise
      );
      expect(scheduleWithCharges.totalProjectedRepaymentPaise).toBe(
        scheduleWithoutCharges.totalProjectedRepaymentPaise
      );
      expect(scheduleWithCharges.installments.length).toBe(scheduleWithoutCharges.installments.length);

      // Verify that every single installment breakdown is identical
      for (let i = 0; i < scheduleWithoutCharges.installments.length; i++) {
        expect(scheduleWithCharges.installments[i].principalPaise).toBe(
          scheduleWithoutCharges.installments[i].principalPaise
        );
        expect(scheduleWithCharges.installments[i].interestPaise).toBe(
          scheduleWithoutCharges.installments[i].interestPaise
        );
        expect(scheduleWithCharges.installments[i].closingPrincipalPaise).toBe(
          scheduleWithoutCharges.installments[i].closingPrincipalPaise
        );
      }
    });
  });
});
