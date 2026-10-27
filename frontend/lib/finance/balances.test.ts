import { describe, expect, it } from "vitest";
import type { CreditCard, FinancialAccount, Transaction } from "./types";
import {
  calculateAccountBalance,
  calculateCardOutstanding,
  calculateAvailableCredit,
  separateAccountBalances,
} from "./balances";

const sampleAccount: FinancialAccount = {
  id: "acc-1",
  name: "Main Savings",
  type: "bank",
  institution: "Example Bank",
  openingBalancePaise: 500_000, // ₹5,000.00
  openingBalanceDate: "2026-03-01",
  isArchived: false,
};

const sampleCard: CreditCard = {
  id: "card-1",
  name: "Platinum Card",
  bankName: "Example Bank",
  creditLimitPaise: 10_000_000, // ₹1,00,000.00
  openingOutstandingPaise: 100_000, // ₹1,000.00
  openingOutstandingDate: "2026-03-01",
  isArchived: false,
};

describe("Account balance calculations", () => {
  it("returns opening balance when no transactions exist", () => {
    expect(calculateAccountBalance(sampleAccount, [])).toBe(500_000);
  });

  it("ignores transactions before the opening balance date", () => {
    const transactions: Transaction[] = [
      {
        id: "tx-1",
        date: "2026-02-28",
        description: "Old income",
        amountPaise: 100_000,
        type: "income",
        accountId: sampleAccount.id,
        categoryId: "cat-salary",
      },
    ];

    expect(calculateAccountBalance(sampleAccount, transactions)).toBe(500_000);
  });

  it("includes transactions recorded on the opening balance date", () => {
    const transactions: Transaction[] = [
      {
        id: "tx-1",
        date: "2026-03-01",
        description: "Day 1 income",
        amountPaise: 50_000,
        type: "income",
        accountId: sampleAccount.id,
        categoryId: "cat-salary",
      },
    ];

    expect(calculateAccountBalance(sampleAccount, transactions)).toBe(550_000);
  });

  it("calculates balance across income, expense, transfers, and card payments", () => {
    const transactions: Transaction[] = [
      {
        id: "tx-1",
        date: "2026-03-05",
        description: "Salary",
        amountPaise: 200_000,
        type: "income",
        accountId: sampleAccount.id,
        categoryId: "cat-salary",
      },
      {
        id: "tx-2",
        date: "2026-03-06",
        description: "Groceries",
        amountPaise: 30_000,
        type: "expense",
        accountId: sampleAccount.id,
        categoryId: "cat-food",
      },
      {
        id: "tx-3",
        date: "2026-03-07",
        description: "Transfer to wallet",
        amountPaise: 20_000,
        type: "transfer",
        fromAccountId: sampleAccount.id,
        toAccountId: "acc-wallet",
      },
      {
        id: "tx-4",
        date: "2026-03-08",
        description: "Transfer from other bank",
        amountPaise: 10_000,
        type: "transfer",
        fromAccountId: "acc-other",
        toAccountId: sampleAccount.id,
      },
      {
        id: "tx-5",
        date: "2026-03-09",
        description: "Credit card repayment",
        amountPaise: 40_000,
        type: "card_payment",
        fromAccountId: sampleAccount.id,
        creditCardId: "card-1",
      },
      // Transaction on different account should be ignored
      {
        id: "tx-6",
        date: "2026-03-10",
        description: "Other account expense",
        amountPaise: 99_000,
        type: "expense",
        accountId: "acc-other",
        categoryId: "cat-food",
      },
    ];

    // 500,000 + 200,000 - 30,000 - 20,000 + 10,000 - 40,000 = 620,000
    expect(calculateAccountBalance(sampleAccount, transactions)).toBe(620_000);
  });
});

