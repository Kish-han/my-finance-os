import {
  generateAmortizationSchedule,
  isLoanEligibleForAmortization,
} from "./amortization";
import {
  getBillingCycleDates,
  calculateCycleStatementAmount,
  calculateCurrentCycleEstimate,
  allocatePaymentsToStatements,
  type CardBillingConfig,
} from "./statement-engine";

export type DueStatus = "overdue" | "due_today" | "due_soon" | "upcoming" | "paid";

export interface DueStatusInfo {
  status: DueStatus;
  daysDiff: number; // Negative = overdue, 0 = today, positive = upcoming
  label: string;
}

/**
 * Computes India's current local date in YYYY-MM-DD format.
 */
export function getIndiaToday(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value])
  );

  return `${values.year}-${values.month}-${values.day}`;
}

/**
 * Calculates due status and human-readable label from due date and today's date.
 */
export function getPaymentDueStatus(
  dueDate: string,
  today: string,
  isPaid = false
): DueStatusInfo {
  if (isPaid) {
    return { status: "paid", daysDiff: 0, label: "Paid" };
  }

  const [dYear, dMonth, dDay] = dueDate.split("-").map(Number);
  const [tYear, tMonth, tDay] = today.split("-").map(Number);

  if (!dYear || !dMonth || !dDay || !tYear || !tMonth || !tDay) {
    return { status: "upcoming", daysDiff: 0, label: "Due date pending" };
  }

  const dueUtc = Date.UTC(dYear, dMonth - 1, dDay);
  const todayUtc = Date.UTC(tYear, tMonth - 1, tDay);

  const diffMs = dueUtc - todayUtc;
  const daysDiff = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (daysDiff < 0) {
    const overdueDays = Math.abs(daysDiff);
    return {
      status: "overdue",
      daysDiff,
      label: overdueDays === 1 ? "Overdue by 1 day" : `Overdue by ${overdueDays} days`,
    };
  }

  if (daysDiff === 0) {
    return {
      status: "due_today",
      daysDiff: 0,
      label: "Due today",
    };
  }

  if (daysDiff <= 5) {
    return {
      status: "due_soon",
      daysDiff,
      label: daysDiff === 1 ? "Due tomorrow" : `Due in ${daysDiff} days`,
    };
  }

  return {
    status: "upcoming",
    daysDiff,
    label: `Due in ${daysDiff} days`,
  };
}

/**
 * Calculates the next due date (YYYY-MM-DD) for a given day of the month (1-31)
 * based on today's date.
 */
export function calculateNextDueDateFromDay(
  paymentDueDay: number,
  today: string
): string {
  const [yearStr, monthStr, dayStr] = today.split("-");
  let year = Number(yearStr);
  let month = Number(monthStr); // 1-12
  const currentDay = Number(dayStr);

  // If today is past the due day, the next due date falls in next month
  if (currentDay > paymentDueDay) {
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }

  // Handle month length (e.g. Feb 28/29, Nov 30)
  const daysInTargetMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const clampedDay = Math.min(paymentDueDay, daysInTargetMonth);

  const yStr = String(year);
  const mStr = String(month).padStart(2, "0");
  const dStr = String(clampedDay).padStart(2, "0");

  return `${yStr}-${mStr}-${dStr}`;
}

export interface CreditCardStatementRecord {
  id: string;
  userId: string;
  creditCardId: string;
  statementDate: string;
  paymentDueDate: string;
  statementBalancePaise: number;
  minimumDuePaise: number | null;
  isSettled: boolean;
  settledAt?: string | null;
  notes?: string | null;
}

export interface StatementSettlementProgress {
  statementBalancePaise: number;
  paidPaise: number;
  remainingPaise: number;
  isFullyPaid: boolean;
  isPartiallyPaid: boolean;
}

/**
 * Calculates the settlement status of a credit card statement based on card repayments
 * made on or after the statement date.
 */
