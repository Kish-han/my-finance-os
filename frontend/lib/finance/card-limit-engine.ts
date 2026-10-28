/**
 * Authoritative Credit Card Limit & Utilization Engine for AURA Wealth / My Finance OS.
 *
 * Core Business Invariant:
 * Projected card outstanding must never exceed that card's configured credit limit
 * when the application records a new charge.
 *
 * Total Utilized Credit = Revolving Outstanding + Blocked Card-Linked EMI Principal
 * Available Credit = Credit Limit - Total Utilized Credit
 *
 * All computations use integer paise.
 */

export interface CardLimitInput {
  id: string;
  creditLimitPaise?: number | string;
  credit_limit_paise?: number | string;
  openingOutstandingPaise?: number | string;
  opening_outstanding_paise?: number | string;
  openingOutstandingDate?: string;
  opening_outstanding_date?: string;
}

export interface CardTransactionInput {
  id?: string;
  date?: string;
  transaction_date?: string;
  amountPaise?: number | string;
  amount_paise?: number | string;
  type?: string;
  transaction_type?: string;
  creditCardId?: string | null;
  credit_card_id?: string | null;
  fromAccountId?: string | null;
  from_account_id?: string | null;
  description?: string;
}

export interface CardLinkedEmiInput {
  id: string;
  name?: string;
  debtType?: string;
  debt_type?: string;
  linkedCreditCardId?: string | null;
  linked_credit_card_id?: string | null;
  currentOutstandingPrincipalPaise?: number | string;
  current_outstanding_principal_paise?: number | string;
  status?: string;
}

export interface CardCreditUtilizationSummary {
  cardId: string;
  creditLimitPaise: number;
  revolvingOutstandingPaise: number;
  blockedEmiPrincipalPaise: number;
  totalUtilizedCreditPaise: number;
  availableCreditPaise: number; // May be negative when card is over limit
  utilizationPercent: number;
  isOverLimit: boolean;
}

export interface LimitValidationResult {
  allowed: boolean;
  creditLimitPaise: number;
  currentUtilizedPaise: number;
  currentAvailablePaise: number;
  chargeAmountPaise: number;
  projectedUtilizedPaise: number;
  projectedAvailablePaise: number;
  exceededByPaise: number;
  errorMessage?: string;
}

/**
 * Formats integer paise into standard Indian Rupee representation (e.g. ₹1,00,000 or -₹5,000).
 */
export function formatRupees(paise: number | string): string {
  const num = Number(paise);
  if (!Number.isFinite(num)) return "₹0";

  const isNegative = num < 0;
  const absPaise = Math.abs(num);
  const rupees = absPaise / 100;
  const hasFractions = absPaise % 100 !== 0;

  const formatted = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: hasFractions ? 2 : 0,
    maximumFractionDigits: hasFractions ? 2 : 0,
  }).format(rupees);

  return isNegative ? `-${formatted}` : formatted;
}

/**
 * Generates the standardized credit limit exceeded rejection message.
 * Example:
 * "This transaction exceeds your available credit by ₹2,000. Available credit: ₹8,000. Transaction amount: ₹10,000."
 */
export function buildLimitExceededMessage(
  exceededByPaise: number,
  availableCreditPaise: number,
  chargeAmountPaise: number
): string {
  return `This transaction exceeds your available credit by ${formatRupees(
    exceededByPaise
  )}. Available credit: ${formatRupees(
    availableCreditPaise
  )}. Transaction amount: ${formatRupees(chargeAmountPaise)}.`;
}

/**
 * Helper to normalize field extraction across camelCase domain types and snake_case DB rows.
 */
function extractCardValues(card: CardLimitInput) {
  const limit = Number(card.creditLimitPaise ?? card.credit_limit_paise ?? 0);
  const openingPaise = Number(
    card.openingOutstandingPaise ?? card.opening_outstanding_paise ?? 0
  );
  const openingDate = String(
    card.openingOutstandingDate ?? card.opening_outstanding_date ?? "1970-01-01"
  );
  return {
    limitPaise: Math.round(Number.isFinite(limit) ? limit : 0),
    openingPaise: Math.round(Number.isFinite(openingPaise) ? openingPaise : 0),
    openingDate,
  };
}

