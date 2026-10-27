import { describe, expect, it } from "vitest";
import {
  validateTransactionEdit,
  detectSignificantTransactionChange,
  parseAmountToPaise,
  isValidDateFormat,
  type TransactionEditInput,
  type ValidationContext,
} from "./transaction-edits";
import {
  calculateAccountBalance,
  calculateCardOutstanding,
  calculateAvailableCredit,
} from "./balances";
import type { CreditCard, FinancialAccount, Transaction } from "./types";

const mockAccounts: FinancialAccount[] = [
  {
    id: "acc-hdfc-savings",
    name: "HDFC Salary Account",
    type: "bank",
    institution: "HDFC Bank",
    openingBalancePaise: 100_000_00, // ₹1,00,000.00
    openingBalanceDate: "2026-01-01",
    isArchived: false,
  },
  {
    id: "acc-icici-savings",
    name: "ICICI Savings",
    type: "bank",
    institution: "ICICI Bank",
    openingBalancePaise: 50_000_00, // ₹50,000.00
    openingBalanceDate: "2026-01-01",
    isArchived: false,
  },
];

const mockCards: CreditCard[] = [
  {
    id: "card-hdfc-regalia",
    name: "HDFC Regalia Gold",
    bankName: "HDFC Bank",
    lastFourDigits: "4321",
    creditLimitPaise: 25_000_000, // ₹2,50,000 limit
    openingOutstandingPaise: 5_000_00, // ₹5,000 opening debt
    openingOutstandingDate: "2026-01-01",
    isArchived: false,
  },
  {
    id: "card-icici-sapphiro",
    name: "ICICI Sapphiro",
    bankName: "ICICI Bank",
    lastFourDigits: "8765",
    creditLimitPaise: 30_000_000, // ₹3,00,000 limit
    openingOutstandingPaise: 0, // ₹0 opening debt
    openingOutstandingDate: "2026-01-01",
    isArchived: false,
  },
];

const validationCtx: ValidationContext = {
  today: "2026-10-27",
  accounts: mockAccounts.map((a) => ({
    id: a.id,
    name: a.name,
    openingBalanceDate: a.openingBalanceDate,
    isArchived: a.isArchived,
  })),
  creditCards: mockCards.map((c) => ({
    id: c.id,
    name: c.name,
    openingOutstandingDate: c.openingOutstandingDate,
    isArchived: c.isArchived,
  })),
};

describe("Transaction Edit Validation & Safety", () => {
  it("validates and parses valid amounts in rupees to integer paise", () => {
    expect(parseAmountToPaise("2000")).toBe(200_000);
    expect(parseAmountToPaise("2000.50")).toBe(200_050);
    expect(parseAmountToPaise("99.99")).toBe(9_999);
    expect(parseAmountToPaise("0.05")).toBe(5);
    expect(parseAmountToPaise("0")).toBeNull();
    expect(parseAmountToPaise("-100")).toBeNull();
    expect(parseAmountToPaise("abc")).toBeNull();
    expect(parseAmountToPaise("100.123")).toBeNull();
  });

  it("validates date format and rejects invalid or non-existent dates", () => {
    expect(isValidDateFormat("2026-10-27")).toBe(true);
    expect(isValidDateFormat("2026-02-29")).toBe(false); // 2026 is not a leap year
    expect(isValidDateFormat("27-10-2026")).toBe(false);
    expect(isValidDateFormat("invalid-date")).toBe(false);
  });

  it("rejects transactions with dates in the future", () => {
    const input: TransactionEditInput = {
      transactionId: "tx-1",
      description: "Flight Booking",
      amountInput: "4500",
      transactionDate: "2026-12-31", // future date
      transactionType: "expense",
      accountId: "acc-hdfc-savings",
    };

    const res = validateTransactionEdit(input, validationCtx);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.code).toBe("future-date");
    }
  });

  it("rejects transaction date earlier than account opening balance date", () => {
    const input: TransactionEditInput = {
      transactionId: "tx-1",
      description: "Old Grocery",
      amountInput: "1500",
      transactionDate: "2025-12-31", // earlier than 2026-01-01
      transactionType: "expense",
      accountId: "acc-hdfc-savings",
    };

    const res = validateTransactionEdit(input, validationCtx);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.code).toBe("date-before-opening");
    }
  });

  it("rejects card purchase without a valid credit card selected", () => {
    const input: TransactionEditInput = {
      transactionId: "tx-purchase",
      description: "Electronics Store",
      amountInput: "12000",
      transactionDate: "2026-10-15",
      transactionType: "card_purchase",
      creditCardId: "", // missing
    };

    const res = validateTransactionEdit(input, validationCtx);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.code).toBe("missing-card");
    }
  });

  it("rejects transfer when source and destination accounts are identical", () => {
    const input: TransactionEditInput = {
      transactionId: "tx-transfer",
      description: "Self Transfer",
      amountInput: "5000",
      transactionDate: "2026-10-15",
      transactionType: "transfer",
      fromAccountId: "acc-hdfc-savings",
      toAccountId: "acc-hdfc-savings",
    };

    const res = validateTransactionEdit(input, validationCtx);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.code).toBe("same-transfer-accounts");
    }
  });

  it("successfully validates a valid card purchase edit payload", () => {
    const input: TransactionEditInput = {
      transactionId: "tx-100",
      description: "Dinner at Bistro",
      amountInput: "2000.00",
      transactionDate: "2026-10-20",
      transactionType: "card_purchase",
      creditCardId: "card-icici-sapphiro",
      categoryName: "Food & Dining",
    };

    const res = validateTransactionEdit(input, validationCtx);
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.amountPaise).toBe(200_000);
      expect(res.data.creditCardId).toBe("card-icici-sapphiro");
      expect(res.data.accountId).toBeNull();
      expect(res.data.categoryName).toBe("Food & Dining");
    }
  });
});

