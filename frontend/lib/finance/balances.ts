import type { CreditCard, FinancialAccount, Transaction } from "./types";

// Dates must use YYYY-MM-DD format.
// The opening balance is the starting balance before
// transactions recorded on the opening date.
function isOnOrAfterOpeningDate(
  transactionDate: string,
  openingDate: string
): boolean {
  return transactionDate >= openingDate;
}

// Calculate the balance of one bank account or cash wallet.
export function calculateAccountBalance(
  account: FinancialAccount,
  transactions: Transaction[]
): number {
  let balance = account.openingBalancePaise;

  for (const transaction of transactions) {
    if (
      !isOnOrAfterOpeningDate(
        transaction.date,
        account.openingBalanceDate
      )
    ) {
      continue;
    }

    if (
      transaction.type === "income" &&
      transaction.accountId === account.id
    ) {
      balance += transaction.amountPaise;
    } else if (
      transaction.type === "expense" &&
      transaction.accountId === account.id
    ) {
      balance -= transaction.amountPaise;
    } else if (transaction.type === "transfer") {
      if (transaction.fromAccountId === account.id) {
        balance -= transaction.amountPaise;
      }

      if (transaction.toAccountId === account.id) {
        balance += transaction.amountPaise;
      }
    } else if (
      transaction.type === "card_payment" &&
      transaction.fromAccountId === account.id
    ) {
      balance -= transaction.amountPaise;
    } else if (
      transaction.type === "money_lent" &&
      transaction.accountId === account.id
    ) {
      balance -= transaction.amountPaise;
    } else if (
      transaction.type === "repayment_received" &&
      transaction.accountId === account.id
    ) {
      balance += transaction.amountPaise;
    } else if (
      transaction.type === "money_borrowed" &&
      transaction.accountId === account.id
    ) {
      balance += transaction.amountPaise;
    } else if (
      transaction.type === "repayment_paid" &&
      transaction.accountId === account.id
    ) {
      balance -= transaction.amountPaise;
    }

    // A credit card purchase does not immediately change
    // the linked bank account's balance.
  }

  return balance;
}

// Calculate the balance of one bank account or cash wallet strictly as of a specific date.
// Transactions after asOfDate are strictly ignored to prevent historical balance distortions.
export function calculateAccountBalanceAsOfDate(
  account: FinancialAccount,
  transactions: Transaction[],
  asOfDate: string
): number {
  let balance = account.openingBalancePaise;

  for (const transaction of transactions) {
    if (
      !isOnOrAfterOpeningDate(
        transaction.date,
        account.openingBalanceDate
      )
    ) {
      continue;
    }

    if (transaction.date > asOfDate) {
      continue;
    }

    if (
      transaction.type === "income" &&
      transaction.accountId === account.id
    ) {
      balance += transaction.amountPaise;
    } else if (
      transaction.type === "expense" &&
      transaction.accountId === account.id
    ) {
      balance -= transaction.amountPaise;
    } else if (transaction.type === "transfer") {
      if (transaction.fromAccountId === account.id) {
        balance -= transaction.amountPaise;
      }

      if (transaction.toAccountId === account.id) {
        balance += transaction.amountPaise;
      }
    } else if (
      transaction.type === "card_payment" &&
      transaction.fromAccountId === account.id
    ) {
      balance -= transaction.amountPaise;
    } else if (
      transaction.type === "money_lent" &&
      transaction.accountId === account.id
    ) {
      balance -= transaction.amountPaise;
    } else if (
      transaction.type === "repayment_received" &&
      transaction.accountId === account.id
    ) {
      balance += transaction.amountPaise;
    } else if (
      transaction.type === "money_borrowed" &&
      transaction.accountId === account.id
    ) {
      balance += transaction.amountPaise;
    } else if (
      transaction.type === "repayment_paid" &&
      transaction.accountId === account.id
    ) {
      balance -= transaction.amountPaise;
    }
  }

  return balance;
}