/**
 * Calculates current revolving outstanding for a credit card.
 * Accounts for:
 * - Opening outstanding
 * - Purchases (+ amount)
 * - Repayments (- amount)
 * - Refunds and merchant credits (- amount)
 */
export function calculateRevolvingOutstanding(
  card: CardLimitInput,
  transactions: CardTransactionInput[],
  asOfDate?: string
): number {
  const { openingPaise, openingDate } = extractCardValues(card);
  let outstanding = openingPaise;

  for (const tx of transactions) {
    const cardId = tx.creditCardId ?? tx.credit_card_id;
    if (cardId !== card.id) continue;

    const txDate = String(tx.date ?? tx.transaction_date ?? "");
    if (txDate < openingDate) continue;
    if (asOfDate && txDate > asOfDate) continue;

    const rawAmount = Number(tx.amountPaise ?? tx.amount_paise ?? 0);
    const amount = Math.round(Number.isFinite(rawAmount) ? rawAmount : 0);
    const type = tx.type ?? tx.transaction_type;

    if (type === "card_purchase") {
      outstanding += amount;
    } else if (type === "card_payment" || type === "card_credit") {
      outstanding -= amount;
    }
  }

  return outstanding;
}

/**
 * Calculates blocked credit limit from active card-linked EMI principal.
 * Closed or foreclosed loans do not block credit limit.
 */
export function calculateBlockedEmiPrincipal(
  cardId: string,
  cardLinkedEmis: CardLinkedEmiInput[] = []
): number {
  let blockedPaise = 0;

  for (const emi of cardLinkedEmis) {
    const linkedId = emi.linkedCreditCardId ?? emi.linked_credit_card_id;
    if (linkedId !== cardId) continue;

    const status = (emi.status || "active").toLowerCase();
    if (status === "closed" || status === "foreclosed") continue;

    const principal = Number(
      emi.currentOutstandingPrincipalPaise ??
        emi.current_outstanding_principal_paise ??
        0
    );
    if (Number.isFinite(principal) && principal > 0) {
      blockedPaise += Math.round(principal);
    }
  }

  return blockedPaise;
}

/**
 * Centralized authoritative calculation of credit utilization and available limit.
 */
export function calculateCardCreditUtilization(
  card: CardLimitInput,
  transactions: CardTransactionInput[] = [],
  cardLinkedEmis: CardLinkedEmiInput[] = [],
  asOfDate?: string
): CardCreditUtilizationSummary {
  const { limitPaise } = extractCardValues(card);
  const revolvingOutstandingPaise = calculateRevolvingOutstanding(
    card,
    transactions,
    asOfDate
  );
  const blockedEmiPrincipalPaise = calculateBlockedEmiPrincipal(
    card.id,
    cardLinkedEmis
  );

  const totalUtilizedCreditPaise =
    revolvingOutstandingPaise + blockedEmiPrincipalPaise;
  const availableCreditPaise = limitPaise - totalUtilizedCreditPaise;
  const isOverLimit = totalUtilizedCreditPaise > limitPaise;

  const utilizationPercent =
    limitPaise > 0
      ? Math.round((totalUtilizedCreditPaise / limitPaise) * 10000) / 100
      : 0;

  return {
    cardId: card.id,
    creditLimitPaise: limitPaise,
    revolvingOutstandingPaise,
    blockedEmiPrincipalPaise,
    totalUtilizedCreditPaise,
    availableCreditPaise,
    utilizationPercent,
    isOverLimit,
  };
}

/**
 * Validates whether a proposed charge (or charge increase) is permitted under the card's credit limit.
 *
 * Supports excluding an existing transaction when editing so the prior amount is not double counted.
 */
