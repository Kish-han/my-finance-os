import { describe, it, expect } from "vitest";
import {
  type CategoryBudget,
  type BudgetAlertEvent,
  getCalendarMonthBounds,
  getRelativeMonthKey,
  resolveEffectiveBudgets,
  calculateMonthlyBudgets,
  evaluateBudgetThresholdAlerts,
} from "./budget-engine";
import { type TransactionRecord } from "./date-ranges";

describe("Budget Engine: Calendar Month Math & Navigation", () => {
  it("formats and parses calendar month bounds correctly", () => {
    const bounds = getCalendarMonthBounds("2026-10");
    expect(bounds.startDate).toBe("2026-10-01");
    expect(bounds.endDate).toBe("2026-10-31");
    expect(bounds.label).toBe("October 2026");
    expect(bounds.year).toBe(2026);
    expect(bounds.month).toBe(10);
  });

  it("handles leap year February and non-leap February", () => {
    const leapFeb = getCalendarMonthBounds("2024-02");
    expect(leapFeb.endDate).toBe("2024-02-29");

    const regularFeb = getCalendarMonthBounds("2025-02");
    expect(regularFeb.endDate).toBe("2025-02-28");
  });

  it("calculates relative month navigation correctly across year boundaries", () => {
    expect(getRelativeMonthKey("2026-10", 1)).toBe("2026-11");
    expect(getRelativeMonthKey("2026-10", -1)).toBe("2026-09");
    expect(getRelativeMonthKey("2026-12", 1)).toBe("2027-01");
    expect(getRelativeMonthKey("2026-01", -1)).toBe("2025-12");
  });
});

describe("Budget Engine: Recurring Default vs Month Override Resolution", () => {
  const recurringBudgets: CategoryBudget[] = [
    {
      id: "b1",
      user_id: "user-1",
      category_name: "Food & Dining",
      amount_paise: 15000_00, // ₹15,000 default
      month_key: null,
      alert_50: true,
      alert_80: true,
      alert_100: true,
      is_active: true,
    },
    {
      id: "b2",
      user_id: "user-1",
      category_name: "Shopping",
      amount_paise: 8000_00, // ₹8,000 default
      month_key: null,
      alert_50: true,
      alert_80: true,
      alert_100: true,
      is_active: true,
    },
    {
      id: "b3",
      user_id: "user-1",
      category_name: "Shopping",
      amount_paise: 20000_00, // ₹20,000 Diwali override in 2026-11
      month_key: "2026-11",
      alert_50: true,
      alert_80: true,
      alert_100: true,
      is_active: true,
    },
    {
      id: "b4",
      user_id: "user-1",
      category_name: "Archived Travel",
      amount_paise: 5000_00,
      month_key: null,
      alert_50: true,
      alert_80: true,
      alert_100: true,
      is_active: false, // Paused / archived
    },
  ];

  it("applies default recurring budget for normal months", () => {
    const effective = resolveEffectiveBudgets(recurringBudgets, "2026-10");
    expect(effective.length).toBe(2);

    const food = effective.find((b) => b.category_name === "Food & Dining");
    const shopping = effective.find((b) => b.category_name === "Shopping");

    expect(food?.amount_paise).toBe(15000_00);
    expect(shopping?.amount_paise).toBe(8000_00);
  });

  it("applies month-specific override when defined for target month", () => {
    const effective = resolveEffectiveBudgets(recurringBudgets, "2026-11");
    expect(effective.length).toBe(2);

    const food = effective.find((b) => b.category_name === "Food & Dining");
    const shopping = effective.find((b) => b.category_name === "Shopping");

    expect(food?.amount_paise).toBe(15000_00);
    expect(shopping?.amount_paise).toBe(20000_00); // Uses override!
  });

  it("excludes inactive/paused budgets", () => {
    const effective = resolveEffectiveBudgets(recurringBudgets, "2026-10");
    const archived = effective.find((b) => b.category_name === "Archived Travel");
    expect(archived).toBeUndefined();
  });
});

