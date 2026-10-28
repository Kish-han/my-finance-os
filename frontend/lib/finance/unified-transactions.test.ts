import { describe, it, expect } from "vitest";
import {
  calculateAccountBalance,
  calculateCardOutstanding,
  calculateAvailableCredit,
} from "./balances";
import type { FinancialAccount, CreditCard, Transaction } from "./types";

describe("Unified Transaction Entry: Balance & Debt Accounting", () => {
  const bankAccount: FinancialAccount = {
    id: "bank-1",
    name: "HDFC Savings",
    type: "bank",
    institution: "HDFC Bank",
    openingBalancePaise: 50000_00, // ₹50,000
    openingBalanceDate: "2026-01-01",
    isArchived: false,
  };

  const cashAccount: FinancialAccount = {
    id: "cash-1",
    name: "Cash Wallet",
    type: "cash",
    openingBalancePaise: 10000_00, // ₹10,000
    openingBalanceDate: "2026-01-01",
    isArchived: false,
  };

  const creditCard: CreditCard = {
    id: "card-1",
    name: "Regalia Gold",
    bankName: "HDFC Bank",
    lastFourDigits: "4321",
    creditLimitPaise: 200000_00, // ₹2,00,000
    openingOutstandingPaise: 5000_00, // ₹5,000
    openingOutstandingDate: "2026-01-01",
    isArchived: false,
  };

  // 1. Income received into a bank account
  it("increases bank account balance exactly once on income transaction", () => {
    const transactions: Transaction[] = [
      {
        id: "tx-income-bank",
        date: "2026-02-01",
        description: "Monthly Salary",
        amountPaise: 80000_00, // ₹80,000
        type: "income",
        accountId: "bank-1",
        categoryId: "cat-salary",
      },
    ];

    const bankBalance = calculateAccountBalance(bankAccount, transactions);
    expect(bankBalance).toBe(130000_00); // 50,000 + 80,000
  });

  // 2. Income received into a cash account
  it("increases cash account balance exactly once on cash income", () => {
    const transactions: Transaction[] = [
      {
        id: "tx-income-cash",
        date: "2026-02-01",
        description: "Cash Gift",
        amountPaise: 5000_00, // ₹5,000
        type: "income",
        accountId: "cash-1",
        categoryId: "cat-gift",
      },
    ];

    const cashBalance = calculateAccountBalance(cashAccount, transactions);
    expect(cashBalance).toBe(15000_00); // 10,000 + 5,000
  });

  // 3. Expense paid from a bank account
  it("decreases bank account balance exactly once on expense transaction", () => {
    const transactions: Transaction[] = [
      {
        id: "tx-expense-bank",
        date: "2026-02-01",
        description: "Electricity Bill",
        amountPaise: 3500_00, // ₹3,500
        type: "expense",
        accountId: "bank-1",
        categoryId: "cat-utilities",
      },
    ];

    const bankBalance = calculateAccountBalance(bankAccount, transactions);
    expect(bankBalance).toBe(46500_00); // 50,000 - 3,500
  });

  // 4. Expense paid from a cash account
  it("decreases cash account balance exactly once on cash expense", () => {
    const transactions: Transaction[] = [
      {
        id: "tx-expense-cash",
        date: "2026-02-01",
        description: "Groceries from local market",
        amountPaise: 2000_00, // ₹2,000
        type: "expense",
        accountId: "cash-1",
        categoryId: "cat-groceries",
      },
    ];

    const cashBalance = calculateAccountBalance(cashAccount, transactions);
    expect(cashBalance).toBe(8000_00); // 10,000 - 2,000
  });

  // 5. Expense paid using a credit card (recorded as card_purchase)
  it("increases card outstanding balance and does NOT debit bank or cash account", () => {
    const transactions: Transaction[] = [
      {
        id: "tx-card-purchase",
        date: "2026-02-01",
        description: "Amazon Electronics",
        amountPaise: 15000_00, // ₹15,000
        type: "card_purchase",
        creditCardId: "card-1",
        categoryId: "cat-shopping",
      },
    ];

    // Card outstanding increases by purchase amount
    const cardOutstanding = calculateCardOutstanding(creditCard, transactions);
    expect(cardOutstanding).toBe(20000_00); // 5,000 + 15,000

    // Available credit decreases accordingly
    const availableCredit = calculateAvailableCredit(creditCard, transactions);
    expect(availableCredit).toBe(180000_00); // 2,00,000 - 20,000

    // Bank and cash accounts must be completely untouched
    const bankBalance = calculateAccountBalance(bankAccount, transactions);
    const cashBalance = calculateAccountBalance(cashAccount, transactions);
    expect(bankBalance).toBe(50000_00);
    expect(cashBalance).toBe(10000_00);
  });

  // 6. Multiple mixed transactions: bank expense, cash expense, and card purchase
  it("tracks independent balances and liabilities accurately across mixed payment types", () => {
    const transactions: Transaction[] = [
      {
        id: "tx-1",
        date: "2026-02-02",
        description: "Rent Paid from Bank",
        amountPaise: 25000_00,
        type: "expense",
        accountId: "bank-1",
        categoryId: "cat-rent",
      },
      {
        id: "tx-2",
        date: "2026-02-03",
        description: "Cash Dinner",
        amountPaise: 1500_00,
        type: "expense",
        accountId: "cash-1",
        categoryId: "cat-dining",
      },
      {
        id: "tx-3",
        date: "2026-02-04",
        description: "Flight Booking via Card",
        amountPaise: 12000_00,
        type: "card_purchase",
        creditCardId: "card-1",
        categoryId: "cat-travel",
      },
      {
        id: "tx-4",
        date: "2026-02-05",
        description: "Consulting Income into Bank",
        amountPaise: 40000_00,
        type: "income",
        accountId: "bank-1",
        categoryId: "cat-income",
      },
    ];

    const bankBalance = calculateAccountBalance(bankAccount, transactions);
    expect(bankBalance).toBe(65000_00); // 50,000 - 25,000 + 40,000

    const cashBalance = calculateAccountBalance(cashAccount, transactions);
    expect(cashBalance).toBe(8500_00); // 10,000 - 1,500

    const cardOutstanding = calculateCardOutstanding(creditCard, transactions);
    expect(cardOutstanding).toBe(17000_00); // 5,000 + 12,000

    const availableCredit = calculateAvailableCredit(creditCard, transactions);
    expect(availableCredit).toBe(183000_00); // 2,00,000 - 17,000
  });

  // 7. Distinct accounting: card repayment reduces card debt AND debits paying bank account
  it("preserves card repayment distinction from ordinary card purchases", () => {
    const transactions: Transaction[] = [
      {
        id: "tx-purchase",
        date: "2026-02-01",
        description: "Online Shopping",
        amountPaise: 10000_00,
        type: "card_purchase",
        creditCardId: "card-1",
        categoryId: "cat-shopping",
      },
      {
        id: "tx-repayment",
        date: "2026-02-15",
        description: "Card Bill Repayment",
        amountPaise: 12000_00,
        type: "card_payment",
        fromAccountId: "bank-1",
        creditCardId: "card-1",
      },
    ];

    // Card outstanding: 5,000 + 10,000 - 12,000 = 3,000
    const cardOutstanding = calculateCardOutstanding(creditCard, transactions);
    expect(cardOutstanding).toBe(3000_00);

    // Bank balance: 50,000 - 12,000 = 38,000
    const bankBalance = calculateAccountBalance(bankAccount, transactions);
    expect(bankBalance).toBe(38000_00);
  });
});