export function calculateStatementProgress(
  statement: CreditCardStatementRecord,
  cardPayments: Array<{ amountPaise: number; date: string; creditCardId: string }>
): StatementSettlementProgress {
  if (statement.isSettled) {
    return {
      statementBalancePaise: statement.statementBalancePaise,
      paidPaise: statement.statementBalancePaise,
      remainingPaise: 0,
      isFullyPaid: true,
      isPartiallyPaid: false,
    };
  }

  // Consider card payments on or after statement date
  const eligiblePayments = cardPayments.filter(
    (p) =>
      p.creditCardId === statement.creditCardId &&
      p.date >= statement.statementDate
  );

  const paidPaise = eligiblePayments.reduce(
    (sum, p) => sum + Number(p.amountPaise),
    0
  );

  const remainingPaise = Math.max(0, statement.statementBalancePaise - paidPaise);
  const isFullyPaid = remainingPaise === 0;
  const isPartiallyPaid = paidPaise > 0 && remainingPaise > 0;

  return {
    statementBalancePaise: statement.statementBalancePaise,
    paidPaise,
    remainingPaise,
    isFullyPaid,
    isPartiallyPaid,
  };
}

export type PaymentItemKind = "credit_card_statement" | "credit_card_reminder" | "standalone_loan";

export interface BaseUpcomingPaymentItem {
  id: string;
  kind: PaymentItemKind;
  title: string;
  subtitle: string;
  dueDate: string;
  dueStatus: DueStatusInfo;
  amountPaise: number;
  isPaid: boolean;
}

export interface CreditCardStatementPaymentItem extends BaseUpcomingPaymentItem {
  kind: "credit_card_statement";
  creditCardId: string;
  statementId: string | null;
  statementDate: string;
  statementBalancePaise: number;
  minimumDuePaise: number | null;
  paidPaise: number;
  remainingPaise: number;
  isPartiallyPaid: boolean;
  isAutoCalculated?: boolean;
  notes: string | null;
}

export interface CreditCardReminderPaymentItem extends BaseUpcomingPaymentItem {
  kind: "credit_card_reminder";
  creditCardId: string;
  paymentDueDay: number | null;
  statementDay: number | null;
  estimatedNextStatementPaise?: number;
}

export interface StandaloneLoanPaymentItem extends BaseUpcomingPaymentItem {
  kind: "standalone_loan";
  debtId: string;
  debtType: string;
  lenderName: string | null;
  nextInstallmentNumber: number | null;
  totalTenureMonths: number;
  expectedPrincipalPaise?: number;
  expectedInterestPaise?: number;
}

export interface RecurringTransactionPaymentItem {
  id: string;
  kind: "recurring_transaction";
  scheduleId: string;
  occurrenceId: string;
  title: string;
  subtitle: string;
  transactionType: "income" | "expense";
  dueDate: string;
  originalDueDate: string;
  dueStatus: DueStatusInfo;
  amountPaise: number;
  isAmountVariable: boolean;
  isSnoozed: boolean;
  snoozedUntilDate?: string | null;
  accountId?: string | null;
  creditCardId?: string | null;
  accountOrCardLabel: string;
  isCreditCard: boolean;
  categoryName?: string | null;
  isPaid: boolean;
  confirmedTransactionId?: string | null;
  confirmedAmountPaise?: number | null;
  notes?: string | null;
}

export type UpcomingPaymentItem =
  | CreditCardStatementPaymentItem
  | CreditCardReminderPaymentItem
  | StandaloneLoanPaymentItem
  | RecurringTransactionPaymentItem;

export interface BuildUpcomingPaymentsParams {
  today: string;
  recurringItems?: RecurringTransactionPaymentItem[];
  cards: Array<{
    id: string;
    name: string;
    bank_name: string;
    last_four_digits: string | null;
    payment_due_day: number | null;
    statement_day: number | null;
    opening_outstanding_paise?: number | string;
    opening_outstanding_date?: string;
  }>;
  statements: CreditCardStatementRecord[];
  cardPaymentTransactions: Array<{
    amountPaise: number;
    date: string;
    creditCardId: string;
  }>;
  debts: Array<{
    id: string;
    name: string;
    lender_name: string | null;
    debt_type: string;
    linked_credit_card_id: string | null;
    emi_amount_paise: number | string;
    next_due_date: string | null;
    status: string;
    original_principal_paise: number | string;
    annual_interest_rate_basis_points: number | string | null;
    total_tenure_months: number;
    installments_paid_before_tracking: number;
    first_emi_due_date: string;
  }>;
  debtPayments: Array<{
    debt_id: string;
    payment_date: string;
    installment_number: number | null;
    amount_paise: number | string;
    principal_component_paise: number | string | null;
    interest_component_paise: number | string | null;
    payment_kind: string;
    payment_method?: string;
  }>;
  allTransactions?: Array<{
    id: string;
    date: string;
    amountPaise: number | string;
    type: string;
    creditCardId: string | null;
  }>;
}

