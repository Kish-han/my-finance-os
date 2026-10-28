import { describe, expect, it } from "vitest";
import {
  formatRupees,
  buildLimitExceededMessage,
  calculateRevolvingOutstanding,
  calculateBlockedEmiPrincipal,
  calculateCardCreditUtilization,
  validateCreditCardChargeLimit,
  processEmiConversionAccounting,
  type CardLimitInput,
  type CardTransactionInput,
  type CardLinkedEmiInput,
} from "./card-limit-engine";

describe("Card Limit Engine - Authoritative Credit Limit Enforcement", () => {
  it("formats rupees and builds standardized rejection messages correctly", () => {
    expect(formatRupees(100000)).toBe("₹1,000");
    expect(formatRupees(-500000)).toBe("-₹5,000");
    expect(formatRupees(100050)).toBe("₹1,000.50");

    const message = buildLimitExceededMessage(200_000, 800_000, 1_000_000);
    expect(message).toBe(
      "This transaction exceeds your available credit by ₹2,000. Available credit: ₹8,000. Transaction amount: ₹10,000."
    );

    const testCard: CardLimitInput = {
      id: "c-rev",
      creditLimitPaise: 1_000_000,
      openingOutstandingPaise: 100_000,
      openingOutstandingDate: "2026-01-01",
    };
    const txs: CardTransactionInput[] = [
      { id: "1", creditCardId: "c-rev", amountPaise: 50_000, type: "card_purchase", date: "2026-01-02" },
      { id: "2", creditCardId: "c-rev", amountPaise: 20_000, type: "card_payment", date: "2026-01-03" },
      { id: "3", creditCardId: "c-rev", amountPaise: 10_000, type: "card_credit", date: "2026-01-04" },
    ];
    expect(calculateRevolvingOutstanding(testCard, txs)).toBe(120_000);
  });

  const sampleCard100k: CardLimitInput = {
    id: "card-axis-100k",
    creditLimitPaise: 10_000_000, // ₹1,00,000.00
    openingOutstandingPaise: 0,
    openingOutstandingDate: "2026-01-01",
  };

  const sampleCardNeo: CardLimitInput = {
    id: "card-axis-neo",
    creditLimitPaise: 10_000_000, // ₹1,00,000.00
    openingOutstandingPaise: 0,
    openingOutstandingDate: "2026-01-01",
  };

  // Case 1: Transaction within limit is permitted
  it("Case 1: permits transaction strictly within available limit (₹92k current + ₹5k charge <= ₹100k limit)", () => {
    const existingTransactions: CardTransactionInput[] = [
      {
        id: "tx-1",
        creditCardId: sampleCard100k.id,
        amountPaise: 9_200_000, // ₹92,000
        type: "card_purchase",
        date: "2026-03-01",
      },
    ];

    const result = validateCreditCardChargeLimit({
      card: sampleCard100k,
      transactions: existingTransactions,
      chargeAmountPaise: 500_000, // ₹5,000
    });

    expect(result.allowed).toBe(true);
    expect(result.currentUtilizedPaise).toBe(9_200_000);
    expect(result.currentAvailablePaise).toBe(800_000); // ₹8,000 available
    expect(result.projectedUtilizedPaise).toBe(9_700_000); // ₹97,000
    expect(result.projectedAvailablePaise).toBe(300_000); // ₹3,000 remaining
    expect(result.exceededByPaise).toBe(0);
    expect(result.errorMessage).toBeUndefined();
  });

  // Case 2: Transaction exactly reaching the limit is permitted
  it("Case 2: permits transaction that brings outstanding exactly to the credit limit (available reaches ₹0)", () => {
    const existingTransactions: CardTransactionInput[] = [
      {
        id: "tx-1",
        creditCardId: sampleCard100k.id,
        amountPaise: 9_200_000, // ₹92,000
        type: "card_purchase",
        date: "2026-03-01",
      },
    ];

    const result = validateCreditCardChargeLimit({
      card: sampleCard100k,
      transactions: existingTransactions,
      chargeAmountPaise: 800_000, // ₹8,000 exactly
    });

    expect(result.allowed).toBe(true);
    expect(result.projectedUtilizedPaise).toBe(10_000_000);
    expect(result.projectedAvailablePaise).toBe(0);
    expect(result.exceededByPaise).toBe(0);
    expect(result.errorMessage).toBeUndefined();
  });

  // Case 3: Transaction exceeding limit by 1 paisa is rejected
  it("Case 3: strictly rejects charge exceeding limit by 1 paisa", () => {
    const existingTransactions: CardTransactionInput[] = [
      {
        id: "tx-1",
        creditCardId: sampleCard100k.id,
        amountPaise: 9_200_000, // ₹92,000
        type: "card_purchase",
        date: "2026-03-01",
      },
    ];

    const result = validateCreditCardChargeLimit({
      card: sampleCard100k,
      transactions: existingTransactions,
      chargeAmountPaise: 800_001, // ₹8,000.01 (1 paisa over)
    });

    expect(result.allowed).toBe(false);
    expect(result.exceededByPaise).toBe(1);
    expect(result.projectedAvailablePaise).toBe(-1);
    expect(result.errorMessage).toBe(
      "This transaction exceeds your available credit by ₹0.01. Available credit: ₹8,000. Transaction amount: ₹8,000.01."
    );
  });

  // Case 4: Transaction exceeding limit by substantial amount (prompt example)
  it("Case 4: strictly rejects ₹10,000 charge with exact message when available credit is ₹8,000", () => {
    const existingTransactions: CardTransactionInput[] = [
      {
        id: "tx-1",
        creditCardId: sampleCard100k.id,
        amountPaise: 9_200_000, // ₹92,000
        type: "card_purchase",
        date: "2026-03-01",
      },
    ];

    const result = validateCreditCardChargeLimit({
      card: sampleCard100k,
      transactions: existingTransactions,
      chargeAmountPaise: 1_000_000, // ₹10,000
    });

    expect(result.allowed).toBe(false);
    expect(result.currentAvailablePaise).toBe(800_000); // ₹8,000
    expect(result.exceededByPaise).toBe(200_000); // Exceeded by ₹2,000
    expect(result.errorMessage).toBe(
      "This transaction exceeds your available credit by ₹2,000. Available credit: ₹8,000. Transaction amount: ₹10,000."
    );
  });

  // Case 5: Opening outstanding already on card accumulates toward limit
  it("Case 5: opening outstanding correctly accumulates toward the credit limit", () => {
    const cardWithOpening: CardLimitInput = {
      id: "card-with-opening",
      creditLimitPaise: 5_000_000, // ₹50,000 limit
      openingOutstandingPaise: 3_000_000, // ₹30,000 opening outstanding
      openingOutstandingDate: "2026-01-01",
    };

    const transactions: CardTransactionInput[] = [
      {
        id: "tx-new-1",
        creditCardId: cardWithOpening.id,
        amountPaise: 1_500_000, // ₹15,000 purchase
        type: "card_purchase",
        date: "2026-01-10",
      },
    ];

    // Current utilized = 30k + 15k = 45k. Available = 5k.
    const validCheck = validateCreditCardChargeLimit({
      card: cardWithOpening,
      transactions,
      chargeAmountPaise: 500_000, // ₹5,000
    });
    expect(validCheck.allowed).toBe(true);

    const overCheck = validateCreditCardChargeLimit({
      card: cardWithOpening,
      transactions,
      chargeAmountPaise: 600_000, // ₹6,000 -> exceeds by ₹1,000
    });
    expect(overCheck.allowed).toBe(false);
    expect(overCheck.exceededByPaise).toBe(100_000);
    expect(overCheck.errorMessage).toBe(
      "This transaction exceeds your available credit by ₹1,000. Available credit: ₹5,000. Transaction amount: ₹6,000."
    );
  });

  // Case 6: Repayments (card_payment) restore available credit
  it("Case 6: card repayments immediately restore available credit and unblock new charges", () => {
    const transactions: CardTransactionInput[] = [
      {
        id: "tx-purchase",
        creditCardId: sampleCard100k.id,
        amountPaise: 9_500_000, // ₹95,000
        type: "card_purchase",
        date: "2026-03-01",
      },
      {
        id: "tx-repayment",
        creditCardId: sampleCard100k.id,
        amountPaise: 5_000_000, // ₹50,000 payment
        type: "card_payment",
        date: "2026-03-10",
      },
    ];

    // Outstanding is now ₹95,000 - ₹50,000 = ₹45,000. Available = ₹55,000.
    const result = validateCreditCardChargeLimit({
      card: sampleCard100k,
      transactions,
      chargeAmountPaise: 5_000_000, // ₹50,000 new charge
    });

    expect(result.allowed).toBe(true);
    expect(result.currentUtilizedPaise).toBe(4_500_000);
    expect(result.currentAvailablePaise).toBe(5_500_000);
    expect(result.projectedUtilizedPaise).toBe(9_500_000);
    expect(result.projectedAvailablePaise).toBe(500_000);
  });

  // Case 7: Refunds and merchant credits (card_credit) restore available credit
  it("Case 7: merchant refunds and credits restore available credit", () => {
    const transactions: CardTransactionInput[] = [
      {
        id: "tx-1",
        creditCardId: sampleCard100k.id,
        amountPaise: 9_500_000, // ₹95,000
        type: "card_purchase",
        date: "2026-03-01",
      },
      {
        id: "tx-refund",
        creditCardId: sampleCard100k.id,
        amountPaise: 1_000_000, // ₹10,000 merchant refund
        type: "card_credit",
        date: "2026-03-05",
      },
    ];

    // Outstanding = 95k - 10k = 85k. Available = 15k.
    const result = validateCreditCardChargeLimit({
      card: sampleCard100k,
      transactions,
      chargeAmountPaise: 1_200_000, // ₹12,000
    });

    expect(result.allowed).toBe(true);
    expect(result.currentUtilizedPaise).toBe(8_500_000);
    expect(result.currentAvailablePaise).toBe(1_500_000);
    expect(result.projectedAvailablePaise).toBe(300_000);
  });

  // Case 8: Transaction editing - increasing amount within limit
  it("Case 8: allows editing transaction up when revised amount fits in limit (excluding old amount)", () => {
    const transactions: CardTransactionInput[] = [
      {
        id: "tx-base",
        creditCardId: sampleCard100k.id,
        amountPaise: 8_000_000, // ₹80,000
        type: "card_purchase",
        date: "2026-03-01",
      },
      {
        id: "tx-editing",
        creditCardId: sampleCard100k.id,
        amountPaise: 1_000_000, // ₹10,000 (currently utilized: 90k)
        type: "card_purchase",
        date: "2026-03-02",
      },
    ];

    // Editing tx-editing from ₹10,000 to ₹18,000 (total will be 80k + 18k = 98k <= 100k)
    const result = validateCreditCardChargeLimit({
      card: sampleCard100k,
      transactions,
      chargeAmountPaise: 1_800_000,
      excludeTransactionId: "tx-editing",
    });

    expect(result.allowed).toBe(true);
    expect(result.currentUtilizedPaise).toBe(8_000_000); // 10k excluded
    expect(result.currentAvailablePaise).toBe(2_000_000);
    expect(result.projectedUtilizedPaise).toBe(9_800_000);
    expect(result.projectedAvailablePaise).toBe(200_000);
  });

  // Case 9: Transaction editing - increasing amount beyond limit is rejected
  it("Case 9: rejects editing transaction up when revised amount exceeds limit (excluding old amount)", () => {
    const transactions: CardTransactionInput[] = [
      {
        id: "tx-base",
        creditCardId: sampleCard100k.id,
        amountPaise: 8_000_000, // ₹80,000
        type: "card_purchase",
        date: "2026-03-01",
      },
      {
        id: "tx-editing",
        creditCardId: sampleCard100k.id,
        amountPaise: 1_000_000, // ₹10,000
        type: "card_purchase",
        date: "2026-03-02",
      },
    ];

    // Editing tx-editing from ₹10,000 to ₹25,000 (80k + 25k = 105k > 100k)
    const result = validateCreditCardChargeLimit({
      card: sampleCard100k,
      transactions,
      chargeAmountPaise: 2_500_000,
      excludeTransactionId: "tx-editing",
    });

    expect(result.allowed).toBe(false);
    expect(result.currentAvailablePaise).toBe(2_000_000); // Available without tx-editing is ₹20,000
    expect(result.exceededByPaise).toBe(500_000); // Exceeded by ₹5,000
    expect(result.errorMessage).toBe(
      "This transaction exceeds your available credit by ₹5,000. Available credit: ₹20,000. Transaction amount: ₹25,000."
    );
  });

  // Case 10: Transaction editing - decreasing amount frees up available credit
  it("Case 10: editing transaction down correctly frees up available credit", () => {
    const transactions: CardTransactionInput[] = [
      {
        id: "tx-editing",
        creditCardId: sampleCard100k.id,
        amountPaise: 9_000_000, // ₹90,000
        type: "card_purchase",
        date: "2026-03-01",
      },
    ];

    // Edit down from ₹90,000 to ₹30,000
    const result = validateCreditCardChargeLimit({
      card: sampleCard100k,
      transactions,
      chargeAmountPaise: 3_000_000,
      excludeTransactionId: "tx-editing",
    });

    expect(result.allowed).toBe(true);
    expect(result.projectedUtilizedPaise).toBe(3_000_000);
    expect(result.projectedAvailablePaise).toBe(7_000_000);
  });

  // Case 11: Transaction editing - moving transaction between cards
  it("Case 11: safely validates credit limit when moving a transaction from Card A to Card B", () => {
    const cardB: CardLimitInput = {
      id: "card-b-50k",
      creditLimitPaise: 5_000_000, // ₹50,000 limit
      openingOutstandingPaise: 0,
      openingOutstandingDate: "2026-01-01",
    };

    const cardBTransactions: CardTransactionInput[] = [
      {
        id: "tx-b-1",
        creditCardId: cardB.id,
        amountPaise: 4_500_000, // ₹45,000 utilized
        type: "card_purchase",
        date: "2026-03-01",
      },
    ];

    // Moving a ₹10,000 transaction originally on Card A to Card B:
    // Card B only has ₹5,000 available, so ₹10,000 must be rejected!
    const checkCardB = validateCreditCardChargeLimit({
      card: cardB,
      transactions: cardBTransactions,
      chargeAmountPaise: 1_000_000, // ₹10,000
      excludeTransactionId: "tx-from-card-a", // was on Card A
    });

    expect(checkCardB.allowed).toBe(false);
    expect(checkCardB.currentAvailablePaise).toBe(500_000); // ₹5,000
    expect(checkCardB.exceededByPaise).toBe(500_000); // Exceeded by ₹5,000
    expect(checkCardB.errorMessage).toBe(
      "This transaction exceeds your available credit by ₹5,000. Available credit: ₹5,000. Transaction amount: ₹10,000."
    );
  });

  // Case 12: Active card-linked EMI principal blocks card credit limit
  it("Case 12: active card-linked EMI principal blocks credit limit and reduces available credit", () => {
    const cardTransactions: CardTransactionInput[] = [
      {
        id: "tx-revolving",
        creditCardId: sampleCard100k.id,
        amountPaise: 3_000_000, // ₹30,000 revolving purchase
        type: "card_purchase",
        date: "2026-03-01",
      },
    ];

    const activeEmis: CardLinkedEmiInput[] = [
      {
        id: "emi-phone",
        linkedCreditCardId: sampleCard100k.id,
        currentOutstandingPrincipalPaise: 4_000_000, // ₹40,000 active EMI principal
        status: "active",
      },
      {
        id: "emi-closed",
        linkedCreditCardId: sampleCard100k.id,
        currentOutstandingPrincipalPaise: 2_000_000, // ₹20,000 closed EMI (does not block limit!)
        status: "closed",
      },
    ];

    const blocked = calculateBlockedEmiPrincipal(sampleCard100k.id, activeEmis);
    expect(blocked).toBe(4_000_000); // Only active EMI blocks limit

    const utilization = calculateCardCreditUtilization(
      sampleCard100k,
      cardTransactions,
      activeEmis
    );

    // Total utilized = ₹30k revolving + ₹40k EMI = ₹70,000
    expect(utilization.revolvingOutstandingPaise).toBe(3_000_000);
    expect(utilization.blockedEmiPrincipalPaise).toBe(4_000_000);
    expect(utilization.totalUtilizedCreditPaise).toBe(7_000_000);
    expect(utilization.availableCreditPaise).toBe(3_000_000); // ₹30,000 available
    expect(utilization.utilizationPercent).toBe(70);

    // Charge of ₹25,000 is permitted
    const check1 = validateCreditCardChargeLimit({
      card: sampleCard100k,
      transactions: cardTransactions,
      cardLinkedEmis: activeEmis,
      chargeAmountPaise: 2_500_000,
    });
    expect(check1.allowed).toBe(true);

    // Charge of ₹35,000 exceeds available credit (₹30,000) by ₹5,000
    const check2 = validateCreditCardChargeLimit({
      card: sampleCard100k,
      transactions: cardTransactions,
      cardLinkedEmis: activeEmis,
      chargeAmountPaise: 3_500_000,
    });
    expect(check2.allowed).toBe(false);
    expect(check2.exceededByPaise).toBe(500_000);
    expect(check2.errorMessage).toBe(
      "This transaction exceeds your available credit by ₹5,000. Available credit: ₹30,000. Transaction amount: ₹35,000."
    );
  });

  // Case 13: Axis Neo EMI conversion integration
  it("Case 13: integrates conversion of ₹47,500 Axis Neo dues into EMI leaving ₹7,450 revolving balance without duplicate expenses, fake bank debits, or double-counted liabilities", () => {
    // 1. Initial state: Axis Neo has ₹54,950 total dues
    const initialTransactions: CardTransactionInput[] = [
      {
        id: "tx-purchase-all",
        creditCardId: sampleCardNeo.id,
        amountPaise: 5_495_000, // ₹54,950
        type: "card_purchase",
        date: "2026-03-01",
      },
    ];

    const preUtilization = calculateCardCreditUtilization(
      sampleCardNeo,
      initialTransactions,
      []
    );
    expect(preUtilization.revolvingOutstandingPaise).toBe(5_495_000); // ₹54,950
    expect(preUtilization.totalUtilizedCreditPaise).toBe(5_495_000);
    expect(preUtilization.availableCreditPaise).toBe(4_505_000); // ₹45,050 available

    // 2. Perform EMI conversion accounting:
    // Converted amount: ₹47,500. Expected revolving remaining: ₹7,450.
    const conversionResult = processEmiConversionAccounting({
      card: sampleCardNeo,
      transactions: initialTransactions,
      cardLinkedEmis: [],
      conversionAmountPaise: 4_750_000, // ₹47,500
      conversionDate: "2026-03-15",
      description: "Axis Neo EMI Conversion Adjustment",
    });

    // A. Verify no fake bank debits
    expect(conversionResult.adjustmentTransaction.fromAccountId).toBeNull();

    // B. Verify revolving balance is reduced by exactly ₹47,500 to leave ₹7,450
    expect(conversionResult.postConversionRevolvingPaise).toBe(745_000); // ₹7,450.00
    expect(conversionResult.preConversionRevolvingPaise - 4_750_000).toBe(745_000);

    // C. Verify blocked EMI principal is now ₹47,500
    expect(conversionResult.newEmiDebt.currentOutstandingPrincipalPaise).toBe(4_750_000);

    // D. Verify total credit utilized remains ₹54,950 (NOT ₹1,02,450!) - Zero double counting!
    expect(conversionResult.postConversionUtilizedPaise).toBe(5_495_000);
    expect(conversionResult.postConversionAvailablePaise).toBe(4_505_000); // Available credit unchanged

    // Total debt liability = Revolving (₹7,450) + Converted EMI principal (₹47,500) = ₹54,950
    const totalLiabilitiesPaise =
      conversionResult.postConversionRevolvingPaise +
      Number(conversionResult.newEmiDebt.currentOutstandingPrincipalPaise);
    expect(totalLiabilitiesPaise).toBe(5_495_000);
  });

  // Case 14: Card already over limit
  it("Case 14: calculates negative available credit on over-limit cards and blocks any positive charge", () => {
    const overLimitCard: CardLimitInput = {
      id: "card-over-limit",
      creditLimitPaise: 5_000_000, // ₹50,000 limit
      openingOutstandingPaise: 0,
      openingOutstandingDate: "2026-01-01",
    };

    const overTransactions: CardTransactionInput[] = [
      {
        id: "tx-over",
        creditCardId: overLimitCard.id,
        amountPaise: 5_200_000, // ₹52,000 (exceeds ₹50,000 limit by ₹2,000)
        type: "card_purchase",
        date: "2026-03-01",
      },
    ];

    const utilization = calculateCardCreditUtilization(
      overLimitCard,
      overTransactions,
      []
    );

    expect(utilization.isOverLimit).toBe(true);
    expect(utilization.revolvingOutstandingPaise).toBe(5_200_000);
    expect(utilization.availableCreditPaise).toBe(-200_000); // -₹2,000 available credit
    expect(utilization.utilizationPercent).toBe(104);

    // Even a ₹1 charge must be blocked!
    const result = validateCreditCardChargeLimit({
      card: overLimitCard,
      transactions: overTransactions,
      chargeAmountPaise: 100, // ₹1.00
    });

    expect(result.allowed).toBe(false);
    expect(result.currentAvailablePaise).toBe(-200_000);
    expect(result.exceededByPaise).toBe(200_100);
    expect(result.errorMessage).toBe(
      "This transaction exceeds your available credit by ₹2,001. Available credit: -₹2,000. Transaction amount: ₹1."
    );
  });
});