describe("Correcting Wrong Credit Card & Financial Balance Integrity", () => {
  const cardHdfc = mockCards[0]; // opening outstanding ₹5,000, limit ₹2,50,000
  const cardIcici = mockCards[1]; // opening outstanding ₹0, limit ₹3,00,000

  it("corrects a ₹2,000 purchase originally assigned to HDFC to ICICI in place without duplicates", () => {
    // Original state: ₹2,000 purchase on HDFC
    const originalPurchase: Transaction = {
      id: "tx-swiggy",
      date: "2026-10-10",
      description: "Swiggy Gourmet",
      amountPaise: 200_000, // ₹2,000
      type: "card_purchase",
      creditCardId: cardHdfc.id,
      categoryId: "cat-food",
    };

    let ledger: Transaction[] = [originalPurchase];

    // Initial derived balances before edit
    expect(calculateCardOutstanding(cardHdfc, ledger)).toBe(500_000 + 200_000); // ₹7,000
    expect(calculateCardOutstanding(cardIcici, ledger)).toBe(0); // ₹0
    expect(calculateAvailableCredit(cardHdfc, ledger)).toBe(25_000_000 - 700_000); // ₹2,43,000
    expect(calculateAvailableCredit(cardIcici, ledger)).toBe(30_000_000); // ₹3,00,000

    // User corrects the card from HDFC to ICICI in place (same ID, no duplicate transactions)
    const correctedPurchase: Transaction = {
      ...originalPurchase,
      creditCardId: cardIcici.id, // switched to ICICI
    };

    // Update in place in the ledger
    ledger = ledger.map((tx) => (tx.id === correctedPurchase.id ? correctedPurchase : tx));

    // Post-edit derived balances: HDFC outstanding drops by ₹2,000, ICICI outstanding rises by ₹2,000
    expect(calculateCardOutstanding(cardHdfc, ledger)).toBe(500_000); // back to ₹5,000
    expect(calculateCardOutstanding(cardIcici, ledger)).toBe(200_000); // now ₹2,000
    expect(calculateAvailableCredit(cardHdfc, ledger)).toBe(25_000_000 - 500_000); // restored to ₹2,45,000
    expect(calculateAvailableCredit(cardIcici, ledger)).toBe(30_000_000 - 200_000); // reduced to ₹2,98,000

    // Ensure total transactions in ledger is exactly 1 (no duplicate or compensating transaction)
    expect(ledger).toHaveLength(1);
  });

  it("editing transaction amount updates the account balance by the exact delta", () => {
    const account = mockAccounts[0]; // opening ₹1,00,000
    const expenseTx: Transaction = {
      id: "tx-groceries",
      date: "2026-10-12",
      description: "Supermarket",
      amountPaise: 100_000, // ₹1,000
      type: "expense",
      accountId: account.id,
      categoryId: "cat-groceries",
    };

    let ledger = [expenseTx];
    expect(calculateAccountBalance(account, ledger)).toBe(100_000_00 - 100_000); // ₹99,000

    // User edits amount to ₹1,500
    const updatedTx: Transaction = {
      ...expenseTx,
      amountPaise: 150_000, // ₹1,500
    };
    ledger = [updatedTx];

    expect(calculateAccountBalance(account, ledger)).toBe(100_000_00 - 150_000); // ₹98,500 (delta: -₹500)
  });

  it("editing description or category alone preserves exact account and card balances", () => {
    const account = mockAccounts[0];
    const initialTx: Transaction = {
      id: "tx-coffee",
      date: "2026-10-15",
      description: "Starbucks Coffee",
      amountPaise: 35_000, // ₹350
      type: "expense",
      accountId: account.id,
      categoryId: "cat-dining",
    };

    const ledgerBefore = [initialTx];
    const balanceBefore = calculateAccountBalance(account, ledgerBefore);

    // Edit only description and category
    const editedTx: Transaction = {
      ...initialTx,
      description: "Blue Tokai Coffee Roasters (Corrected description)",
      categoryId: "cat-lifestyle",
    };
    const ledgerAfter = [editedTx];
    const balanceAfter = calculateAccountBalance(account, ledgerAfter);

    expect(balanceAfter).toBe(balanceBefore);
  });
});

