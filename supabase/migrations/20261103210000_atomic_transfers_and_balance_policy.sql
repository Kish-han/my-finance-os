-- Migration: 20261103210000_atomic_transfers_and_balance_policy.sql
-- Description: Adds atomic transfer RPC with transactional fee creation, row-level locking concurrency guard,
--              and explicit insufficient-balance / overdraft policy.
-- Reversible: Rollback script included at the bottom of this file.
-- Note: DO NOT EXECUTE AUTOMATICALLY AGAINST PRODUCTION. Provide for explicit user review.

-- 1. Optional overdraft facility flag on accounts
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS allow_overdraft BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN accounts.allow_overdraft IS
  'If true, this account permits negative balances (e.g. overdraft facility, OD account).';

-- 2. Schema-level companion link for atomic cascading deletion of fees with transfers
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS linked_transaction_id UUID DEFAULT NULL
  REFERENCES transactions(id) ON DELETE CASCADE;

-- Enforce 1-to-1 cardinality and provide index lookup support:
-- A transfer can have at most one companion fee expense.
-- This partial unique index serves both uniqueness enforcement and foreign key lookups/cascades.
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_unique_linked_fee
  ON transactions (linked_transaction_id)
  WHERE linked_transaction_id IS NOT NULL;

COMMENT ON COLUMN transactions.linked_transaction_id IS
  'References parent transaction (e.g. transfer for a fee). ON DELETE CASCADE guarantees atomic companion deletion.';

-- 3. Declarative integrity constraints on linked transactions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_linked_transaction_is_expense'
  ) THEN
    ALTER TABLE transactions
      ADD CONSTRAINT chk_linked_transaction_is_expense
      CHECK (linked_transaction_id IS NULL OR transaction_type = 'expense');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_linked_transaction_no_self_link'
  ) THEN
    ALTER TABLE transactions
      ADD CONSTRAINT chk_linked_transaction_no_self_link
      CHECK (linked_transaction_id IS NULL OR linked_transaction_id <> id);
  END IF;
END $$;

-- 4. Cross-row tenant, type, and parent-immutability validation trigger
CREATE OR REPLACE FUNCTION validate_linked_transaction()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- A. Child insertion or update:
  -- If this row links to a parent transaction, verify parent exists, belongs to the exact same user, and is a transfer
  IF NEW.linked_transaction_id IS NOT NULL THEN

  PERFORM 1
  FROM transactions
  WHERE id = NEW.linked_transaction_id
    AND user_id = NEW.user_id
    AND transaction_type = 'transfer'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'INVALID_LINKED_TRANSACTION: Parent transaction % must exist, belong to the same user, and be of type transfer',
      NEW.linked_transaction_id;
  END IF;

END IF;

  -- B. Parent transfer protection under update:
  -- Prevent altering transaction_type or user_id of a transfer that has a linked fee expense
  IF TG_OP = 'UPDATE' AND OLD.transaction_type = 'transfer' THEN
    IF (NEW.transaction_type <> 'transfer' OR NEW.user_id <> OLD.user_id) THEN
      IF EXISTS (
        SELECT 1 FROM transactions
        WHERE linked_transaction_id = OLD.id
      ) THEN
        RAISE EXCEPTION 'CANNOT_MUTATE_PARENT_TRANSFER: Cannot alter transaction_type or user_id of transfer % while a linked fee expense is attached',
          OLD.id;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_linked_transaction ON transactions;
CREATE TRIGGER trg_validate_linked_transaction
BEFORE INSERT OR UPDATE OF linked_transaction_id, user_id, transaction_type ON transactions
FOR EACH ROW EXECUTE FUNCTION validate_linked_transaction();

-- 5. Index to accelerate transfer lookup on accounts
CREATE INDEX IF NOT EXISTS idx_transactions_from_to_accounts
  ON transactions (user_id, from_account_id, to_account_id)
  WHERE transaction_type = 'transfer';

