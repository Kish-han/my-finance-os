import { describe, expect, it } from "vitest";
import {
  calculateOverallMetrics,
  calculatePersonSummaries,
  calculatePersonSummary,
  calculateRecordBalance,
  validateRecordInput,
  validateRepaymentInput,
} from "./money-tracker-engine";
import { calculateAccountBalance, calculateAccountBalanceAsOfDate, calculateNetWorth } from "./balances";
import { aggregatePeriodTotals, TransactionRecord } from "./date-ranges";
import { isTransactionEditable } from "./transfer-engine";
import type {
  FinancialAccount,
  Person,
  PersonalMoneyRecord,
  PersonalMoneyRepayment,
  Transaction,
} from "./types";

describe("Simple Money Tracker Engine — Unit & Financial Accounting Tests (No Interest)", () => {
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

  // 1. Money Given: Record & Initial Balance Calculation
  it("computes outstanding balance for Money Given record accurately", () => {
    const record: PersonalMoneyRecord = {
      id: "rec-1",
      personId: dummyPerson.id,
      direction: "given",
      amountPaise: 5000000, // ₹50,000
      recordDate: "2026-06-01",
      accountId: dummyAccount.id,
      status: "active",
    };

    const bal = calculateRecordBalance(record, []);
    expect(bal.originalAmountPaise).toBe(5000000);
    expect(bal.totalRepaidPaise).toBe(0);
    expect(bal.outstandingPaise).toBe(5000000);
    expect(bal.isSettled).toBe(false);
    expect(bal.progressPercent).toBe(0);
  });

  // 2. Money Taken: Record & Initial Balance Calculation
  it("computes outstanding balance for Money Taken record accurately", () => {
    const record: PersonalMoneyRecord = {
      id: "rec-2",
      personId: dummyPerson.id,
      direction: "taken",
      amountPaise: 3000000, // ₹30,000
      recordDate: "2026-06-01",
      accountId: dummyAccount.id,
      status: "active",
    };

    const bal = calculateRecordBalance(record, []);
    expect(bal.originalAmountPaise).toBe(3000000);
    expect(bal.totalRepaidPaise).toBe(0);
    expect(bal.outstandingPaise).toBe(3000000);
    expect(bal.isSettled).toBe(false);
    expect(bal.progressPercent).toBe(0);
  });

  // 3. Partial Repayments: Accumulation and Remaining Balance
  it("tracks partial repayments and reduces outstanding balance accurately", () => {
    const record: PersonalMoneyRecord = {
      id: "rec-1",
      personId: dummyPerson.id,
      direction: "given",
      amountPaise: 5000000, // ₹50,000
      recordDate: "2026-06-01",
      accountId: dummyAccount.id,
      status: "active",
    };

    const rep1: PersonalMoneyRepayment = {
      id: "rep-1",
      recordId: record.id,
      amountPaise: 2000000, // ₹20,000 repaid
      repaymentDate: "2026-06-15",
      accountId: dummyAccount.id,
    };

    const bal1 = calculateRecordBalance(record, [rep1]);
    expect(bal1.totalRepaidPaise).toBe(2000000);
    expect(bal1.outstandingPaise).toBe(3000000); // 50k - 20k = 30k
    expect(bal1.isSettled).toBe(false);
    expect(bal1.progressPercent).toBe(40);

    const rep2: PersonalMoneyRepayment = {
      id: "rep-2",
      recordId: record.id,
      amountPaise: 1500000, // ₹15,000 repaid
      repaymentDate: "2026-06-20",
      accountId: dummyAccount.id,
    };

    const bal2 = calculateRecordBalance(record, [rep1, rep2]);
    expect(bal2.totalRepaidPaise).toBe(3500000);
    expect(bal2.outstandingPaise).toBe(1500000); // 50k - 35k = 15k
    expect(bal2.isSettled).toBe(false);
    expect(bal2.progressPercent).toBe(70);
  });

  // 4. Full Repayment: Transitions to Settled
  it("transitions to settled when repayments equal the original amount", () => {
    const record: PersonalMoneyRecord = {
      id: "rec-1",
      personId: dummyPerson.id,
      direction: "given",
      amountPaise: 5000000, // ₹50,000
      recordDate: "2026-06-01",
      accountId: dummyAccount.id,
      status: "active",
    };

    const repFull: PersonalMoneyRepayment = {
      id: "rep-full",
      recordId: record.id,
      amountPaise: 5000000, // ₹50,000
      repaymentDate: "2026-06-15",
      accountId: dummyAccount.id,
    };

    const bal = calculateRecordBalance(record, [repFull]);
    expect(bal.totalRepaidPaise).toBe(5000000);
    expect(bal.outstandingPaise).toBe(0);
    expect(bal.isSettled).toBe(true);
    expect(bal.progressPercent).toBe(100);
  });

  // 5. Over-repayment Rejection
  it("rejects repayment exceeding outstanding balance", () => {
    const record: PersonalMoneyRecord = {
      id: "rec-1",
      personId: dummyPerson.id,
      direction: "given",
      amountPaise: 5000000, // ₹50,000
      recordDate: "2026-06-01",
      accountId: dummyAccount.id,
      status: "active",
    };

    // Existing repayment: ₹30,000. Outstanding: ₹20,000.
    const existingRep: PersonalMoneyRepayment = {
      id: "rep-1",
      recordId: record.id,
      amountPaise: 3000000,
      repaymentDate: "2026-06-10",
      accountId: dummyAccount.id,
    };

    // Attempting to repay ₹25,000 (exceeds remaining ₹20,000)
    const res = validateRepaymentInput({
      record,
      existingRepayments: [existingRep],
      paymentAmountPaise: 2500000,
      repaymentDate: "2026-06-15",
      account: dummyAccount,
    });

    expect(res.isValid).toBe(false);
    expect(res.errorCode).toBe("OVERPAYMENT_NOT_ALLOWED");
  });

  // 6. Same Person with Separate Given and Taken Records (NEVER AUTO-OFFSET)
  it("keeps Given and Taken records strictly separate for the same person without offsetting", () => {
    // User gave Alice ₹50,000
    const recordGiven: PersonalMoneyRecord = {
      id: "rec-given",
      personId: dummyPerson.id,
      direction: "given",
      amountPaise: 5000000,
      recordDate: "2026-06-01",
      accountId: dummyAccount.id,
      status: "active",
    };

    // User also took ₹20,000 from Alice
    const recordTaken: PersonalMoneyRecord = {
      id: "rec-taken",
      personId: dummyPerson.id,
      direction: "taken",
      amountPaise: 2000000,
      recordDate: "2026-06-05",
      accountId: dummyAccount.id,
      status: "active",
    };

    // Alice partially repaid ₹10,000 of the loan
    const repAlice: PersonalMoneyRepayment = {
      id: "rep-alice",
      recordId: recordGiven.id,
      amountPaise: 1000000,
      repaymentDate: "2026-06-15",
      accountId: dummyAccount.id,
    };

    const summary = calculatePersonSummary(
      dummyPerson,
      [recordGiven, recordTaken],
      [repAlice]
    );

    // Given metrics
    expect(summary.totalGivenPaise).toBe(5000000);
    expect(summary.totalGivenRecoveredPaise).toBe(1000000);
    expect(summary.outstandingReceivablePaise).toBe(4000000); // 50k - 10k = 40k

    // Taken metrics
    expect(summary.totalTakenPaise).toBe(2000000);
    expect(summary.totalTakenRepaidPaise).toBe(0);
    expect(summary.outstandingPayablePaise).toBe(2000000);

    // CRITICAL: They are NOT automatically netted out to ₹20,000!
    // Receivables and Payables remain independent bilateral records.
    expect(summary.outstandingReceivablePaise).toBe(4000000);
    expect(summary.outstandingPayablePaise).toBe(2000000);
    expect(summary.activeGivenCount).toBe(1);
    expect(summary.activeTakenCount).toBe(1);

    // Also verify calculatePersonSummaries over list of people
    const allSummaries = calculatePersonSummaries(
      [dummyPerson],
      [recordGiven, recordTaken],
      [repAlice]
    );
    expect(allSummaries).toHaveLength(1);
    expect(allSummaries[0].person.id).toBe(dummyPerson.id);
    expect(allSummaries[0].outstandingReceivablePaise).toBe(4000000);
    expect(allSummaries[0].outstandingPayablePaise).toBe(2000000);
  });

  // 7. Account Balance Changes
  it("verifies account balance correctly incorporates all 4 money tracker movement types", () => {
    const txLent: Transaction = {
      id: "tx-1",
      date: "2026-02-01",
      description: "Money Given to Alice",
      amountPaise: 2000000, // -₹20,000
      type: "money_lent",
      accountId: dummyAccount.id,
    };

    const txRecv: Transaction = {
      id: "tx-2",
      date: "2026-02-15",
      description: "Repayment from Alice",
      amountPaise: 500000, // +₹5,000
      type: "repayment_received",
      accountId: dummyAccount.id,
    };

    const txBorrow: Transaction = {
      id: "tx-3",
      date: "2026-03-01",
      description: "Money Taken from Bob",
      amountPaise: 3000000, // +₹30,000
      type: "money_borrowed",
      accountId: dummyAccount.id,
    };

    const txPaid: Transaction = {
      id: "tx-4",
      date: "2026-03-10",
      description: "Repayment to Bob",
      amountPaise: 1000000, // -₹10,000
      type: "repayment_paid",
      accountId: dummyAccount.id,
    };

    const balance = calculateAccountBalance(dummyAccount, [
      txLent,
      txRecv,
      txBorrow,
      txPaid,
    ]);

    // Initial: 100,000
    // - 20,000 (lent) + 5,000 (repaid) + 30,000 (borrowed) - 10,000 (repaid) = 105,000 = 10500000 paise
    expect(balance).toBe(10500000);
  });

  // 8. Net Worth Integration
  it("incorporates receivables as assets and payables as liabilities without altering net worth", () => {
    // Initial: Liquid = ₹1,00,000, Card = ₹10,000, Standalone Loans = ₹20,000 => Net Worth = ₹70,000
    const initial = calculateNetWorth({
      liquidAssetsPaise: 10000000,
      cardOutstandingPaise: 1000000,
      standaloneLoanPrincipalPaise: 2000000,
      personalReceivablesPaise: 0,
      personalPayablesPaise: 0,
    });
    expect(initial.netWorthPaise).toBe(7000000);

    // After giving ₹20,000:
    // Liquid decreases by ₹20,000 (to ₹80,000).
    // Receivables increases by ₹20,000.
    // Net worth remains EXACTLY ₹70,000!
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

    // After taking ₹30,000:
    // Liquid increases by ₹30,000 (to ₹1,10,000).
    // Payables increases by ₹30,000.
    // Net worth remains EXACTLY ₹70,000!
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

  // 9. Income, Expense and Budget Analytics Unaffected
  it("ensures personal money records do not distort income, expense or budget analytics", () => {
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
        description: "Money Given to Friend",
        amount_paise: 5000000,
        transaction_type: "money_lent",
      },
      {
        id: "tx-repayment-rcv",
        transaction_date: "2026-06-10",
        description: "Friend Repayment",
        amount_paise: 2500000,
        transaction_type: "repayment_received",
      },
      {
        id: "tx-borrow",
        transaction_date: "2026-06-12",
        description: "Money Taken from Colleague",
        amount_paise: 4000000,
        transaction_type: "money_borrowed",
      },
      {
        id: "tx-repayment-paid",
        transaction_date: "2026-06-15",
        description: "Repaid Colleague",
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

  // 10. Ledger Protection from Ordinary Transaction Edits
  it("protects money tracker ledger entries from being edited via transaction actions", () => {
    expect(isTransactionEditable("money_lent", "expense").allowed).toBe(false);
    expect(isTransactionEditable("money_borrowed", "income").allowed).toBe(false);
    expect(isTransactionEditable("repayment_received", "repayment_received").allowed).toBe(false);
    expect(isTransactionEditable("repayment_paid", "repayment_paid").allowed).toBe(false);
    expect(isTransactionEditable("expense", "money_lent").allowed).toBe(false);
  });

  // 11. Rejection of repayment against already settled record
  it("rejects repayment against an already settled record", () => {
    const record: PersonalMoneyRecord = {
      id: "rec-settled",
      personId: dummyPerson.id,
      direction: "given",
      amountPaise: 5000000,
      recordDate: "2026-06-01",
      accountId: dummyAccount.id,
      status: "settled",
    };

    const res = validateRepaymentInput({
      record,
      existingRepayments: [],
      paymentAmountPaise: 1000000,
      repaymentDate: "2026-06-10",
      account: dummyAccount,
    });

    expect(res.isValid).toBe(false);
    expect(res.errorCode).toBe("RECORD_ALREADY_SETTLED");
  });

  // 12. Date validation: Repayment preceding record date
  it("rejects repayment date earlier than original record date or account opening date", () => {
    const record: PersonalMoneyRecord = {
      id: "rec-date",
      personId: dummyPerson.id,
      direction: "given",
      amountPaise: 5000000,
      recordDate: "2026-06-01",
      accountId: dummyAccount.id,
      status: "active",
    };

    const resPreceding = validateRepaymentInput({
      record,
      existingRepayments: [],
      paymentAmountPaise: 1000000,
      repaymentDate: "2026-05-30", // precedes record date
      account: dummyAccount,
    });

    expect(resPreceding.isValid).toBe(false);
    expect(resPreceding.errorCode).toBe("PAYMENT_PRECEDES_RECORD");
  });

  // 13. Historical Account Balance vs Future Transactions
  it("calculates account balance strictly as of the record date, ignoring future deposits", () => {
    const openingBalanceDate = "2026-01-01";
    const testAccount: FinancialAccount = {
      id: "acc-historical",
      name: "Current Account",
      type: "bank",
      openingBalancePaise: 1000000, // ₹10,000 on Jan 1
      openingBalanceDate,
      isArchived: false,
    };

    const txPastIncome: Transaction = {
      id: "tx-past-inc",
      date: "2026-01-15",
      description: "Consulting Fee",
      amountPaise: 500000, // +₹5,000 on Jan 15 (Total: ₹15,000)
      type: "income",
      accountId: testAccount.id,
      categoryId: "cat-1",
    };

    const txFutureSalary: Transaction = {
      id: "tx-future-salary",
      date: "2026-06-01",
      description: "Future Deposit",
      amountPaise: 10000000, // +₹1,00,000 on Jun 1
      type: "income",
      accountId: testAccount.id,
      categoryId: "cat-1",
    };

    const allTransactions = [txPastIncome, txFutureSalary];

    // As of 2026-02-01: Available is ₹15,000 (1500000 paise). The future ₹1,00,000 MUST NOT be counted.
    const historicalBalance = calculateAccountBalanceAsOfDate(
      testAccount,
      allTransactions,
      "2026-02-01"
    );
    expect(historicalBalance).toBe(1500000);

    // Current balance includes future deposit
    const currentBalance = calculateAccountBalance(testAccount, allTransactions);
    expect(currentBalance).toBe(11500000);

    // Giving ₹20,000 on 2026-02-01 must be REJECTED when using historical balance
    const res = validateRecordInput({
      personName: "Bob",
      direction: "given",
      amountPaise: 2000000, // ₹20,000 requested
      recordDate: "2026-02-01",
      account: testAccount,
      accountBalancePaise: historicalBalance, // ₹15,000 available as of date
      allowOverdraft: false,
    });

    expect(res.isValid).toBe(false);
    expect(res.errorCode).toBe("INSUFFICIENT_FUNDS");
  });

  // 14. Comprehensive Portfolio Metrics
  it("computes comprehensive portfolio metrics across all records and repayments", () => {
    const recGiven: PersonalMoneyRecord = {
      id: "rec-g",
      personId: "person-1",
      direction: "given",
      amountPaise: 4000000, // ₹40,000
      recordDate: "2026-06-01",
      accountId: dummyAccount.id,
      status: "active",
    };

    const recTaken: PersonalMoneyRecord = {
      id: "rec-t",
      personId: "person-2",
      direction: "taken",
      amountPaise: 1500000, // ₹15,000
      recordDate: "2026-06-02",
      accountId: dummyAccount.id,
      status: "active",
    };

    const recSettled: PersonalMoneyRecord = {
      id: "rec-s",
      personId: "person-3",
      direction: "given",
      amountPaise: 1000000, // ₹10,000
      recordDate: "2026-05-01",
      accountId: dummyAccount.id,
      status: "settled",
    };

    const repGiven: PersonalMoneyRepayment = {
      id: "rep-g",
      recordId: recGiven.id,
      amountPaise: 1000000, // ₹10,000 recovered
      repaymentDate: "2026-06-10",
      accountId: dummyAccount.id,
    };

    const repSettled: PersonalMoneyRepayment = {
      id: "rep-s",
      recordId: recSettled.id,
      amountPaise: 1000000,
      repaymentDate: "2026-05-15",
      accountId: dummyAccount.id,
    };

    const metrics = calculateOverallMetrics(
      [recGiven, recTaken, recSettled],
      [repGiven, repSettled]
    );

    expect(metrics.totalGivenPaise).toBe(5000000); // 40k + 10k
    expect(metrics.totalReceivedBackPaise).toBe(2000000); // 10k + 10k
    expect(metrics.outstandingReceivablesPaise).toBe(3000000); // 30k remaining on recGiven

    expect(metrics.totalBorrowedPaise).toBe(1500000);
    expect(metrics.totalRepaidPaise).toBe(0);
    expect(metrics.outstandingPayablesPaise).toBe(1500000);

    expect(metrics.activeGivenCount).toBe(1);
    expect(metrics.activeTakenCount).toBe(1);
    expect(metrics.settledCount).toBe(1);
  });
});
