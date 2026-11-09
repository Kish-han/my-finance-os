import type {
  AgreementBalance,
  FinancialAccount,
  MoneyTrackerMetrics,
  Person,
  PersonBalanceSummary,
  PersonalLoanAgreement,
  PersonalLoanPayment,
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
 * Calculates simple interest in paise for a given principal, annual basis points, and duration in days.
 * 1 basis point = 0.01% = 0.0001
 * Interest = (Principal * BPS * Days) / (10000 * 365)
 */
export function calculateSimpleInterestPaise(
  principalPaise: number,
  annualInterestRateBasisPoints: number,
  days: number
): number {
  if (principalPaise <= 0 || annualInterestRateBasisPoints <= 0 || days <= 0) {
    return 0;
  }
  const interest =
    (BigInt(principalPaise) *
      BigInt(annualInterestRateBasisPoints) *
      BigInt(days)) /
    (BigInt(10000) * BigInt(365));
  return Number(interest);
}

/**
 * Computes the financial balances of an agreement given its payment history.
 */
export function calculateAgreementBalance(
  agreement: PersonalLoanAgreement,
  payments: PersonalLoanPayment[] = []
): AgreementBalance {
  // Filter payments for this agreement
  const agreementPayments = payments.filter(
    (p) => p.personalLoanId === agreement.id
  );

  let totalInterestPaise = 0;
  if (agreement.interestType === "fixed_amount") {
    totalInterestPaise = Math.max(0, agreement.agreedInterestPaise ?? 0);
  } else if (agreement.interestType === "simple_annual") {
    if (agreement.agreedInterestPaise && agreement.agreedInterestPaise > 0) {
      totalInterestPaise = agreement.agreedInterestPaise;
    } else if (
      agreement.interestRateAnnualBasisPoints &&
      agreement.interestRateAnnualBasisPoints > 0
    ) {
      const targetEndDate =
        agreement.expectedRepaymentDate ??
        agreement.agreementDate;
      const days = getDaysBetween(agreement.agreementDate, targetEndDate);
      totalInterestPaise = calculateSimpleInterestPaise(
        agreement.principalPaise,
        agreement.interestRateAnnualBasisPoints,
        days
      );
    }
  }

  const totalExpectedPaise = agreement.principalPaise + totalInterestPaise;

  const totalPrincipalRepaidPaise = agreementPayments.reduce(
    (sum, p) => sum + (p.principalComponentPaise || 0),
    0
  );
  const totalInterestRepaidPaise = agreementPayments.reduce(
    (sum, p) => sum + (p.interestComponentPaise || 0),
    0
  );
  const totalRepaidPaise = agreementPayments.reduce(
    (sum, p) => sum + (p.paymentAmountPaise || 0),
    0
  );

  const remainingPrincipalPaise = Math.max(
    0,
    agreement.principalPaise - totalPrincipalRepaidPaise
  );
  const remainingInterestPaise = Math.max(
    0,
    totalInterestPaise - totalInterestRepaidPaise
  );
  const totalOutstandingPaise =
    remainingPrincipalPaise + remainingInterestPaise;

  const isSettled =
    agreement.status === "settled" ||
    (remainingPrincipalPaise === 0 && remainingInterestPaise === 0);

  const progressPercent =
    totalExpectedPaise > 0
      ? Math.min(
          100,
          Math.max(
            0,
            Math.round((totalRepaidPaise / totalExpectedPaise) * 100)
          )
        )
      : 100;

  return {
    totalExpectedPaise,
    totalInterestPaise,
    totalPrincipalRepaidPaise,
    totalInterestRepaidPaise,
    totalRepaidPaise,
    remainingPrincipalPaise,
    remainingInterestPaise,
    totalOutstandingPaise: isSettled ? 0 : totalOutstandingPaise,
    isSettled,
    progressPercent,
  };
}

/**
 * Computes balance summary for a single person across all their agreements.
 */
export function calculatePersonBalances(
  person: Person,
  agreements: PersonalLoanAgreement[],
  payments: PersonalLoanPayment[] = []
): PersonBalanceSummary {
  const personAgreements = agreements.filter((a) => a.personId === person.id);

  let totalGivenPaise = 0;
  let totalGivenRecoveredPaise = 0;
  let outstandingReceivablePaise = 0;

  let totalTakenPaise = 0;
  let totalTakenRepaidPaise = 0;
  let outstandingPayablePaise = 0;

  let activeAgreementsCount = 0;
  let settledAgreementsCount = 0;

  for (const agreement of personAgreements) {
    const bal = calculateAgreementBalance(agreement, payments);
    if (bal.isSettled) {
      settledAgreementsCount++;
    } else {
      activeAgreementsCount++;
    }

    if (agreement.direction === "given") {
      totalGivenPaise += agreement.principalPaise;
      totalGivenRecoveredPaise += bal.totalRepaidPaise;
      outstandingReceivablePaise += bal.totalOutstandingPaise;
    } else {
      totalTakenPaise += agreement.principalPaise;
      totalTakenRepaidPaise += bal.totalRepaidPaise;
      outstandingPayablePaise += bal.totalOutstandingPaise;
    }
  }

  const netPositionPaise = outstandingReceivablePaise - outstandingPayablePaise;

  return {
    person,
    totalGivenPaise,
    totalGivenRecoveredPaise,
    outstandingReceivablePaise,
    totalTakenPaise,
    totalTakenRepaidPaise,
    outstandingPayablePaise,
    netPositionPaise,
    activeAgreementsCount,
    settledAgreementsCount,
  };
}

/**
 * Computes aggregate portfolio metrics across all agreements and payments.
 */
export function calculateOverallMoneyTrackerMetrics(
  agreements: PersonalLoanAgreement[],
  payments: PersonalLoanPayment[] = []
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

  for (const agreement of agreements) {
    const bal = calculateAgreementBalance(agreement, payments);

    if (bal.isSettled) {
      settledCount++;
    }

    if (agreement.direction === "given") {
      totalGivenPaise += agreement.principalPaise;
      totalReceivedBackPaise += bal.totalRepaidPaise;
      outstandingReceivablesPaise += bal.totalOutstandingPaise;
      if (!bal.isSettled) {
        activeGivenCount++;
      }
    } else {
      totalBorrowedPaise += agreement.principalPaise;
      totalRepaidPaise += bal.totalRepaidPaise;
      outstandingPayablesPaise += bal.totalOutstandingPaise;
      if (!bal.isSettled) {
        activeTakenCount++;
      }
    }
  }

  const netPositionPaise =
    outstandingReceivablesPaise - outstandingPayablesPaise;

  return {
    totalGivenPaise,
    totalReceivedBackPaise,
    outstandingReceivablesPaise,
    totalBorrowedPaise,
    totalRepaidPaise,
    outstandingPayablesPaise,
    netPositionPaise,
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
 * Validates new agreement inputs before submission.
 */
export function validateAgreementInput(params: {
  personName: string;
  direction: "given" | "taken";
  principalPaise: number;
  agreementDate: string;
  expectedDate?: string | null;
  account: FinancialAccount;
  accountBalancePaise?: number;
  interestType?: "none" | "fixed_amount" | "simple_annual";
  interestRateAnnualBasisPoints?: number;
  agreedInterestPaise?: number;
  allowOverdraft?: boolean;
}): ValidationResult {
  if (!params.personName || params.personName.trim().length === 0) {
    return {
      isValid: false,
      errorCode: "INVALID_PERSON",
      errorMessage: "Person name is required",
    };
  }

  if (
    !params.principalPaise ||
    !Number.isInteger(params.principalPaise) ||
    params.principalPaise <= 0
  ) {
    return {
      isValid: false,
      errorCode: "INVALID_PRINCIPAL",
      errorMessage: "Principal amount must be a positive integer in paise",
    };
  }

  if (!params.agreementDate || !/^\d{4}-\d{2}-\d{2}$/.test(params.agreementDate)) {
    return {
      isValid: false,
      errorCode: "INVALID_DATE",
      errorMessage: "Agreement date must be in YYYY-MM-DD format",
    };
  }

  if (params.agreementDate < params.account.openingBalanceDate) {
    return {
      isValid: false,
      errorCode: "DATE_PRECEDES_OPENING",
      errorMessage: `Agreement date cannot precede account opening date (${params.account.openingBalanceDate})`,
    };
  }

  if (
    params.expectedDate &&
    params.expectedDate < params.agreementDate
  ) {
    return {
      isValid: false,
      errorCode: "INVALID_DUE_DATE",
      errorMessage: "Expected repayment date cannot be earlier than agreement date",
    };
  }

  // When lending money (given), account balance must cover principal unless overdraft allowed
  if (
    params.direction === "given" &&
    !params.allowOverdraft &&
    params.accountBalancePaise !== undefined &&
    params.accountBalancePaise < params.principalPaise
  ) {
    return {
      isValid: false,
      errorCode: "INSUFFICIENT_FUNDS",
      errorMessage: "Insufficient funds in the selected account",
    };
  }

  if (
    params.interestType === "simple_annual" &&
    (params.interestRateAnnualBasisPoints === undefined ||
      params.interestRateAnnualBasisPoints < 0)
  ) {
    return {
      isValid: false,
      errorCode: "INVALID_INTEREST_RATE",
      errorMessage: "Annual interest rate must be non-negative",
    };
  }

  if (
    params.interestType === "fixed_amount" &&
    (params.agreedInterestPaise === undefined ||
      params.agreedInterestPaise < 0)
  ) {
    return {
      isValid: false,
      errorCode: "INVALID_INTEREST_AMOUNT",
      errorMessage: "Fixed interest amount must be non-negative",
    };
  }

  return { isValid: true };
}

/**
 * Validates repayment entry against agreement outstanding balance and account funds.
 */
export function validateRepaymentInput(params: {
  agreement: PersonalLoanAgreement;
  existingPayments: PersonalLoanPayment[];
  paymentAmountPaise: number;
  principalComponentPaise: number;
  interestComponentPaise: number;
  paymentDate: string;
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
      errorMessage: "Payment amount must be a positive integer in paise",
    };
  }

  if (
    params.principalComponentPaise < 0 ||
    params.interestComponentPaise < 0
  ) {
    return {
      isValid: false,
      errorCode: "NEGATIVE_COMPONENTS",
      errorMessage: "Principal and interest components must be non-negative",
    };
  }

  if (
    params.principalComponentPaise + params.interestComponentPaise !==
    params.paymentAmountPaise
  ) {
    return {
      isValid: false,
      errorCode: "COMPONENT_MISMATCH",
      errorMessage: "Sum of principal and interest components must equal total payment amount",
    };
  }

  const currentBalance = calculateAgreementBalance(
    params.agreement,
    params.existingPayments
  );

  if (currentBalance.isSettled) {
    return {
      isValid: false,
      errorCode: "AGREEMENT_ALREADY_SETTLED",
      errorMessage: "This agreement is already fully settled",
    };
  }

  if (params.paymentAmountPaise > currentBalance.totalOutstandingPaise) {
    return {
      isValid: false,
      errorCode: "OVERPAYMENT_NOT_ALLOWED",
      errorMessage: `Payment amount (${params.paymentAmountPaise} paise) exceeds remaining outstanding balance (${currentBalance.totalOutstandingPaise} paise)`,
    };
  }

  if (
    params.principalComponentPaise > currentBalance.remainingPrincipalPaise
  ) {
    return {
      isValid: false,
      errorCode: "PRINCIPAL_OVERPAYMENT",
      errorMessage: `Principal component exceeds remaining principal (${currentBalance.remainingPrincipalPaise} paise)`,
    };
  }

  if (
    params.interestComponentPaise > currentBalance.remainingInterestPaise
  ) {
    return {
      isValid: false,
      errorCode: "INTEREST_OVERPAYMENT",
      errorMessage: `Interest component exceeds remaining interest (${currentBalance.remainingInterestPaise} paise)`,
    };
  }

  if (!params.paymentDate || !/^\d{4}-\d{2}-\d{2}$/.test(params.paymentDate)) {
    return {
      isValid: false,
      errorCode: "INVALID_DATE",
      errorMessage: "Payment date must be in YYYY-MM-DD format",
    };
  }

  if (params.paymentDate < params.agreement.agreementDate) {
    return {
      isValid: false,
      errorCode: "PAYMENT_PRECEDES_AGREEMENT",
      errorMessage: "Payment date cannot precede the agreement date",
    };
  }

  if (params.paymentDate < params.account.openingBalanceDate) {
    return {
      isValid: false,
      errorCode: "DATE_PRECEDES_OPENING",
      errorMessage: `Payment date cannot precede account opening date (${params.account.openingBalanceDate})`,
    };
  }

  // When repaying borrowed money (taken), account balance must cover payment unless overdraft allowed
  if (
    params.agreement.direction === "taken" &&
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
