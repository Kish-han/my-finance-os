/**
 * Authoritative Quick-Entry Engine for AURA Wealth / My Finance OS.
 *
 * Provides pure, deterministic functions for:
 * 1. Ranking recent categories combining recency and frequency signals.
 * 2. Resolving remembered payment sources independently for income and expense.
 * 3. Fast numeric amount parsing with strict integer-paise financial validation.
 * 4. Transaction template application and subscription replay with date defaulting to today.
 */

export interface CategoryRankingItem {
  name: string;
  score: number;
  frequency: number;
  lastUsedDate: string;
  isPinned: boolean;
}

export type RankedCategoryItem = CategoryRankingItem;

export type TemplatePrefillInput = {
  name?: string;
  transactionType: "income" | "expense";
  amountPaise: number | null;
  categoryName: string;
  description?: string;
  sourceId: string | null;
  isFavorite?: boolean;
  notes?: string | null;
};

export interface RawTransactionRow {
  id?: string;
  transaction_date?: string;
  date?: string;
  description?: string;
  amount_paise?: number | string;
  transaction_type?: string;
  type?: string;
  category_id?: string | null;
  category_name?: string | null;
  account_id?: string | null;
  credit_card_id?: string | null;
  from_account_id?: string | null;
}

export interface AccountOption {
  id: string;
  name: string;
  account_type?: "bank" | "cash";
  is_archived?: boolean;
}

export interface CreditCardOption {
  id: string;
  name: string;
  bank_name?: string;
  last_four_digits?: string | null;
  is_archived?: boolean;
  credit_limit_paise?: number | string;
  current_available_paise?: number;
}

export interface TransactionTemplate {
  id: string;
  userId?: string;
  name: string;
  transactionType: "income" | "expense";
  amountPaise: number | null;
  categoryName: string;
  description: string;
  sourceId: string | null;
  accountId?: string | null;
  creditCardId?: string | null;
  isFavorite: boolean;
  lastUsedAt?: string | null;
  useCount?: number;
  notes?: string | null;
}

export interface UserTransactionPreferences {
  lastExpenseSourceId?: string | null;
  lastIncomeSourceId?: string | null;
  pinnedCategories?: string[];
}

export interface PrefilledFormData {
  transactionType: "income" | "expense";
  amountInput: string;
  description: string;
  category: string;
  sourceId: string;
  transactionDate: string;
  notes: string;
}

export const DEFAULT_EXPENSE_CATEGORIES = [
  "Food & Dining",
  "Groceries",
  "Shopping & Lifestyle",
  "Utilities & Bills",
  "Transportation & Fuel",
  "Entertainment",
  "Housing & Rent",
  "Healthcare & Medical",
];

export const DEFAULT_INCOME_CATEGORIES = [
  "Salary",
  "Freelance & Consulting",
  "Investments & Savings",
  "Gifts & Donations",
  "Other Income",
];

/**
 * Calculates calendar day difference between two YYYY-MM-DD date strings.
 */
export function getDaysDifference(date1: string, date2: string): number {
  const d1 = new Date(`${date1}T00:00:00.000Z`).getTime();
  const d2 = new Date(`${date2}T00:00:00.000Z`).getTime();
  if (Number.isNaN(d1) || Number.isNaN(d2)) return 999;
  return Math.max(0, Math.floor(Math.abs(d1 - d2) / (1000 * 60 * 60 * 24)));
}

/**
 * Validates and converts user-entered string rupees into exact integer paise.
 */
export function parseAmountToPaise(input: string): {
  valid: boolean;
  paise: number;
  rupees: number;
  error?: string;
} {
  const clean = input.trim();
  if (!clean) {
    return { valid: false, paise: 0, rupees: 0, error: "Amount is required." };
  }

  if (!/^\d{1,12}(\.\d{1,2})?$/.test(clean)) {
    return {
      valid: false,
      paise: 0,
      rupees: 0,
      error: "Enter a valid amount with up to 2 decimal places.",
    };
  }

  const rupees = Number(clean);
  if (!Number.isFinite(rupees) || rupees <= 0) {
    return {
      valid: false,
      paise: 0,
      rupees: 0,
      error: "Amount must be strictly greater than zero.",
    };
  }

  const paise = Math.round(rupees * 100);
  // Cap at 100 Crore (₹1,00,00,00,000.00)
  if (!Number.isSafeInteger(paise) || paise > 100_000_000_000_00) {
    return {
      valid: false,
      paise: 0,
      rupees: 0,
      error: "Amount exceeds maximum supported limit.",
    };
  }

  return { valid: true, paise, rupees };
}

