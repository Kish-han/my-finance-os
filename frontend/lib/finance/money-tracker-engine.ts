import type {
  FinancialAccount,
  MoneyTrackerMetrics,
  Person,
  PersonSummary,
  PersonalMoneyRecord,
  PersonalMoneyRepayment,
  RecordBalance,
} from "./types";

/**
 * Calculates days between two YYYY-MM-DD strings.
 */
export function getDaysBetween(startDate: string, endDate: string): number {
  const d1 = new Date(startDate + "T00:00:00Z");
  const d2 = new Date(endDate + "T00:00:00Z");
  const diffTime = d2.getTime() - d1.getTime();
  return Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));
}

/**
 * Computes the financial balances of a personal money record given its repayment history.
 * Strictly no interest calculations: Outstanding = Amount - Total Repaid.
 */
export function calculateRecordBalance(
  record: PersonalMoneyRecord,
  repayments: PersonalMoneyRepayment[] = []
): RecordBalance {
  // Filter repayments for this record
  const recordRepayments = repayments.filter(
    (p) => p.recordId === record.id
  );

  const totalRepaidPaise = recordRepayments.reduce(
    (sum, p) => sum + (p.amountPaise || 0),
    0
  );

  const outstandingPaise = Math.max(
    0,
    record.amountPaise - totalRepaidPaise
  );

  const isSettled =
    record.status === "settled" || outstandingPaise === 0;

  const progressPercent =
    record.amountPaise > 0
      ? Math.min(
          100,
          Math.max(
            0,
            Math.round((totalRepaidPaise / record.amountPaise) * 100)
          )
        )
      : 100;

  return {
    originalAmountPaise: record.amountPaise,
    totalRepaidPaise,
    outstandingPaise: isSettled ? 0 : outstandingPaise,
    isSettled,
    progressPercent,
  };
}

/**
 * Computes separate Given and Taken balances for a single person.
 * IMPORTANT: Given and Taken records involving the same person must remain strictly separate.
 * They are NEVER automatically offset.
 */
export function calculatePersonSummary(
  person: Person,
  records: PersonalMoneyRecord[],
  repayments: PersonalMoneyRepayment[] = []
): PersonSummary {
  const personRecords = records.filter((r) => r.personId === person.id);

  let totalGivenPaise = 0;
  let totalGivenRecoveredPaise = 0;
  let outstandingReceivablePaise = 0;

  let totalTakenPaise = 0;
  let totalTakenRepaidPaise = 0;
  let outstandingPayablePaise = 0;

  let activeGivenCount = 0;
  let activeTakenCount = 0;
  let settledCount = 0;

  for (const record of personRecords) {
    const bal = calculateRecordBalance(record, repayments);

    if (bal.isSettled) {
      settledCount++;
    }

    if (record.direction === "given") {
      totalGivenPaise += record.amountPaise;
      totalGivenRecoveredPaise += bal.totalRepaidPaise;
      outstandingReceivablePaise += bal.outstandingPaise;
      if (!bal.isSettled) {
        activeGivenCount++;
      }
    } else {
      totalTakenPaise += record.amountPaise;
      totalTakenRepaidPaise += bal.totalRepaidPaise;
      outstandingPayablePaise += bal.outstandingPaise;
      if (!bal.isSettled) {
        activeTakenCount++;
      }
    }
  }

  return {
    person,
    totalGivenPaise,
    totalGivenRecoveredPaise,
    outstandingReceivablePaise,
    totalTakenPaise,
    totalTakenRepaidPaise,
    outstandingPayablePaise,
    activeGivenCount,
    activeTakenCount,
    settledCount,
  };
}

/**
 * Computes person summaries across a list of people.
 */
export function calculatePersonSummaries(
  people: Person[],
  records: PersonalMoneyRecord[],
  repayments: PersonalMoneyRepayment[] = []
): PersonSummary[] {
  return people.map((person) =>
    calculatePersonSummary(person, records, repayments)
  );
}

/**
 * Computes aggregate portfolio metrics across all personal money records.
 */
export function calculateOverallMetrics(
  records: PersonalMoneyRecord[],
  repayments: PersonalMoneyRepayment[] = []
): MoneyTrackerMetrics {
  let totalGivenPaise = 0;
  let totalReceivedBackPaise = 0;
  let outstandingReceivablesPaise = 0;

  let totalBorrowedPaise = 0;
  let totalRepaidPaise = 0;
  let outstandingPayablesPaise = 0;

  let activeGivenCount = 0;
  let activeTakenCount = 0;
  let settledCount = 0;

  for (const record of records) {
    const bal = calculateRecordBalance(record, repayments);

    if (bal.isSettled) {
      settledCount++;
    }

    if (record.direction === "given") {
      totalGivenPaise += record.amountPaise;
      totalReceivedBackPaise += bal.totalRepaidPaise;
      outstandingReceivablesPaise += bal.outstandingPaise;
      if (!bal.isSettled) {
        activeGivenCount++;
      }
    } else {
      totalBorrowedPaise += record.amountPaise;
      totalRepaidPaise += bal.totalRepaidPaise;
      outstandingPayablesPaise += bal.outstandingPaise;
      if (!bal.isSettled) {
        activeTakenCount++;
      }
    }
  }

  return {
    totalGivenPaise,
    totalReceivedBackPaise,
    outstandingReceivablesPaise,
    totalBorrowedPaise,
    totalRepaidPaise,
    outstandingPayablesPaise,
    activeGivenCount,
    activeTakenCount,
    settledCount,
  };
}

/**
 * Validation result object
 */
export interface ValidationResult {
  isValid: boolean;
  errorCode?: string;
  errorMessage?: string;
}

/**
 * Validates new money record input before submission.
 */