// Calculate outstanding debt on one credit card.
export function calculateCardOutstanding(
  card: CreditCard,
  transactions: Transaction[]
): number {
  let outstanding = card.openingOutstandingPaise;

  for (const transaction of transactions) {
    if (
      !isOnOrAfterOpeningDate(
        transaction.date,
        card.openingOutstandingDate
      )
    ) {
      continue;
    }

    if (
      transaction.type === "card_purchase" &&
      transaction.creditCardId === card.id
    ) {
      outstanding += transaction.amountPaise;
    } else if (
      transaction.type === "card_payment" &&
      transaction.creditCardId === card.id
    ) {
      outstanding -= transaction.amountPaise;
    } else if (
      (transaction as { type: string; creditCardId?: string }).type === "card_credit" &&
      (transaction as { type: string; creditCardId?: string }).creditCardId === card.id
    ) {
      outstanding -= transaction.amountPaise;
    }
  }

  return outstanding;
}

// Calculate credit remaining under the card's stated limit.
export function calculateAvailableCredit(
  card: CreditCard,
  transactions: Transaction[]
): number {
  return (
    card.creditLimitPaise -
    calculateCardOutstanding(card, transactions)
  );
}

export * from "./card-limit-engine";


export interface SeparatedAccountBalances<
  T extends { account: FinancialAccount; balancePaise: number }
> {
  bankAccounts: T[];
  cashAccounts: T[];
  totalBankBalancesPaise: number;
  totalCashInHandPaise: number;
  totalLiquidPaise: number;
}

/**
 * Categorizes accounts into physical cash accounts and institutional bank accounts,
 * ensuring each account is assigned to exactly one category without overlap.
 */
export function separateAccountBalances<
  T extends { account: FinancialAccount; balancePaise: number }
>(accountBalances: T[]): SeparatedAccountBalances<T> {
  const bankAccounts = accountBalances.filter(
    (item) => item.account.type === "bank"
  );
  const cashAccounts = accountBalances.filter(
    (item) => item.account.type === "cash"
  );

  const totalBankBalancesPaise = bankAccounts.reduce(
    (sum, item) => sum + item.balancePaise,
    0
  );
  const totalCashInHandPaise = cashAccounts.reduce(
    (sum, item) => sum + item.balancePaise,
    0
  );

  return {
    bankAccounts,
    cashAccounts,
    totalBankBalancesPaise,
    totalCashInHandPaise,
    totalLiquidPaise: totalBankBalancesPaise + totalCashInHandPaise,
  };
}

export interface DebtLiabilityItem {
  debtType: string;
  linkedCreditCardId: string | null;
  outstandingPaise: number;
}

/**
 * Separates standalone term loans from credit-card-linked EMIs.
 * Card-linked EMIs are already represented within the credit card's revolving debt / outstanding.
 * Only standalone term loans constitute independent liabilities to prevent double counting.
 */
export function partitionDebtsForLiabilities<T extends DebtLiabilityItem>(
  debts: T[]
): {
  standaloneLoans: T[];
  cardLinkedEmis: T[];
  totalStandaloneLoanPaise: number;
  totalCardLinkedEmiPaise: number;
} {
  const standaloneLoans: T[] = [];
  const cardLinkedEmis: T[] = [];

  for (const debt of debts) {
    if (
      debt.debtType === "credit_card_emi" ||
      Boolean(debt.linkedCreditCardId)
    ) {
      cardLinkedEmis.push(debt);
    } else {
      standaloneLoans.push(debt);
    }
  }

  const totalStandaloneLoanPaise = standaloneLoans.reduce(
    (sum, d) => sum + d.outstandingPaise,
    0
  );
  const totalCardLinkedEmiPaise = cardLinkedEmis.reduce(
    (sum, d) => sum + d.outstandingPaise,
    0
  );

  return {
    standaloneLoans,
    cardLinkedEmis,
    totalStandaloneLoanPaise,
    totalCardLinkedEmiPaise,
  };
}