describe("Credit card balance calculations", () => {
  it("returns opening outstanding when no transactions exist", () => {
    expect(calculateCardOutstanding(sampleCard, [])).toBe(100_000);
  });

  it("calculates outstanding from purchases and repayments", () => {
    const transactions: Transaction[] = [
      {
        id: "tx-1",
        date: "2026-03-05",
        description: "Amazon purchase",
        amountPaise: 50_000,
        type: "card_purchase",
        creditCardId: sampleCard.id,
        categoryId: "cat-shopping",
      },
      {
        id: "tx-2",
        date: "2026-03-10",
        description: "Bill payment",
        amountPaise: 80_000,
        type: "card_payment",
        fromAccountId: "acc-1",
        creditCardId: sampleCard.id,
      },
      // Transaction for another card should be ignored
      {
        id: "tx-3",
        date: "2026-03-11",
        description: "Other card purchase",
        amountPaise: 30_000,
        type: "card_purchase",
        creditCardId: "card-other",
        categoryId: "cat-shopping",
      },
    ];

    // 100,000 + 50,000 - 80,000 = 70,000
    expect(calculateCardOutstanding(sampleCard, transactions)).toBe(70_000);
  });

  it("calculates available credit limit correctly", () => {
    const transactions: Transaction[] = [
      {
        id: "tx-1",
        date: "2026-03-05",
        description: "Electronics purchase",
        amountPaise: 2_000_000,
        type: "card_purchase",
        creditCardId: sampleCard.id,
        categoryId: "cat-electronics",
      },
    ];

    // Limit 10,000,000 - (Opening 100,000 + 2,000,000) = 7,900,000
    expect(calculateAvailableCredit(sampleCard, transactions)).toBe(7_900_000);
  });
});

