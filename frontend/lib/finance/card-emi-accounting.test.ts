import { describe, expect, it } from "vitest";
import type { CreditCard, FinancialAccount, Transaction } from "./types";
import {
  calculateCardOutstanding,
  calculateAvailableCredit,
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
});
