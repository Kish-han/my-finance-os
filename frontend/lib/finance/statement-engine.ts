export interface CardBillingConfig {
  id: string;
  name: string;
  bankName: string;
  statementDay: number | null;
  paymentDueDay: number | null;
  openingOutstandingPaise: number;
  openingOutstandingDate: string;
}

export interface BillingCycleDates {
  previousStatementDate: string;
  currentStatementDate: string;
  currentPaymentDueDate: string;
  nextStatementDate: string;
  nextPaymentDueDate: string;
  isCurrentCycleClosed: boolean;
}

/**
 * Calculates a valid date string (YYYY-MM-DD) for a given year, month (1-12), and day (1-31),
 * properly clamping days to month boundaries (e.g. Feb 28/29, April 30).
 */
export function constructClampedDate(year: number, month: number, day: number): string {
  // Handle month wrapping
  let adjYear = year;
  let adjMonth = month;
  while (adjMonth > 12) {
    adjMonth -= 12;
    adjYear += 1;
  }
  while (adjMonth < 1) {
    adjMonth += 12;
    adjYear -= 1;
  }

  // Find max days in the target month using UTC
  const daysInMonth = new Date(Date.UTC(adjYear, adjMonth, 0)).getUTCDate();
  const clampedDay = Math.min(Math.max(1, day), daysInMonth);

  const yStr = String(adjYear);
  const mStr = String(adjMonth).padStart(2, "0");
  const dStr = String(clampedDay).padStart(2, "0");

  return `${yStr}-${mStr}-${dStr}`;
}

/**
 * Calculates the payment due date corresponding to a given statement cutoff date.
 * If paymentDueDay <= statementDay, the due date falls in the following calendar month.
 * If paymentDueDay > statementDay, the due date falls in the same calendar month.
 */
export function calculateDueDateFromStatementDate(
  statementDate: string,
  paymentDueDay: number
): string {
  const [yStr, mStr, dStr] = statementDate.split("-");
  const year = Number(yStr);
  const month = Number(mStr);
  const statementDay = Number(dStr);

  const targetMonth = paymentDueDay <= statementDay ? month + 1 : month;
  return constructClampedDate(year, targetMonth, paymentDueDay);
}

/**
 * Determines billing cycle dates for a card as of a given date (typically today).
 * If statementDay is not configured, defaults to the 1st of the month with due day 20th.
 */
export function getBillingCycleDates(
  statementDayInput: number | null,
  paymentDueDayInput: number | null,
  asOfDate: string
): BillingCycleDates {
  const stmtDay = statementDayInput ?? 1;
  const dueDay = paymentDueDayInput ?? (stmtDay <= 10 ? stmtDay + 20 : (stmtDay + 20) % 30 || 5);

  const [yStr, mStr, dStr] = asOfDate.split("-");
  const currentYear = Number(yStr);
  const currentMonth = Number(mStr);
  const currentDay = Number(dStr);

  let prevStmtDate: string;
  let currStmtDate: string;
  let nextStmtDate: string;
  const isClosed = currentDay >= stmtDay;

  if (isClosed) {
    // Current month's statement has already closed on or before today
    prevStmtDate = constructClampedDate(currentYear, currentMonth - 1, stmtDay);
    currStmtDate = constructClampedDate(currentYear, currentMonth, stmtDay);
    nextStmtDate = constructClampedDate(currentYear, currentMonth + 1, stmtDay);
  } else {
    // Current month's statement hasn't closed yet; latest closed was last month
    prevStmtDate = constructClampedDate(currentYear, currentMonth - 2, stmtDay);
    currStmtDate = constructClampedDate(currentYear, currentMonth - 1, stmtDay);
    nextStmtDate = constructClampedDate(currentYear, currentMonth, stmtDay);
  }

  const currDueDate = calculateDueDateFromStatementDate(currStmtDate, dueDay);
  const nextDueDate = calculateDueDateFromStatementDate(nextStmtDate, dueDay);

  return {
    previousStatementDate: prevStmtDate,
    currentStatementDate: currStmtDate,
    currentPaymentDueDate: currDueDate,
    nextStatementDate: nextStmtDate,
    nextPaymentDueDate: nextDueDate,
    isCurrentCycleClosed: isClosed,
  };
}

export interface BilledEmiItem {
  id: string;
  name: string;
  installmentNumber: number;
  installmentAmountPaise: number;
  billingDate: string;
}

