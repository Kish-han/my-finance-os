export interface TransactionEditInput {
  transactionId: string;
  description: string;
  amountInput: string;
  transactionDate: string;
  transactionType: "income" | "expense" | "transfer" | "card_purchase" | "card_payment";
  accountId?: string | null;
  fromAccountId?: string | null;
  toAccountId?: string | null;
  creditCardId?: string | null;
  categoryName?: string | null;
}

export interface ValidationContext {
  today: string;
  accounts: Array<{
    id: string;
    name: string;
    openingBalanceDate: string;
    isArchived?: boolean;
  }>;
  creditCards: Array<{
    id: string;
    name: string;
    openingOutstandingDate: string;
    isArchived?: boolean;
  }>;
}

export interface ValidatedTransactionPayload {
  transactionId: string;
  description: string;
  amountPaise: number;
  transactionDate: string;
  transactionType: "income" | "expense" | "transfer" | "card_purchase" | "card_payment";
  accountId: string | null;
  fromAccountId: string | null;
  toAccountId: string | null;
  creditCardId: string | null;
  categoryName: string | null;
}

export type ValidationResult =
  | { success: true; data: ValidatedTransactionPayload }
  | { success: false; error: string; code: string };

export function isValidDateFormat(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function parseAmountToPaise(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(trimmed)) return null;
  const rupees = Number(trimmed);
  const paise = Math.round(rupees * 100);
  if (!Number.isFinite(rupees) || !Number.isSafeInteger(paise) || paise <= 0) {
    return null;
  }
  return paise;
}