describe("Budget Engine: Financial Calculation & Aggregation Rules", () => {
  const categoryMap = new Map([
    ["cat-food", "Food & Dining"],
    ["cat-shop", "Shopping"],
    ["cat-bills", "Utilities"],
  ]);

  const testBudgets: CategoryBudget[] = [
    {
      id: "b-food",
      user_id: "user-1",
      category_name: "Food & Dining",
      amount_paise: 10000_00, // ₹10,000
      month_key: null,
      alert_50: true,
      alert_80: true,
      alert_100: true,
      is_active: true,
    },
    {
      id: "b-shop",
      user_id: "user-1",
      category_name: "Shopping",
      amount_paise: 5000_00, // ₹5,000
      month_key: null,
      alert_50: true,
      alert_80: true,
      alert_100: true,
      is_active: true,
    },
    {
      id: "b-bills",
      user_id: "user-1",
      category_name: "Utilities",
      amount_paise: 4000_00, // ₹4,000
      month_key: null,
      alert_50: false, // 50% alert disabled
      alert_80: true,
      alert_100: true,
      is_active: true,
    },
  ];

  const transactions: TransactionRecord[] = [
    // 1. Direct Expense in October: ₹4,000 on Food
    {
      id: "t1",
      transaction_date: "2026-10-05",
      description: "Supermarket groceries",
      amount_paise: 4000_00,
      transaction_type: "expense",
      category_id: "cat-food",
    },
    // 2. Credit Card Purchase in October: ₹2,000 on Food (eligible spend)
    {
      id: "t2",
      transaction_date: "2026-10-12",
      description: "Restaurant dinner on HDFC Card",
      amount_paise: 2000_00,
      transaction_type: "card_purchase",
      credit_card_id: "card-1",
      category_id: "cat-food",
    },
    // 3. Credit Card Bill Repayment: ₹10,000 MUST NOT be counted as spend!
    {
      id: "t3",
      transaction_date: "2026-10-15",
      description: "HDFC Card Bill Pay",
      amount_paise: 10000_00,
      transaction_type: "card_payment",
      credit_card_id: "card-1",
      category_id: "cat-bills",
    },
    // 4. Bank Transfer: ₹15,000 MUST NOT be counted as spend!
    {
      id: "t4",
      transaction_date: "2026-10-18",
      description: "Transfer to Savings",
      amount_paise: 15000_00,
      transaction_type: "transfer",
    },
    // 5. Salary Income: ₹80,000 MUST NOT be counted as spend!
    {
      id: "t5",
      transaction_date: "2026-10-01",
      description: "Tech Corp Salary",
      amount_paise: 80000_00,
      transaction_type: "income",
    },
    // 6. Shopping Spend exceeding budget: ₹6,500 on ₹5,000 budget
    {
      id: "t6",
      transaction_date: "2026-10-20",
      description: "Electronics purchase",
      amount_paise: 6500_00,
      transaction_type: "expense",
      category_id: "cat-shop",
    },
    // 7. Utilities spend at 60%: ₹2,400 on ₹4,000 budget
    {
      id: "t7",
      transaction_date: "2026-10-22",
      description: "Electricity bill",
      amount_paise: 2400_00,
      transaction_type: "expense",
      category_id: "cat-bills",
    },
    // 8. Transaction from previous month (September): MUST NOT be included in October!
    {
      id: "t8",
      transaction_date: "2026-09-28",
      description: "September dinner",
      amount_paise: 5000_00,
      transaction_type: "expense",
      category_id: "cat-food",
    },
    // 9. Transaction from future month (November): MUST NOT be included in October!
    {
      id: "t9",
      transaction_date: "2026-11-02",
      description: "November groceries",
      amount_paise: 3000_00,
      transaction_type: "expense",
      category_id: "cat-food",
    },
  ];

  it("calculates exact category spending including direct expense and card purchase", () => {
    const overview = calculateMonthlyBudgets(testBudgets, transactions, categoryMap, "2026-10");

    // Food & Dining: ₹4,000 (expense) + ₹2,000 (card purchase) = ₹6,000 (60%)
    const food = overview.categorySummaries.find((c) => c.categoryName === "Food & Dining");
    expect(food).toBeDefined();
    expect(food?.budgetPaise).toBe(10000_00);
    expect(food?.actualSpendingPaise).toBe(6000_00);
    expect(food?.remainingPaise).toBe(4000_00);
    expect(food?.overspentPaise).toBe(0);
    expect(food?.percentageUsed).toBe(60);
    expect(food?.isOverspent).toBe(false);
    expect(food?.status).toBe("warning_50");
    expect(food?.transactionCount).toBe(2);
  });

  it("excludes card payments, bank transfers, income, and out-of-month dates", () => {
    const overview = calculateMonthlyBudgets(testBudgets, transactions, categoryMap, "2026-10");

    // Utilities: Only ₹2,400 electricity bill is counted.
    // The ₹10,000 card_payment is strictly excluded!
    const bills = overview.categorySummaries.find((c) => c.categoryName === "Utilities");
    expect(bills).toBeDefined();
    expect(bills?.actualSpendingPaise).toBe(2400_00);
    expect(bills?.remainingPaise).toBe(1600_00);
    expect(bills?.percentageUsed).toBe(60);
  });

  it("correctly identifies overspent categories and prevents broken percentage/negative remaining", () => {
    const overview = calculateMonthlyBudgets(testBudgets, transactions, categoryMap, "2026-10");

    // Shopping: ₹6,500 spent on ₹5,000 budget = 130%
    const shop = overview.categorySummaries.find((c) => c.categoryName === "Shopping");
    expect(shop).toBeDefined();
    expect(shop?.budgetPaise).toBe(5000_00);
    expect(shop?.actualSpendingPaise).toBe(6500_00);
    expect(shop?.remainingPaise).toBe(0); // Clamped to 0, never negative!
    expect(shop?.overspentPaise).toBe(1500_00); // ₹1,500 overspent
    expect(shop?.percentageUsed).toBe(130);
    expect(shop?.isOverspent).toBe(true);
    expect(shop?.status).toBe("exceeded");
  });

  it("calculates overall monthly totals and category status counts", () => {
    const overview = calculateMonthlyBudgets(testBudgets, transactions, categoryMap, "2026-10");

    // Total Budget: 10,000 + 5,000 + 4,000 = ₹19,000 (1,900,000 paise)
    expect(overview.totalBudgetPaise).toBe(19000_00);
    // Total Spend: 6,000 + 6,500 + 2,400 = ₹14,900 (1,490,000 paise)
    expect(overview.totalActualSpendingPaise).toBe(14900_00);
    expect(overview.totalRemainingPaise).toBe(4100_00);
    expect(overview.categoriesCount).toBe(3);
    expect(overview.approachingCount).toBe(2); // Food (60%) and Utilities (60%)
    expect(overview.exceededCount).toBe(1); // Shopping (130%)
  });
});

