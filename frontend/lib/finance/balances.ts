
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