-- 6. Atomic transfer and fee creation RPC
-- Uses SECURITY DEFINER with fixed search_path to prevent search-path injection.
-- Validates caller identity using auth.uid() exclusively (never trusts client user_id).
CREATE OR REPLACE FUNCTION record_atomic_transfer(
  p_from_account_id UUID,
  p_to_account_id UUID,
  p_amount_paise BIGINT,
  p_transaction_date DATE,
  p_description TEXT,
  p_fee_paise BIGINT DEFAULT 0,
  p_allow_overdraft BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_from_acc RECORD;
  v_to_acc RECORD;
  v_current_balance_paise BIGINT;
  v_transfer_tx_id UUID;
  v_fee_tx_id UUID := NULL;
  v_fee_cat_id UUID;
  v_clean_desc TEXT;
BEGIN
  -- 1. Authenticate caller: never trust client-supplied user_id
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: Authentication session required';
  END IF;

  -- 2. Validate input parameters
  IF p_from_account_id IS NULL OR p_to_account_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_ACCOUNTS: Both source and destination accounts are required';
  END IF;

  IF p_from_account_id = p_to_account_id THEN
    RAISE EXCEPTION 'SAME_ACCOUNTS: Source and destination accounts cannot be the same';
  END IF;

  IF p_amount_paise IS NULL OR p_amount_paise <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT: Transfer amount must be greater than zero';
  END IF;

  IF p_fee_paise IS NULL OR p_fee_paise < 0 THEN
    RAISE EXCEPTION 'INVALID_FEE: Transfer fee must be a non-negative integer';
  END IF;

  IF p_transaction_date IS NULL THEN
    RAISE EXCEPTION 'INVALID_DATE: Transaction date is required';
  END IF;

  v_clean_desc := TRIM(COALESCE(p_description, 'Internal Transfer'));
  IF LENGTH(v_clean_desc) = 0 THEN
    v_clean_desc := 'Internal Transfer';
  END IF;
  v_clean_desc := SUBSTRING(v_clean_desc FROM 1 FOR 160);

  -- 3. Acquire exclusive row-level lock on the source account to serialize concurrent debits
  -- CONCURRENCY SPECIFICATION & DOCUMENTED LIMITATION:
  -- The SELECT ... FOR UPDATE below serializes concurrent `record_atomic_transfer` calls
  -- against the same source account. However, ordinary income, expense, and card payment
  -- mutations created through application endpoints do not acquire this lock. Cross-operation
  -- balance race conditions remain possible until an account-locking trigger or universal
  -- row-level locking strategy is implemented across all ledger mutation pathways.
  SELECT id, name, account_type, opening_balance_date, opening_balance_paise, allow_overdraft
  INTO v_from_acc
  FROM accounts
  WHERE id = p_from_account_id
    AND user_id = v_user_id
    AND is_archived = FALSE
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVALID_SOURCE_ACCOUNT: Source account not found or access denied';
  END IF;

  -- 4. Verify destination account belongs to the same user
  SELECT id, name, account_type, opening_balance_date
  INTO v_to_acc
  FROM accounts
  WHERE id = p_to_account_id
    AND user_id = v_user_id
    AND is_archived = FALSE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVALID_DEST_ACCOUNT: Destination account not found or access denied';
  END IF;

  -- 5. Date boundaries check
  IF p_transaction_date < v_from_acc.opening_balance_date THEN
    RAISE EXCEPTION 'DATE_BEFORE_OPENING: Transfer date cannot precede source account opening date (%)',
      v_from_acc.opening_balance_date;
  END IF;

  IF p_transaction_date < v_to_acc.opening_balance_date THEN
    RAISE EXCEPTION 'DATE_BEFORE_OPENING: Transfer date cannot precede destination account opening date (%)',
      v_to_acc.opening_balance_date;
  END IF;

  -- 6. Authoritative balance calculation inside row-lock transaction
  -- Strictly mirrors lib/finance/balances.ts formula
  SELECT v_from_acc.opening_balance_paise + COALESCE(SUM(
    CASE
      WHEN transaction_type = 'income' AND account_id = p_from_account_id THEN amount_paise
      WHEN transaction_type = 'expense' AND account_id = p_from_account_id THEN -amount_paise
      WHEN transaction_type = 'transfer' AND to_account_id = p_from_account_id THEN amount_paise
      WHEN transaction_type = 'transfer' AND from_account_id = p_from_account_id THEN -amount_paise
      WHEN transaction_type = 'card_payment' AND from_account_id = p_from_account_id THEN -amount_paise
      ELSE 0
    END
  ), 0)
  INTO v_current_balance_paise
  FROM transactions
  WHERE user_id = v_user_id
    AND transaction_date >= v_from_acc.opening_balance_date
    AND (
      account_id = p_from_account_id OR
      from_account_id = p_from_account_id OR
      to_account_id = p_from_account_id
    );

  -- 7. Explicit Insufficient-Balance / Overdraft Policy Enforcement
  -- Physical cash accounts cannot physically go negative under any circumstance
  IF v_from_acc.account_type = 'cash' AND v_current_balance_paise < (p_amount_paise + p_fee_paise) THEN
    RAISE EXCEPTION 'INSUFFICIENT_FUNDS: Physical cash accounts cannot be overdrawn (available: % paise, requested: % paise)',
      v_current_balance_paise, (p_amount_paise + p_fee_paise);
  END IF;

  -- Institutional bank accounts:
  -- A client boolean parameter alone CANNOT grant overdraft privileges on an account where allow_overdraft is FALSE.
  -- Overdraft is permitted ONLY if:
  --   a) The account has an authorized overdraft facility configured in the database (v_from_acc.allow_overdraft = TRUE), OR
  --   b) The transaction is a backdated historical catch-up entry (p_transaction_date < CURRENT_DATE) AND the user explicitly confirmed it (p_allow_overdraft = TRUE).
  -- Present or future transactions on standard bank accounts (allow_overdraft = FALSE) CANNOT be overdrawn by client parameter override.
  IF v_from_acc.account_type = 'bank' AND v_current_balance_paise < (p_amount_paise + p_fee_paise) THEN
    IF NOT (v_from_acc.allow_overdraft OR (p_allow_overdraft AND p_transaction_date < CURRENT_DATE)) THEN
      IF p_transaction_date >= CURRENT_DATE AND NOT v_from_acc.allow_overdraft THEN
        RAISE EXCEPTION 'INSUFFICIENT_FUNDS: Bank account "%" does not permit overdrafts. Enable overdraft facility on this account or reduce transfer amount (available: % paise, requested: % paise)',
          v_from_acc.name, v_current_balance_paise, (p_amount_paise + p_fee_paise);
      ELSE
        RAISE EXCEPTION 'INSUFFICIENT_FUNDS: Insufficient available balance in "%" (available: % paise, requested: % paise). Explicit overdraft authorization required.',
          v_from_acc.name, v_current_balance_paise, (p_amount_paise + p_fee_paise);
      END IF;
    END IF;

    -- If account has an overdraft facility, require explicit confirmation flag to prevent accidental overdraw
    IF v_from_acc.allow_overdraft AND NOT p_allow_overdraft THEN
      RAISE EXCEPTION 'OVERDRAFT_CONFIRMATION_REQUIRED: Transfer will overdraw "%" (available: % paise, requested: % paise). Confirmation required.',
        v_from_acc.name, v_current_balance_paise, (p_amount_paise + p_fee_paise);
    END IF;
  END IF;

  -- 8. Atomic Insert: 1. Transfer record
  INSERT INTO transactions (
    user_id,
    transaction_date,
    description,
    amount_paise,
    transaction_type,
    from_account_id,
    to_account_id,
    account_id,
    credit_card_id,
    category_id
  )
  VALUES (
    v_user_id,
    p_transaction_date,
    v_clean_desc,
    p_amount_paise,
    'transfer',
    p_from_account_id,
    p_to_account_id,
    NULL,
    NULL,
    NULL
  )
  RETURNING id INTO v_transfer_tx_id;

  -- 9. Atomic Insert: 2. Optional Fee Expense (committed together in same transaction)
  IF p_fee_paise > 0 THEN
    -- Find existing "Bank Charges" category (active or archived, case-insensitive)
    SELECT id INTO v_fee_cat_id
    FROM categories
    WHERE user_id = v_user_id
      AND category_type = 'expense'
      AND LOWER(TRIM(name)) = 'bank charges'
    ORDER BY is_archived ASC, id ASC
    LIMIT 1;

    -- If found but archived, unarchive it so it is visible in expense analytics
    IF v_fee_cat_id IS NOT NULL THEN
      UPDATE categories
      SET is_archived = FALSE
      WHERE id = v_fee_cat_id AND is_archived = TRUE;
    ELSE
      -- Safely insert, catching any concurrent or unique collision cleanly
      BEGIN
        INSERT INTO categories (user_id, name, category_type, is_archived)
        VALUES (v_user_id, 'Bank Charges', 'expense', FALSE)
        RETURNING id INTO v_fee_cat_id;
      EXCEPTION WHEN unique_violation THEN
        SELECT id INTO v_fee_cat_id
        FROM categories
        WHERE user_id = v_user_id
          AND category_type = 'expense'
          AND LOWER(TRIM(name)) = 'bank charges'
        LIMIT 1;
      END;
    END IF;

    INSERT INTO transactions (
      user_id,
      transaction_date,
      description,
      amount_paise,
      transaction_type,
      account_id,
      category_id,
      from_account_id,
      to_account_id,
      credit_card_id,
      linked_transaction_id
    )
    VALUES (
      v_user_id,
      p_transaction_date,
      SUBSTRING(('Transfer Fee: ' || v_clean_desc) FROM 1 FOR 160),
      p_fee_paise,
      'expense',
      p_from_account_id,
      v_fee_cat_id,
      NULL,
      NULL,
      NULL,
      v_transfer_tx_id
    )
    RETURNING id INTO v_fee_tx_id;
  END IF;

  -- 10. Return telemetry payload
  RETURN jsonb_build_object(
    'success', TRUE,
    'transfer_id', v_transfer_tx_id,
    'fee_id', v_fee_tx_id,
    'source_previous_balance_paise', v_current_balance_paise,
    'source_new_balance_paise', v_current_balance_paise - (p_amount_paise + p_fee_paise),
    'amount_paise', p_amount_paise,
    'fee_paise', p_fee_paise
  );