export function validateRecordInput(params: {
  personName: string;
  direction: "given" | "taken";
  amountPaise: number;
  recordDate: string;
  dueDate?: string | null;
  account: FinancialAccount;
  accountBalancePaise?: number;
  allowOverdraft?: boolean;
}): ValidationResult {
  if (!params.personName || params.personName.trim().length === 0) {
    return {
      isValid: false,
      errorCode: "INVALID_PERSON",
      errorMessage: "Person name is required",
    };
  }

  if (params.direction !== "given" && params.direction !== "taken") {
    return {
      isValid: false,
      errorCode: "INVALID_DIRECTION",
      errorMessage: "Direction must be either 'given' or 'taken'",
    };
  }

  if (
    !params.amountPaise ||
    !Number.isInteger(params.amountPaise) ||
    params.amountPaise <= 0
  ) {
    return {
      isValid: false,
      errorCode: "INVALID_AMOUNT",
      errorMessage: "Amount must be a positive integer in paise",
    };
  }

  if (!params.recordDate || !/^\d{4}-\d{2}-\d{2}$/.test(params.recordDate)) {
    return {
      isValid: false,
      errorCode: "INVALID_DATE",
      errorMessage: "Record date must be in YYYY-MM-DD format",
    };
  }

  if (params.recordDate < params.account.openingBalanceDate) {
    return {
      isValid: false,
      errorCode: "DATE_PRECEDES_OPENING",
      errorMessage: `Record date cannot precede account opening date (${params.account.openingBalanceDate})`,
    };
  }

  if (
    params.dueDate &&
    params.dueDate < params.recordDate
  ) {
    return {
      isValid: false,
      errorCode: "INVALID_DUE_DATE",
      errorMessage: "Expected return date cannot precede record date",
    };
  }

  // When giving money (given), account balance must cover amount unless overdraft allowed
  if (
    params.direction === "given" &&
    !params.allowOverdraft &&
    params.accountBalancePaise !== undefined &&
    params.accountBalancePaise < params.amountPaise
  ) {
    return {
      isValid: false,
      errorCode: "INSUFFICIENT_FUNDS",
      errorMessage: "Insufficient funds in the selected account",
    };
  }

  return { isValid: true };
}

/**
 * Validates repayment entry against money record outstanding balance and account funds.
 */
export function validateRepaymentInput(params: {
  record: PersonalMoneyRecord;
  existingRepayments: PersonalMoneyRepayment[];
  paymentAmountPaise: number;
  repaymentDate: string;
  account: FinancialAccount;
  accountBalancePaise?: number;
  allowOverdraft?: boolean;
}): ValidationResult {
  if (
    !params.paymentAmountPaise ||
    !Number.isInteger(params.paymentAmountPaise) ||
    params.paymentAmountPaise <= 0
  ) {
    return {
      isValid: false,
      errorCode: "INVALID_PAYMENT_AMOUNT",
      errorMessage: "Repayment amount must be a positive integer in paise",
    };
  }

  const currentBalance = calculateRecordBalance(
    params.record,
    params.existingRepayments
  );

  if (params.record.status === "settled" || currentBalance.isSettled) {
    return {
      isValid: false,
      errorCode: "RECORD_ALREADY_SETTLED",
      errorMessage: "This record is already fully settled",
    };
  }

  if (params.paymentAmountPaise > currentBalance.outstandingPaise) {
    return {
      isValid: false,
      errorCode: "OVERPAYMENT_NOT_ALLOWED",
      errorMessage: `Repayment amount (${params.paymentAmountPaise} paise) exceeds remaining outstanding balance (${currentBalance.outstandingPaise} paise)`,
    };
  }

  if (!params.repaymentDate || !/^\d{4}-\d{2}-\d{2}$/.test(params.repaymentDate)) {
    return {
      isValid: false,
      errorCode: "INVALID_DATE",
      errorMessage: "Repayment date must be in YYYY-MM-DD format",
    };
  }

  if (params.repaymentDate < params.record.recordDate) {
    return {
      isValid: false,
      errorCode: "PAYMENT_PRECEDES_RECORD",
      errorMessage: "Repayment date cannot precede the original record date",
    };
  }

  if (params.repaymentDate < params.account.openingBalanceDate) {
    return {
      isValid: false,
      errorCode: "DATE_PRECEDES_OPENING",
      errorMessage: `Repayment date cannot precede account opening date (${params.account.openingBalanceDate})`,
    };
  }

  // When repaying borrowed money (taken), user is paying out; account balance must cover payment unless overdraft allowed
  if (
    params.record.direction === "taken" &&
    !params.allowOverdraft &&
    params.accountBalancePaise !== undefined &&
    params.accountBalancePaise < params.paymentAmountPaise
  ) {
    return {
      isValid: false,
      errorCode: "INSUFFICIENT_FUNDS",
      errorMessage: "Insufficient funds in the selected repayment account",
    };
  }

  return { isValid: true };
}

// Compatibility aliases
export const calculateAgreementBalance = calculateRecordBalance;
export const calculateOverallMoneyTrackerMetrics = calculateOverallMetrics;
export const calculatePersonBalances = calculatePersonSummary;
export const validateAgreementInput = (params: {
  personName: string;
  direction: "given" | "taken";
  principalPaise: number;
  agreementDate: string;
  expectedDate?: string | null;
  account: FinancialAccount;
  accountBalancePaise?: number;
  allowOverdraft?: boolean;
}) =>
  validateRecordInput({
    personName: params.personName,
    direction: params.direction,
    amountPaise: params.principalPaise,
    recordDate: params.agreementDate,
    dueDate: params.expectedDate,
    account: params.account,
    accountBalancePaise: params.accountBalancePaise,
    allowOverdraft: params.allowOverdraft,
  });
