/**
 * Internal Account Transfer Engine
 *
 * Implements client-side execution orchestration, RPC error classification,
 * and fail-closed security policies for atomic account transfers.
 *
 * ARCHITECTURAL CONCURRENCY SPECIFICATION & DOCUMENTED LIMITATIONS:
 * ===============================================================
 * 1. Transfer-to-Transfer Serialization:
 *    When `record_atomic_transfer` executes in PostgreSQL, it issues:
 *      SELECT ... FROM accounts WHERE id = p_from_account_id FOR UPDATE;
 *    This acquires an exclusive row lock on the source account for the duration of the
 *    transaction, ensuring concurrent transfers from the same account are strictly serialized
 *    and cannot double-spend available balance.
 *
 * 2. Cross-Operation Race Condition Limitation:
 *    Ordinary income, expense, and card payment creations (via `createTransaction`) do NOT
 *    currently acquire `accounts FOR UPDATE`. Therefore, if an ordinary expense or card
 *    payment is inserted concurrently with an internal transfer on the same account, a
 *    cross-operation race condition remains theoretically possible.
 *
 * 3. Transfer Editing Limitation:
 *    Transfer edits (via `updateTransaction`) use application-level balance checking and
 *    do not currently execute inside a locked database transaction (`accounts FOR UPDATE`).
 *    Editing a transfer does NOT guarantee database-level concurrency protection.
 *
 * 4. Smallest Recommended Future Improvement:
 *    To achieve universal account-level concurrency serialization across the entire ledger
 *    without rewriting the application layer, add a PostgreSQL trigger:
 *      CREATE TRIGGER trg_serialize_account_mutations
 *      BEFORE INSERT OR UPDATE OR DELETE ON transactions
 *      FOR EACH ROW EXECUTE FUNCTION lock_affected_accounts();
 *    which performs `PERFORM 1 FROM accounts WHERE id IN (...) FOR UPDATE;`
 */

export interface TransferRpcErrorLike {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}

export interface TransferExecutionParams {
  fromAccountId: string;
  toAccountId: string;
  amountPaise: number;
  transactionDate: string;
  description: string;
  feePaise: number;
  allowOverdraft: boolean;
}

export type TransferExecutionResult =
  | { success: true }
  | { success: false; error: string; code: string };

/**
 * Classifies RPC errors returned from PostgreSQL/PostgREST into unambiguous domain errors.
 *
 * CRITICAL SECURITY INVARIANT:
 * - Missing RPC / pending migration MUST return code: "migration-required"
 * - Permission / auth errors MUST NOT be misreported as missing migration (code: "permission-denied")
 * - Network / connection failures MUST NOT be misreported as missing migration (code: "network-error")
 */
export function classifyTransferRpcError(rpcError: TransferRpcErrorLike): {
  error: string;
  code: string;
} {
  const errorMsg = rpcError.message || "";
  const errorCode = rpcError.code || "";

  // 1. Business domain exceptions raised by Postgres function logic
  if (
    errorMsg.includes("INSUFFICIENT_FUNDS") ||
    errorMsg.includes("OVERDRAFT_CONFIRMATION_REQUIRED") ||
    errorMsg.includes("OVERDRAFT_NOT_PERMITTED")
  ) {
    return {
      error:
        "Insufficient available balance in source account. Enable 'Allow Overdraft' if this account has an overdraft facility or you are recording historical catch-up entries.",
      code: "insufficient-funds",
    };
  }

  if (errorMsg.includes("SAME_ACCOUNTS")) {
    return {
      error: "Source and destination accounts cannot be the same.",
      code: "same-transfer-accounts",
    };
  }

  if (errorMsg.includes("DATE_BEFORE_OPENING")) {
    return {
      error: "Transfer date cannot be earlier than an account's opening balance date.",
      code: "date-before-opening",
    };
  }

  if (
    errorMsg.includes("INVALID_ACCOUNT_OWNERSHIP") ||
    errorMsg.includes("ACCOUNTS_NOT_FOUND") ||
    errorMsg.includes("INVALID_SOURCE_ACCOUNT") ||
    errorMsg.includes("INVALID_DEST_ACCOUNT")
  ) {
    return {
      error: "One or both accounts are invalid or do not belong to your profile.",
      code: "invalid-accounts",
    };
  }

  // 2. Permission / authorization errors (must NOT be misreported as migration missing)
  const isPermissionError =
    errorCode === "42501" || // Postgres insufficient_privilege
    errorCode === "PGRST301" ||
    errorMsg.toLowerCase().includes("permission denied") ||
    errorMsg.toLowerCase().includes("not authorized") ||
    errorMsg.toLowerCase().includes("unauthenticated");

  if (isPermissionError) {
    return {
      error: "Permission denied executing atomic transfer. Please verify your authentication privileges.",
      code: "permission-denied",
    };
  }

  // 3. Network, timeout, or connection failures (must NOT be misreported as migration missing)
  const isNetworkOrTimeout =
    errorCode === "ECONNREFUSED" ||
    errorCode === "ETIMEDOUT" ||
    errorMsg.toLowerCase().includes("fetch failed") ||
    errorMsg.toLowerCase().includes("network") ||
    errorMsg.toLowerCase().includes("timeout") ||
    errorMsg.toLowerCase().includes("failed to fetch");

  if (isNetworkOrTimeout) {
    return {
      error: "Network error communicating with database. Please check your connection and try again.",
      code: "network-error",
    };
  }

  // 4. Missing RPC / schema cache missing (migration required)
  const isRpcMissing =
    errorCode === "PGRST202" || // PostgREST function not found in schema cache
    errorCode === "42883" ||    // Postgres undefined_function
    errorMsg.includes("record_atomic_transfer") ||
    errorMsg.includes("function record_atomic_transfer") ||
    errorMsg.includes("does not exist") ||
    errorMsg.includes("Could not find the function");

  if (isRpcMissing) {
    return {
      error:
        "Atomic transfer service is unavailable. Required database migration 20261103210000_atomic_transfers_and_balance_policy.sql must be applied to Supabase.",
      code: "migration-required",
    };
  }

  // 5. General database / unexpected error
  return {
    error: errorMsg || "Failed to record transfer in database. Please try again.",
    code: "rpc-error",
  };
}

