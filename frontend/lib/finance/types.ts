
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
