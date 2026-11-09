import { describe, expect, it } from "vitest";
import {
  calculateAgreementBalance,
  calculateOverallMoneyTrackerMetrics,
  calculatePersonBalances,
  calculateSimpleInterestPaise,
  validateAgreementInput,
  validateRepaymentInput,
} from "./money-tracker-engine";
import { calculateAccountBalance, calculateNetWorth } from "./balances";
import { aggregatePeriodTotals, TransactionRecord } from "./date-ranges";
import type {
  FinancialAccount,
  Person,
  PersonalLoanAgreement,
  PersonalLoanPayment,
  Transaction,
} from "./types";

describe("Money Tracker Engine — Unit & Financial Accounting Tests", () => {
  const dummyAccount: FinancialAccount = {
    id: "acc-bank-1",
    name: "HDFC Salary",
    type: "bank",
    openingBalancePaise: 10000000, // ₹1,00,000.00
    openingBalanceDate: "2026-01-01",
    isArchived: false,
  };

  const dummyPerson: Person = {
    id: "person-1",
    name: "Alice Sharma",
    phone: "+91 9876543210",
  };

  // 1. Interest calculation
  it("computes simple interest accurately with integer paise precision", () => {
    // ₹1,00,000 at 12% p.a. for 365 days = ₹12,000 = 1200000 paise
    const interest = calculateSimpleInterestPaise(10000000, 1200, 365);
    expect(interest).toBe(1200000);

    // 0 days or 0 bps returns 0
    expect(calculateSimpleInterestPaise(10000000, 0, 365)).toBe(0);
    expect(calculateSimpleInterestPaise(10000000, 1200, 0)).toBe(0);
  });

  // 2. Money Given: Agreement & Balance Calculation
  it("computes outstanding balance for Money Given agreement without interest", () => {
    const loan: PersonalLoanAgreement = {
      id: "loan-1",
      personId: dummyPerson.id,
      direction: "given",
      principalPaise: 5000000, // ₹50,000
      interestType: "none",
      agreementDate: "2026-06-01",
      accountId: dummyAccount.id,
      status: "active",
    };

    const bal = calculateAgreementBalance(loan, []);
    expect(bal.totalExpectedPaise).toBe(5000000);
    expect(bal.remainingPrincipalPaise).toBe(5000000);
    expect(bal.totalOutstandingPaise).toBe(5000000);
    expect(bal.isSettled).toBe(false);
    expect(bal.progressPercent).toBe(0);
  });

  // 3. Money Taken: Agreement with Fixed Interest
  it("computes outstanding balance for Money Taken agreement with fixed interest", () => {
    const loan: PersonalLoanAgreement = {
      id: "loan-2",
      personId: dummyPerson.id,
      direction: "taken",
      principalPaise: 10000000, // ₹1,00,000
      interestType: "fixed_amount",
      agreedInterestPaise: 500000, // ₹5,000
      agreementDate: "2026-06-01",
      accountId: dummyAccount.id,
      status: "active",
    };

    const bal = calculateAgreementBalance(loan, []);
    expect(bal.totalExpectedPaise).toBe(10500000);
    expect(bal.remainingPrincipalPaise).toBe(10000000);
    expect(bal.remainingInterestPaise).toBe(500000);
    expect(bal.totalOutstandingPaise).toBe(10500000);
    expect(bal.isSettled).toBe(false);
  });

  // 4. Partial Repayments Accumulation
  it("tracks partial repayments and computes remaining balances accurately", () => {
    const loan: PersonalLoanAgreement = {
      id: "loan-1",
      personId: dummyPerson.id,
      direction: "given",
      principalPaise: 5000000, // ₹50,000
      interestType: "none",
      agreementDate: "2026-06-01",
      accountId: dummyAccount.id,
      status: "active",
    };

    const p1: PersonalLoanPayment = {
      id: "pay-1",
      personalLoanId: loan.id,
      paymentAmountPaise: 2000000,
      principalComponentPaise: 2000000,
      interestComponentPaise: 0,
      paymentDate: "2026-06-15",
      accountId: dummyAccount.id,
    };

    const bal1 = calculateAgreementBalance(loan, [p1]);
    expect(bal1.totalRepaidPaise).toBe(2000000);
    expect(bal1.remainingPrincipalPaise).toBe(3000000);
    expect(bal1.totalOutstandingPaise).toBe(3000000);
    expect(bal1.isSettled).toBe(false);
    expect(bal1.progressPercent).toBe(40);

    const p2: PersonalLoanPayment = {
      id: "pay-2",
      personalLoanId: loan.id,
      paymentAmountPaise: 1500000,
      principalComponentPaise: 1500000,
      interestComponentPaise: 0,
      paymentDate: "2026-06-20",
      accountId: dummyAccount.id,
    };

    const bal2 = calculateAgreementBalance(loan, [p1, p2]);
    expect(bal2.totalRepaidPaise).toBe(3500000);
    expect(bal2.remainingPrincipalPaise).toBe(1500000);
    expect(bal2.totalOutstandingPaise).toBe(1500000);
    expect(bal2.isSettled).toBe(false);
    expect(bal2.progressPercent).toBe(70);
  });

  // 5. Full Repayment and Auto Settlement
  it("transitions to settled when remaining balance is zero", () => {
    const loan: PersonalLoanAgreement = {
      id: "loan-1",
      personId: dummyPerson.id,
      direction: "given",
      principalPaise: 5000000,
      interestType: "none",
      agreementDate: "2026-06-01",
      accountId: dummyAccount.id,
      status: "active",
    };

    const p1: PersonalLoanPayment = {
      id: "pay-1",
      personalLoanId: loan.id,
      paymentAmountPaise: 5000000,
      principalComponentPaise: 5000000,
      interestComponentPaise: 0,
      paymentDate: "2026-06-15",
      accountId: dummyAccount.id,
    };

    const bal = calculateAgreementBalance(loan, [p1]);
    expect(bal.remainingPrincipalPaise).toBe(0);
    expect(bal.totalOutstandingPaise).toBe(0);
    expect(bal.isSettled).toBe(true);
    expect(bal.progressPercent).toBe(100);
  });

  // 6. Overpayment prevention in validateRepaymentInput
  it("rejects overpayment exceeding total outstanding or individual components", () => {
    const loan: PersonalLoanAgreement = {
      id: "loan-1",
      personId: dummyPerson.id,
      direction: "given",
      principalPaise: 5000000, // ₹50,000
      interestType: "fixed_amount",
      agreedInterestPaise: 500000, // ₹5,000
      agreementDate: "2026-06-01",
      accountId: dummyAccount.id,
      status: "active",
    };

    // Total outstanding = 55,00,000. Attempt 60,00,000.
    const resOver = validateRepaymentInput({
      agreement: loan,
      existingPayments: [],
      paymentAmountPaise: 6000000,
      principalComponentPaise: 5000000,
      interestComponentPaise: 1000000,
      paymentDate: "2026-06-10",
      account: dummyAccount,
    });
    expect(resOver.isValid).toBe(false);
    expect(resOver.errorCode).toBe("OVERPAYMENT_NOT_ALLOWED");

    // Overpayment of interest component (exceeds ₹5,000)
    const resInterestOver = validateRepaymentInput({
      agreement: loan,
      existingPayments: [],
      paymentAmountPaise: 5000000,
      principalComponentPaise: 4000000,
      interestComponentPaise: 1000000, // max is 500,000
      paymentDate: "2026-06-10",
      account: dummyAccount,
    });
    expect(resInterestOver.isValid).toBe(false);
    expect(resInterestOver.errorCode).toBe("INTEREST_OVERPAYMENT");
  });

  // 7. Component mismatch rejection
  it("rejects repayment when component sum does not equal total payment amount", () => {
    const loan: PersonalLoanAgreement = {
      id: "loan-1",
      personId: dummyPerson.id,
      direction: "given",
      principalPaise: 5000000,
      interestType: "none",
      agreementDate: "2026-06-01",
      accountId: dummyAccount.id,
      status: "active",
    };

    const res = validateRepaymentInput({
      agreement: loan,
      existingPayments: [],
      paymentAmountPaise: 2000000,
      principalComponentPaise: 1000000,
      interestComponentPaise: 500000, // sum is 15,00,000 != 20,00,000
      paymentDate: "2026-06-10",
      account: dummyAccount,
    });
    expect(res.isValid).toBe(false);
    expect(res.errorCode).toBe("COMPONENT_MISMATCH");
  });

  // 8. Rejection when agreement is already settled
  it("rejects repayment against an already settled agreement", () => {
    const loan: PersonalLoanAgreement = {
      id: "loan-1",
      personId: dummyPerson.id,
      direction: "given",
      principalPaise: 5000000,
      interestType: "none",
      agreementDate: "2026-06-01",
      accountId: dummyAccount.id,
      status: "settled",
    };

    const res = validateRepaymentInput({
      agreement: loan,
      existingPayments: [],
      paymentAmountPaise: 1000000,
      principalComponentPaise: 1000000,
      interestComponentPaise: 0,
      paymentDate: "2026-06-10",
      account: dummyAccount,
    });
    expect(res.isValid).toBe(false);
    expect(res.errorCode).toBe("AGREEMENT_ALREADY_SETTLED");
  });

  // 9. Date validation: Payment before agreement or account opening
  it("rejects payment date earlier than agreement date or account opening date", () => {
    const loan: PersonalLoanAgreement = {
      id: "loan-1",
      personId: dummyPerson.id,
      direction: "given",
      principalPaise: 5000000,
      interestType: "none",
      agreementDate: "2026-06-01",
      accountId: dummyAccount.id,
      status: "active",
    };

    const resPreceding = validateRepaymentInput({
      agreement: loan,
      existingPayments: [],
      paymentAmountPaise: 1000000,
      principalComponentPaise: 1000000,
      interestComponentPaise: 0,
      paymentDate: "2026-05-30", // precedes agreement date
      account: dummyAccount,
    });
    expect(resPreceding.isValid).toBe(false);
    expect(resPreceding.errorCode).toBe("PAYMENT_PRECEDES_AGREEMENT");
  });

  // 10. Lending requires sufficient funds in account
  it("rejects agreement creation when lending amount exceeds account balance (without overdraft)", () => {
    const res = validateAgreementInput({
      personName: "Bob",
      direction: "given",
      principalPaise: 20000000, // ₹2,00,000
      agreementDate: "2026-06-01",
      account: dummyAccount,
      accountBalancePaise: 10000000, // only ₹1,00,000 available
      allowOverdraft: false,
    });
    expect(res.isValid).toBe(false);
    expect(res.errorCode).toBe("INSUFFICIENT_FUNDS");

    // Allowed when allowOverdraft is true
    const resOverdraft = validateAgreementInput({
      personName: "Bob",
      direction: "given",
      principalPaise: 20000000,
      agreementDate: "2026-06-01",
      account: dummyAccount,
      accountBalancePaise: 10000000,
      allowOverdraft: true,
    });
    expect(resOverdraft.isValid).toBe(true);
  });

  // 11. Bank Account Balance Engine Integration
  it("verifies calculateAccountBalance correctly applies all 4 personal lending transaction types", () => {
    const txLent: Transaction = {
      id: "tx-1",
      date: "2026-02-01",
      description: "Money Lent to Alice",
      amountPaise: 2000000,
      type: "money_lent",
      accountId: dummyAccount.id,
    };

    const txRecv: Transaction = {
      id: "tx-2",
      date: "2026-02-15",
      description: "Repayment received from Alice",
      amountPaise: 500000,
      type: "repayment_received",
      accountId: dummyAccount.id,
    };

    const txBorrow: Transaction = {
      id: "tx-3",
      date: "2026-03-01",
      description: "Money Borrowed from Charlie",
      amountPaise: 3000000,
      type: "money_borrowed",
      accountId: dummyAccount.id,
    };

    const txPaid: Transaction = {
      id: "tx-4",
      date: "2026-03-10",
      description: "Repayment paid to Charlie",
      amountPaise: 1000000,
      type: "repayment_paid",
      accountId: dummyAccount.id,
    };

    const balance = calculateAccountBalance(dummyAccount, [
      txLent,
      txRecv,
      txBorrow,
      txPaid,
    ]);

    // 10000000 - 2000000 + 500000 + 3000000 - 1000000 = 10500000
    expect(balance).toBe(10500000);
  });

  // 12. Income / Expense exclusion
  it("ensures personal lending transactions do not distort income or expenses", () => {
    const txRecords: TransactionRecord[] = [
      {
        id: "tx-income",
        transaction_date: "2026-06-05",
        description: "Monthly Salary",
        amount_paise: 8000000,
        transaction_type: "income",
      },
      {
        id: "tx-expense",
        transaction_date: "2026-06-06",
        description: "Groceries",
        amount_paise: 1500000,
        transaction_type: "expense",
      },
      {
        id: "tx-lent",
        transaction_date: "2026-06-07",
        description: "Lent to Bob",
        amount_paise: 5000000,
        transaction_type: "money_lent",
      },
      {
        id: "tx-repayment-rcv",
        transaction_date: "2026-06-10",
        description: "Bob Repayment",
        amount_paise: 2500000,
        transaction_type: "repayment_received",
      },
      {
        id: "tx-borrow",
        transaction_date: "2026-06-12",
        description: "Borrowed from David",
        amount_paise: 4000000,
        transaction_type: "money_borrowed",
      },
      {
        id: "tx-repayment-paid",
        transaction_date: "2026-06-15",
        description: "Repaid David",
        amount_paise: 1000000,
        transaction_type: "repayment_paid",
      },
    ];

    const totals = aggregatePeriodTotals(
      txRecords,
      "2026-06-01",
      "2026-06-30"
    );

    // Only Salary is income; only Groceries is expense
    expect(totals.totalIncomePaise).toBe(8000000);
    expect(totals.totalExpensePaise).toBe(1500000);
  });

  // 13. Net Worth Integration
  it("incorporates personal receivables as assets and payables as liabilities without double-counting", () => {
    // Initial: Bank = ₹1,00,000, Credit Card = ₹10,000, Standalone loan = ₹20,000
    // Net worth = 100000 - 30000 = 70000
    const initial = calculateNetWorth({
      liquidAssetsPaise: 10000000,
      cardOutstandingPaise: 1000000,
      standaloneLoanPrincipalPaise: 2000000,
      personalReceivablesPaise: 0,
      personalPayablesPaise: 0,
    });
    expect(initial.netWorthPaise).toBe(7000000);

    // After lending ₹20,000:
    // Bank reduces by ₹20,000 (to ₹80,000).
    // Receivables increases by ₹20,000.
    // Net worth remains EXACTLY constant!
    const postLend = calculateNetWorth({
      liquidAssetsPaise: 8000000,
      cardOutstandingPaise: 1000000,
      standaloneLoanPrincipalPaise: 2000000,
      personalReceivablesPaise: 2000000,
      personalPayablesPaise: 0,
    });
    expect(postLend.totalAssetsPaise).toBe(10000000);
    expect(postLend.totalLiabilitiesPaise).toBe(3000000);
    expect(postLend.netWorthPaise).toBe(7000000);

    // After borrowing ₹30,000:
    // Bank increases by ₹30,000 (from ₹80,000 to ₹1,10,000).
    // Payables increases by ₹30,000.
    // Net worth remains EXACTLY constant!
    const postBorrow = calculateNetWorth({
      liquidAssetsPaise: 11000000,
      cardOutstandingPaise: 1000000,
      standaloneLoanPrincipalPaise: 2000000,
      personalReceivablesPaise: 2000000,
      personalPayablesPaise: 3000000,
    });
    expect(postBorrow.totalAssetsPaise).toBe(13000000);
    expect(postBorrow.totalLiabilitiesPaise).toBe(6000000);
    expect(postBorrow.netWorthPaise).toBe(7000000);
  });

  // 14. Person Balance Summary across multiple agreements
  it("aggregates bilateral balances per person accurately", () => {
    const loan1: PersonalLoanAgreement = {
      id: "loan-1",
      personId: dummyPerson.id,
      direction: "given",
      principalPaise: 5000000, // ₹50,000
      interestType: "none",
      agreementDate: "2026-06-01",
      accountId: dummyAccount.id,
      status: "active",
    };

    const loan2: PersonalLoanAgreement = {
      id: "loan-2",
      personId: dummyPerson.id,
      direction: "taken",
      principalPaise: 2000000, // ₹20,000
      interestType: "none",
      agreementDate: "2026-06-05",
      accountId: dummyAccount.id,
      status: "active",
    };

    const payment1: PersonalLoanPayment = {
      id: "pay-1",
      personalLoanId: loan1.id,
      paymentAmountPaise: 1000000, // Alice repaid ₹10,000
      principalComponentPaise: 1000000,
      interestComponentPaise: 0,
      paymentDate: "2026-06-15",
      accountId: dummyAccount.id,
    };

    const personSummary = calculatePersonBalances(
      dummyPerson,
      [loan1, loan2],
      [payment1]
    );

    expect(personSummary.totalGivenPaise).toBe(5000000);
    expect(personSummary.totalGivenRecoveredPaise).toBe(1000000);
    expect(personSummary.outstandingReceivablePaise).toBe(4000000); // 50k - 10k

    expect(personSummary.totalTakenPaise).toBe(2000000);
    expect(personSummary.totalTakenRepaidPaise).toBe(0);
    expect(personSummary.outstandingPayablePaise).toBe(2000000);

    // Alice owes ₹40,000, user owes Alice ₹20,000 -> Net position = +₹20,000
    expect(personSummary.netPositionPaise).toBe(2000000);
    expect(personSummary.activeAgreementsCount).toBe(2);
    expect(personSummary.settledAgreementsCount).toBe(0);
  });

  // 15. Portfolio Overall Telemetry
  it("computes comprehensive portfolio metrics", () => {
    const loanGiven: PersonalLoanAgreement = {
      id: "loan-g",
      personId: "person-1",
      direction: "given",
      principalPaise: 4000000, // ₹40,000
      interestType: "none",
      agreementDate: "2026-06-01",
      accountId: dummyAccount.id,
      status: "active",
    };

    const loanTaken: PersonalLoanAgreement = {
      id: "loan-t",
      personId: "person-2",
      direction: "taken",
      principalPaise: 1500000, // ₹15,000
      interestType: "none",
      agreementDate: "2026-06-02",
      accountId: dummyAccount.id,
      status: "active",
    };

    const loanSettled: PersonalLoanAgreement = {
      id: "loan-s",
      personId: "person-3",
      direction: "given",
      principalPaise: 1000000, // ₹10,000
      interestType: "none",
      agreementDate: "2026-05-01",
      accountId: dummyAccount.id,
      status: "settled",
    };

    const pGiven: PersonalLoanPayment = {
      id: "pay-g",
      personalLoanId: loanGiven.id,
      paymentAmountPaise: 1000000,
      principalComponentPaise: 1000000,
      interestComponentPaise: 0,
      paymentDate: "2026-06-10",
      accountId: dummyAccount.id,
    };

    const pSettled: PersonalLoanPayment = {
      id: "pay-s",
      personalLoanId: loanSettled.id,
      paymentAmountPaise: 1000000,
      principalComponentPaise: 1000000,
      interestComponentPaise: 0,
      paymentDate: "2026-05-15",
      accountId: dummyAccount.id,
    };

    const metrics = calculateOverallMoneyTrackerMetrics(
      [loanGiven, loanTaken, loanSettled],
      [pGiven, pSettled]
    );

    expect(metrics.totalGivenPaise).toBe(5000000); // 40k + 10k
    expect(metrics.totalReceivedBackPaise).toBe(2000000); // 10k + 10k
    expect(metrics.outstandingReceivablesPaise).toBe(3000000); // 30k remaining on loanGiven

    expect(metrics.totalBorrowedPaise).toBe(1500000);
    expect(metrics.totalRepaidPaise).toBe(0);
    expect(metrics.outstandingPayablesPaise).toBe(1500000);

    expect(metrics.netPositionPaise).toBe(1500000); // 30k receivables - 15k payables = +15k
    expect(metrics.activeGivenCount).toBe(1);
    expect(metrics.activeTakenCount).toBe(1);
    expect(metrics.settledCount).toBe(1);
  });
});