END;
$$;

-- Grant execution to authenticated users only
REVOKE ALL ON FUNCTION record_atomic_transfer(UUID, UUID, BIGINT, DATE, TEXT, BIGINT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION record_atomic_transfer(UUID, UUID, BIGINT, DATE, TEXT, BIGINT, BOOLEAN) TO authenticated;

COMMENT ON FUNCTION record_atomic_transfer(UUID, UUID, BIGINT, DATE, TEXT, BIGINT, BOOLEAN) IS
  'Atomically creates an internal transfer and optional bank fee expense within a single database transaction with row-level locking concurrency control.';

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';

-- ==============================================================================
-- ROLLBACK INSTRUCTIONS:
--
-- To safely rollback this migration:
--   DROP FUNCTION IF EXISTS record_atomic_transfer(UUID, UUID, BIGINT, DATE, TEXT, BIGINT, BOOLEAN);
--   DROP TRIGGER IF EXISTS trg_validate_linked_transaction ON transactions;
--   DROP FUNCTION IF EXISTS validate_linked_transaction();
--   ALTER TABLE transactions DROP CONSTRAINT IF EXISTS chk_linked_transaction_is_expense;
--   ALTER TABLE transactions DROP CONSTRAINT IF EXISTS chk_linked_transaction_no_self_link;
--   DROP INDEX IF EXISTS idx_transactions_unique_linked_fee;
--   DROP INDEX IF EXISTS idx_transactions_from_to_accounts;
--   ALTER TABLE transactions DROP COLUMN IF EXISTS linked_transaction_id;
--   ALTER TABLE accounts DROP COLUMN IF EXISTS allow_overdraft;
--   NOTIFY pgrst, 'reload schema';
--
-- DATA SAFETY NOTE:
--   - Dropping record_atomic_transfer does NOT delete or alter any existing transactions.
--   - Dropping idx_transactions_from_to_accounts and idx_transactions_unique_linked_fee removes only index structures.
--   - Dropping linked_transaction_id removes the companion relationship without deleting transactions.
--   - Dropping allow_overdraft removes the overdraft flag on accounts, but all accounts,
--     balances, and transfer ledger histories remain completely intact and preserved.
-- ==============================================================================