/**
 * Formats a numeric string or paise amount with INR currency representation.
 */
export function formatAmountInputFromPaise(paise: number | null | undefined): string {
  if (paise === null || paise === undefined || paise <= 0) return "";
  const rupees = paise / 100;
  const formatted = rupees.toFixed(2);
  return formatted.endsWith(".00") ? formatted.slice(0, -3) : formatted;
}

/**
 * Deterministically ranks recent categories combining recency and frequency.
 * Excludes transfers and card repayments.
 * Separates income from expense.
 * Pinned categories are granted priority.
 * Gracefully handles new/empty history users.
 */
export function rankRecentCategories({
  transactions,
  categories,
  transactionType,
  pinnedCategoryNames = [],
  limit = 8,
  today = new Date().toISOString().slice(0, 10),
}: {
  transactions: RawTransactionRow[];
  categories: Array<{ id: string; name: string }>;
  transactionType: "income" | "expense";
  pinnedCategoryNames?: string[];
  limit?: number;
  today?: string;
}): CategoryRankingItem[] {
  const categoryIdToName = new Map<string, string>();
  const availableSet = new Set<string>();

  for (const c of categories) {
    categoryIdToName.set(c.id, c.name);
    availableSet.add(c.name.toLowerCase());
  }

  // Filter valid transactions matching the requested flow
  const relevantTxs = transactions.filter((tx) => {
    const rawType = tx.transaction_type ?? tx.type;
    if (transactionType === "income") {
      return rawType === "income";
    }
    // Expense includes cash/bank expenses and card purchases
    return rawType === "expense" || rawType === "card_purchase";
  });

  const categoryStats = new Map<
    string,
    { name: string; frequency: number; lastUsedDate: string; rawScore: number }
  >();

  for (const tx of relevantTxs) {
    const rawDate = tx.transaction_date ?? tx.date ?? "";
    const rawCatId = tx.category_id;
    let catName = tx.category_name;

    if (!catName && rawCatId && categoryIdToName.has(rawCatId)) {
      catName = categoryIdToName.get(rawCatId);
    }

    if (!catName || !availableSet.has(catName.toLowerCase())) {
      continue;
    }

    // Match exact casing from categories list
    const canonical =
      categories.find((c) => c.name.toLowerCase() === catName!.toLowerCase())?.name || catName;

    const daysAgo = getDaysDifference(today, rawDate);
    // Recency weighting
    let recencyPoints = 0.5;
    if (daysAgo <= 7) {
      recencyPoints = 4.0;
    } else if (daysAgo <= 30) {
      recencyPoints = 2.0;
    } else if (daysAgo <= 90) {
      recencyPoints = 1.0;
    }

    const existing = categoryStats.get(canonical);
    if (existing) {
      existing.frequency += 1;
      existing.rawScore += recencyPoints;
      if (rawDate > existing.lastUsedDate) {
        existing.lastUsedDate = rawDate;
      }
    } else {
      categoryStats.set(canonical, {
        name: canonical,
        frequency: 1,
        lastUsedDate: rawDate,
        rawScore: recencyPoints,
      });
    }
  }

  const pinnedLower = new Set(pinnedCategoryNames.map((n) => n.toLowerCase()));

  // Convert stats to items
  const items: CategoryRankingItem[] = [];

  for (const stat of categoryStats.values()) {
    const isPinned = pinnedLower.has(stat.name.toLowerCase());
    const finalScore = (isPinned ? 1000 : 0) + stat.rawScore + stat.frequency * 0.5;
    items.push({
      name: stat.name,
      score: finalScore,
      frequency: stat.frequency,
      lastUsedDate: stat.lastUsedDate,
      isPinned,
    });
  }

  // If pinned categories were not in recent history but exist in available categories, include them
  for (const pinnedName of pinnedCategoryNames) {
    const existsInItems = items.some((i) => i.name.toLowerCase() === pinnedName.toLowerCase());
    const isAvailable = availableSet.has(pinnedName.toLowerCase());
    if (!existsInItems && isAvailable) {
      const canonical =
        categories.find((c) => c.name.toLowerCase() === pinnedName.toLowerCase())?.name ||
        pinnedName;
      items.push({
        name: canonical,
        score: 1000,
        frequency: 0,
        lastUsedDate: "",
        isPinned: true,
      });
    }
  }

  // Sort deterministically:
  // 1. Pinned first
  // 2. Score descending
  // 3. Last used date descending
  // 4. Alphabetical tie-breaker
  items.sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    if (b.score !== a.score) return b.score - a.score;
    if (b.lastUsedDate !== a.lastUsedDate) return b.lastUsedDate.localeCompare(a.lastUsedDate);
    return a.name.localeCompare(b.name);
  });

  // If fewer than limit, fill with sensible default categories for that type
  if (items.length < limit) {
    const defaults =
      transactionType === "income" ? DEFAULT_INCOME_CATEGORIES : DEFAULT_EXPENSE_CATEGORIES;

    for (const def of defaults) {
      if (items.length >= limit) break;
      const alreadyPresent = items.some((i) => i.name.toLowerCase() === def.toLowerCase());
      const isAvailable = availableSet.has(def.toLowerCase());
      if (!alreadyPresent && isAvailable) {
        items.push({
          name: def,
          score: 0,
          frequency: 0,
          lastUsedDate: "",
          isPinned: false,
        });
      }
    }
  }

  return items.slice(0, limit);
}