describe("Physical Cash and Bank Balances Separation", () => {
  const bankAccount1: FinancialAccount = {
    id: "bank-1",
    name: "HDFC Salary",
    type: "bank",
    institution: "HDFC Bank",
    openingBalancePaise: 1_500_000, // ₹15,000.00
    openingBalanceDate: "2026-01-01",
    isArchived: false,
  };

  const bankAccount2: FinancialAccount = {
    id: "bank-2",
    name: "SBI Savings",
    type: "bank",
    institution: "State Bank of India",
    openingBalancePaise: 500_000, // ₹5,000.00
    openingBalanceDate: "2026-01-01",
    isArchived: false,
  };

  const cashAccount1: FinancialAccount = {
    id: "cash-1",
    name: "Daily Cash",
    type: "cash",
    openingBalancePaise: 120_000, // ₹1,200.00
    openingBalanceDate: "2026-01-01",
    isArchived: false,
  };

  const cashAccount2: FinancialAccount = {
    id: "cash-2",
    name: "Emergency Cash Vault",
    type: "cash",
    openingBalancePaise: 80_000, // ₹800.00
    openingBalanceDate: "2026-01-01",
    isArchived: false,
  };

  it("separates accounts into distinct bank and cash buckets with correct balances and counts", () => {
    const accountBalances = [
      { account: bankAccount1, balancePaise: 1_500_000 },
      { account: bankAccount2, balancePaise: 500_000 },
      { account: cashAccount1, balancePaise: 120_000 },
      { account: cashAccount2, balancePaise: 80_000 },
    ];

    const result = separateAccountBalances(accountBalances);

    expect(result.bankAccounts).toHaveLength(2);
    expect(result.totalBankBalancesPaise).toBe(2_000_000); // ₹20,000.00

    expect(result.cashAccounts).toHaveLength(2);
    expect(result.totalCashInHandPaise).toBe(200_000); // ₹2,000.00

    expect(result.totalLiquidPaise).toBe(2_200_000); // ₹22,000.00
  });

  it("ensures every account appears in exactly one category with no double counting", () => {
    const accountBalances = [
      { account: bankAccount1, balancePaise: 1_000_000 },
      { account: cashAccount1, balancePaise: 500_000 },
    ];

    const result = separateAccountBalances(accountBalances);

    expect(result.bankAccounts.every((a) => a.account.type === "bank")).toBe(true);
    expect(result.cashAccounts.every((a) => a.account.type === "cash")).toBe(true);

    const bankIds = new Set(result.bankAccounts.map((a) => a.account.id));
    const cashIds = new Set(result.cashAccounts.map((a) => a.account.id));

    // Intersection is empty
    for (const id of bankIds) {
      expect(cashIds.has(id)).toBe(false);
    }

    // Sum equals individual sums exactly
    expect(result.totalLiquidPaise).toBe(
      result.totalBankBalancesPaise + result.totalCashInHandPaise
    );
  });

  it("preserves total liquid reserves when transferring between bank and physical cash", () => {
    // Starting balances: Bank ₹20,000 (2_000_000 paise), Cash ₹2,000 (200_000 paise)
    const initialAccounts = [
      { account: bankAccount1, balancePaise: 2_000_000 },
      { account: cashAccount1, balancePaise: 200_000 },
    ];

    const initialSeparation = separateAccountBalances(initialAccounts);
    expect(initialSeparation.totalBankBalancesPaise).toBe(2_000_000);
    expect(initialSeparation.totalCashInHandPaise).toBe(200_000);
    expect(initialSeparation.totalLiquidPaise).toBe(2_200_000);

    // ATM cash withdrawal of ₹5,000 (500,000 paise) from bank to cash
    const atmWithdrawal: Transaction = {
      id: "tx-atm-1",
      date: "2026-03-05",
      description: "ATM Cash Withdrawal",
      amountPaise: 500_000,
      type: "transfer",
      fromAccountId: bankAccount1.id,
      toAccountId: cashAccount1.id,
    };

    const newBankBalance = calculateAccountBalance(bankAccount1, [atmWithdrawal]);
    const newCashBalance = calculateAccountBalance(cashAccount1, [atmWithdrawal]);

    // Bank: 1,500,000 - 500,000 = 1,000,000 paise (starting opening is 1,500,000)
    expect(newBankBalance).toBe(1_000_000);
    // Cash: 120,000 + 500,000 = 620,000 paise (starting opening is 120,000)
    expect(newCashBalance).toBe(620_000);

    const postTransferSeparation = separateAccountBalances([
      { account: bankAccount1, balancePaise: newBankBalance },
      { account: cashAccount1, balancePaise: newCashBalance },
    ]);

    expect(postTransferSeparation.totalBankBalancesPaise).toBe(1_000_000);
    expect(postTransferSeparation.totalCashInHandPaise).toBe(620_000);
    // Total liquid wealth is preserved exactly without double counting or inflation:
    expect(postTransferSeparation.totalLiquidPaise).toBe(
      bankAccount1.openingBalancePaise + cashAccount1.openingBalancePaise
    );
  });

  it("handles zero accounts in either category safely", () => {
    const onlyBank = separateAccountBalances([
      { account: bankAccount1, balancePaise: 750_000 },
    ]);
    expect(onlyBank.bankAccounts).toHaveLength(1);
    expect(onlyBank.totalBankBalancesPaise).toBe(750_000);
    expect(onlyBank.cashAccounts).toHaveLength(0);
    expect(onlyBank.totalCashInHandPaise).toBe(0);
    expect(onlyBank.totalLiquidPaise).toBe(750_000);

    const onlyCash = separateAccountBalances([
      { account: cashAccount1, balancePaise: 300_000 },
    ]);
    expect(onlyCash.cashAccounts).toHaveLength(1);
    expect(onlyCash.totalCashInHandPaise).toBe(300_000);
    expect(onlyCash.bankAccounts).toHaveLength(0);
    expect(onlyCash.totalBankBalancesPaise).toBe(0);
    expect(onlyCash.totalLiquidPaise).toBe(300_000);

    const empty = separateAccountBalances([]);
    expect(empty.bankAccounts).toHaveLength(0);
    expect(empty.cashAccounts).toHaveLength(0);
    expect(empty.totalBankBalancesPaise).toBe(0);
    expect(empty.totalCashInHandPaise).toBe(0);
    expect(empty.totalLiquidPaise).toBe(0);
  });
});