export function validateCreditCardChargeLimit({
  card,
  transactions = [],
  cardLinkedEmis = [],
  chargeAmountPaise,
  excludeTransactionId,
  asOfDate,
}: {
  card: CardLimitInput;
  transactions?: CardTransactionInput[];
  cardLinkedEmis?: CardLinkedEmiInput[];
  chargeAmountPaise: number;
  excludeTransactionId?: string | null;
  asOfDate?: string;
}): LimitValidationResult {
  const { limitPaise } = extractCardValues(card);

  const effectiveTransactions = excludeTransactionId
    ? transactions.filter((t) => t.id !== excludeTransactionId)
    : transactions;

  const revolvingPaise = calculateRevolvingOutstanding(
    card,
    effectiveTransactions,
    asOfDate
  );
  const blockedEmiPaise = calculateBlockedEmiPrincipal(
    card.id,
    cardLinkedEmis
  );

  const currentUtilizedPaise = revolvingPaise + blockedEmiPaise;
  const currentAvailablePaise = limitPaise - currentUtilizedPaise;

  const safeCharge = Math.round(Number.isFinite(chargeAmountPaise) ? chargeAmountPaise : 0);
  const projectedUtilizedPaise = currentUtilizedPaise + safeCharge;
  const projectedAvailablePaise = limitPaise - projectedUtilizedPaise;

  const isOverLimit = projectedUtilizedPaise > limitPaise;
  const exceededByPaise = isOverLimit ? projectedUtilizedPaise - limitPaise : 0;
  const allowed = !isOverLimit;

  let errorMessage: string | undefined;
  if (!allowed) {
    errorMessage = buildLimitExceededMessage(
      exceededByPaise,
      currentAvailablePaise,
      safeCharge
    );
  }

  return {
    allowed,
    creditLimitPaise: limitPaise,
    currentUtilizedPaise,
    currentAvailablePaise,
    chargeAmountPaise: safeCharge,
    projectedUtilizedPaise,
    projectedAvailablePaise,
    exceededByPaise,
    errorMessage,
  };
}

/**
 * Converts revolving card dues to an EMI debt without double counting or fake bank debits.
 *
 * Returns:
 * - adjustmentTransaction: A card balance adjustment (type: 'card_payment', fromAccountId: null)
 *   that clears the converted amount from revolving dues.
 * - postConversionSummary: Demonstrates that remaining revolving balance matches the expected
 *   revolving residual, and total credit limit utilization is preserved accurately.
 */
export function processEmiConversionAccounting({
  card,
  transactions = [],
  cardLinkedEmis = [],
  conversionAmountPaise,
  conversionDate,
  description = "EMI Conversion Adjustment",
}: {
  card: CardLimitInput;
  transactions?: CardTransactionInput[];
  cardLinkedEmis?: CardLinkedEmiInput[];
  conversionAmountPaise: number;
  conversionDate: string;
  description?: string;
}) {
  const preSummary = calculateCardCreditUtilization(
    card,
    transactions,
    cardLinkedEmis
  );

  const adjustmentTransaction: CardTransactionInput = {
    id: `adj-emi-conv-${Date.now()}`,
    date: conversionDate,
    amountPaise: conversionAmountPaise,
    type: "card_payment",
    creditCardId: card.id,
    fromAccountId: null, // No bank debit!
    description,
  };

  const simulatedTransactions = [...transactions, adjustmentTransaction];

  const newEmiDebt: CardLinkedEmiInput = {
    id: `emi-conv-${Date.now()}`,
    debtType: "credit_card_emi",
    linkedCreditCardId: card.id,
    currentOutstandingPrincipalPaise: conversionAmountPaise,
    status: "active",
  };

  const simulatedEmis = [...cardLinkedEmis, newEmiDebt];

  const postSummary = calculateCardCreditUtilization(
    card,
    simulatedTransactions,
    simulatedEmis
  );

  return {
    adjustmentTransaction,
    newEmiDebt,
    preConversionRevolvingPaise: preSummary.revolvingOutstandingPaise,
    postConversionRevolvingPaise: postSummary.revolvingOutstandingPaise,
    preConversionUtilizedPaise: preSummary.totalUtilizedCreditPaise,
    postConversionUtilizedPaise: postSummary.totalUtilizedCreditPaise,
    postConversionAvailablePaise: postSummary.availableCreditPaise,
  };
}
