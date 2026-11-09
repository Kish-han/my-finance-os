-- Migration: 20261110000000_create_money_tracker.sql
-- Description: Personal Lending & Borrowing Tracker (Money Tracker) schema.
--              Includes reusable people directory, lending/borrowing agreements,
--              repayment ledgers, tenant-isolated RLS, and atomic database RPCs.
-- Reversible: Rollback script included at the bottom of this file.
-- Note: DO NOT EXECUTE AUTOMATICALLY AGAINST PRODUCTION. Provide for explicit user review.

-- ============================================================================
-- 1. PEOPLE DIRECTORY
-- Reusable person records associated with the user profile.
-- ============================================================================

CREATE TABLE IF NOT EXISTS people (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Case-insensitive uniqueness per user so "Alice" and "alice" are not duplicated
CREATE UNIQUE INDEX IF NOT EXISTS idx_people_user_name_unique
  ON people (user_id, LOWER(TRIM(name)));

CREATE INDEX IF NOT EXISTS idx_people_user_id
  ON people (user_id);

COMMENT ON TABLE people IS
  'Directory of people the user lends money to or borrows money from.';

-- Enable RLS
ALTER TABLE people ENABLE ROW LEVEL SECURITY;

CREATE POLICY people_tenant_isolation ON people
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- 2. PERSONAL LOANS / AGREEMENTS
-- Tracks money given (lent) and money taken (borrowed).
-- ============================================================================

CREATE TABLE IF NOT EXISTS personal_loans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  person_id UUID NOT NULL REFERENCES people(id) ON DELETE RESTRICT,
  direction TEXT NOT NULL CHECK (direction IN ('given', 'taken')),
  principal_amount_paise BIGINT NOT NULL CHECK (principal_amount_paise > 0),
  interest_type TEXT NOT NULL DEFAULT 'none' CHECK (interest_type IN ('none', 'fixed_amount', 'simple_annual')),
  interest_rate_basis_points INTEGER NOT NULL DEFAULT 0 CHECK (interest_rate_basis_points >= 0),
  agreed_interest_paise BIGINT NOT NULL DEFAULT 0 CHECK (agreed_interest_paise >= 0),
  agreement_date DATE NOT NULL,
  expected_repayment_date DATE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  linked_transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'settled')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_personal_loans_user_status
  ON personal_loans (user_id, status);

CREATE INDEX IF NOT EXISTS idx_personal_loans_person_id
  ON personal_loans (user_id, person_id);

CREATE INDEX IF NOT EXISTS idx_personal_loans_account_id
  ON personal_loans (user_id, account_id);

COMMENT ON TABLE personal_loans IS
  'Personal informal lending and borrowing agreements.';

-- Enable RLS
ALTER TABLE personal_loans ENABLE ROW LEVEL SECURITY;

CREATE POLICY personal_loans_tenant_isolation ON personal_loans
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- 3. PERSONAL LOAN PAYMENTS / REPAYMENTS
-- Tracks partial and full repayments with principal/interest split.
-- ============================================================================

CREATE TABLE IF NOT EXISTS personal_loan_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  personal_loan_id UUID NOT NULL REFERENCES personal_loans(id) ON DELETE CASCADE,
  payment_amount_paise BIGINT NOT NULL CHECK (payment_amount_paise > 0),
  principal_component_paise BIGINT NOT NULL DEFAULT 0 CHECK (principal_component_paise >= 0),
  interest_component_paise BIGINT NOT NULL DEFAULT 0 CHECK (interest_component_paise >= 0),
  payment_date DATE NOT NULL,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  linked_transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_personal_payment_components_sum
    CHECK (principal_component_paise + interest_component_paise = payment_amount_paise)
);

CREATE INDEX IF NOT EXISTS idx_personal_payments_loan_id
  ON personal_loan_payments (user_id, personal_loan_id);

CREATE INDEX IF NOT EXISTS idx_personal_payments_account_id
  ON personal_loan_payments (user_id, account_id);

COMMENT ON TABLE personal_loan_payments IS
  'Repayments recorded against personal lending and borrowing agreements.';

