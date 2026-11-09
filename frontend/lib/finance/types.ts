
export type AccountType = "bank" | "cash";

export interface FinancialAccount {
    id: string;
    name: string;
    type: AccountType;
    institution?: string;
    openingBalancePaise: number;
    openingBalanceDate: string;
    isArchived: boolean;
}

export interface CreditCard {
    id: string;
    name: string;
    bankName: string;
    lastFourDigits?: string;
    creditLimitPaise: number;
    openingOutstandingPaise: number;
    openingOutstandingDate: string;
    statementDay?: number;
    paymentDueDay?: number;
    isArchived: boolean;
}

export type CategoryType = "income" | "expense";

export interface Category {
    id: string;
    name: string;
    type: CategoryType;
    isArchived: boolean;
}

export interface TransactionBase {
    id: string;
    date: string;
    description: string;
    amountPaise: number;
    notes?: string;
}

export type Transaction =
    | (TransactionBase & {
        type: "income";
        accountId: string;
        categoryId: string;
    })
    | (TransactionBase & {
        type: "expense";
        accountId: string;
        categoryId: string;
    })
    | (TransactionBase & {
        type: "transfer";
        fromAccountId: string;
        toAccountId: string;
    })
    | (TransactionBase & {
        type: "card_purchase";
        creditCardId: string;
        categoryId: string;
    })
    | (TransactionBase & {
        type: "card_payment";
        fromAccountId: string;
        creditCardId: string;
    })
    | (TransactionBase & {
        type: "money_lent";
        accountId: string;
        personId?: string;
        agreementId?: string;
    })
    | (TransactionBase & {
        type: "repayment_received";
        accountId: string;
        personId?: string;
        agreementId?: string;
    })
    | (TransactionBase & {
        type: "money_borrowed";
        accountId: string;
        personId?: string;
        agreementId?: string;
    })
    | (TransactionBase & {
        type: "repayment_paid";
        accountId: string;
        personId?: string;
        agreementId?: string;
    });


export type DebtType =
    | "personal_loan"
    | "vehicle_loan"
    | "credit_card_emi"
    | "consumer_durable_emi"
    | "external_loan"
    | "other";

export type InterestMethod =
    | "reducing_balance"
    | "flat_rate"
    | "unknown";

export type DebtStatus =
    | "active"
    | "foreclosed"
    | "closed";

export interface EmiDebt {
    id: string;
    name: string;
    debtType: DebtType;
    lenderName: string;

    // Link card-based EMIs to the associated credit card.
    linkedCreditCardId?: string;

    // Optional account normally used to repay the EMI.
    paymentAccountId?: string;

    originalPrincipalPaise: number;
    currentOutstandingPrincipalPaise: number;
    outstandingAsOfDate: string;

    // Example: 14.5% annual interest = 1450 basis points.
    annualInterestRateBasisPoints?: number;
    interestMethod: InterestMethod;

    totalTenureMonths: number;
    installmentsPaidBeforeTracking: number;
    emiAmountPaise: number;

    firstEmiDueDate: string;
    nextDueDate?: string;

    status: DebtStatus;
    additionalChargesPaise?: number;
    chargeDescription?: string | null;
    notes?: string;
}

export type DebtPaymentMethod =
    | "bank_debit"
    | "billed_to_credit_card"
    | "manual_external"
    | "foreclosure";

export interface EmiPaymentRecord {
    paymentKind:
    | "scheduled_emi"
    | "extra_principal"
    | "fee_only"
    | "foreclosure_settlement";

    id: string;
    debtId: string;
    date: string;
    installmentNumber?: number;

    // Total amount paid or billed for this instalment.
    amountPaise: number;

    principalComponentPaise?: number;
    interestComponentPaise?: number;
    chargesPaise?: number;

    paymentMethod: DebtPaymentMethod;
    paymentAccountId?: string;
    billedToCreditCardId?: string;

    notes?: string;
}

export type ForeclosureQuoteSource =
    | "lender_quote"
    | "estimate";

export interface ForeclosureQuote {
    id: string;
    debtId: string;

    quoteDate: string;
    validUntil?: string;

    outstandingPrincipalPaise: number;
    foreclosureChargesPaise: number;
    taxPaise: number;
    otherChargesPaise: number;
    waiversPaise: number;

    totalPayoffPaise: number;
    source: ForeclosureQuoteSource;
    notes?: string;
}

// ============================================================================
// MONEY TRACKER: Personal Lending & Borrowing Types
// ============================================================================

export interface Person {
    id: string;
    userId?: string;
    name: string;
    phone?: string | null;
    notes?: string | null;
    createdAt?: string;
    updatedAt?: string;
}

export type PersonalLoanDirection = "given" | "taken";

export type PersonalLoanInterestType = "none" | "fixed_amount" | "simple_annual";

export type PersonalLoanStatus = "active" | "settled";

export interface PersonalLoanAgreement {
    id: string;
    userId?: string;
    personId: string;
    direction: PersonalLoanDirection;
    principalPaise: number;
    interestType: PersonalLoanInterestType;
    interestRateAnnualBasisPoints?: number;
    agreedInterestPaise?: number;
    agreementDate: string; // YYYY-MM-DD
    expectedRepaymentDate?: string | null; // YYYY-MM-DD
    accountId: string;
    linkedTransactionId?: string | null;
    status: PersonalLoanStatus;
    notes?: string | null;
    createdAt?: string;
    updatedAt?: string;

    // Joined relations for UI
    person?: Person;
    account?: FinancialAccount;
}

export interface PersonalLoanPayment {
    id: string;
    userId?: string;
    personalLoanId: string;
    paymentAmountPaise: number;
    principalComponentPaise: number;
    interestComponentPaise: number;
    paymentDate: string; // YYYY-MM-DD
    accountId: string;
    linkedTransactionId?: string | null;
    notes?: string | null;
    createdAt?: string;

    // Joined relations for UI
    account?: FinancialAccount;
}

export interface AgreementBalance {
    totalExpectedPaise: number;
    totalInterestPaise: number;
    totalPrincipalRepaidPaise: number;
    totalInterestRepaidPaise: number;
    totalRepaidPaise: number;
    remainingPrincipalPaise: number;
    remainingInterestPaise: number;
    totalOutstandingPaise: number;
    isSettled: boolean;
    progressPercent: number;
}

export interface PersonBalanceSummary {
    person: Person;
    totalGivenPaise: number;
    totalGivenRecoveredPaise: number;
    outstandingReceivablePaise: number;
    totalTakenPaise: number;
    totalTakenRepaidPaise: number;
    outstandingPayablePaise: number;
    netPositionPaise: number; // positive = they owe user; negative = user owes them
    activeAgreementsCount: number;
    settledAgreementsCount: number;
}

export interface MoneyTrackerMetrics {
    totalGivenPaise: number;
    totalReceivedBackPaise: number;
    outstandingReceivablesPaise: number;
    totalBorrowedPaise: number;
    totalRepaidPaise: number;
    outstandingPayablesPaise: number;
    netPositionPaise: number; // outstandingReceivablesPaise - outstandingPayablesPaise
    activeGivenCount: number;
    activeTakenCount: number;
    settledCount: number;
}