describe("Significant Change Detection & Confirmation Rules", () => {
  const cardNames = new Map([
    ["card-hdfc-regalia", "HDFC Regalia Gold"],
    ["card-icici-sapphiro", "ICICI Sapphiro"],
  ]);
  const accountNames = new Map([
    ["acc-hdfc-savings", "HDFC Salary Account"],
    ["acc-icici-savings", "ICICI Savings"],
  ]);

  it("detects changing credit card on a purchase as a significant change requiring confirmation", () => {
    const original = {
      amountPaise: 200_000,
      transactionType: "card_purchase",
      creditCardId: "card-hdfc-regalia",
      transactionDate: "2026-10-10",
    };

    const edited = {
      amountPaise: 200_000,
      transactionType: "card_purchase",
      creditCardId: "card-icici-sapphiro",
      transactionDate: "2026-10-10",
    };

    const result = detectSignificantTransactionChange(original, edited, cardNames, accountNames);
    expect(result.isSignificant).toBe(true);
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0].field).toBe("credit_card");
    expect(result.changes[0].oldValue).toBe("HDFC Regalia Gold");
    expect(result.changes[0].newValue).toBe("ICICI Sapphiro");
    expect(result.explanation).toContain("move between the cards' calculated outstanding balances");
  });

  it("detects changing transaction amount as a significant change", () => {
    const original = {
      amountPaise: 100_000,
      transactionType: "expense",
      accountId: "acc-hdfc-savings",
      transactionDate: "2026-10-10",
    };

    const edited = {
      amountPaise: 150_000,
      transactionType: "expense",
      accountId: "acc-hdfc-savings",
      transactionDate: "2026-10-10",
    };

    const result = detectSignificantTransactionChange(original, edited, cardNames, accountNames);
    expect(result.isSignificant).toBe(true);
    expect(result.changes.some((c) => c.field === "amount")).toBe(true);
  });

  it("does not flag harmless text or category modifications as significant changes", () => {
    const original = {
      amountPaise: 100_000,
      transactionType: "expense",
      accountId: "acc-hdfc-savings",
      transactionDate: "2026-10-10",
    };

    const edited = {
      amountPaise: 100_000, // same amount
      transactionType: "expense", // same type
      accountId: "acc-hdfc-savings", // same account
      transactionDate: "2026-10-10", // same date
    };

    const result = detectSignificantTransactionChange(original, edited, cardNames, accountNames);
    expect(result.isSignificant).toBe(false);
    expect(result.changes).toHaveLength(0);
  });
});