/**
 * Computes net worth and total liabilities without double-counting card EMIs.
 * Incorporates personal receivables (assets) and personal payables (liabilities).
 */
export function calculateNetWorth(params: {
  liquidAssetsPaise: number;
  cardOutstandingPaise: number;
  standaloneLoanPrincipalPaise: number;
  personalReceivablesPaise?: number;
  personalPayablesPaise?: number;
}): {
  totalAssetsPaise: number;
  totalLiabilitiesPaise: number;
  netWorthPaise: number;
} {
  const personalReceivablesPaise = params.personalReceivablesPaise ?? 0;
  const personalPayablesPaise = params.personalPayablesPaise ?? 0;

  const totalAssetsPaise =
    params.liquidAssetsPaise + personalReceivablesPaise;
  const totalLiabilitiesPaise =
    params.cardOutstandingPaise +
    params.standaloneLoanPrincipalPaise +
    personalPayablesPaise;
  const netWorthPaise = totalAssetsPaise - totalLiabilitiesPaise;

  return {
    totalAssetsPaise,
    totalLiabilitiesPaise,
    netWorthPaise,
  };
}

export type RawAccountRow = {
  id: string;
  name: string;
  account_type: "bank" | "cash";
  institution?: string | null;
  opening_balance_paise: number | string;
  opening_balance_date: string;
  is_archived?: boolean;
};

export type RawTransactionRow = {
  id: string;
  transaction_date: string;
  amount_paise: number | string;
  transaction_type: string;
  description?: string | null;
  account_id?: string | null;
  from_account_id?: string | null;
  to_account_id?: string | null;
  credit_card_id?: string | null;
  category_id?: string | null;
};

export function toFinancialAccount(row: RawAccountRow): FinancialAccount {
  return {
    id: row.id,
    name: row.name,
    type: row.account_type,
    institution: row.institution ?? undefined,
    openingBalancePaise: Number(row.opening_balance_paise),
    openingBalanceDate: row.opening_balance_date,
    isArchived: Boolean(row.is_archived),
  };
}

export function toFinancialTransaction(row: RawTransactionRow): Transaction {
  const base = {
    id: row.id,
    date: row.transaction_date,
    description: row.description ?? "",
    amountPaise: Number(row.amount_paise),
  };

  switch (row.transaction_type) {
    case "income":
      return {
        ...base,
        type: "income",
        accountId: row.account_id ?? "",
        categoryId: row.category_id ?? "",
      };

    case "expense":
      return {
        ...base,
        type: "expense",
        accountId: row.account_id ?? "",
        categoryId: row.category_id ?? "",
      };

    case "transfer":
      return {
        ...base,
        type: "transfer",
        fromAccountId: row.from_account_id ?? "",
        toAccountId: row.to_account_id ?? "",
      };

    case "card_purchase":
      return {
        ...base,
        type: "card_purchase",
        creditCardId: row.credit_card_id ?? "",
        categoryId: row.category_id ?? "",
      };

    case "card_payment":
      return {
        ...base,
        type: "card_payment",
        fromAccountId: row.from_account_id ?? "",
        creditCardId: row.credit_card_id ?? "",
      };

    case "money_lent":
      return {
        ...base,
        type: "money_lent",
        accountId: row.account_id ?? "",
      };

    case "repayment_received":
      return {
        ...base,
        type: "repayment_received",
        accountId: row.account_id ?? "",
      };

    case "money_borrowed":
      return {
        ...base,
        type: "money_borrowed",
        accountId: row.account_id ?? "",
      };

    case "repayment_paid":
      return {
        ...base,
        type: "repayment_paid",
        accountId: row.account_id ?? "",
      };

    default:
      return {
        ...base,
        type: "expense",
        accountId: row.account_id ?? "",
        categoryId: row.category_id ?? "",
      };
  }
}

