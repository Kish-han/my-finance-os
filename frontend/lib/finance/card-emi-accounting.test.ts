import { describe, expect, it } from "vitest";
import type { CreditCard, FinancialAccount, Transaction } from "./types";
import {
  calculateCardOutstanding,
  calculateAvailableCredit,
  calculateCardCreditUtilization,
  partitionDebtsForLiabilities,
  calculateNetWorth,
} from "./balances";

describe("Credit Card & EMI Accounting Integration", () => {
  const sampleCard: CreditCard = {
    id: "card-axis-25k",
    name: "Axis Neo",
    bankName: "Axis Bank",
    creditLimitPaise: 2_500_000, // ₹25,000.00
    openingOutstandingPaise: 0,
    openingOutstandingDate: "2026-01-01",
    isArchived: false,
  };

  const sampleBank: FinancialAccount = {
    id: "bank-hdfc",
    name: "HDFC Savings",
    type: "bank",
    institution: "HDFC Bank",
    openingBalancePaise: 5_000_000, // ₹50,000.00
    openingBalanceDate: "2026-01-01",
    isArchived: false,
  };

  it("satisfies the user primary test case: ₹25k limit, ₹10k purchase + ₹5k EMI => ₹15k liability (NOT ₹20k), ₹10k available credit", () => {
    // 1. Transactions recorded on the card: ₹10,000 regular purchase + ₹5,000 EMI conversion purchase
    const cardTransactions: Transaction[] = [
      {
        id: "tx-purchase-1",
        date: "2026-03-05",
        description: "Grocery shopping",
        amountPaise: 1_000_000, // ₹10,000
        type: "card_purchase",
        creditCardId: sampleCard.id,
        categoryId: "cat-groceries",
      },
      {
        id: "tx-purchase-emi",
        date: "2026-03-08",
        description: "Microwave Oven (EMI Purchase)",
        amountPaise: 500_000, // ₹5,000
        type: "card_purchase",
        creditCardId: sampleCard.id,
        categoryId: "cat-electronics",
      },
    ];

    // Card outstanding must be exactly ₹15,000
    const cardOutstandingPaise = calculateCardOutstanding(
      sampleCard,
      cardTransactions
    );
    expect(cardOutstandingPaise).toBe(1_500_000); // ₹15,000.00

    // Available credit must be exactly ₹10,000
    const availableCreditPaise = calculateAvailableCredit(
      sampleCard,
      cardTransactions
    );
    expect(availableCreditPaise).toBe(1_000_000); // ₹10,000.00
    expect(availableCreditPaise + cardOutstandingPaise).toBe(
      sampleCard.creditLimitPaise
    );

    // Credit utilization must be exactly 60%
    const utilizationRate = cardOutstandingPaise / sampleCard.creditLimitPaise;
    expect(utilizationRate).toBe(0.6);

    // 2. EMI debt record linked to the credit card
    const debts = [
      {
        id: "emi-microwave",
        debtType: "credit_card_emi",
        linkedCreditCardId: sampleCard.id,
        outstandingPaise: 500_000, // ₹5,000
      },
    ];

    // 3. Partitioning debts: Card-linked EMI must NOT be treated as a standalone loan
    const partition = partitionDebtsForLiabilities(debts);
    expect(partition.standaloneLoans).toHaveLength(0);
    expect(partition.cardLinkedEmis).toHaveLength(1);
    expect(partition.totalStandaloneLoanPaise).toBe(0);
    expect(partition.totalCardLinkedEmiPaise).toBe(500_000);

    // 4. Net Worth calculation: Total liability MUST be ₹15,000, NOT ₹20,000!
    const { totalLiabilitiesPaise, netWorthPaise } = calculateNetWorth({
      liquidAssetsPaise: sampleBank.openingBalancePaise, // ₹50,000
      cardOutstandingPaise, // ₹15,000
      standaloneLoanPrincipalPaise: partition.totalStandaloneLoanPaise, // ₹0
    });

    expect(totalLiabilitiesPaise).toBe(1_500_000); // ₹15,000 (NOT ₹20,000)
    expect(netWorthPaise).toBe(3_500_000); // ₹50,000 - ₹15,000 = ₹35,000
  });

  it("handles co-existence of standalone term loans and credit card EMIs correctly", () => {
    // Card has ₹15,000 outstanding (incorporating the ₹5,000 card EMI)
    const cardOutstandingPaise = 1_500_000;

    const debts = [
      {
        id: "debt-car-loan",
        debtType: "vehicle_loan",
        linkedCreditCardId: null,
        outstandingPaise: 5_000_000, // ₹50,000 standalone loan
      },
      {
        id: "debt-phone-emi",
        debtType: "credit_card_emi",
        linkedCreditCardId: "card-axis-25k",
        outstandingPaise: 500_000, // ₹5,000 card-linked EMI
      },
    ];

    const partition = partitionDebtsForLiabilities(debts);
    expect(partition.standaloneLoans).toHaveLength(1);
    expect(partition.standaloneLoans[0].id).toBe("debt-car-loan");
    expect(partition.cardLinkedEmis).toHaveLength(1);
    expect(partition.cardLinkedEmis[0].id).toBe("debt-phone-emi");

    expect(partition.totalStandaloneLoanPaise).toBe(5_000_000);
    expect(partition.totalCardLinkedEmiPaise).toBe(500_000);

    // Total liabilities = ₹15,000 card + ₹50,000 term loan = ₹65,000 (NOT ₹70,000)
    const liquidAssetsPaise = 10_000_000; // ₹1,00,000
    const { totalLiabilitiesPaise, netWorthPaise } = calculateNetWorth({
      liquidAssetsPaise,
      cardOutstandingPaise,
      standaloneLoanPrincipalPaise: partition.totalStandaloneLoanPaise,
    });

    expect(totalLiabilitiesPaise).toBe(6_500_000); // ₹65,000
    expect(netWorthPaise).toBe(3_500_000); // ₹1,00,000 - ₹65,000 = ₹35,000
  });

  it("classifies debts accurately across debtType and linkedCreditCardId combinations", () => {
    const mixedDebts = [
      // Standalone term loans
      {
        id: "d1",
        debtType: "personal_loan",
        linkedCreditCardId: null,
        outstandingPaise: 100_000,
      },
      {
        id: "d2",
        debtType: "home_loan",
        linkedCreditCardId: null,
        outstandingPaise: 200_000,
      },
      // Card EMI by debtType
      {
        id: "d3",
        debtType: "credit_card_emi",
        linkedCreditCardId: null,
        outstandingPaise: 300_000,
      },
      // Card EMI by linked card
      {
        id: "d4",
        debtType: "consumer_durable_emi",
        linkedCreditCardId: "card-axis-25k",
        outstandingPaise: 400_000,
      },
    ];

    const partition = partitionDebtsForLiabilities(mixedDebts);

    expect(partition.standaloneLoans.map((d) => d.id)).toEqual(["d1", "d2"]);
    expect(partition.cardLinkedEmis.map((d) => d.id)).toEqual(["d3", "d4"]);
    expect(partition.totalStandaloneLoanPaise).toBe(300_000);
    expect(partition.totalCardLinkedEmiPaise).toBe(700_000);
  });

  it("verifies non-duplication of expenses: card_purchase is expense, card_payment is balance reduction", () => {
    const transactions: Transaction[] = [
      {
        id: "tx-purchase",
        date: "2026-03-01",
        description: "Laptop Purchase",
        amountPaise: 6_000_000, // ₹60,000
        type: "card_purchase",
        creditCardId: sampleCard.id,
        categoryId: "cat-electronics",
      },
      {
        id: "tx-repayment",
        date: "2026-03-20",
        description: "Axis Card Bill Payment",
        amountPaise: 6_000_000, // ₹60,000
        type: "card_payment",
        fromAccountId: sampleBank.id,
        creditCardId: sampleCard.id,
      },
    ];

    // Card outstanding after bill payment returns to ₹0
    const finalOutstanding = calculateCardOutstanding(sampleCard, transactions);
    expect(finalOutstanding).toBe(0);

    // Monthly expenses filter only includes "expense" and "card_purchase", NOT "card_payment"
    const monthlyExpensesPaise = transactions
      .filter(
        (tx) => tx.type === "expense" || tx.type === "card_purchase"
      )
      .reduce((sum, tx) => sum + tx.amountPaise, 0);

    expect(monthlyExpensesPaise).toBe(6_000_000); // Only the purchase, not the repayment
  });

  describe("Scenario 1: Convert an existing card purchase into EMI", () => {
    const card50k: CreditCard = {
      id: "card-hdfc-50k",
      name: "HDFC Regalia",
      bankName: "HDFC Bank",
      creditLimitPaise: 5_000_000, // ₹50,000.00
      openingOutstandingPaise: 0,
      openingOutstandingDate: "2026-01-01",
      isArchived: false,
    };

    it("leaves card outstanding and available credit unchanged at ₹10k and ₹40k respectively with 1 transaction", () => {
      // 1. Initial State: ₹10,000 purchase recorded on the card
      const existingPurchase: Transaction = {
        id: "tx-purchase-10k",
        date: "2026-04-01",
        description: "Electronics Store",
        amountPaise: 1_000_000, // ₹10,000
        type: "card_purchase",
        creditCardId: card50k.id,
        categoryId: "cat-electronics",
      };
      const transactions: Transaction[] = [existingPurchase];

      // Before conversion:
      const preOutstanding = calculateCardOutstanding(card50k, transactions);
      const preAvailable = calculateAvailableCredit(card50k, transactions);
      expect(preOutstanding).toBe(1_000_000); // ₹10,000
      expect(preAvailable).toBe(4_000_000); // ₹40,000

      // 2. User converts this ₹10,000 purchase into EMI:
      // EMI plan is created and linked to the existing purchase transaction.
      // Crucial rules:
      // - Do NOT create another card purchase transaction.
      // - Do NOT create a fake payment adjustment.
      // - Do NOT add the EMI principal to outstanding again.
      // - Do NOT subtract the EMI principal simply because it was converted.
      const emiPlan = {
        id: "emi-plan-electronics",
        name: "Electronics Store EMI",
        debtType: "credit_card_emi",
        linkedCreditCardId: card50k.id,
        linkedTransactionId: existingPurchase.id, // Linked to existing purchase!
        currentOutstandingPrincipalPaise: 1_000_000, // ₹10,000
        status: "active",
      };

      // Exactly 1 transaction exists in the ledger
      expect(transactions).toHaveLength(1);
      expect(transactions[0].id).toBe("tx-purchase-10k");

      // Card outstanding remains ₹10,000
      const postOutstanding = calculateCardOutstanding(card50k, transactions);
      expect(postOutstanding).toBe(1_000_000); // ₹10,000 (unchanged)

      // Available credit remains ₹40,000
      const postAvailable = calculateAvailableCredit(card50k, transactions);
      expect(postAvailable).toBe(4_000_000); // ₹40,000 (unchanged)

      // Total utilized credit in Card Limit Engine
      const utilization = calculateCardCreditUtilization(
        card50k,
        transactions,
        [emiPlan]
      );
      expect(utilization.revolvingOutstandingPaise).toBe(1_000_000);
      expect(utilization.blockedEmiPrincipalPaise).toBe(0); // Linked EMI is not added again
      expect(utilization.totalUtilizedCreditPaise).toBe(1_000_000); // Exactly ₹10,000
      expect(utilization.availableCreditPaise).toBe(4_000_000); // Exactly ₹40,000
      expect(utilization.isOverLimit).toBe(false);
    });
  });

  describe("Scenario 2: Make a new purchase directly on EMI", () => {
    const card50k: CreditCard = {
      id: "card-hdfc-50k",
      name: "HDFC Regalia",
      bankName: "HDFC Bank",
      creditLimitPaise: 5_000_000, // ₹50,000.00
      openingOutstandingPaise: 0,
      openingOutstandingDate: "2026-01-01",
      isArchived: false,
    };

    it("increases card outstanding from ₹10k to ₹20k and decreases available credit to ₹30k with 2 transactions", () => {
      // 1. Initial State: ₹10,000 prior purchase
      const priorPurchase: Transaction = {
        id: "tx-prior-10k",
        date: "2026-04-01",
        description: "Grocery Supermarket",
        amountPaise: 1_000_000, // ₹10,000
        type: "card_purchase",
        creditCardId: card50k.id,
        categoryId: "cat-groceries",
      };
      const transactions: Transaction[] = [priorPurchase];

      expect(calculateCardOutstanding(card50k, transactions)).toBe(1_000_000);
      expect(calculateAvailableCredit(card50k, transactions)).toBe(4_000_000);

      // 2. User makes a new ₹10,000 purchase directly on EMI:
      // Exactly ONE new card purchase transaction is created in the ledger
      const newEmiPurchase: Transaction = {
        id: "tx-new-emi-10k",
        date: "2026-04-10",
        description: "Smartphone on 6M EMI",
        amountPaise: 1_000_000, // ₹10,000
        type: "card_purchase",
        creditCardId: card50k.id,
        categoryId: "cat-electronics",
      };
      transactions.push(newEmiPurchase);

      // EMI plan is created and linked to the new transaction
      const emiPlan = {
        id: "emi-plan-smartphone",
        name: "Smartphone on 6M EMI",
        debtType: "credit_card_emi",
        linkedCreditCardId: card50k.id,
        linkedTransactionId: newEmiPurchase.id,
        currentOutstandingPrincipalPaise: 1_000_000, // ₹10,000
        status: "active",
      };

      // Ledger has exactly two purchases
      expect(transactions).toHaveLength(2);

      // Card outstanding becomes ₹20,000 (NOT ₹30,000!)
      const postOutstanding = calculateCardOutstanding(card50k, transactions);
      expect(postOutstanding).toBe(2_000_000); // ₹20,000

      // Available credit becomes ₹30,000
      const postAvailable = calculateAvailableCredit(card50k, transactions);
      expect(postAvailable).toBe(3_000_000); // ₹30,000

      // Utilization engine reflects ₹20,000 total utilized and ₹30,000 available
      const utilization = calculateCardCreditUtilization(
        card50k,
        transactions,
        [emiPlan]
      );
      expect(utilization.revolvingOutstandingPaise).toBe(2_000_000);
      expect(utilization.blockedEmiPrincipalPaise).toBe(0);
      expect(utilization.totalUtilizedCreditPaise).toBe(2_000_000); // ₹20,000
      expect(utilization.availableCreditPaise).toBe(3_000_000); // ₹30,000

      // 3. Repayment: User pays ₹10,000 card bill
      const billPayment: Transaction = {
        id: "tx-payment-10k",
        date: "2026-04-25",
        description: "HDFC Card Bill Payment",
        amountPaise: 1_000_000, // ₹10,000
        type: "card_payment",
        fromAccountId: sampleBank.id,
        creditCardId: card50k.id,
      };
      transactions.push(billPayment);

      // Card outstanding reduces to ₹10,000 and available credit returns to ₹40,000
      const postRepaymentOutstanding = calculateCardOutstanding(card50k, transactions);
      const postRepaymentAvailable = calculateAvailableCredit(card50k, transactions);
      expect(postRepaymentOutstanding).toBe(1_000_000); // ₹10,000
      expect(postRepaymentAvailable).toBe(4_000_000); // ₹40,000
    });
  });

  describe("Backward compatibility with unlinked legacy EMIs", () => {
    const card50k: CreditCard = {
      id: "card-hdfc-50k",
      name: "HDFC Regalia",
      bankName: "HDFC Bank",
      creditLimitPaise: 5_000_000, // ₹50,000.00
      openingOutstandingPaise: 0,
      openingOutstandingDate: "2026-01-01",
      isArchived: false,
    };

    it("blocks limit for unlinked legacy EMIs without corresponding transaction rows", () => {
      // Legacy EMI entered without a corresponding transaction row in the ledger
      const legacyUnlinkedEmi = {
        id: "emi-legacy",
        name: "Old Laptop EMI",
        debtType: "credit_card_emi",
        linkedCreditCardId: card50k.id,
        linkedTransactionId: null, // Unlinked!
        currentOutstandingPrincipalPaise: 1_500_000, // ₹15,000
        status: "active",
      };

      const utilization = calculateCardCreditUtilization(
        card50k,
        [], // No transactions
        [legacyUnlinkedEmi]
      );

      expect(utilization.revolvingOutstandingPaise).toBe(0);
      expect(utilization.blockedEmiPrincipalPaise).toBe(1_500_000); // ₹15,000 blocked
      expect(utilization.totalUtilizedCreditPaise).toBe(1_500_000);
      expect(utilization.availableCreditPaise).toBe(3_500_000); // ₹35,000 remaining
    });
  });
});