export interface AutoCalculatedStatement {
  cardId: string;
  statementPeriodStart: string; // Day after previous statement cutoff
  statementDate: string;       // Cutoff date of this cycle
  paymentDueDate: string;
  openingBalancePaise: number;
  purchasesPaise: number;
  creditsPaise: number;
  billedEmiPaise: number;
  paymentsBeforeCutoffPaise: number;
  previousUnpaidBalancePaise: number;
  statementBalancePaise: number;
  minimumDuePaise: number;
  isProjected: boolean;
  billedEmis: BilledEmiItem[];
}

export interface StatementCalculationInput {
  card: CardBillingConfig;
  statementDate: string;
  previousStatementDate: string;
  transactions: Array<{
    id: string;
    date: string;
    amountPaise: number | string;
    type: string;
    creditCardId: string | null;
  }>;
  cardLinkedEmis: Array<{
    id: string;
    name: string;
    emiAmountPaise: number | string;
    firstEmiDueDate: string;
    nextDueDate: string | null;
    totalTenureMonths: number;
    installmentsPaidBeforeTracking: number;
  }>;
  emiPayments: Array<{
    debtId: string;
    paymentDate: string;
    amountPaise: number | string;
    paymentMethod: string;
  }>;
  previousUnpaidBalancePaise?: number;
  isProjected?: boolean;
}

/**
 * Computes the exact statement balance for a billing cycle:
 * Statement Balance = Previous Unpaid Balance + Purchases + Billed EMIs - Credits/Refunds - Payments (before/on cutoff)
 */
export function calculateCycleStatementAmount({
  card,
  statementDate,
  previousStatementDate,
  transactions,
  cardLinkedEmis,
  emiPayments,
  previousUnpaidBalancePaise = 0,
  isProjected = false,
}: StatementCalculationInput): AutoCalculatedStatement {
  const cardTransactions = transactions.filter(
    (t) => t.creditCardId === card.id
  );

  // Period: (previousStatementDate, statementDate]
  const periodPurchases = cardTransactions.filter(
    (t) =>
      t.type === "card_purchase" &&
      t.date > previousStatementDate &&
      t.date <= statementDate
  );

  const purchasesPaise = periodPurchases.reduce(
    (sum, t) => sum + Number(t.amountPaise),
    0
  );

  // Reversals / credits / refunds (if any recorded as negative or credit types)
  const creditsPaise = cardTransactions
    .filter(
      (t) =>
        t.type === "card_credit" &&
        t.date > previousStatementDate &&
        t.date <= statementDate
    )
    .reduce((sum, t) => sum + Number(t.amountPaise), 0);

  // Payments recorded on or before statement cutoff date reduce the generated bill
  const periodPayments = cardTransactions.filter(
    (t) =>
      t.type === "card_payment" &&
      t.date > previousStatementDate &&
      t.date <= statementDate
  );

  const paymentsBeforeCutoffPaise = periodPayments.reduce(
    (sum, t) => sum + Number(t.amountPaise),
    0
  );

  // Identify Credit Card EMI installments billed during this billing period
  const billedEmis: BilledEmiItem[] = [];
  let billedEmiPaise = 0;

  for (const emi of cardLinkedEmis) {
    // 1. Check if a payment recorded with method 'billed_to_credit_card' falls in this cycle
    const billedPayment = emiPayments.find(
      (p) =>
        p.debtId === emi.id &&
        p.paymentMethod === "billed_to_credit_card" &&
        p.paymentDate > previousStatementDate &&
        p.paymentDate <= statementDate
    );

    if (billedPayment) {
      const amt = Number(billedPayment.amountPaise);
      billedEmiPaise += amt;
      billedEmis.push({
        id: emi.id,
        name: emi.name,
        installmentNumber: 1,
        installmentAmountPaise: amt,
        billingDate: billedPayment.paymentDate,
      });
      continue;
    }

    // 2. Alternatively check if scheduled EMI due date falls in this billing period
    const scheduledDate = emi.nextDueDate || emi.firstEmiDueDate;
    if (
      scheduledDate &&
      scheduledDate > previousStatementDate &&
      scheduledDate <= statementDate
    ) {
      const amt = Number(emi.emiAmountPaise);
      billedEmiPaise += amt;
      billedEmis.push({
        id: emi.id,
        name: emi.name,
        installmentNumber: emi.installmentsPaidBeforeTracking + 1,
        installmentAmountPaise: amt,
        billingDate: scheduledDate,
      });
    }
  }

  // Opening balance incorporation:
  // If card was created during this cycle and has opening balance
  let openingBalancePaise = 0;
  if (
    card.openingOutstandingDate > previousStatementDate &&
    card.openingOutstandingDate <= statementDate
  ) {
    openingBalancePaise = card.openingOutstandingPaise;
  }

  // Net calculated statement balance
  const rawBalance =
    previousUnpaidBalancePaise +
    openingBalancePaise +
    purchasesPaise +
    billedEmiPaise -
    creditsPaise -
    paymentsBeforeCutoffPaise;

  const statementBalancePaise = Math.max(0, rawBalance);

  // Minimum amount due: standard 5% of statement balance, minimum ₹500 (or entire balance if < ₹500)
  const minimumDuePaise =
    statementBalancePaise > 0
      ? Math.min(statementBalancePaise, Math.max(50_000, Math.round(statementBalancePaise * 0.05)))
      : 0;

  const paymentDueDate = calculateDueDateFromStatementDate(
    statementDate,
    card.paymentDueDay ?? 5
  );

  return {
    cardId: card.id,
    statementPeriodStart: previousStatementDate,
    statementDate,
    paymentDueDate,
    openingBalancePaise,
    purchasesPaise,
    creditsPaise,
    billedEmiPaise,
    paymentsBeforeCutoffPaise,
    previousUnpaidBalancePaise,
    statementBalancePaise,
    minimumDuePaise,
    isProjected,
    billedEmis,
  };
}