describe("Budget Engine: Idempotent Alert Evaluation (50%, 80%, 100%)", () => {
  const summaries = [
    {
      budgetId: "b-food",
      categoryName: "Food & Dining",
      budgetPaise: 10000_00,
      actualSpendingPaise: 6000_00,
      remainingPaise: 4000_00,
      overspentPaise: 0,
      percentageUsed: 60,
      isOverspent: false,
      status: "warning_50" as const,
      transactionCount: 2,
      alert_50: true,
      alert_80: true,
      alert_100: true,
      isActive: true,
      isOverride: false,
    },
    {
      budgetId: "b-shop",
      categoryName: "Shopping",
      budgetPaise: 5000_00,
      actualSpendingPaise: 6500_00,
      remainingPaise: 0,
      overspentPaise: 1500_00,
      percentageUsed: 130,
      isOverspent: true,
      status: "exceeded" as const,
      transactionCount: 1,
      alert_50: true,
      alert_80: true,
      alert_100: true,
      isActive: true,
      isOverride: false,
    },
    {
      budgetId: "b-bills",
      categoryName: "Utilities",
      budgetPaise: 4000_00,
      actualSpendingPaise: 2400_00,
      remainingPaise: 1600_00,
      overspentPaise: 0,
      percentageUsed: 60,
      isOverspent: false,
      status: "warning_50" as const,
      transactionCount: 1,
      alert_50: false, // Disabled 50% alert!
      alert_80: true,
      alert_100: true,
      isActive: true,
      isOverride: false,
    },
  ];

  it("generates candidates for eligible reached thresholds when no prior alerts exist", () => {
    const existingAlerts: BudgetAlertEvent[] = [];
    const candidates = evaluateBudgetThresholdAlerts(summaries, existingAlerts, "2026-10");

    // Food & Dining (60%): 50% candidate
    // Shopping (130%): 50%, 80%, 100% candidates
    // Utilities (60%): alert_50 is false -> 0 candidates!
    expect(candidates.length).toBe(4);

    const foodAlert = candidates.find(
      (c) => c.categoryName === "Food & Dining" && c.thresholdPercent === 50
    );
    expect(foodAlert).toBeDefined();

    const shop100 = candidates.find(
      (c) => c.categoryName === "Shopping" && c.thresholdPercent === 100
    );
    expect(shop100).toBeDefined();

    const billsAlert = candidates.find((c) => c.categoryName === "Utilities");
    expect(billsAlert).toBeUndefined(); // Suppressed because alert_50 is false
  });

  it("prevents duplicate alerts when threshold events are already recorded", () => {
    const existingAlerts: BudgetAlertEvent[] = [
      {
        id: "a1",
        user_id: "user-1",
        budget_id: "b-food",
        category_name: "Food & Dining",
        month_key: "2026-10",
        threshold_percent: 50,
        spending_paise: 5200_00,
        budget_paise: 10000_00,
        triggered_at: "2026-10-10T12:00:00Z",
        is_acknowledged: false,
      },
      {
        id: "a2",
        user_id: "user-1",
        budget_id: "b-shop",
        category_name: "Shopping",
        month_key: "2026-10",
        threshold_percent: 50,
        spending_paise: 2600_00,
        budget_paise: 5000_00,
        triggered_at: "2026-10-12T12:00:00Z",
        is_acknowledged: true,
      },
      {
        id: "a3",
        user_id: "user-1",
        budget_id: "b-shop",
        category_name: "Shopping",
        month_key: "2026-10",
        threshold_percent: 80,
        spending_paise: 4100_00,
        budget_paise: 5000_00,
        triggered_at: "2026-10-18T12:00:00Z",
        is_acknowledged: false,
      },
    ];

    const candidates = evaluateBudgetThresholdAlerts(summaries, existingAlerts, "2026-10");

    // Only Shopping 100% should be emitted!
    // Food 50% is already in existingAlerts.
    // Shopping 50% and 80% are already in existingAlerts.
    expect(candidates.length).toBe(1);
    expect(candidates[0].categoryName).toBe("Shopping");
    expect(candidates[0].thresholdPercent).toBe(100);
  });
});
