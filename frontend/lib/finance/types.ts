
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

    // Optional link to the underlying card_purchase transaction (prevents double counting)
    linkedTransactionId?: string | null;

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
// MONEY TRACKER: Simple Personal Money Records & Repayments (No Interest)
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

export type MoneyRecordDirection = "given" | "taken";
export type MoneyRecordStatus = "active" | "settled";

export interface PersonalMoneyRecord {
    id: string;
    userId?: string;
    personId: string;
    direction: MoneyRecordDirection;
    amountPaise: number;
    recordDate: string; // YYYY-MM-DD
    dueDate?: string | null; // YYYY-MM-DD
    accountId: string;
    linkedTransactionId?: string | null;
    status: MoneyRecordStatus;
    notes?: string | null;
    createdAt?: string;
    updatedAt?: string;

    // Joined relations for UI
    person?: Person;
    account?: FinancialAccount;
}

export interface PersonalMoneyRepayment {
    id: string;
    userId?: string;
    recordId: string;
    amountPaise: number;
    repaymentDate: string; // YYYY-MM-DD
    accountId: string;
    linkedTransactionId?: string | null;
    notes?: string | null;
    createdAt?: string;

    // Joined relations for UI
    account?: FinancialAccount;
}

export interface RecordBalance {
    originalAmountPaise: number;
    totalRepaidPaise: number;
    outstandingPaise: number;
    isSettled: boolean;
    progressPercent: number;
}

export interface PersonSummary {
    person: Person;
    totalGivenPaise: number;
    totalGivenRecoveredPaise: number;
    outstandingReceivablePaise: number;
    totalTakenPaise: number;
    totalTakenRepaidPaise: number;
    outstandingPayablePaise: number;
    activeGivenCount: number;
    activeTakenCount: number;
    settledCount: number;
}

export interface MoneyTrackerMetrics {
    totalGivenPaise: number;
    totalReceivedBackPaise: number;
    outstandingReceivablesPaise: number;
    totalBorrowedPaise: number;
    totalRepaidPaise: number;
    outstandingPayablesPaise: number;
    activeGivenCount: number;
    activeTakenCount: number;
    settledCount: number;
}

// Aliases for compatibility with any existing imports during migration
export type PersonalLoanDirection = MoneyRecordDirection;
export type PersonalLoanStatus = MoneyRecordStatus;
export type PersonalLoanAgreement = PersonalMoneyRecord;
export type PersonalLoanPayment = PersonalMoneyRepayment;
export type AgreementBalance = RecordBalance;
export type PersonBalanceSummary = PersonSummary;