export function validateTransactionEdit(
  input: TransactionEditInput,
  context: ValidationContext
): ValidationResult {
  const transactionId = (input.transactionId ?? "").trim();
  if (!transactionId) {
    return { success: false, error: "Transaction ID is required.", code: "invalid-id" };
  }

  const description = (input.description ?? "").trim();
  if (!description || description.length > 160) {
    return {
      success: false,
      error: "Description must be between 1 and 160 characters.",
      code: "invalid-description",
    };
  }

  const amountPaise = parseAmountToPaise(input.amountInput);
  if (amountPaise === null) {
    return {
      success: false,
      error: "Enter a valid positive amount (up to 2 decimal places).",
      code: "invalid-amount",
    };
  }

  const date = (input.transactionDate ?? "").trim();
  if (!isValidDateFormat(date)) {
    return {
      success: false,
      error: "Invalid date format. Expected YYYY-MM-DD.",
      code: "invalid-date",
    };
  }

  if (date > context.today) {
    return {
      success: false,
      error: "Transaction date cannot be in the future.",
      code: "future-date",
    };
  }

  const validTypes = ["income", "expense", "transfer", "card_purchase", "card_payment"] as const;
  if (!validTypes.includes(input.transactionType)) {
    return {
      success: false,
      error: "Invalid transaction type.",
      code: "invalid-type",
    };
  }

  const accountsMap = new Map(context.accounts.map((a) => [a.id, a]));
  const cardsMap = new Map(context.creditCards.map((c) => [c.id, c]));

  let targetAccountId: string | null = null;
  let targetFromAccountId: string | null = null;
  let targetToAccountId: string | null = null;
  let targetCreditCardId: string | null = null;

  switch (input.transactionType) {
    case "income":
    case "expense": {
      const accId = (input.accountId ?? "").trim();
      if (!accId) {
        return {
          success: false,
          error: "Please select an account for this transaction.",
          code: "missing-account",
        };
      }
      const account = accountsMap.get(accId);
      if (!account || account.isArchived) {
        return {
          success: false,
          error: "Selected account is not found or is archived.",
          code: "invalid-account",
        };
      }
      if (date < account.openingBalanceDate) {
        return {
          success: false,
          error: `Transaction date cannot be earlier than the account opening balance date (${account.openingBalanceDate}).`,
          code: "date-before-opening",
        };
      }
      targetAccountId = account.id;
      break;
    }

    case "card_purchase": {
      const cardId = (input.creditCardId ?? "").trim();
      if (!cardId) {
        return {
          success: false,
          error: "Please select a credit card for this purchase.",
          code: "missing-card",
        };
      }
      const card = cardsMap.get(cardId);
      if (!card || card.isArchived) {
        return {
          success: false,
          error: "Selected credit card is not found or is archived.",
          code: "invalid-card",
        };
      }
      if (date < card.openingOutstandingDate) {
        return {
          success: false,
          error: `Transaction date cannot be earlier than the card opening balance date (${card.openingOutstandingDate}).`,
          code: "date-before-opening",
        };
      }
      targetCreditCardId = card.id;
      break;
    }

    case "card_payment": {
      const cardId = (input.creditCardId ?? "").trim();
      const fromAccId = (input.fromAccountId ?? "").trim();
      if (!cardId) {
        return {
          success: false,
          error: "Please select the credit card being repaid.",
          code: "missing-card",
        };
      }
      if (!fromAccId) {
        return {
          success: false,
          error: "Please select the paying bank/cash account.",
          code: "missing-from-account",
        };
      }
      const card = cardsMap.get(cardId);
      if (!card || card.isArchived) {
        return {
          success: false,
          error: "Selected credit card is not found or is archived.",
          code: "invalid-card",
        };
      }
      const fromAcc = accountsMap.get(fromAccId);
      if (!fromAcc || fromAcc.isArchived) {
        return {
          success: false,
          error: "Selected payment account is not found or is archived.",
          code: "invalid-from-account",
        };
      }
      if (date < card.openingOutstandingDate) {
        return {
          success: false,
          error: `Payment date cannot be earlier than the card opening balance date (${card.openingOutstandingDate}).`,
          code: "date-before-opening",
        };
      }
      if (date < fromAcc.openingBalanceDate) {
        return {
          success: false,
          error: `Payment date cannot be earlier than the payment account opening balance date (${fromAcc.openingBalanceDate}).`,
          code: "date-before-opening",
        };
      }
      targetCreditCardId = card.id;
      targetFromAccountId = fromAcc.id;
      break;
    }

    case "transfer": {
      const fromAccId = (input.fromAccountId ?? "").trim();
      const toAccId = (input.toAccountId ?? "").trim();
      if (!fromAccId || !toAccId) {
        return {
          success: false,
          error: "Source and destination accounts are both required for a transfer.",
          code: "missing-transfer-account",
        };
      }
      if (fromAccId === toAccId) {
        return {
          success: false,
          error: "Source and destination accounts cannot be the same account.",
          code: "same-transfer-accounts",
        };
      }
      const fromAcc = accountsMap.get(fromAccId);
      const toAcc = accountsMap.get(toAccId);
      if (!fromAcc || fromAcc.isArchived || !toAcc || toAcc.isArchived) {
        return {
          success: false,
          error: "One or both selected transfer accounts are invalid or archived.",
          code: "invalid-transfer-accounts",
        };
      }
      if (date < fromAcc.openingBalanceDate || date < toAcc.openingBalanceDate) {
        return {
          success: false,
          error: "Transfer date cannot be earlier than an account's opening balance date.",
          code: "date-before-opening",
        };
      }
      targetFromAccountId = fromAcc.id;
      targetToAccountId = toAcc.id;
      break;
    }
  }

  const categoryName = (input.categoryName ?? "").trim() || null;
  if (categoryName && categoryName.length > 60) {
    return {
      success: false,
      error: "Category name must be 60 characters or less.",
      code: "invalid-category",
    };
  }

  return {
    success: true,
    data: {
      transactionId,
      description,
      amountPaise,
      transactionDate: date,
      transactionType: input.transactionType,
      accountId: targetAccountId,
      fromAccountId: targetFromAccountId,
      toAccountId: targetToAccountId,
      creditCardId: targetCreditCardId,
      categoryName,
    },
  };
}

