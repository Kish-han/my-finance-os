/**
 * Budget Calculation and Alert Evaluation Engine for AURA Wealth.
 * All computations use integer paise and Indian Standard Time (Asia/Kolkata).
 */

import { type TransactionRecord } from "./date-ranges";

export interface CategoryBudget {
  id: string;
  user_id: string;
  category_id?: string | null;
  category_name: string;
  amount_paise: number;
  month_key?: string | null; // null = recurring monthly default; "YYYY-MM" = override
  alert_50: boolean;
  alert_80: boolean;
  alert_100: boolean;
  is_active: boolean;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface BudgetAlertEvent {
  id: string;
  user_id: string;
  budget_id: string;
  category_name: string;
  month_key: string;
  threshold_percent: 50 | 80 | 100;
  spending_paise: number;
  budget_paise: number;
  triggered_at: string;
  is_acknowledged: boolean;
  acknowledged_at?: string | null;
}

export type BudgetStatus = "normal" | "warning_50" | "warning_80" | "exceeded";

export interface CategorySpendingSummary {
  budgetId: string;
  categoryName: string;
  budgetPaise: number;
  actualSpendingPaise: number;
  remainingPaise: number;
  overspentPaise: number;
  percentageUsed: number;
  isOverspent: boolean;
  status: BudgetStatus;
  transactionCount: number;
  alert_50: boolean;
  alert_80: boolean;
  alert_100: boolean;
  isActive: boolean;
  notes?: string | null;
  isOverride: boolean;
}

export interface MonthlyBudgetOverview {
  monthKey: string;
  monthLabel: string;
  startDate: string;
  endDate: string;
  totalBudgetPaise: number;
  totalActualSpendingPaise: number;
  totalRemainingPaise: number;
  totalOverspentPaise: number;
  overallPercentageUsed: number;
  categoriesCount: number;
  withinLimitCount: number;
  approachingCount: number; // 50% - 79%
  nearLimitCount: number; // 80% - 99%
  exceededCount: number; // >= 100%
  categorySummaries: CategorySpendingSummary[];
}

export interface BudgetThresholdAlertCandidate {
  budgetId: string;
  categoryName: string;
  monthKey: string;
  thresholdPercent: 50 | 80 | 100;
  spendingPaise: number;
  budgetPaise: number;
}

const MONTH_NAMES_FULL = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * Returns the current month key in Indian Standard Time as YYYY-MM.
 */
export function getCurrentMonthKey(refDate: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(refDate);

  const values = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${values.year}-${values.month}`;
}

/**
 * Validates and normalizes a month key (YYYY-MM). Defaults to current month if invalid.
 */
export function normalizeMonthKey(monthKey?: string | null): string {
  if (monthKey && /^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey.trim())) {
    return monthKey.trim();
  }
  return getCurrentMonthKey();
}

/**
 * Computes calendar month bounds (startDate, endDate, label) for a given YYYY-MM.
 */
export function getCalendarMonthBounds(monthKey: string): {
  startDate: string;
  endDate: string;
  label: string;
  year: number;
  month: number;
} {
  const normalized = normalizeMonthKey(monthKey);
  const [yearStr, monthStr] = normalized.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);

  const startDate = `${yearStr}-${monthStr}-01`;
  // Last day of the month in UTC
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const endDate = `${yearStr}-${monthStr}-${String(lastDay).padStart(2, "0")}`;

  const label = `${MONTH_NAMES_FULL[month - 1]} ${year}`;

  return { startDate, endDate, label, year, month };
}

/**
 * Navigates by a delta of months from a starting month key.
 */
export function getRelativeMonthKey(monthKey: string, deltaMonths: number): string {
  const normalized = normalizeMonthKey(monthKey);
  const [yearStr, monthStr] = normalized.split("-");
  const d = new Date(Date.UTC(Number(yearStr), Number(monthStr) - 1 + deltaMonths, 1));
  const newYear = d.getUTCFullYear();
  const newMonth = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${newYear}-${newMonth}`;
}

/**
 * Formats rupee paise into standard INR currency string.
 */
export function formatRupees(paise: number | string, fractionDigits = 0): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: fractionDigits,
  }).format(Number(paise) / 100);
}

