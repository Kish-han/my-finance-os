import { describe, expect, it } from "vitest";
import {
  rankRecentCategories,
  resolveRememberedSource,
  parseAmountToPaise,
  formatAmountInputFromPaise,
  applyTemplateToForm,
  getRecentRepeatableTransactions,
  type RawTransactionRow,
  type TransactionTemplate,
  type AccountOption,
  type CreditCardOption,
} from "./quick-entry-engine";

describe("Quick Entry Engine - Categories, Templates, Sources, and Amounts", () => {
  const sampleCategories = [
    { id: "cat-1", name: "Food & Dining" },
    { id: "cat-2", name: "Groceries" },
    { id: "cat-3", name: "Shopping & Lifestyle" },
    { id: "cat-4", name: "Utilities & Bills" },
    { id: "cat-5", name: "Transportation & Fuel" },
    { id: "cat-6", name: "Salary" },
    { id: "cat-7", name: "Freelance & Consulting" },
    { id: "cat-8", name: "Investments & Savings" },
    { id: "cat-9", name: "Entertainment" },
  ];

  const sampleAccounts: AccountOption[] = [
    { id: "acc-hdfc", name: "HDFC Salary", account_type: "bank", is_archived: false },
    { id: "acc-cash", name: "Cash Wallet", account_type: "cash", is_archived: false },
    { id: "acc-old", name: "Old Bank", account_type: "bank", is_archived: true },
  ];

  const sampleCards: CreditCardOption[] = [
    { id: "card-axis", name: "Axis Neo", bank_name: "Axis Bank", is_archived: false },
    { id: "card-icici", name: "ICICI Sapphiro", bank_name: "ICICI Bank", is_archived: false },
    { id: "card-closed", name: "Closed Card", bank_name: "SBI", is_archived: true },
  ];

  describe("Recent Categories Ranking", () => {
    it("combines recency and frequency signals deterministically", () => {
      const today = "2026-10-29";
      const txs: RawTransactionRow[] = [
        // Groceries: 3 times recent
        { category_id: "cat-2", transaction_date: "2026-10-28", transaction_type: "expense" },
        { category_id: "cat-2", transaction_date: "2026-10-25", transaction_type: "expense" },
        { category_id: "cat-2", transaction_date: "2026-10-20", transaction_type: "expense" },
        // Food & Dining: 1 time very recent
        { category_id: "cat-1", transaction_date: "2026-10-29", transaction_type: "expense" },
        // Utilities & Bills: 1 time 60 days ago
        { category_id: "cat-4", transaction_date: "2026-08-25", transaction_type: "expense" },
      ];

      const ranked = rankRecentCategories({
        transactions: txs,
        categories: sampleCategories,
        transactionType: "expense",
        today,
        limit: 5,
      });

      expect(ranked.length).toBe(5);
      // Groceries has 3 recent transactions, so it should rank first
      expect(ranked[0].name).toBe("Groceries");
      expect(ranked[1].name).toBe("Food & Dining");
    });

    it("separates income categories from expense categories strictly", () => {
      const today = "2026-10-29";
      const txs: RawTransactionRow[] = [
        { category_id: "cat-6", transaction_date: "2026-10-28", transaction_type: "income" },
        { category_id: "cat-1", transaction_date: "2026-10-28", transaction_type: "expense" },
      ];

      const incomeRanked = rankRecentCategories({
        transactions: txs,
        categories: sampleCategories,
        transactionType: "income",
        today,
      });

      // Income ranking must only include income categories, never Food & Dining
      expect(incomeRanked.some((c) => c.name === "Food & Dining")).toBe(false);
      expect(incomeRanked[0].name).toBe("Salary");

      const expenseRanked = rankRecentCategories({
        transactions: txs,
        categories: sampleCategories,
        transactionType: "expense",
        today,
      });

      // Expense ranking must only include expense categories, never Salary
      expect(expenseRanked.some((c) => c.name === "Salary")).toBe(false);
      expect(expenseRanked[0].name).toBe("Food & Dining");
    });

    it("excludes card repayments (card_payment) and transfers from regular categories", () => {
      const today = "2026-10-29";
      const txs: RawTransactionRow[] = [
        { category_name: "Internal Transfer", transaction_type: "transfer", transaction_date: "2026-10-29" },
        { category_name: "Credit Card Bill", transaction_type: "card_payment", transaction_date: "2026-10-29" },
        { category_id: "cat-5", transaction_type: "card_purchase", transaction_date: "2026-10-29" },
      ];

      const ranked = rankRecentCategories({
        transactions: txs,
        categories: sampleCategories,
        transactionType: "expense",
        today,
      });

      expect(ranked.some((c) => c.name === "Internal Transfer")).toBe(false);
      expect(ranked.some((c) => c.name === "Credit Card Bill")).toBe(false);
      expect(ranked[0].name).toBe("Transportation & Fuel");
    });

    it("prioritizes pinned/favorite categories at the top", () => {
      const today = "2026-10-29";
      const txs: RawTransactionRow[] = [
        { category_id: "cat-1", transaction_date: "2026-10-28", transaction_type: "expense" },
      ];

      const ranked = rankRecentCategories({
        transactions: txs,
        categories: sampleCategories,
        transactionType: "expense",
        pinnedCategoryNames: ["Utilities & Bills"],
        today,
      });

      // Pinned category must come first even if another category has more recent activity
      expect(ranked[0].name).toBe("Utilities & Bills");
      expect(ranked[0].isPinned).toBe(true);
    });

    it("prevents deleted or unauthorized categories from appearing in suggestions", () => {
      const today = "2026-10-29";
      const txs: RawTransactionRow[] = [
        { category_name: "Deleted Crypto Scheme", transaction_type: "expense", transaction_date: "2026-10-29" },
      ];

      const ranked = rankRecentCategories({
        transactions: txs,
        categories: sampleCategories, // "Deleted Crypto Scheme" is not in sampleCategories
        transactionType: "expense",
        today,
      });

      expect(ranked.some((c) => c.name === "Deleted Crypto Scheme")).toBe(false);
    });

    it("handles empty transaction history gracefully with sensible defaults", () => {
      const rankedExpense = rankRecentCategories({
        transactions: [],
        categories: sampleCategories,
        transactionType: "expense",
        limit: 4,
      });

      expect(rankedExpense.length).toBe(4);
      expect(rankedExpense.map((c) => c.name)).toEqual([
        "Food & Dining",
        "Groceries",
        "Shopping & Lifestyle",
        "Utilities & Bills",
      ]);

      const rankedIncome = rankRecentCategories({
        transactions: [],
        categories: sampleCategories,
        transactionType: "income",
        limit: 3,
      });

      expect(rankedIncome.length).toBe(3);
      expect(rankedIncome.map((c) => c.name)).toEqual([
        "Salary",
        "Freelance & Consulting",
        "Investments & Savings",
      ]);
    });
  });

  describe("Remembered Payment Sources", () => {
    it("preselects the last-used expense source (credit card)", () => {
      const txs: RawTransactionRow[] = [
        { transaction_type: "card_purchase", credit_card_id: "card-axis", transaction_date: "2026-10-28" },
      ];

      const source = resolveRememberedSource({
        transactionType: "expense",
        transactions: txs,
        accounts: sampleAccounts,
        creditCards: sampleCards,
      });

      expect(source).toBe("card:card-axis");
    });

    it("preselects the last-used income destination (bank account)", () => {
      const txs: RawTransactionRow[] = [
        { transaction_type: "income", account_id: "acc-hdfc", transaction_date: "2026-10-28" },
      ];

      const source = resolveRememberedSource({
        transactionType: "income",
        transactions: txs,
        accounts: sampleAccounts,
        creditCards: sampleCards,
      });

      expect(source).toBe("account:acc-hdfc");
    });

    it("NEVER allows a credit card to be selected as an income destination", () => {
      const source = resolveRememberedSource({
        transactionType: "income",
        preferences: { lastIncomeSourceId: "card:card-axis" }, // Invalid preference spoof
        accounts: sampleAccounts,
        creditCards: sampleCards,
      });

      // Must reject card and fall back to active bank account
      expect(source.startsWith("account:")).toBe(true);
      expect(source).toBe("account:acc-hdfc");
    });

    it("falls back safely when a remembered source is archived or deleted", () => {
      const source = resolveRememberedSource({
        transactionType: "expense",
        preferences: { lastExpenseSourceId: "card:card-closed" }, // Archived card
        accounts: sampleAccounts,
        creditCards: sampleCards,
      });

      // Must fall back to first active card
      expect(source).toBe("card:card-axis");

      const sourceNoCards = resolveRememberedSource({
        transactionType: "expense",
        preferences: { lastExpenseSourceId: "account:acc-old" }, // Archived account
        accounts: sampleAccounts,
        creditCards: [],
      });

      // Must fall back to first active bank account
      expect(sourceNoCards).toBe("account:acc-hdfc");
    });

    it("switches smoothly between income and expense without keeping incompatible cards", () => {
      // User is on expense with card
      const expenseSource = resolveRememberedSource({
        transactionType: "expense",
        preferences: { lastExpenseSourceId: "card:card-axis", lastIncomeSourceId: "account:acc-cash" },
        accounts: sampleAccounts,
        creditCards: sampleCards,
      });
      expect(expenseSource).toBe("card:card-axis");

      // User switches to income
      const incomeSource = resolveRememberedSource({
        transactionType: "income",
        preferences: { lastExpenseSourceId: "card:card-axis", lastIncomeSourceId: "account:acc-cash" },
        accounts: sampleAccounts,
        creditCards: sampleCards,
      });
      expect(incomeSource).toBe("account:acc-cash");
    });
  });

  describe("Fast Numeric Amount Parsing & Validation", () => {
    it("parses valid integer and decimal amounts accurately into paise", () => {
      expect(parseAmountToPaise("500")).toEqual({ valid: true, paise: 50000, rupees: 500 });
      expect(parseAmountToPaise("149.99")).toEqual({ valid: true, paise: 14999, rupees: 149.99 });
      expect(parseAmountToPaise("0.50")).toEqual({ valid: true, paise: 50, rupees: 0.5 });
      expect(parseAmountToPaise(" 1250.5 ")).toEqual({ valid: true, paise: 125050, rupees: 1250.5 });
    });

    it("rejects zero, negative, malformed, or multiple decimal amounts strictly", () => {
      expect(parseAmountToPaise("0").valid).toBe(false);
      expect(parseAmountToPaise("-100").valid).toBe(false);
      expect(parseAmountToPaise("12.345").valid).toBe(false); // More than 2 decimals
      expect(parseAmountToPaise("10.5.2").valid).toBe(false); // Multiple decimals
      expect(parseAmountToPaise("abc").valid).toBe(false);
      expect(parseAmountToPaise("").valid).toBe(false);
    });

    it("formats amount input string cleanly from integer paise", () => {
      expect(formatAmountInputFromPaise(50000)).toBe("500");
      expect(formatAmountInputFromPaise(14999)).toBe("149.99");
      expect(formatAmountInputFromPaise(null)).toBe("");
      expect(formatAmountInputFromPaise(0)).toBe("");
    });
  });

  describe("Transaction Templates & Subscription Replay", () => {
    it("applies a template to the form with transaction date defaulted to TODAY", () => {
      const template: TransactionTemplate = {
        id: "tpl-netflix",
        name: "Netflix Subscription",
        transactionType: "expense",
        amountPaise: 64900, // ₹649
        categoryName: "Entertainment",
        description: "Netflix Premium Plan",
        sourceId: "card:card-axis",
        isFavorite: true,
      };

      const today = "2026-10-29";
      const prefill = applyTemplateToForm({
        template,
        accounts: sampleAccounts,
        creditCards: sampleCards,
        today,
      });

      expect(prefill.transactionType).toBe("expense");
      expect(prefill.amountInput).toBe("649");
      expect(prefill.category).toBe("Entertainment");
      expect(prefill.description).toBe("Netflix Premium Plan");
      expect(prefill.sourceId).toBe("card:card-axis");
      // Critical check: Date must be today, NOT a stale template date!
      expect(prefill.transactionDate).toBe("2026-10-29");
    });

    it("safely falls back if the template's saved payment source was archived", () => {
      const template: TransactionTemplate = {
        id: "tpl-gym",
        name: "Gym Fee",
        transactionType: "expense",
        amountPaise: 200000,
        categoryName: "Healthcare & Medical",
        description: "Monthly Gym Membership",
        sourceId: "card:card-closed", // Archived card
        isFavorite: false,
      };

      const prefill = applyTemplateToForm({
        template,
        accounts: sampleAccounts,
        creditCards: sampleCards,
        today: "2026-10-29",
      });

      // Must fall back to first active card instead of using archived card
      expect(prefill.sourceId).toBe("card:card-axis");
    });

    it("extracts distinct recent repeatable transactions for 1-tap re-entry", () => {
      const txs: RawTransactionRow[] = [
        {
          id: "tx-1",
          description: "Swiggy Food",
          amount_paise: 45000,
          transaction_type: "expense",
          category_name: "Food & Dining",
          credit_card_id: "card-axis",
          transaction_date: "2026-10-28",
        },
        {
          id: "tx-2",
          description: "Swiggy Food",
          amount_paise: 45000, // duplicate recent
          transaction_type: "expense",
          category_name: "Food & Dining",
          credit_card_id: "card-axis",
          transaction_date: "2026-10-27",
        },
        {
          id: "tx-3",
          description: "Monthly Salary",
          amount_paise: 8500000,
          transaction_type: "income",
          category_name: "Salary",
          account_id: "acc-hdfc",
          transaction_date: "2026-10-01",
        },
      ];

      const repeatables = getRecentRepeatableTransactions({
        transactions: txs,
        accounts: sampleAccounts,
        creditCards: sampleCards,
        limit: 5,
        today: "2026-10-29",
      });

      // Swiggy should only appear once (deduplicated)
      expect(repeatables.length).toBe(2);
      expect(repeatables[0].name).toBe("Swiggy Food");
      expect(repeatables[0].amountPaise).toBe(45000);
      expect(repeatables[0].sourceId).toBe("card:card-axis");
      expect(repeatables[1].name).toBe("Monthly Salary");
      expect(repeatables[1].sourceId).toBe("account:acc-hdfc");
    });
  });
});