-- Enable RLS
ALTER TABLE personal_loan_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY personal_loan_payments_tenant_isolation ON personal_loan_payments
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- 4. ATOMIC DATABASE OPERATIONS: CREATE PERSONAL LOAN
-- Creates person (if new), acquires exclusive account lock, verifies balance
-- when lending money, posts ledger transaction, and inserts personal_loans record.
-- ============================================================================

CREATE OR REPLACE FUNCTION create_personal_loan_agreement(
  p_person_name TEXT,
  p_person_phone TEXT,
  p_direction TEXT,
  p_principal_paise BIGINT,
  p_account_id UUID,
  p_agreement_date DATE,
  p_expected_date DATE DEFAULT NULL,
  p_interest_type TEXT DEFAULT 'none',
  p_interest_rate_bps INTEGER DEFAULT 0,
  p_agreed_interest_paise BIGINT DEFAULT 0,
  p_notes TEXT DEFAULT NULL,
  p_allow_overdraft BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_person_id UUID;
  v_account RECORD;
  v_current_balance_paise BIGINT;
  v_tx_type TEXT;
  v_tx_desc TEXT;
  v_tx_id UUID;
  v_loan_id UUID;
BEGIN
  -- 1. Derive authenticated caller
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: Authentication required';
  END IF;

  -- 2. Validate input parameters
  IF TRIM(COALESCE(p_person_name, '')) = '' THEN
    RAISE EXCEPTION 'INVALID_NAME: Person name is required';
  END IF;

  IF p_direction NOT IN ('given', 'taken') THEN
    RAISE EXCEPTION 'INVALID_DIRECTION: Direction must be either given or taken';
  END IF;

  IF p_principal_paise <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT: Principal amount must be strictly positive';
  END IF;

  -- 3. Lock and verify account ownership
  SELECT *
  INTO v_account
  FROM accounts
  WHERE id = p_account_id
    AND user_id = v_user_id
    AND is_archived = FALSE
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVALID_ACCOUNT: Account not found, archived, or access denied';
  END IF;

  IF p_agreement_date < v_account.opening_balance_date THEN
    RAISE EXCEPTION 'DATE_BEFORE_OPENING: Agreement date cannot precede account opening date (%)',
      v_account.opening_balance_date;
  END IF;

  -- 4. Balance check if lending money (outflow from account)
  IF p_direction = 'given' THEN
    SELECT v_account.opening_balance_paise + COALESCE(SUM(
      CASE
        WHEN transaction_type = 'income' AND account_id = p_account_id THEN amount_paise
        WHEN transaction_type = 'expense' AND account_id = p_account_id THEN -amount_paise
        WHEN transaction_type = 'transfer' AND to_account_id = p_account_id THEN amount_paise
        WHEN transaction_type = 'transfer' AND from_account_id = p_account_id THEN -amount_paise
        WHEN transaction_type = 'card_payment' AND from_account_id = p_account_id THEN -amount_paise
        WHEN transaction_type = 'repayment_received' AND account_id = p_account_id THEN amount_paise
        WHEN transaction_type = 'money_borrowed' AND account_id = p_account_id THEN amount_paise
        WHEN transaction_type = 'money_lent' AND account_id = p_account_id THEN -amount_paise
        WHEN transaction_type = 'repayment_paid' AND account_id = p_account_id THEN -amount_paise
        ELSE 0
      END
    ), 0)
    INTO v_current_balance_paise
    FROM transactions
    WHERE user_id = v_user_id
      AND transaction_date >= v_account.opening_balance_date
      AND (
        account_id = p_account_id OR
        from_account_id = p_account_id OR
        to_account_id = p_account_id
      );

    -- Cash accounts can never be overdrawn
    IF v_account.account_type = 'cash' AND v_current_balance_paise < p_principal_paise THEN
      RAISE EXCEPTION 'INSUFFICIENT_FUNDS: Cash account cannot be overdrawn (available: % paise, requested: % paise)',
        v_current_balance_paise, p_principal_paise;
    END IF;

    -- Bank accounts require explicit overdraft configuration
    IF v_account.account_type = 'bank' AND v_current_balance_paise < p_principal_paise THEN
      IF NOT (v_account.allow_overdraft OR (p_allow_overdraft AND p_agreement_date < CURRENT_DATE)) THEN
        RAISE EXCEPTION 'INSUFFICIENT_FUNDS: Insufficient funds in bank account (available: % paise, requested: % paise)',
          v_current_balance_paise, p_principal_paise;
      END IF;
    END IF;
  END IF;

  -- 5. Resolve or create person
  SELECT id INTO v_person_id
  FROM people
  WHERE user_id = v_user_id
    AND LOWER(TRIM(name)) = LOWER(TRIM(p_person_name));

  IF v_person_id IS NULL THEN
    INSERT INTO people (user_id, name, phone, notes)
    VALUES (v_user_id, TRIM(p_person_name), NULLIF(TRIM(p_person_phone), ''), NULL)
    RETURNING id INTO v_person_id;
  END IF;

  -- 6. Insert companion balance-sheet transaction into ledger
  IF p_direction = 'given' THEN
    v_tx_type := 'money_lent';
    v_tx_desc := 'Money Lent to ' || TRIM(p_person_name);
  ELSE
    v_tx_type := 'money_borrowed';
    v_tx_desc := 'Money Borrowed from ' || TRIM(p_person_name);
  END IF;

  INSERT INTO transactions (
    user_id,
    transaction_date,
    description,
    amount_paise,
    transaction_type,
    account_id
  ) VALUES (
    v_user_id,
    p_agreement_date,
    v_tx_desc,
    p_principal_paise,
    v_tx_type,
    p_account_id
  ) RETURNING id INTO v_tx_id;

  -- 7. Insert personal loan agreement record
  INSERT INTO personal_loans (
    user_id,
    person_id,
    direction,
    principal_amount_paise,
    interest_type,
    interest_rate_basis_points,
    agreed_interest_paise,
    agreement_date,
    expected_repayment_date,
    account_id,
    linked_transaction_id,
    status,
    notes
  ) VALUES (
    v_user_id,
    v_person_id,
    p_direction,
    p_principal_paise,
    COALESCE(p_interest_type, 'none'),
    COALESCE(p_interest_rate_bps, 0),
    COALESCE(p_agreed_interest_paise, 0),
    p_agreement_date,
    p_expected_date,
    p_account_id,
    v_tx_id,
    'active',
    NULLIF(TRIM(p_notes), '')
  ) RETURNING id INTO v_loan_id;

  RETURN jsonb_build_object(
    'loan_id', v_loan_id,
    'person_id', v_person_id,
    'transaction_id', v_tx_id,
    'direction', p_direction,
    'principal_amount_paise', p_principal_paise
  );
END;
$$;

-- ============================================================================
-- 5. ATOMIC DATABASE OPERATIONS: RECORD REPAYMENT
-- Locks personal loan and account, checks against overpayment, posts ledger transaction,
-- logs personal_loan_payments record, and auto-settles loan when balance is zero.
-- ============================================================================

CREATE OR REPLACE FUNCTION record_personal_loan_payment(
  p_loan_id UUID,
  p_payment_amount_paise BIGINT,
  p_principal_paise BIGINT,
  p_interest_paise BIGINT,
  p_account_id UUID,
  p_payment_date DATE,
  p_notes TEXT DEFAULT NULL,
  p_allow_overdraft BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_loan RECORD;
  v_person RECORD;
  v_account RECORD;
  v_total_principal_paid BIGINT;
  v_total_interest_paid BIGINT;
  v_remaining_principal_paise BIGINT;
  v_remaining_interest_paise BIGINT;
  v_current_balance_paise BIGINT;
  v_tx_type TEXT;
  v_tx_desc TEXT;
  v_tx_id UUID;
  v_payment_id UUID;
  v_is_now_settled BOOLEAN;
BEGIN
  -- 1. Derive authenticated caller
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: Authentication required';
  END IF;

  -- 2. Validate input amounts
  IF p_payment_amount_paise <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT: Payment amount must be strictly positive';
  END IF;

  IF (p_principal_paise + p_interest_paise) <> p_payment_amount_paise THEN
    RAISE EXCEPTION 'INVALID_COMPONENTS: Principal (%) and interest (%) must equal total payment (%)',
      p_principal_paise, p_interest_paise, p_payment_amount_paise;
  END IF;

  -- 3. Lock loan agreement for update
  SELECT *
  INTO v_loan
  FROM personal_loans
  WHERE id = p_loan_id
    AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'LOAN_NOT_FOUND: Personal agreement not found or access denied';
  END IF;

  IF v_loan.status = 'settled' THEN
    RAISE EXCEPTION 'ALREADY_SETTLED: This agreement is already fully settled';
  END IF;

  -- 4. Get person details for transaction description
  SELECT * INTO v_person
  FROM people
  WHERE id = v_loan.person_id;

  -- 5. Calculate existing repayments to guard against overpayment
  SELECT
    COALESCE(SUM(principal_component_paise), 0),
    COALESCE(SUM(interest_component_paise), 0)
  INTO v_total_principal_paid, v_total_interest_paid
  FROM personal_loan_payments
  WHERE personal_loan_id = p_loan_id
    AND user_id = v_user_id;

  v_remaining_principal_paise := v_loan.principal_amount_paise - v_total_principal_paid;
  v_remaining_interest_paise := v_loan.agreed_interest_paise - v_total_interest_paid;

  IF p_principal_paise > v_remaining_principal_paise THEN
    RAISE EXCEPTION 'OVERPAYMENT_PRINCIPAL: Principal payment (% paise) exceeds remaining principal (% paise)',
      p_principal_paise, v_remaining_principal_paise;
  END IF;

  IF v_loan.interest_type = 'fixed_amount' AND p_interest_paise > v_remaining_interest_paise THEN
    RAISE EXCEPTION 'OVERPAYMENT_INTEREST: Interest payment (% paise) exceeds agreed remaining interest (% paise)',
      p_interest_paise, v_remaining_interest_paise;
  END IF;

  -- 6. Lock and verify payment account
  SELECT *
  INTO v_account
  FROM accounts
  WHERE id = p_account_id
    AND user_id = v_user_id
    AND is_archived = FALSE
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVALID_ACCOUNT: Account not found, archived, or access denied';
  END IF;

  IF p_payment_date < v_account.opening_balance_date THEN
    RAISE EXCEPTION 'DATE_BEFORE_OPENING: Payment date cannot precede account opening date (%)',
      v_account.opening_balance_date;
  END IF;

  IF p_payment_date < v_loan.agreement_date THEN
    RAISE EXCEPTION 'DATE_BEFORE_AGREEMENT: Payment date cannot precede agreement date (%)',
      v_loan.agreement_date;
  END IF;

  -- 7. If user is repaying money taken (outflow from user's account), check sufficient balance
  IF v_loan.direction = 'taken' THEN
    SELECT v_account.opening_balance_paise + COALESCE(SUM(
      CASE
        WHEN transaction_type = 'income' AND account_id = p_account_id THEN amount_paise
        WHEN transaction_type = 'expense' AND account_id = p_account_id THEN -amount_paise
        WHEN transaction_type = 'transfer' AND to_account_id = p_account_id THEN amount_paise
        WHEN transaction_type = 'transfer' AND from_account_id = p_account_id THEN -amount_paise
        WHEN transaction_type = 'card_payment' AND from_account_id = p_account_id THEN -amount_paise
        WHEN transaction_type = 'repayment_received' AND account_id = p_account_id THEN amount_paise
        WHEN transaction_type = 'money_borrowed' AND account_id = p_account_id THEN amount_paise
        WHEN transaction_type = 'money_lent' AND account_id = p_account_id THEN -amount_paise
        WHEN transaction_type = 'repayment_paid' AND account_id = p_account_id THEN -amount_paise
        ELSE 0
      END
    ), 0)
    INTO v_current_balance_paise
    FROM transactions
    WHERE user_id = v_user_id
      AND transaction_date >= v_account.opening_balance_date
      AND (
        account_id = p_account_id OR
        from_account_id = p_account_id OR
        to_account_id = p_account_id
      );

    IF v_account.account_type = 'cash' AND v_current_balance_paise < p_payment_amount_paise THEN
      RAISE EXCEPTION 'INSUFFICIENT_FUNDS: Cash account cannot be overdrawn (available: % paise, requested: % paise)',
        v_current_balance_paise, p_payment_amount_paise;
    END IF;

    IF v_account.account_type = 'bank' AND v_current_balance_paise < p_payment_amount_paise THEN
      IF NOT (v_account.allow_overdraft OR (p_allow_overdraft AND p_payment_date < CURRENT_DATE)) THEN
        RAISE EXCEPTION 'INSUFFICIENT_FUNDS: Insufficient funds in bank account (available: % paise, requested: % paise)',
          v_current_balance_paise, p_payment_amount_paise;
      END IF;
    END IF;
  END IF;

  -- 8. Post ledger transaction
  IF v_loan.direction = 'given' THEN
    -- User lent money; someone is repaying user => cash inflow into user's account
    v_tx_type := 'repayment_received';
    v_tx_desc := 'Repayment from ' || COALESCE(v_person.name, 'Person') || ' (Agreement #' || SUBSTRING(p_loan_id::text, 1, 8) || ')';
  ELSE
    -- User borrowed money; user is repaying them => cash outflow from user's account
    v_tx_type := 'repayment_paid';
    v_tx_desc := 'Repayment to ' || COALESCE(v_person.name, 'Person') || ' (Agreement #' || SUBSTRING(p_loan_id::text, 1, 8) || ')';
  END IF;

  INSERT INTO transactions (
    user_id,
    transaction_date,
    description,
    amount_paise,
    transaction_type,
    account_id
  ) VALUES (
    v_user_id,
    p_payment_date,
    v_tx_desc,
    p_payment_amount_paise,
    v_tx_type,
    p_account_id
  ) RETURNING id INTO v_tx_id;

  -- 9. Insert payment row
  INSERT INTO personal_loan_payments (
    user_id,
    personal_loan_id,
    payment_amount_paise,
    principal_component_paise,
    interest_component_paise,
    payment_date,
    account_id,
    linked_transaction_id,
    notes
  ) VALUES (
    v_user_id,
    p_loan_id,
    p_payment_amount_paise,
    p_principal_paise,
    p_interest_paise,
    p_payment_date,
    p_account_id,
    v_tx_id,
    NULLIF(TRIM(p_notes), '')
  ) RETURNING id INTO v_payment_id;

  -- 10. Check if fully settled: principal reached zero AND agreed interest reached zero
  v_is_now_settled := (v_remaining_principal_paise - p_principal_paise = 0)
    AND (v_remaining_interest_paise - p_interest_paise <= 0);

  IF v_is_now_settled THEN
    UPDATE personal_loans
    SET status = 'settled',
        updated_at = now()
    WHERE id = p_loan_id;
  ELSE
    UPDATE personal_loans
    SET updated_at = now()
    WHERE id = p_loan_id;
  END IF;

  RETURN jsonb_build_object(
    'payment_id', v_payment_id,
    'loan_id', p_loan_id,
    'transaction_id', v_tx_id,
    'payment_amount_paise', p_payment_amount_paise,
    'remaining_principal_paise', v_remaining_principal_paise - p_principal_paise,
    'is_settled', v_is_now_settled
  );
END;
$$;

-- Grant execution to authenticated role exclusively (never to PUBLIC)
REVOKE ALL ON FUNCTION create_personal_loan_agreement FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_personal_loan_agreement TO authenticated;

REVOKE ALL ON FUNCTION record_personal_loan_payment FROM PUBLIC;
GRANT EXECUTE ON FUNCTION record_personal_loan_payment TO authenticated;

-- ============================================================================
-- ROLLBACK SCRIPT (Do not run unless reversing this migration)
-- ============================================================================
-- DROP FUNCTION IF EXISTS record_personal_loan_payment(UUID, BIGINT, BIGINT, BIGINT, UUID, DATE, TEXT, BOOLEAN);
-- DROP FUNCTION IF EXISTS create_personal_loan_agreement(TEXT, TEXT, TEXT, BIGINT, UUID, DATE, DATE, TEXT, INTEGER, BIGINT, TEXT, BOOLEAN);
-- DROP TABLE IF EXISTS personal_loan_payments CASCADE;
-- DROP TABLE IF EXISTS personal_loans CASCADE;
-- DROP TABLE IF EXISTS people CASCADE;