/**
 * Combines, categorizes, and orders all upcoming actionable payments:
 * - Credit card statement payments (verified or auto-calculated from cycle transactions)
 * - Credit card cycle estimates & reminders (when statement pending or in-progress)
 * - Standalone term loan EMIs (calculated with amortization engine)
 * - EXCLUDES credit-card-linked EMIs from standalone section (they bill to card statements)
 * 
 * Sort order: Overdue first, earliest due date first.
 */
export function buildUpcomingPaymentsList({
  today,
  cards,
  statements,
  cardPaymentTransactions,
  debts,
  debtPayments,
  allTransactions = [],
  recurringItems = [],
}: BuildUpcomingPaymentsParams): {
  activePayments: UpcomingPaymentItem[];
  settledPayments: UpcomingPaymentItem[];
} {
  const items: UpcomingPaymentItem[] = [];

  // 1. Process Credit Cards: statements, auto-calculated statements, or estimates/reminders
  for (const card of cards) {
    const cardLabel = `${card.bank_name} ${card.name}${
      card.last_four_digits ? ` (••${card.last_four_digits})` : ""
    }`;

    const cardStatements = statements
      .filter((s) => s.creditCardId === card.id)
      .sort((a, b) => a.paymentDueDate.localeCompare(b.paymentDueDate));

    if (cardStatements.length > 0) {
      // Allocate payments after statement date chronologically across all statements
      const paymentsForCard = cardPaymentTransactions.filter((p) => p.creditCardId === card.id);
      const allocations = allocatePaymentsToStatements(cardStatements, paymentsForCard);

      for (const statement of cardStatements) {
        const alloc = allocations.find((a) => a.statementId === statement.id);
        const paidPaise = alloc ? alloc.paidPaise : 0;
        const remainingPaise = alloc ? alloc.remainingPaise : statement.statementBalancePaise;
        const isPaid = alloc ? alloc.isFullyPaid : statement.isSettled;
        const isPartiallyPaid = alloc ? alloc.isPartiallyPaid : false;

        const dueStatus = getPaymentDueStatus(
          statement.paymentDueDate,
          today,
          isPaid
        );

        items.push({
          id: `stmt-${statement.id}`,
          kind: "credit_card_statement",
          statementId: statement.id,
          creditCardId: card.id,
          title: cardLabel,
          subtitle: "Credit Card Bill",
          dueDate: statement.paymentDueDate,
          statementDate: statement.statementDate,
          dueStatus,
          amountPaise: remainingPaise,
          statementBalancePaise: statement.statementBalancePaise,
          minimumDuePaise: statement.minimumDuePaise,
          paidPaise,
          remainingPaise,
          isPartiallyPaid,
          isPaid,
          isAutoCalculated: false,
          notes: statement.notes ?? null,
        });
      }
    } else if (card.statement_day) {
      // No saved statement in DB, but card has statement_day configured
      const cycleDates = getBillingCycleDates(card.statement_day, card.payment_due_day, today);

      if (cycleDates.isCurrentCycleClosed) {
        // Current cycle has closed! Auto-calculate statement amount
        const cardBillingConfig: CardBillingConfig = {
          id: card.id,
          name: card.name,
          bankName: card.bank_name,
          statementDay: card.statement_day,
          paymentDueDay: card.payment_due_day,
          openingOutstandingPaise: Number(card.opening_outstanding_paise || 0),
          openingOutstandingDate: card.opening_outstanding_date || "1970-01-01",
        };

        const cardLinkedEmis = debts
          .filter((d) => d.linked_credit_card_id === card.id)
          .map((d) => ({
            id: d.id,
            name: d.name,
            emiAmountPaise: d.emi_amount_paise,
            firstEmiDueDate: d.first_emi_due_date,
            nextDueDate: d.next_due_date,
            totalTenureMonths: d.total_tenure_months,
            installmentsPaidBeforeTracking: d.installments_paid_before_tracking,
          }));

        const emiPaymentItems = debtPayments.map((p) => ({
          debtId: p.debt_id,
          paymentDate: p.payment_date,
          amountPaise: p.amount_paise,
          paymentMethod: p.payment_method || "bank_debit",
        }));

        const calcResult = calculateCycleStatementAmount({
          card: cardBillingConfig,
          statementDate: cycleDates.currentStatementDate,
          previousStatementDate: cycleDates.previousStatementDate,
          transactions: allTransactions,
          cardLinkedEmis,
          emiPayments: emiPaymentItems,
        });

        // Any payments recorded after currentStatementDate reduce remaining payable
        const paymentsAfterCutoff = cardPaymentTransactions.filter(
          (p) => p.creditCardId === card.id && p.date > cycleDates.currentStatementDate
        );
        const paidAfterCutoffPaise = paymentsAfterCutoff.reduce(
          (sum, p) => sum + Number(p.amountPaise),
          0
        );

        const remainingPaise = Math.max(0, calcResult.statementBalancePaise - paidAfterCutoffPaise);
        const isPaid = remainingPaise === 0 && calcResult.statementBalancePaise > 0;
        const isPartiallyPaid = paidAfterCutoffPaise > 0 && remainingPaise > 0;

        if (calcResult.statementBalancePaise > 0 || remainingPaise > 0) {
          const dueStatus = getPaymentDueStatus(calcResult.paymentDueDate, today, isPaid);

          items.push({
            id: `auto-stmt-${card.id}-${cycleDates.currentStatementDate}`,
            kind: "credit_card_statement",
            statementId: null,
            creditCardId: card.id,
            title: cardLabel,
            subtitle: "Auto-Calculated Statement",
            dueDate: calcResult.paymentDueDate,
            statementDate: calcResult.statementDate,
            dueStatus,
            amountPaise: remainingPaise,
            statementBalancePaise: calcResult.statementBalancePaise,
            minimumDuePaise: calcResult.minimumDuePaise,
            paidPaise: paidAfterCutoffPaise,
            remainingPaise,
            isPartiallyPaid,
            isPaid,
            isAutoCalculated: true,
            notes: "Computed automatically from cycle purchases, billed EMIs, and cutoff payments.",
          });
        } else if (card.payment_due_day) {
          // If no transactions were posted, show statement pending reminder with configured due day
          const calculatedDueDate = calculateNextDueDateFromDay(
            card.payment_due_day,
            today
          );
          const dueStatus = getPaymentDueStatus(calculatedDueDate, today, false);

          items.push({
            id: `card-reminder-${card.id}`,
            kind: "credit_card_reminder",
            creditCardId: card.id,
            paymentDueDay: card.payment_due_day,
            statementDay: card.statement_day,
            title: cardLabel,
            subtitle: "Statement Pending",
            dueDate: calculatedDueDate,
            dueStatus,
            amountPaise: 0,
            isPaid: false,
          });
        }
      } else {
        // Current cycle still in progress: calculate current cycle estimate
        const estimate = calculateCurrentCycleEstimate(
          card.id,
          cycleDates.previousStatementDate,
          allTransactions
        );

        const calculatedDueDate = calculateNextDueDateFromDay(
          card.payment_due_day || 20,
          today
        );
        const dueStatus = getPaymentDueStatus(calculatedDueDate, today, false);

        items.push({
          id: `card-reminder-${card.id}`,
          kind: "credit_card_reminder",
          creditCardId: card.id,
          paymentDueDay: card.payment_due_day,
          statementDay: card.statement_day,
          title: cardLabel,
          subtitle: estimate.estimatedNextStatementPaise > 0 ? "Current Cycle (Estimated)" : "Statement Pending",
          dueDate: calculatedDueDate,
          dueStatus,
          amountPaise: estimate.estimatedNextStatementPaise,
          estimatedNextStatementPaise: estimate.estimatedNextStatementPaise,
          isPaid: false,
        });
      }
    } else if (card.payment_due_day) {
      // No statement recorded and no statement day, but card has a configured payment due day
      const calculatedDueDate = calculateNextDueDateFromDay(
        card.payment_due_day,
        today
      );
      const dueStatus = getPaymentDueStatus(calculatedDueDate, today, false);

      items.push({
        id: `card-reminder-${card.id}`,
        kind: "credit_card_reminder",
        creditCardId: card.id,
        paymentDueDay: card.payment_due_day,
        statementDay: null,
        title: cardLabel,
        subtitle: "Statement Pending",
        dueDate: calculatedDueDate,
        dueStatus,
        amountPaise: 0,
        isPaid: false,
      });
    }
  }

  // 2. Process Standalone Loans (filter out credit card EMIs)
  const standaloneLoans = debts.filter(
    (d) =>
      d.status === "active" &&
      d.debt_type !== "credit_card_emi" &&
      !d.linked_credit_card_id
  );

  for (const loan of standaloneLoans) {
    const loanPayments = debtPayments.filter((p) => p.debt_id === loan.id);
    let amountPaise = Number(loan.emi_amount_paise);
    let dueDate = loan.next_due_date || today;
    let nextInstallmentNumber: number | null =
      loan.installments_paid_before_tracking +
      loanPayments.filter((p) => p.payment_kind === "scheduled_emi").length +
      1;

    let expectedPrincipalPaise: number | undefined;
    let expectedInterestPaise: number | undefined;

    if (isLoanEligibleForAmortization(loan)) {
      const schedule = generateAmortizationSchedule({
        principalPaise: Number(loan.original_principal_paise),
        annualInterestRateBasisPoints: Number(
          loan.annual_interest_rate_basis_points
        ),
        totalTenureMonths: loan.total_tenure_months,
        firstEmiDate: loan.first_emi_due_date,
        emiAmountPaise: Number(loan.emi_amount_paise),
        installmentsPaidBeforeTracking: loan.installments_paid_before_tracking,
        actualPayments: loanPayments.map((p) => ({
          date: p.payment_date,
          installmentNumber: p.installment_number,
          amountPaise: Number(p.amount_paise),
          principalComponentPaise:
            p.principal_component_paise != null
              ? Number(p.principal_component_paise)
              : null,
          interestComponentPaise:
            p.interest_component_paise != null
              ? Number(p.interest_component_paise)
              : null,
          paymentKind: p.payment_kind,
        })),
      });

      if (schedule.nextDueInstallment) {
        amountPaise = schedule.nextDueInstallment.emiAmountPaise;
        dueDate = schedule.nextDueInstallment.dueDate;
        nextInstallmentNumber = schedule.nextDueInstallment.installmentNumber;
        expectedPrincipalPaise = schedule.nextDueInstallment.principalPaise;
        expectedInterestPaise = schedule.nextDueInstallment.interestPaise;
      }
    }

    const dueStatus = getPaymentDueStatus(dueDate, today, false);
    const loanTypeFormatted = loan.debt_type
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());

    items.push({
      id: `loan-${loan.id}`,
      kind: "standalone_loan",
      debtId: loan.id,
      debtType: loan.debt_type,
      lenderName: loan.lender_name,
      nextInstallmentNumber,
      totalTenureMonths: loan.total_tenure_months,
      expectedPrincipalPaise,
      expectedInterestPaise,
      title: loan.name,
      subtitle: loan.lender_name ? `${loanTypeFormatted} · ${loan.lender_name}` : loanTypeFormatted,
      dueDate,
      dueStatus,
      amountPaise,
      isPaid: false,
    });
  }

  // 3. Process Recurring Transaction Items (if provided)
  if (recurringItems && recurringItems.length > 0) {
    for (const recItem of recurringItems) {
      items.push(recItem);
    }
  }

  // Sort comparator:
  // 1. Overdue payments first (earliest due date first)
  // 2. Due today
  // 3. Due soon
  // 4. Upcoming
  // 5. Secondary sort: dueDate ascending, then title
  const statusRank: Record<DueStatus, number> = {
    overdue: 0,
    due_today: 1,
    due_soon: 2,
    upcoming: 3,
    paid: 4,
  };

  const sortedItems = items.sort((a, b) => {
    const rankDiff = statusRank[a.dueStatus.status] - statusRank[b.dueStatus.status];
    if (rankDiff !== 0) return rankDiff;

    const dateDiff = a.dueDate.localeCompare(b.dueDate);
    if (dateDiff !== 0) return dateDiff;

    return a.title.localeCompare(b.title);
  });

  const activePayments = sortedItems.filter((i) => !i.isPaid);
  const settledPayments = sortedItems.filter((i) => i.isPaid);

  return {
    activePayments,
    settledPayments,
  };
}