/**
 * Resolves active budgets for a specific month.
 * If a category has an explicit month override (month_key === selectedMonth),
 * it takes precedence over the default recurring budget (month_key === null).
 */
export function resolveEffectiveBudgets(
  allBudgets: CategoryBudget[],
  targetMonthKey: string
): CategoryBudget[] {
  const normalizedTarget = normalizeMonthKey(targetMonthKey);
  const activeBudgets = allBudgets.filter((b) => b.is_active);

  // Group by lower(trim(category_name))
  const categoryGroups = new Map<string, { default?: CategoryBudget; override?: CategoryBudget }>();

  for (const budget of activeBudgets) {
    const key = budget.category_name.trim().toLowerCase();
    const group = categoryGroups.get(key) ?? {};

    if (budget.month_key === normalizedTarget) {
      group.override = budget;
    } else if (!budget.month_key) {
      group.default = budget;
    }
    categoryGroups.set(key, group);
  }

  const effective: CategoryBudget[] = [];
  for (const group of categoryGroups.values()) {
    if (group.override) {
      effective.push(group.override);
    } else if (group.default) {
      effective.push(group.default);
    }
  }

  // Sort alphabetically by category name
  return effective.sort((a, b) => a.category_name.localeCompare(b.category_name));
}

/**
 * Calculates monthly actual spending per budget category and generates overall overview.
 * Respects strict financial rules:
 * - Eligible spending: expense and card_purchase only
 * - Excluded: income, transfer, card_payment, unposted schedules
 * - No double counting
 */
export function calculateMonthlyBudgets(
  allBudgets: CategoryBudget[],
  transactions: TransactionRecord[],
  categoryMap: Map<string, string>,
  monthKey: string
): MonthlyBudgetOverview {
  const normalizedMonth = normalizeMonthKey(monthKey);
  const { startDate, endDate, label } = getCalendarMonthBounds(normalizedMonth);
  const effectiveBudgets = resolveEffectiveBudgets(allBudgets, normalizedMonth);

  // 1. Group posted actual spending for the calendar month
  const categorySpending = new Map<string, { totalPaise: number; count: number }>();

  for (const tx of transactions) {
    if (tx.transaction_date >= startDate && tx.transaction_date <= endDate) {
      // Strict expense check: ordinary expenses and credit card purchases
      if (tx.transaction_type === "expense" || tx.transaction_type === "card_purchase") {
        const amount = Number(tx.amount_paise) || 0;
        const categoryName = tx.category_id
          ? (categoryMap.get(tx.category_id) ?? "Uncategorized")
          : "Uncategorized";

        const normKey = categoryName.trim().toLowerCase();
        const current = categorySpending.get(normKey) ?? { totalPaise: 0, count: 0 };
        categorySpending.set(normKey, {
          totalPaise: current.totalPaise + amount,
          count: current.count + 1,
        });
      }
    }
  }

  // 2. Build summary for each active budget
  let totalBudgetPaise = 0;
  let totalActualSpendingPaise = 0;
  let withinLimitCount = 0;
  let approachingCount = 0;
  let nearLimitCount = 0;
  let exceededCount = 0;

  const categorySummaries: CategorySpendingSummary[] = effectiveBudgets.map((budget) => {
    const normKey = budget.category_name.trim().toLowerCase();
    const spendingData = categorySpending.get(normKey) ?? { totalPaise: 0, count: 0 };
    const actualSpendingPaise = spendingData.totalPaise;
    const budgetPaise = Number(budget.amount_paise) || 0;

    const remainingPaise = Math.max(0, budgetPaise - actualSpendingPaise);
    const overspentPaise = Math.max(0, actualSpendingPaise - budgetPaise);
    const percentageUsed = budgetPaise > 0 ? (actualSpendingPaise / budgetPaise) * 100 : 0;
    const isOverspent = actualSpendingPaise > budgetPaise;

    let status: BudgetStatus = "normal";
    if (isOverspent) {
      status = "exceeded";
      exceededCount++;
    } else if (percentageUsed >= 80) {
      status = "warning_80";
      nearLimitCount++;
    } else if (percentageUsed >= 50) {
      status = "warning_50";
      approachingCount++;
    } else {
      withinLimitCount++;
    }

    totalBudgetPaise += budgetPaise;
    totalActualSpendingPaise += actualSpendingPaise;

    return {
      budgetId: budget.id,
      categoryName: budget.category_name,
      budgetPaise,
      actualSpendingPaise,
      remainingPaise,
      overspentPaise,
      percentageUsed,
      isOverspent,
      status,
      transactionCount: spendingData.count,
      alert_50: budget.alert_50,
      alert_80: budget.alert_80,
      alert_100: budget.alert_100,
      isActive: budget.is_active,
      notes: budget.notes,
      isOverride: Boolean(budget.month_key),
    };
  });

  const totalRemainingPaise = Math.max(0, totalBudgetPaise - totalActualSpendingPaise);
  const totalOverspentPaise = Math.max(0, totalActualSpendingPaise - totalBudgetPaise);
  const overallPercentageUsed =
    totalBudgetPaise > 0 ? (totalActualSpendingPaise / totalBudgetPaise) * 100 : 0;

  return {
    monthKey: normalizedMonth,
    monthLabel: label,
    startDate,
    endDate,
    totalBudgetPaise,
    totalActualSpendingPaise,
    totalRemainingPaise,
    totalOverspentPaise,
    overallPercentageUsed,
    categoriesCount: categorySummaries.length,
    withinLimitCount,
    approachingCount,
    nearLimitCount,
    exceededCount,
    categorySummaries,
  };
}

