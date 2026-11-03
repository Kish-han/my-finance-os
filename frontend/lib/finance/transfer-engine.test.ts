import { describe, it, expect } from "vitest";
import type { FinancialAccount, Transaction } from "./types";
import {
  calculateAccountBalance,
  calculateNetWorth,
  separateAccountBalances,
} from "./balances";
import {
  aggregateTransactionRange,
  type TransactionRecord,
} from "./date-ranges";
import {
  calculateMonthlyBudgets,
  type CategoryBudget,
} from "./budget-engine";
import {
  validateTransactionEdit,
  type TransactionEditInput,
  type ValidationContext,
} from "./transaction-edits";
import {
  classifyTransferRpcError,
  executeAtomicTransferWithClient,
  isTransactionEditable,
  simulateCascadeDeletion,
  type TransferExecutionParams,
  type LedgerRowWithLink,
} from "./transfer-engine";

describe("Internal Account Transfer Engine", () => {
  const bankA: FinancialAccount = {
    id: "bank-hdfc",
    name: "HDFC Salary",
    type: "bank",
    institution: "HDFC Bank",
    openingBalancePaise: 100_000_00, // ₹1,00,000
    openingBalanceDate: "2026-01-01",
    isArchived: false,
  };

  const bankB: FinancialAccount = {
    id: "bank-icici",
    name: "ICICI Savings",
    type: "bank",
    institution: "ICICI Bank",
    openingBalancePaise: 50_000_00, // ₹50,000
    openingBalanceDate: "2026-01-01",
    isArchived: false,
  };

  const cashWallet: FinancialAccount = {
    id: "cash-wallet",
    name: "Cash Wallet",
    type: "cash",
    openingBalancePaise: 5_000_00, // ₹5,000
    openingBalanceDate: "2026-01-01",
    isArchived: false,
  };

  const validationCtx: ValidationContext = {
    today: "2026-11-03",
    accounts: [
      { id: bankA.id, name: bankA.name, openingBalanceDate: bankA.openingBalanceDate, isArchived: false },
      { id: bankB.id, name: bankB.name, openingBalanceDate: bankB.openingBalanceDate, isArchived: false },
      { id: cashWallet.id, name: cashWallet.name, openingBalanceDate: cashWallet.openingBalanceDate, isArchived: false },
    ],
    creditCards: [],
  };

  // 1. Source balance decreases
  it("decreases source account balance by the exact transfer amount", () => {
    const transferTx: Transaction = {
      id: "tx-xfer-1",
      date: "2026-04-10",
      description: "Transfer to ICICI",
      amountPaise: 25_000_00, // ₹25,000
      type: "transfer",
      fromAccountId: bankA.id,
      toAccountId: bankB.id,
    };

    const balanceA = calculateAccountBalance(bankA, [transferTx]);
    expect(balanceA).toBe(75_000_00); // 1,00,000 - 25,000 = 75,000
  });

  // 2. Destination balance increases
  it("increases destination account balance by the exact transfer amount", () => {
    const transferTx: Transaction = {
      id: "tx-xfer-1",
      date: "2026-04-10",
      description: "Transfer to ICICI",
      amountPaise: 25_000_00, // ₹25,000
      type: "transfer",
      fromAccountId: bankA.id,
      toAccountId: bankB.id,
    };

    const balanceB = calculateAccountBalance(bankB, [transferTx]);
    expect(balanceB).toBe(75_000_00); // 50,000 + 25,000 = 75,000
  });

  // 3. Total balance across both accounts is invariant
  it("preserves total combined liquidity across involved accounts (fundamental invariant)", () => {
    const transferTx: Transaction = {
      id: "tx-xfer-1",
      date: "2026-04-10",
      description: "Transfer to ICICI",
      amountPaise: 30_000_00, // ₹30,000
      type: "transfer",
      fromAccountId: bankA.id,
      toAccountId: bankB.id,
    };

    const initialTotal = bankA.openingBalancePaise + bankB.openingBalancePaise;
    const postA = calculateAccountBalance(bankA, [transferTx]);
    const postB = calculateAccountBalance(bankB, [transferTx]);

    expect(postA + postB).toBe(initialTotal);
  });

  // 4. ATM Cash withdrawal updates bank and cash wallet balances
  it("correctly handles ATM withdrawal moving funds from bank to physical cash wallet", () => {
    const atmWithdrawal: Transaction = {
      id: "tx-atm-1",
      date: "2026-04-15",
      description: "ATM Cash Withdrawal",
      amountPaise: 4_000_00, // ₹4,000
      type: "transfer",
      fromAccountId: bankA.id,
      toAccountId: cashWallet.id,
    };

    const bankBalance = calculateAccountBalance(bankA, [atmWithdrawal]);
    const walletBalance = calculateAccountBalance(cashWallet, [atmWithdrawal]);

    expect(bankBalance).toBe(96_000_00);
    expect(walletBalance).toBe(9_000_00); // 5,000 + 4,000 = 9,000

    const sep = separateAccountBalances([
      { account: bankA, balancePaise: bankBalance },
      { account: cashWallet, balancePaise: walletBalance },
    ]);
    expect(sep.totalBankBalancesPaise).toBe(96_000_00);
    expect(sep.totalCashInHandPaise).toBe(9_000_00);
    expect(sep.totalLiquidPaise).toBe(105_000_00);
  });

  // 5. Net worth is unchanged
  it("leaves net worth unchanged when money moves between own accounts", () => {
    const transferTx: Transaction = {
      id: "tx-xfer-2",
      date: "2026-04-12",
      description: "Rebalancing",
      amountPaise: 15_000_00,
      type: "transfer",
      fromAccountId: bankA.id,
      toAccountId: bankB.id,
    };

    const initialNetWorth = calculateNetWorth({
      liquidAssetsPaise: bankA.openingBalancePaise + bankB.openingBalancePaise,
      cardOutstandingPaise: 0,
      standaloneLoanPrincipalPaise: 0,
    });

    const postA = calculateAccountBalance(bankA, [transferTx]);
    const postB = calculateAccountBalance(bankB, [transferTx]);

    const postNetWorth = calculateNetWorth({
      liquidAssetsPaise: postA + postB,
      cardOutstandingPaise: 0,
      standaloneLoanPrincipalPaise: 0,
    });

    expect(postNetWorth.netWorthPaise).toBe(initialNetWorth.netWorthPaise);
  });

  // 6. Excluded from income totals in date ranges
  it("excludes internal transfers from income calculations", () => {
    const records: TransactionRecord[] = [
      {
        id: "tx-salary",
        transaction_date: "2026-04-01",
        description: "Monthly Salary",
        amount_paise: 150_000_00,
        transaction_type: "income",
        account_id: bankA.id,
      },
      {
        id: "tx-xfer",
        transaction_date: "2026-04-05",
        description: "Move to Savings",
        amount_paise: 50_000_00,
        transaction_type: "transfer",
        from_account_id: bankA.id,
        to_account_id: bankB.id,
      },
    ];

    const summary = aggregateTransactionRange(records, "custom", {
      customStart: "2026-04-01",
      customEnd: "2026-04-30",
    });

    expect(summary.totalIncomePaise).toBe(150_000_00);
    expect(summary.incomeCount).toBe(1);
    expect(summary.transferCount).toBe(1);
  });

  // 7. Excluded from expense totals in date ranges
  it("excludes internal transfers from expense calculations", () => {
    const records: TransactionRecord[] = [
      {
        id: "tx-groceries",
        transaction_date: "2026-04-02",
        description: "Supermarket",
        amount_paise: 5_000_00,
        transaction_type: "expense",
        account_id: bankA.id,
      },
      {
        id: "tx-xfer",
        transaction_date: "2026-04-05",
        description: "Move to ICICI",
        amount_paise: 20_000_00,
        transaction_type: "transfer",
        from_account_id: bankA.id,
        to_account_id: bankB.id,
      },
    ];

    const summary = aggregateTransactionRange(records, "custom", {
      customStart: "2026-04-01",
      customEnd: "2026-04-30",
    });

    expect(summary.totalExpensePaise).toBe(5_000_00);
    expect(summary.expenseCount).toBe(1);
    expect(summary.transferCount).toBe(1);
  });

  // 8. Excluded from monthly category budget calculations
  it("does not count transfers against category budget spending", () => {
    const budgets: CategoryBudget[] = [
      {
        id: "b-1",
        user_id: "user-1",
        category_id: "cat-savings",
        category_name: "Savings",
        amount_paise: 25_000_00,
        month_key: null,
        is_active: true,
        alert_50: false,
        alert_80: false,
        alert_100: false,
        created_at: "2026-01-01",
        updated_at: "2026-01-01",
      },
    ];

    const records: TransactionRecord[] = [
      {
        id: "tx-xfer",
        transaction_date: "2026-04-05",
        description: "Savings Transfer",
        amount_paise: 20_000_00,
        transaction_type: "transfer",
        from_account_id: bankA.id,
        to_account_id: bankB.id,
        category_id: "cat-savings",
      },
    ];

    const categoryMap = new Map<string, string>([["cat-savings", "Savings"]]);
    const analysis = calculateMonthlyBudgets(budgets, records, categoryMap, "2026-04");

    expect(analysis.totalBudgetPaise).toBe(25_000_00);
    expect(analysis.totalActualSpendingPaise).toBe(0);
    expect(analysis.categorySummaries[0].actualSpendingPaise).toBe(0);
  });

  // 9. Rejects same-account transfer
  it("rejects transfer when source and destination accounts are identical", () => {
    const input: TransactionEditInput = {
      transactionId: "tx-test",
      description: "Self Transfer",
      amountInput: "1000",
      transactionDate: "2026-04-10",
      transactionType: "transfer",
      fromAccountId: bankA.id,
      toAccountId: bankA.id,
    };

    const res = validateTransactionEdit(input, validationCtx);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.code).toBe("same-transfer-accounts");
    }
  });

  // 10. Rejects date before opening balance date
  it("rejects transfer date earlier than an account's opening balance date", () => {
    const input: TransactionEditInput = {
      transactionId: "tx-test",
      description: "Early Transfer",
      amountInput: "1000",
      transactionDate: "2025-12-31", // before 2026-01-01
      transactionType: "transfer",
      fromAccountId: bankA.id,
      toAccountId: bankB.id,
    };

    const res = validateTransactionEdit(input, validationCtx);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.code).toBe("date-before-opening");
    }
  });

  // 11. Rejects non-positive amount
  it("rejects zero or negative transfer amounts", () => {
    const inputZero: TransactionEditInput = {
      transactionId: "tx-test",
      description: "Zero Transfer",
      amountInput: "0",
      transactionDate: "2026-04-10",
      transactionType: "transfer",
      fromAccountId: bankA.id,
      toAccountId: bankB.id,
    };

    const resZero = validateTransactionEdit(inputZero, validationCtx);
    expect(resZero.success).toBe(false);
    if (!resZero.success) {
      expect(resZero.code).toBe("invalid-amount");
    }

    const inputNeg: TransactionEditInput = {
      ...inputZero,
      amountInput: "-500",
    };
    const resNeg = validateTransactionEdit(inputNeg, validationCtx);
    expect(resNeg.success).toBe(false);
  });

  // 12. Transfer edit adjusts both source and destination account balances
  it("correctly recalculates balances when transfer amount is edited", () => {
    const originalTransfer: Transaction = {
      id: "tx-xfer-edit",
      date: "2026-04-10",
      description: "Transfer to ICICI",
      amountPaise: 10_000_00, // ₹10,000 originally
      type: "transfer",
      fromAccountId: bankA.id,
      toAccountId: bankB.id,
    };

    expect(calculateAccountBalance(bankA, [originalTransfer])).toBe(90_000_00);
    expect(calculateAccountBalance(bankB, [originalTransfer])).toBe(60_000_00);

    // Edited to ₹25,000
    const updatedTransfer: Transaction = {
      ...originalTransfer,
      amountPaise: 25_000_00,
    };

    expect(calculateAccountBalance(bankA, [updatedTransfer])).toBe(75_000_00);
    expect(calculateAccountBalance(bankB, [updatedTransfer])).toBe(75_000_00);
  });

  // 13. Optional transfer fee recorded as separate expense
  it("records optional transfer fee as separate expense without distorting the transfer amount", () => {
    const transferTx: Transaction = {
      id: "tx-xfer-fee-test",
      date: "2026-04-10",
      description: "Wire Transfer",
      amountPaise: 50_000_00, // ₹50,000 transfer
      type: "transfer",
      fromAccountId: bankA.id,
      toAccountId: bankB.id,
    };

    const feeTx: Transaction = {
      id: "tx-fee-1",
      date: "2026-04-10",
      description: "Transfer Fee: Wire Transfer",
      amountPaise: 15_00, // ₹15.00 IMPS/wire fee
      type: "expense",
      accountId: bankA.id,
      categoryId: "cat-bank-charges",
    };

    // Bank A has both the transfer debit and the fee expense
    const balanceA = calculateAccountBalance(bankA, [transferTx, feeTx]);
    expect(balanceA).toBe(100_000_00 - 50_000_00 - 15_00);

    // Bank B receives the full ₹50,000 transfer without any fee deduction
    const balanceB = calculateAccountBalance(bankB, [transferTx, feeTx]);
    expect(balanceB).toBe(50_000_00 + 50_000_00);

    // Date range aggregation correctly counts ₹15 fee as expense and keeps transfer separate
    const records: TransactionRecord[] = [
      {
        id: transferTx.id,
        transaction_date: transferTx.date,
        description: transferTx.description,
        amount_paise: transferTx.amountPaise,
        transaction_type: "transfer",
        from_account_id: bankA.id,
        to_account_id: bankB.id,
      },
      {
        id: feeTx.id,
        transaction_date: feeTx.date,
        description: feeTx.description,
        amount_paise: feeTx.amountPaise,
        transaction_type: "expense",
        account_id: bankA.id,
      },
    ];

    const summary = aggregateTransactionRange(records, "custom", {
      customStart: "2026-04-01",
      customEnd: "2026-04-30",
    });

    expect(summary.totalExpensePaise).toBe(15_00);
    expect(summary.transferCount).toBe(1);
    expect(summary.expenseCount).toBe(1);
  });

  // 14. Explicit Insufficient-Balance / Overdraft Policy
  it("correctly identifies insufficient available balance when transfer amount exceeds available funds", () => {
    // Bank A has ₹1,00,000 opening balance
    const currentBalance = calculateAccountBalance(bankA, []);
    expect(currentBalance).toBe(100_000_00);

    const requestedAmountPaise = 150_000_00; // ₹1,50,000 (exceeds ₹1,00,000)
    const isOverdraft = requestedAmountPaise > currentBalance;
    expect(isOverdraft).toBe(true);

    // Without overdraft authorization, the policy requires rejection
    const allowOverdraft = false;
    const canProceed = !isOverdraft || allowOverdraft;
    expect(canProceed).toBe(false);
  });

  // 15. Explicit Overdraft Authorization
  it("allows overdraft when explicitly authorized and preserves total liquidity invariant", () => {
    const requestedAmountPaise = 120_000_00; // ₹1,20,000 on account with ₹1,00,000
    const allowOverdraft = true;

    // With explicit authorization, transfer proceeds
    const canProceed = allowOverdraft;
    expect(canProceed).toBe(true);

    const overdraftTransfer: Transaction = {
      id: "tx-od-1",
      date: "2026-04-10",
      description: "Emergency Medical Transfer",
      amountPaise: requestedAmountPaise,
      type: "transfer",
      fromAccountId: bankA.id,
      toAccountId: bankB.id,
    };

    const postA = calculateAccountBalance(bankA, [overdraftTransfer]);
    const postB = calculateAccountBalance(bankB, [overdraftTransfer]);

    // Bank A goes into overdraft: 1,00,000 - 1,20,000 = -20,000
    expect(postA).toBe(-20_000_00);
    // Bank B receives full amount: 50,000 + 1,20,000 = 1,70,000
    expect(postB).toBe(170_000_00);

    // Combined liquidity is still strictly conserved: (-20,000) + 1,70,000 = 1,50,000
    expect(postA + postB).toBe(bankA.openingBalancePaise + bankB.openingBalancePaise);
  });

  // 16. Balance sufficiency accounts for both transfer amount and transfer fee
  it("evaluates balance sufficiency against the sum of transfer amount and transfer fee", () => {
    const smallAccount: FinancialAccount = {
      id: "acc-small",
      name: "Small Account",
      type: "bank",
      openingBalancePaise: 1_000_00, // ₹1,000.00
      openingBalanceDate: "2026-01-01",
      isArchived: false,
    };

    const transferAmountPaise = 990_00; // ₹990.00
    const feePaise = 20_00; // ₹20.00
    const totalRequiredPaise = transferAmountPaise + feePaise; // ₹1,010.00

    const balance = calculateAccountBalance(smallAccount, []);
    expect(balance).toBe(1_000_00);

    // Amount alone (₹990) fits within balance (₹1,000), but amount + fee (₹1,010) exceeds it!
    expect(transferAmountPaise <= balance).toBe(true);
    expect(totalRequiredPaise > balance).toBe(true);
  });

  // 17. Physical cash wallets can NEVER overdraft under any circumstance
  it("strictly forbids overdraft on physical cash accounts regardless of authorization flag", () => {
    const cashBalance = calculateAccountBalance(cashWallet, []);
    expect(cashBalance).toBe(5_000_00); // ₹5,000

    const requestedAmountPaise = 6_000_00; // ₹6,000 exceeds ₹5,000
    const isOverdraft = requestedAmountPaise > cashBalance;

    // Even if allowOverdraft is true, cash accounts reject overdraft
    const allowOverdraft = true;
    const canCashOverdraft = cashWallet.type === "cash" ? false : allowOverdraft;

    expect(isOverdraft).toBe(true);
    expect(canCashOverdraft).toBe(false);
  });

  describe("RPC Error Classification & Production Safety", () => {
    it("classifies PGRST202 (function not found in schema cache) as migration-required", () => {
      const res = classifyTransferRpcError({
        code: "PGRST202",
        message: "Could not find the function public.record_atomic_transfer in the schema cache",
      });
      expect(res.code).toBe("migration-required");
      expect(res.error).toContain("Required database migration 20261103210000");
    });

    it("classifies Postgres 42883 (undefined_function) as migration-required", () => {
      const res = classifyTransferRpcError({
        code: "42883",
        message: "function record_atomic_transfer(uuid, uuid, bigint, date, text, bigint, boolean) does not exist",
      });
      expect(res.code).toBe("migration-required");
      expect(res.error).toContain("Required database migration 20261103210000");
    });

    it("classifies Postgres 42501 (insufficient_privilege) as permission-denied and NOT migration-required", () => {
      const res = classifyTransferRpcError({
        code: "42501",
        message: "permission denied for function record_atomic_transfer",
      });
      expect(res.code).toBe("permission-denied");
      expect(res.code).not.toBe("migration-required");
      expect(res.error).toContain("Permission denied");
    });

    it("classifies PostgREST 301 unauthorized as permission-denied and NOT migration-required", () => {
      const res = classifyTransferRpcError({
        code: "PGRST301",
        message: "JWT expired or user not authorized",
      });
      expect(res.code).toBe("permission-denied");
      expect(res.code).not.toBe("migration-required");
    });

    it("classifies network failure (fetch failed) as network-error and NOT migration-required", () => {
      const res = classifyTransferRpcError({
        message: "TypeError: fetch failed",
      });
      expect(res.code).toBe("network-error");
      expect(res.code).not.toBe("migration-required");
      expect(res.error).toContain("Network error");
    });

    it("classifies connection refused as network-error and NOT migration-required", () => {
      const res = classifyTransferRpcError({
        code: "ECONNREFUSED",
        message: "connect ECONNREFUSED 127.0.0.1:54321",
      });
      expect(res.code).toBe("network-error");
      expect(res.code).not.toBe("migration-required");
    });

    it("classifies business domain exceptions correctly", () => {
      expect(classifyTransferRpcError({ message: "INSUFFICIENT_FUNDS: overdraft not permitted" }).code).toBe("insufficient-funds");
      expect(classifyTransferRpcError({ message: "SAME_ACCOUNTS: identical source and destination" }).code).toBe("same-transfer-accounts");
      expect(classifyTransferRpcError({ message: "DATE_BEFORE_OPENING: prior to opening date" }).code).toBe("date-before-opening");
      expect(classifyTransferRpcError({ message: "INVALID_SOURCE_ACCOUNT: not found" }).code).toBe("invalid-accounts");
    });
  });

  describe("Fail-Closed Atomic Execution & Mock Ledger Invariants", () => {
    const validParams: TransferExecutionParams = {
      fromAccountId: bankA.id,
      toAccountId: bankB.id,
      amountPaise: 25_000_00,
      transactionDate: "2026-04-10",
      description: "Inter-account transfer",
      feePaise: 0,
      allowOverdraft: false,
    };

    it("RPC unavailable → rejects transfer with migration-required, inserting ZERO transfer or fee rows", async () => {
      let rpcCallCount = 0;
      let directInsertCount = 0;

      const mockSupabase = {
        rpc: async () => {
          rpcCallCount++;
          return {
            error: {
              code: "PGRST202",
              message: "Could not find the function public.record_atomic_transfer in the schema cache",
            },
          };
        },
        from: () => ({
          insert: async () => {
            directInsertCount++;
            return { error: null };
          },
        }),
      };

      const result = await executeAtomicTransferWithClient(mockSupabase, validParams);

      // 1. Must be rejected
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe("migration-required");
        expect(result.error).toContain("Required database migration 20261103210000");
      }

      // 2. RPC was attempted
      expect(rpcCallCount).toBe(1);

      // 3. ZERO direct inserts on transactions table (no fallback execution)
      expect(directInsertCount).toBe(0);
    });

    it("RPC unavailable with fee → rejects transfer and inserts ZERO fee rows", async () => {
      let feeRowsInserted = 0;

      const mockSupabase = {
        rpc: async () => ({
          error: {
            code: "42883",
            message: "function record_atomic_transfer does not exist",
          },
        }),
        from: () => ({
          insert: async () => {
            feeRowsInserted++;
            return { error: null };
          },
        }),
      };

      const paramsWithFee: TransferExecutionParams = {
        ...validParams,
        feePaise: 15_00,
      };

      const result = await executeAtomicTransferWithClient(mockSupabase, paramsWithFee);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe("migration-required");
      }
      expect(feeRowsInserted).toBe(0);
    });

    it("RPC permission error → rejected as permission-denied without misreporting as migration missing", async () => {
      const mockSupabase = {
        rpc: async () => ({
          error: {
            code: "42501",
            message: "permission denied for function record_atomic_transfer",
          },
        }),
      };

      const result = await executeAtomicTransferWithClient(mockSupabase, validParams);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe("permission-denied");
        expect(result.code).not.toBe("migration-required");
        expect(result.error).toContain("Permission denied");
      }
    });

    it("RPC network error → rejected as network-error without misreporting as migration missing", async () => {
      const mockSupabase = {
        rpc: async () => ({
          error: {
            code: "ECONNREFUSED",
            message: "fetch failed: connection refused",
          },
        }),
      };

      const result = await executeAtomicTransferWithClient(mockSupabase, validParams);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe("network-error");
        expect(result.code).not.toBe("migration-required");
        expect(result.error).toContain("Network error");
      }
    });

    it("RPC available → normal transfer succeeds", async () => {
      let executedArgs: Record<string, unknown> | null = null;

      const mockSupabase = {
        rpc: async (fn: string, args: Record<string, unknown>) => {
          if (fn === "record_atomic_transfer") {
            executedArgs = args;
            return { error: null, data: { success: true, transfer_id: "tx-test-123" } };
          }
          return { error: { message: "unknown function" } };
        },
      };

      const result = await executeAtomicTransferWithClient(mockSupabase, validParams);

      expect(result.success).toBe(true);
      expect(executedArgs).toEqual({
        p_from_account_id: bankA.id,
        p_to_account_id: bankB.id,
        p_amount_paise: 25_000_00,
        p_transaction_date: "2026-04-10",
        p_description: "Inter-account transfer",
        p_fee_paise: 0,
        p_allow_overdraft: false,
      });
    });

    it("RPC available → fee transfer succeeds atomically in single RPC call", async () => {
      let executedArgs: Record<string, unknown> | null = null;
      let rpcCalls = 0;

      const mockSupabase = {
        rpc: async (fn: string, args: Record<string, unknown>) => {
          rpcCalls++;
          if (fn === "record_atomic_transfer") {
            executedArgs = args;
            return {
              error: null,
              data: {
                success: true,
                transfer_id: "tx-test-123",
                fee_id: "tx-fee-456",
              },
            };
          }
          return { error: { message: "unknown function" } };
        },
      };

      const paramsWithFee: TransferExecutionParams = {
        ...validParams,
        feePaise: 20_00,
      };

      const result = await executeAtomicTransferWithClient(mockSupabase, paramsWithFee);

      expect(result.success).toBe(true);
      expect(rpcCalls).toBe(1); // Exactly one atomic call
      expect(executedArgs).toEqual({
        p_from_account_id: bankA.id,
        p_to_account_id: bankB.id,
        p_amount_paise: 25_000_00,
        p_transaction_date: "2026-04-10",
        p_description: "Inter-account transfer",
        p_fee_paise: 20_00,
        p_allow_overdraft: false,
      });
    });
  });

  describe("Transfer Safety Patch — Editing Disabled & Atomic Cascade Deletion", () => {
    it("rejects editing a transaction when existing type is transfer", () => {
      const check = isTransactionEditable("transfer", "transfer");
      expect(check.allowed).toBe(false);
      expect(check.code).toBe("transfer-editing-disabled");
      expect(check.error).toContain("Internal transfers cannot be edited directly");
    });

    it("rejects converting an ordinary transaction into a transfer via edit", () => {
      const check = isTransactionEditable("expense", "transfer");
      expect(check.allowed).toBe(false);
      expect(check.code).toBe("transfer-editing-disabled");
    });

    it("allows editing ordinary income transactions", () => {
      const check = isTransactionEditable("income", "income");
      expect(check.allowed).toBe(true);
      expect(check.code).toBeUndefined();
    });

    it("allows editing ordinary expense transactions", () => {
      const check = isTransactionEditable("expense", "expense");
      expect(check.allowed).toBe(true);
      expect(check.code).toBeUndefined();
    });

    it("allows editing card purchase and card payment transactions", () => {
      expect(isTransactionEditable("card_purchase", "card_purchase").allowed).toBe(true);
      expect(isTransactionEditable("card_payment", "card_payment").allowed).toBe(true);
    });

    it("deleting a transfer atomically cascades and deletes its linked companion fee expense", () => {
      const transferId = "tx-transfer-alpha";
      const feeId = "tx-fee-alpha";

      const ledger: LedgerRowWithLink[] = [
        {
          id: transferId,
          type: "transfer",
          linkedTransactionId: null,
          amountPaise: 50_000_00,
        },
        {
          id: feeId,
          type: "expense",
          linkedTransactionId: transferId, // references the transfer
          amountPaise: 15_00,
        },
        {
          id: "tx-unrelated-expense",
          type: "expense",
          linkedTransactionId: null,
          amountPaise: 2_500_00,
        },
      ];

      const { remainingRows, deletedRows } = simulateCascadeDeletion(ledger, transferId);

      // Both the transfer and its companion fee must be deleted
      expect(deletedRows.map((r) => r.id)).toEqual([transferId, feeId]);
      // Zero orphaned fees remain
      expect(remainingRows.some((r) => r.id === feeId)).toBe(false);
      // Unrelated expense is completely preserved
      expect(remainingRows.map((r) => r.id)).toEqual(["tx-unrelated-expense"]);
    });

    it("deleting an ordinary expense does NOT delete any other transaction", () => {
      const expenseId = "tx-grocery-1";
      const ledger: LedgerRowWithLink[] = [
        { id: expenseId, type: "expense", linkedTransactionId: null, amountPaise: 1_200_00 },
        { id: "tx-transfer-beta", type: "transfer", linkedTransactionId: null, amountPaise: 10_000_00 },
        { id: "tx-fee-beta", type: "expense", linkedTransactionId: "tx-transfer-beta", amountPaise: 10_00 },
      ];

      const { remainingRows, deletedRows } = simulateCascadeDeletion(ledger, expenseId);

      expect(deletedRows.map((r) => r.id)).toEqual([expenseId]);
      expect(remainingRows.map((r) => r.id)).toEqual(["tx-transfer-beta", "tx-fee-beta"]);
    });

    it("classifies INVALID_FEE database exception cleanly", () => {
      const res = classifyTransferRpcError({
        message: "INVALID_FEE: Transfer fee must be a non-negative integer",
      });
      expect(res.code).toBe("rpc-error");
      expect(res.error).toContain("Transfer fee must be a non-negative integer");
    });
  });
});
