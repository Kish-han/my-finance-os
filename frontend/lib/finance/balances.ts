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
    }

    // A credit card purchase does not immediately change
    // the linked bank account's balance.
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
 */
export function calculateNetWorth(params: {
  liquidAssetsPaise: number;
  cardOutstandingPaise: number;
  standaloneLoanPrincipalPaise: number;
}): {
  totalLiabilitiesPaise: number;
  netWorthPaise: number;
} {
  const totalLiabilitiesPaise =
    params.cardOutstandingPaise + params.standaloneLoanPrincipalPaise;
  const netWorthPaise = params.liquidAssetsPaise - totalLiabilitiesPaise;

  return {
    totalLiabilitiesPaise,
    netWorthPaise,
  };
}