export interface SignificantChangeItem {
  field: "credit_card" | "account" | "amount" | "type" | "date";
  label: string;
  oldValue: string;
  newValue: string;
}

export interface SignificantChangeDetection {
  isSignificant: boolean;
  changes: SignificantChangeItem[];
  explanation: string;
}

export function detectSignificantTransactionChange(
  original: {
    amountPaise: number | string;
    transactionType: string;
    accountId?: string | null;
    fromAccountId?: string | null;
    toAccountId?: string | null;
    creditCardId?: string | null;
    transactionDate?: string;
  },
  edited: {
    amountPaise: number;
    transactionType: string;
    accountId?: string | null;
    fromAccountId?: string | null;
    toAccountId?: string | null;
    creditCardId?: string | null;
    transactionDate?: string;
  },
  cardNames: Map<string, string>,
  accountNames: Map<string, string>
): SignificantChangeDetection {
  const changes: SignificantChangeItem[] = [];

  // 1. Credit Card Changed (Primary Use Case)
  const origCardId = original.creditCardId ?? null;
  const editCardId = edited.creditCardId ?? null;
  if (origCardId !== editCardId) {
    const oldCard = origCardId ? (cardNames.get(origCardId) ?? "Original Card") : "None";
    const newCard = editCardId ? (cardNames.get(editCardId) ?? "New Card") : "None";
    changes.push({
      field: "credit_card",
      label: "Linked Credit Card",
      oldValue: oldCard,
      newValue: newCard,
    });
  }

  // 2. Account Changed
  const origAccId = original.accountId ?? original.fromAccountId ?? null;
  const editAccId = edited.accountId ?? edited.fromAccountId ?? null;
  if (origAccId !== editAccId) {
    const oldAcc = origAccId ? (accountNames.get(origAccId) ?? "Original Account") : "None";
    const newAcc = editAccId ? (accountNames.get(editAccId) ?? "New Account") : "None";
    changes.push({
      field: "account",
      label: "Linked Account",
      oldValue: oldAcc,
      newValue: newAcc,
    });
  }

  // 3. Amount Changed
  const origPaise = Math.round(Number(original.amountPaise));
  const editPaise = edited.amountPaise;
  if (origPaise !== editPaise) {
    const fmt = (p: number) => `₹${(p / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
    changes.push({
      field: "amount",
      label: "Transaction Amount",
      oldValue: fmt(origPaise),
      newValue: fmt(editPaise),
    });
  }

  // 4. Transaction Type Changed
  if (original.transactionType !== edited.transactionType) {
    changes.push({
      field: "type",
      label: "Transaction Type",
      oldValue: original.transactionType.replace("_", " "),
      newValue: edited.transactionType.replace("_", " "),
    });
  }

  // 5. Date Changed
  if (original.transactionDate && edited.transactionDate && original.transactionDate !== edited.transactionDate) {
    changes.push({
      field: "date",
      label: "Transaction Date",
      oldValue: original.transactionDate,
      newValue: edited.transactionDate,
    });
  }

  const isSignificant = changes.length > 0;
  let explanation = "";

  if (changes.some((c) => c.field === "credit_card")) {
    explanation =
      "You are changing the credit card for this transaction. This entry will move between the cards' calculated outstanding balances, immediately updating available credit and utilization for both cards while remaining a single transaction record.";
  } else if (changes.some((c) => c.field === "account")) {
    explanation =
      "You are reassigning the financial account for this transaction. The balances of both the previous and new accounts will be recalculated from your verified ledger history.";
  } else if (changes.some((c) => c.field === "amount")) {
    explanation =
      "You are modifying the transaction amount. All derived balances, credit utilization, and historical cash flow analytics will be updated to reflect the new amount.";
  } else if (changes.some((c) => c.field === "type")) {
    explanation =
      "You are changing the transaction type. The financial treatment of this record will be converted and all associated account and card balances will adjust accordingly.";
  }

  return {
    isSignificant,
    changes,
    explanation,
  };
}