/**
 * Resolves the remembered payment source independently by transaction type.
 * Enforces business rules:
 * - Income destinations must be active bank/cash accounts (NEVER credit cards).
 * - Expense sources can be cards, bank, or cash accounts.
 * - Safely falls back if the remembered source has been archived, deleted, or is invalid.
 */
export function resolveRememberedSource({
  transactionType,
  preferences,
  transactions = [],
  accounts = [],
  creditCards = [],
}: {
  transactionType: "income" | "expense";
  preferences?: UserTransactionPreferences | null;
  transactions?: RawTransactionRow[];
  accounts?: AccountOption[];
  creditCards?: CreditCardOption[];
}): string {
  const activeAccounts = accounts.filter((a) => !a.is_archived);
  const activeCards = creditCards.filter((c) => !c.is_archived);

  const isValidSource = (sourceId: string | null | undefined): boolean => {
    if (!sourceId) return false;
    if (sourceId.startsWith("card:")) {
      // Income can NEVER be paid to a credit card
      if (transactionType === "income") return false;
      const cardId = sourceId.replace("card:", "");
      return activeCards.some((c) => c.id === cardId);
    }
    if (sourceId.startsWith("account:")) {
      const accId = sourceId.replace("account:", "");
      return activeAccounts.some((a) => a.id === accId);
    }
    return false;
  };

  // 1. Check explicit user preference if present
  if (transactionType === "income") {
    if (isValidSource(preferences?.lastIncomeSourceId)) {
      return preferences!.lastIncomeSourceId!;
    }
  } else {
    if (isValidSource(preferences?.lastExpenseSourceId)) {
      return preferences!.lastExpenseSourceId!;
    }
  }

  // 2. Infer from user's most recent valid transaction of that type
  const sortedTxs = [...transactions].sort((a, b) => {
    const da = a.transaction_date ?? a.date ?? "";
    const db = b.transaction_date ?? b.date ?? "";
    return db.localeCompare(da);
  });

  for (const tx of sortedTxs) {
    const rawType = tx.transaction_type ?? tx.type;
    if (transactionType === "income" && rawType === "income") {
      if (tx.account_id && isValidSource(`account:${tx.account_id}`)) {
        return `account:${tx.account_id}`;
      }
    } else if (transactionType === "expense") {
      if (rawType === "card_purchase" && tx.credit_card_id) {
        if (isValidSource(`card:${tx.credit_card_id}`)) {
          return `card:${tx.credit_card_id}`;
        }
      } else if (rawType === "expense" && tx.account_id) {
        if (isValidSource(`account:${tx.account_id}`)) {
          return `account:${tx.account_id}`;
        }
      }
    }
  }

  // 3. Sensible defaults
  if (transactionType === "income") {
    return activeAccounts[0] ? `account:${activeAccounts[0].id}` : "";
  }

  // For expense, prefer first available card, then first account
  if (activeCards.length > 0) {
    return `card:${activeCards[0].id}`;
  }
  if (activeAccounts.length > 0) {
    return `account:${activeAccounts[0].id}`;
  }

  return "";
}