export interface StatementAllocationResult {
  statementId: string;
  statementDate: string;
  paymentDueDate: string;
  statementBalancePaise: number;
  paidPaise: number;
  remainingPaise: number;
  isFullyPaid: boolean;
  isPartiallyPaid: boolean;
}

/**
 * Allocates card repayments made after statement issuance against unpaid statements,
 * following the standard policy: oldest outstanding statement first.
 */
export function allocatePaymentsToStatements(
  statements: Array<{
    id: string;
    statementDate: string;
    paymentDueDate: string;
    statementBalancePaise: number;
    isSettled?: boolean;
  }>,
  paymentsAfterCutoff: Array<{
    amountPaise: number;
    date: string;
  }>
): StatementAllocationResult[] {
  // Sort statements chronologically (oldest due date first)
  const sortedStatements = [...statements].sort((a, b) =>
    a.paymentDueDate.localeCompare(b.paymentDueDate)
  );

  // Sum total payments available
  let availablePaymentPaise = paymentsAfterCutoff.reduce(
    (sum, p) => sum + Number(p.amountPaise),
    0
  );

  const results: StatementAllocationResult[] = [];

  for (const stmt of sortedStatements) {
    if (stmt.isSettled) {
      results.push({
        statementId: stmt.id,
        statementDate: stmt.statementDate,
        paymentDueDate: stmt.paymentDueDate,
        statementBalancePaise: stmt.statementBalancePaise,
        paidPaise: stmt.statementBalancePaise,
        remainingPaise: 0,
        isFullyPaid: true,
        isPartiallyPaid: false,
      });
      continue;
    }

    const bill = stmt.statementBalancePaise;
    const allocated = Math.min(bill, availablePaymentPaise);
    availablePaymentPaise -= allocated;
    const remaining = bill - allocated;

    results.push({
      statementId: stmt.id,
      statementDate: stmt.statementDate,
      paymentDueDate: stmt.paymentDueDate,
      statementBalancePaise: bill,
      paidPaise: allocated,
      remainingPaise: remaining,
      isFullyPaid: remaining === 0,
      isPartiallyPaid: allocated > 0 && remaining > 0,
    });
  }

  return results;
}

/**
 * Calculates current cycle spending accumulated after the latest statement cutoff.
 * Clearly displayed as an estimate before the statement date arrives.
 */
export function calculateCurrentCycleEstimate(
  cardId: string,
  latestStatementCutoff: string,
  transactions: Array<{
    date: string;
    amountPaise: number | string;
    type: string;
    creditCardId: string | null;
  }>
): {
  unbilledPurchasesPaise: number;
  unbilledPaymentsPaise: number;
  estimatedNextStatementPaise: number;
} {
  const unbilledPurchasesPaise = transactions
    .filter(
      (t) =>
        t.creditCardId === cardId &&
        t.type === "card_purchase" &&
        t.date > latestStatementCutoff
    )
    .reduce((sum, t) => sum + Number(t.amountPaise), 0);

  const unbilledPaymentsPaise = transactions
    .filter(
      (t) =>
        t.creditCardId === cardId &&
        t.type === "card_payment" &&
        t.date > latestStatementCutoff
    )
    .reduce((sum, t) => sum + Number(t.amountPaise), 0);

  const estimatedNextStatementPaise = Math.max(
    0,
    unbilledPurchasesPaise - unbilledPaymentsPaise
  );

  return {
    unbilledPurchasesPaise,
    unbilledPaymentsPaise,
    estimatedNextStatementPaise,
  };
}