/**
 * Evaluates which threshold alerts should be generated for the current month.
 * Strictly idempotent:
 * - Triggered only if the threshold is enabled on the budget.
 * - Triggered only if the alert has not already been recorded in `existingAlerts`
 *   for the same (user, category, month, threshold).
 */
export function evaluateBudgetThresholdAlerts(
  summaries: CategorySpendingSummary[],
  existingAlerts: BudgetAlertEvent[],
  monthKey: string
): BudgetThresholdAlertCandidate[] {
  const normalizedMonth = normalizeMonthKey(monthKey);
  const candidates: BudgetThresholdAlertCandidate[] = [];

  // Index existing alerts by `lower(category_name):monthKey:threshold`
  const recordedSet = new Set<string>();
  for (const alert of existingAlerts) {
    if (alert.month_key === normalizedMonth) {
      const key = `${alert.category_name.trim().toLowerCase()}:${alert.threshold_percent}`;
      recordedSet.add(key);
    }
  }

  for (const summary of summaries) {
    const normCategory = summary.categoryName.trim().toLowerCase();

    // 50% Threshold Check
    if (summary.alert_50 && summary.percentageUsed >= 50) {
      const key = `${normCategory}:50`;
      if (!recordedSet.has(key)) {
        candidates.push({
          budgetId: summary.budgetId,
          categoryName: summary.categoryName,
          monthKey: normalizedMonth,
          thresholdPercent: 50,
          spendingPaise: summary.actualSpendingPaise,
          budgetPaise: summary.budgetPaise,
        });
        recordedSet.add(key); // Avoid duplicates within same evaluation run
      }
    }

    // 80% Threshold Check
    if (summary.alert_80 && summary.percentageUsed >= 80) {
      const key = `${normCategory}:80`;
      if (!recordedSet.has(key)) {
        candidates.push({
          budgetId: summary.budgetId,
          categoryName: summary.categoryName,
          monthKey: normalizedMonth,
          thresholdPercent: 80,
          spendingPaise: summary.actualSpendingPaise,
          budgetPaise: summary.budgetPaise,
        });
        recordedSet.add(key);
      }
    }

    // 100% Threshold Check
    if (summary.alert_100 && summary.percentageUsed >= 100) {
      const key = `${normCategory}:100`;
      if (!recordedSet.has(key)) {
        candidates.push({
          budgetId: summary.budgetId,
          categoryName: summary.categoryName,
          monthKey: normalizedMonth,
          thresholdPercent: 100,
          spendingPaise: summary.actualSpendingPaise,
          budgetPaise: summary.budgetPaise,
        });
        recordedSet.add(key);
      }
    }
  }

  return candidates;
}