describe("Unified Transaction Entry: Validation Rules & Source Parsing", () => {
  function resolveTransactionMapping(
    flowType: "income" | "expense",
    sourceId: string
  ): {
    isValid: boolean;
    transactionType?: "income" | "expense" | "card_purchase";
    targetId?: string;
    isCard?: boolean;
    error?: string;
  } {
    const isCard = sourceId.startsWith("card:");
    const cleanId = sourceId.replace(/^(card|account):/, "");

    if (!cleanId) {
      return { isValid: false, error: "Missing source identifier" };
    }

    if (isCard) {
      if (flowType === "income") {
        return {
          isValid: false,
          error: "Credit cards cannot be selected as income destinations",
        };
      }
      return {
        isValid: true,
        transactionType: "card_purchase",
        targetId: cleanId,
        isCard: true,
      };
    }

    return {
      isValid: true,
      transactionType: flowType,
      targetId: cleanId,
      isCard: false,
    };
  }

  it("maps credit card expense to card_purchase", () => {
    const result = resolveTransactionMapping("expense", "card:card-123");
    expect(result.isValid).toBe(true);
    expect(result.transactionType).toBe("card_purchase");
    expect(result.targetId).toBe("card-123");
    expect(result.isCard).toBe(true);
  });

  it("maps bank account expense to ordinary expense", () => {
    const result = resolveTransactionMapping("expense", "account:acc-456");
    expect(result.isValid).toBe(true);
    expect(result.transactionType).toBe("expense");
    expect(result.targetId).toBe("acc-456");
    expect(result.isCard).toBe(false);
  });

  it("maps bank account income to ordinary income", () => {
    const result = resolveTransactionMapping("income", "account:acc-456");
    expect(result.isValid).toBe(true);
    expect(result.transactionType).toBe("income");
    expect(result.targetId).toBe("acc-456");
    expect(result.isCard).toBe(false);
  });

  it("rejects credit card selected as income source", () => {
    const result = resolveTransactionMapping("income", "card:card-123");
    expect(result.isValid).toBe(false);
    expect(result.error).toContain("Credit cards cannot be selected as income destinations");
  });

  it("rejects empty source identifier", () => {
    const result = resolveTransactionMapping("expense", "");
    expect(result.isValid).toBe(false);
    expect(result.error).toBe("Missing source identifier");
  });
});