export interface TransferRpcClient {
  rpc: (
    fn: string,
    args: Record<string, unknown>
  ) => PromiseLike<{ data?: unknown; error: TransferRpcErrorLike | null }>;
}

/**
 * Invokes the atomic transfer RPC through a Supabase client.
 *
 * Enforces a strict FAIL-CLOSED policy:
 * - Every transfer must be processed by `record_atomic_transfer`.
 * - If the RPC is missing or fails, no fallback transaction row is ever inserted.
 */
export async function executeAtomicTransferWithClient(
  client: TransferRpcClient,
  params: TransferExecutionParams
): Promise<TransferExecutionResult> {
  const { error: rpcError } = await client.rpc("record_atomic_transfer", {
    p_from_account_id: params.fromAccountId,
    p_to_account_id: params.toAccountId,
    p_amount_paise: params.amountPaise,
    p_transaction_date: params.transactionDate,
    p_description: params.description,
    p_fee_paise: params.feePaise,
    p_allow_overdraft: params.allowOverdraft,
  });

  if (!rpcError) {
    return { success: true };
  }

  const failure = classifyTransferRpcError(rpcError);
  return { success: false, error: failure.error, code: failure.code };
}

/**
 * Checks whether editing a transaction is permitted.
 *
 * SAFETY INVARIANT:
 * Internal transfers cannot be edited directly in-place to prevent double-entry balance
 * desynchronization or orphaned fee states. Users must delete and recreate the transfer.
 * Ordinary income, expense, and card payments remain fully editable.
 */
export function isTransactionEditable(
  existingType: string,
  targetType: string
): { allowed: boolean; error?: string; code?: string } {
  if (existingType === "transfer" || targetType === "transfer") {
    return {
      allowed: false,
      error:
        "Internal transfers cannot be edited directly to preserve double-entry balance and fee integrity. Please delete this transfer and record a new one with the updated details.",
      code: "transfer-editing-disabled",
    };
  }
  return { allowed: true };
}

export interface LedgerRowWithLink {
  id: string;
  type: string;
  linkedTransactionId?: string | null;
  amountPaise: number;
}

/**
 * Simulates schema-level ON DELETE CASCADE behavior.
 * When a parent transfer row is deleted, its linked companion fee expense is atomically removed.
 * Unrelated transactions and unlinked expenses are strictly preserved.
 */
export function simulateCascadeDeletion(
  ledger: LedgerRowWithLink[],
  transactionIdToDelete: string
): { remainingRows: LedgerRowWithLink[]; deletedRows: LedgerRowWithLink[] } {
  const deletedRows = ledger.filter(
    (row) =>
      row.id === transactionIdToDelete ||
      row.linkedTransactionId === transactionIdToDelete
  );
  const remainingRows = ledger.filter(
    (row) =>
      row.id !== transactionIdToDelete &&
      row.linkedTransactionId !== transactionIdToDelete
  );
  return { remainingRows, deletedRows };
}