/**
 * Pre-fills the transaction form when a user taps a transaction template.
 * - Always defaults the transaction date to today (never an old date).
 * - Leaves all fields editable defaults.
 * - Checks source validity, falling back cleanly if archived.
 */
export function applyTemplateToForm({
  template,
  accounts = [],
  creditCards = [],
  today = new Date().toISOString().slice(0, 10),
}: {
  template: TemplatePrefillInput;
  accounts?: AccountOption[];
  creditCards?: CreditCardOption[];
  today?: string;
}): PrefilledFormData {
  const activeAccounts = accounts.filter((a) => !a.is_archived);
  const activeCards = creditCards.filter((c) => !c.is_archived);

  let resolvedSource = "";
  if (template.sourceId) {
    if (template.sourceId.startsWith("card:")) {
      const cardId = template.sourceId.replace("card:", "");
      if (template.transactionType === "expense" && activeCards.some((c) => c.id === cardId)) {
        resolvedSource = template.sourceId;
      }
    } else if (template.sourceId.startsWith("account:")) {
      const accId = template.sourceId.replace("account:", "");
      if (activeAccounts.some((a) => a.id === accId)) {
        resolvedSource = template.sourceId;
      }
    }
  }

  if (!resolvedSource) {
    resolvedSource = resolveRememberedSource({
      transactionType: template.transactionType,
      accounts,
      creditCards,
    });
  }

  return {
    transactionType: template.transactionType,
    amountInput: formatAmountInputFromPaise(template.amountPaise),
    description: template.description || template.name || "",
    category: template.categoryName,
    sourceId: resolvedSource,
    transactionDate: today,
    notes: template.notes || "",
  };
}

/**
 * Extracts distinct recent repeatable transactions (e.g. routine merchants, subscriptions)
 * to provide a quick 1-tap repeat experience.
 */
export function getRecentRepeatableTransactions({
  transactions,
  accounts = [],
  creditCards = [],
  limit = 5,
  today = new Date().toISOString().slice(0, 10),
}: {
  transactions: RawTransactionRow[];
  accounts?: AccountOption[];
  creditCards?: CreditCardOption[];
  limit?: number;
  today?: string;
}): Array<{
  id: string;
  name: string;
  transactionType: "income" | "expense";
  amountPaise: number;
  categoryName: string;
  sourceId: string;
  description: string;
  lastDate: string;
}> {
  const activeAccountIds = new Set(accounts.filter((a) => !a.is_archived).map((a) => a.id));
  const activeCardIds = new Set(creditCards.filter((c) => !c.is_archived).map((c) => c.id));

  // Sort by date descending
  const sorted = [...transactions].sort((a, b) => {
    const da = a.transaction_date ?? a.date ?? "";
    const db = b.transaction_date ?? b.date ?? "";
    return db.localeCompare(da);
  });

  const seen = new Set<string>();
  const results: Array<{
    id: string;
    name: string;
    transactionType: "income" | "expense";
    amountPaise: number;
    categoryName: string;
    sourceId: string;
    description: string;
    lastDate: string;
  }> = [];

  for (const tx of sorted) {
    const type = tx.transaction_type ?? tx.type;
    if (type !== "income" && type !== "expense" && type !== "card_purchase") {
      continue;
    }

    const description = (tx.description || "").trim();
    if (!description) continue;

    const amountPaise = Number(tx.amount_paise || 0);
    if (amountPaise <= 0) continue;

    const categoryName = tx.category_name || "General";
    const flowType: "income" | "expense" = type === "income" ? "income" : "expense";
    let sourceId = "";

    if (flowType === "expense" && tx.credit_card_id && activeCardIds.has(tx.credit_card_id)) {
      sourceId = `card:${tx.credit_card_id}`;
    } else if (tx.account_id && activeAccountIds.has(tx.account_id)) {
      sourceId = `account:${tx.account_id}`;
    }

    if (!sourceId) continue;
    const dedupeKey = `${flowType}:${description.toLowerCase()}:${amountPaise}`;

    if (!seen.has(dedupeKey)) {
      seen.add(dedupeKey);
      results.push({
        id: tx.id || dedupeKey,
        name: description,
        transactionType: flowType,
        amountPaise,
        categoryName,
        sourceId,
        description,
        lastDate: tx.transaction_date ?? tx.date ?? today,
      });
    }

    if (results.length >= limit) break;
  }

  return results;
}

