-- ============================================================================
-- AURA Wealth: Simple Money Tracker (NO INTEREST)
-- Migration: 20261110000000_create_money_tracker.sql
--
-- Adds simple "money given" / "money taken" records and repayments.
-- All amounts are integer paise. There are no interest fields or calculations.
--
-- IMPORTANT:
-- 1. Review before applying to Supabase.
-- 2. Preserves all existing transaction types and extends shape constraints cleanly.
-- 3. Adds four Money Tracker transaction types:
--    money_lent, money_borrowed, repayment_received, repayment_paid.
-- 4. Protects linked Money Tracker ledger rows from direct edits/deletes.
-- 5. Strict multi-tenant isolation via auth.uid() on all tables and RPCs.
-- 6. Hierarchical account row-level locks serialize Money Tracker operations.
-- 7. Updates record_atomic_transfer balance calculation to respect Money Tracker entries.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 0. Clean up any previous draft functions/tables if present
-- ----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS record_personal_loan_payment(UUID, BIGINT, BIGINT, BIGINT, UUID, DATE, TEXT, BOOLEAN);
DROP FUNCTION IF EXISTS create_personal_loan_agreement(TEXT, TEXT, TEXT, BIGINT, UUID, DATE, DATE, TEXT, INTEGER, BIGINT, TEXT, BOOLEAN);
DROP FUNCTION IF EXISTS delete_personal_loan_agreement(UUID);
DROP FUNCTION IF EXISTS calculate_accrued_simple_interest_paise(BIGINT, INTEGER, INTEGER);
DROP TABLE IF EXISTS personal_loan_payments CASCADE;
DROP TABLE IF EXISTS personal_loans CASCADE;

-- ----------------------------------------------------------------------------
-- 1. Extend ONLY the two known transaction constraints.
--    Do not drop unrelated CHECK constraints.
-- ----------------------------------------------------------------------------

ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_transaction_type_check;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_transaction_type_check
  CHECK (
    transaction_type = ANY (ARRAY[
      'income'::text,
      'expense'::text,
      'transfer'::text,
      'card_purchase'::text,
      'card_payment'::text,
      'money_lent'::text,
      'money_borrowed'::text,
      'repayment_received'::text,
      'repayment_paid'::text
    ])
  );

ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_valid_shape;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_valid_shape
  CHECK (
    (
      transaction_type = ANY (ARRAY['income'::text, 'expense'::text])
      AND account_id IS NOT NULL
      AND category_id IS NOT NULL
      AND from_account_id IS NULL
      AND to_account_id IS NULL
      AND credit_card_id IS NULL
    )
    OR
    (
      transaction_type = 'transfer'::text
      AND account_id IS NULL
      AND category_id IS NULL
      AND from_account_id IS NOT NULL
      AND to_account_id IS NOT NULL
      AND from_account_id <> to_account_id
      AND credit_card_id IS NULL
    )
    OR
    (
      transaction_type = 'card_purchase'::text
      AND account_id IS NULL
      AND category_id IS NOT NULL
      AND from_account_id IS NULL
      AND to_account_id IS NULL
      AND credit_card_id IS NOT NULL
    )
    OR
    (
      transaction_type = 'card_payment'::text
      AND account_id IS NULL
      AND category_id IS NULL
      AND from_account_id IS NOT NULL
      AND to_account_id IS NULL
      AND credit_card_id IS NOT NULL
    )
    OR
    (
      transaction_type = ANY (ARRAY[
        'money_lent'::text,
        'money_borrowed'::text,
        'repayment_received'::text,
        'repayment_paid'::text
      ])
      AND account_id IS NOT NULL
      AND category_id IS NULL
      AND from_account_id IS NULL
      AND to_account_id IS NULL
      AND credit_card_id IS NULL
    )
  );

-- ----------------------------------------------------------------------------
-- 2. People directory
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.people (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT people_name_not_blank CHECK (length(trim(name)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_people_user_name_unique
  ON public.people (user_id, lower(trim(name)));

CREATE INDEX IF NOT EXISTS idx_people_user_id
  ON public.people (user_id);

ALTER TABLE public.people ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS people_tenant_isolation ON public.people;
CREATE POLICY people_tenant_isolation
  ON public.people
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.people TO authenticated;
REVOKE ALL ON public.people FROM anon;

-- ----------------------------------------------------------------------------
-- 3. Money records: money given or money taken
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.personal_money_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE RESTRICT,
  direction TEXT NOT NULL CHECK (direction IN ('given', 'taken')),
  amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
  record_date DATE NOT NULL,
  due_date DATE,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
  linked_transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'settled')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_personal_money_records_dates
    CHECK (due_date IS NULL OR due_date >= record_date)
);

CREATE INDEX IF NOT EXISTS idx_money_records_user_status
  ON public.personal_money_records (user_id, status);

CREATE INDEX IF NOT EXISTS idx_money_records_person_id
  ON public.personal_money_records (user_id, person_id);

CREATE INDEX IF NOT EXISTS idx_money_records_account_id
  ON public.personal_money_records (user_id, account_id);

CREATE TABLE IF NOT EXISTS public.personal_money_repayments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  record_id UUID NOT NULL
    REFERENCES public.personal_money_records(id) ON DELETE CASCADE,
  amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
  repayment_date DATE NOT NULL,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
  linked_transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_money_repayments_record_id
  ON public.personal_money_repayments (user_id, record_id);

CREATE INDEX IF NOT EXISTS idx_money_repayments_account_id
  ON public.personal_money_repayments (user_id, account_id);

-- ----------------------------------------------------------------------------
-- 4. RLS and table privileges
-- Records/repayments are read-only to the client. Mutations happen through
-- SECURITY DEFINER RPCs below. Direct DELETE/INSERT/UPDATE are strictly revoked.
-- ----------------------------------------------------------------------------

ALTER TABLE public.personal_money_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personal_money_repayments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS money_records_select_policy
  ON public.personal_money_records;
CREATE POLICY money_records_select_policy
  ON public.personal_money_records
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS money_repayments_select_policy
  ON public.personal_money_repayments;
CREATE POLICY money_repayments_select_policy
  ON public.personal_money_repayments
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

REVOKE ALL ON public.personal_money_records FROM anon, authenticated;
REVOKE ALL ON public.personal_money_repayments FROM anon, authenticated;
GRANT SELECT ON public.personal_money_records TO authenticated;
GRANT SELECT ON public.personal_money_repayments TO authenticated;

-- ----------------------------------------------------------------------------
-- 5. Cross-table ownership & linked transaction validation
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.validate_personal_money_record_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.people p
    WHERE p.id = NEW.person_id
      AND p.user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'PERSON_NOT_FOUND: Person does not belong to this user';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.accounts a
    WHERE a.id = NEW.account_id
      AND a.user_id = NEW.user_id
      AND a.is_archived = FALSE
  ) THEN
    RAISE EXCEPTION 'INVALID_ACCOUNT: Account is unavailable or belongs to another user';
  END IF;

  -- Validate companion ledger transaction ownership and direction
  IF NEW.linked_transaction_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.transactions t
    WHERE t.id = NEW.linked_transaction_id
      AND t.user_id = NEW.user_id
      AND (
        (NEW.direction = 'given' AND t.transaction_type = 'money_lent')
        OR
        (NEW.direction = 'taken' AND t.transaction_type = 'money_borrowed')
      )
  ) THEN
    RAISE EXCEPTION 'INVALID_LEDGER_LINK: Linked transaction is invalid or mismatched';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_money_record_integrity
  ON public.personal_money_records;
CREATE TRIGGER trg_validate_money_record_integrity
  BEFORE INSERT OR UPDATE OF person_id, account_id, user_id, linked_transaction_id
  ON public.personal_money_records
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_personal_money_record_integrity();

CREATE OR REPLACE FUNCTION public.validate_personal_money_repayment_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_direction TEXT;
BEGIN
  SELECT r.direction
    INTO v_direction
  FROM public.personal_money_records r
  WHERE r.id = NEW.record_id
    AND r.user_id = NEW.user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RECORD_NOT_FOUND: Money record does not belong to this user';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.accounts a
    WHERE a.id = NEW.account_id
      AND a.user_id = NEW.user_id
      AND a.is_archived = FALSE
  ) THEN
    RAISE EXCEPTION 'INVALID_ACCOUNT: Account is unavailable or belongs to another user';
  END IF;

  -- Validate companion ledger transaction ownership and direction
  IF NEW.linked_transaction_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.transactions t
    WHERE t.id = NEW.linked_transaction_id
      AND t.user_id = NEW.user_id
      AND (
        (v_direction = 'given' AND t.transaction_type = 'repayment_received')
        OR
        (v_direction = 'taken' AND t.transaction_type = 'repayment_paid')
      )
  ) THEN
    RAISE EXCEPTION 'INVALID_LEDGER_LINK: Linked repayment transaction is invalid or mismatched';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_money_repayment_integrity
  ON public.personal_money_repayments;
CREATE TRIGGER trg_validate_money_repayment_integrity
  BEFORE INSERT OR UPDATE OF record_id, account_id, user_id, linked_transaction_id
  ON public.personal_money_repayments
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_personal_money_repayment_integrity();

-- Prevent a record from being marked settled while money remains outstanding.
CREATE OR REPLACE FUNCTION public.prevent_premature_money_record_settlement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_repaid NUMERIC;
BEGIN
  IF NEW.status = 'settled' AND OLD.status IS DISTINCT FROM 'settled' THEN
    SELECT COALESCE(SUM(p.amount_paise), 0)
      INTO v_repaid
    FROM public.personal_money_repayments p
    WHERE p.record_id = NEW.id
      AND p.user_id = NEW.user_id;

    IF v_repaid < NEW.amount_paise THEN
      RAISE EXCEPTION 'CANNOT_SETTLE: Outstanding amount remains';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_premature_money_record_settlement
  ON public.personal_money_records;
CREATE TRIGGER trg_prevent_premature_money_record_settlement
  BEFORE UPDATE OF status ON public.personal_money_records
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_premature_money_record_settlement();

-- ----------------------------------------------------------------------------
-- 6. Protect Money Tracker ledger entries from ordinary transaction edits
--    and deletes. The dedicated delete RPC removes the record first; its
--    ON DELETE SET NULL references are cleared before it deletes ledger rows.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.protect_personal_money_ledger_transactions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.personal_money_records r
    WHERE r.linked_transaction_id = OLD.id
  ) OR EXISTS (
    SELECT 1
    FROM public.personal_money_repayments p
    WHERE p.linked_transaction_id = OLD.id
  ) THEN
    RAISE EXCEPTION
      'MONEY_TRACKER_LEDGER_PROTECTED: Use the Money Tracker to modify or delete this entry';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_personal_money_ledger_transactions
  ON public.transactions;
CREATE TRIGGER trg_protect_personal_money_ledger_transactions
  BEFORE UPDATE OR DELETE ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_personal_money_ledger_transactions();

-- ----------------------------------------------------------------------------
-- 7. Helper: calculate account balance as of a date, in paise.
--    Uses the same transaction signs as the app's balance engine.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.personal_money_account_balance_as_of(
  p_user_id UUID,
  p_account_id UUID,
  p_as_of_date DATE,
  p_opening_balance_paise BIGINT,
  p_opening_date DATE
)
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT (
    p_opening_balance_paise::NUMERIC
    + COALESCE(SUM(
      CASE
        WHEN t.transaction_type = 'income'
          AND t.account_id = p_account_id THEN t.amount_paise
        WHEN t.transaction_type = 'expense'
          AND t.account_id = p_account_id THEN -t.amount_paise
        WHEN t.transaction_type = 'transfer'
          AND t.to_account_id = p_account_id THEN t.amount_paise
        WHEN t.transaction_type = 'transfer'
          AND t.from_account_id = p_account_id THEN -t.amount_paise
        WHEN t.transaction_type = 'card_payment'
          AND t.from_account_id = p_account_id THEN -t.amount_paise
        WHEN t.transaction_type = 'money_lent'
          AND t.account_id = p_account_id THEN -t.amount_paise
        WHEN t.transaction_type = 'money_borrowed'
          AND t.account_id = p_account_id THEN t.amount_paise
        WHEN t.transaction_type = 'repayment_received'
          AND t.account_id = p_account_id THEN t.amount_paise
        WHEN t.transaction_type = 'repayment_paid'
          AND t.account_id = p_account_id THEN -t.amount_paise
        ELSE 0
      END
    ), 0)
  )::BIGINT
  FROM public.transactions t
  WHERE t.user_id = p_user_id
    AND t.transaction_date >= p_opening_date
    AND t.transaction_date <= p_as_of_date
    AND (
      t.account_id = p_account_id
      OR t.from_account_id = p_account_id
      OR t.to_account_id = p_account_id
    );
$$;

-- ----------------------------------------------------------------------------
-- 8. RPC: create a money given/taken record and its ledger entry atomically.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_personal_money_record(
  p_person_name TEXT,
  p_person_phone TEXT,
  p_direction TEXT,
  p_amount_paise BIGINT,
  p_account_id UUID,
  p_record_date DATE,
  p_due_date DATE DEFAULT NULL,
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
  v_balance BIGINT;
  v_tx_type TEXT;
  v_tx_desc TEXT;
  v_tx_id UUID;
  v_record_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: Authentication required';
  END IF;

  IF length(trim(COALESCE(p_person_name, ''))) = 0 THEN
    RAISE EXCEPTION 'INVALID_NAME: Person name is required';
  END IF;
  IF p_direction NOT IN ('given', 'taken') THEN
    RAISE EXCEPTION 'INVALID_DIRECTION: Direction must be given or taken';
  END IF;
  IF p_amount_paise IS NULL OR p_amount_paise <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT: Amount must be greater than zero';
  END IF;
  IF p_record_date IS NULL THEN
    RAISE EXCEPTION 'INVALID_DATE: Record date is required';
  END IF;
  IF p_due_date IS NOT NULL AND p_due_date < p_record_date THEN
    RAISE EXCEPTION 'INVALID_DUE_DATE: Expected return date cannot precede record date';
  END IF;

  -- Lock account before reading its historical balance.
  SELECT a.*
    INTO v_account
  FROM public.accounts a
  WHERE a.id = p_account_id
    AND a.user_id = v_user_id
    AND a.is_archived = FALSE
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVALID_ACCOUNT: Account not found, archived, or inaccessible';
  END IF;

  IF p_record_date < v_account.opening_balance_date THEN
    RAISE EXCEPTION 'DATE_BEFORE_OPENING: Record date precedes account opening date';
  END IF;

  IF p_direction = 'given' THEN
    v_balance := public.personal_money_account_balance_as_of(
      v_user_id,
      p_account_id,
      p_record_date,
      v_account.opening_balance_paise,
      v_account.opening_balance_date
    );

    IF v_account.account_type = 'cash' AND v_balance < p_amount_paise THEN
      RAISE EXCEPTION 'INSUFFICIENT_FUNDS: Cash account balance is insufficient';
    END IF;

    IF v_account.account_type = 'bank'
       AND v_balance < p_amount_paise
       AND NOT (
         v_account.allow_overdraft
         OR (p_allow_overdraft AND p_record_date < CURRENT_DATE)
       ) THEN
      RAISE EXCEPTION 'INSUFFICIENT_FUNDS: Bank account balance is insufficient';
    END IF;
  END IF;

  -- Create-or-reuse a person safely under concurrent requests.
  INSERT INTO public.people (user_id, name, phone)
  VALUES (
    v_user_id,
    trim(p_person_name),
    NULLIF(trim(COALESCE(p_person_phone, '')), '')
  )
  ON CONFLICT (user_id, (lower(trim(name))))
  DO UPDATE SET updated_at = now()
  RETURNING id INTO v_person_id;

  IF p_direction = 'given' THEN
    v_tx_type := 'money_lent';
    v_tx_desc := 'Money Given to ' || trim(p_person_name);
  ELSE
    v_tx_type := 'money_borrowed';
    v_tx_desc := 'Money Taken from ' || trim(p_person_name);
  END IF;

  INSERT INTO public.transactions (
    user_id, transaction_date, description, amount_paise,
    transaction_type, account_id
  )
  VALUES (
    v_user_id, p_record_date, left(v_tx_desc, 160), p_amount_paise,
    v_tx_type, p_account_id
  )
  RETURNING id INTO v_tx_id;

  INSERT INTO public.personal_money_records (
    user_id, person_id, direction, amount_paise, record_date,
    due_date, account_id, linked_transaction_id, status, notes
  )
  VALUES (
    v_user_id, v_person_id, p_direction, p_amount_paise, p_record_date,
    p_due_date, p_account_id, v_tx_id, 'active',
    NULLIF(trim(COALESCE(p_notes, '')), '')
  )
  RETURNING id INTO v_record_id;

  RETURN jsonb_build_object(
    'record_id', v_record_id,
    'person_id', v_person_id,
    'transaction_id', v_tx_id,
    'direction', p_direction,
    'amount_paise', p_amount_paise
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 9. RPC: record a partial/full repayment and its ledger entry atomically.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.record_personal_money_repayment(
  p_record_id UUID,
  p_amount_paise BIGINT,
  p_account_id UUID,
  p_repayment_date DATE,
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
  v_record RECORD;
  v_account RECORD;
  v_total_repaid NUMERIC;
  v_remaining NUMERIC;
  v_new_remaining NUMERIC;
  v_balance BIGINT;
  v_tx_type TEXT;
  v_tx_desc TEXT;
  v_tx_id UUID;
  v_repayment_id UUID;
  v_settled BOOLEAN;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: Authentication required';
  END IF;
  IF p_amount_paise IS NULL OR p_amount_paise <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT: Repayment must be greater than zero';
  END IF;
  IF p_repayment_date IS NULL THEN
    RAISE EXCEPTION 'INVALID_DATE: Repayment date is required';
  END IF;

  -- Consistent lock order: account first, then money record.
  SELECT a.*
    INTO v_account
  FROM public.accounts a
  WHERE a.id = p_account_id
    AND a.user_id = v_user_id
    AND a.is_archived = FALSE
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVALID_ACCOUNT: Account not found, archived, or inaccessible';
  END IF;

  SELECT r.*
    INTO v_record
  FROM public.personal_money_records r
  WHERE r.id = p_record_id
    AND r.user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RECORD_NOT_FOUND: Money record not found';
  END IF;
  IF v_record.status = 'settled' THEN
    RAISE EXCEPTION 'ALREADY_SETTLED: This record is already settled';
  END IF;
  IF p_repayment_date < v_account.opening_balance_date THEN
    RAISE EXCEPTION 'DATE_BEFORE_OPENING: Repayment date precedes account opening date';
  END IF;
  IF p_repayment_date < v_record.record_date THEN
    RAISE EXCEPTION 'DATE_BEFORE_RECORD: Repayment date precedes original record date';
  END IF;

  SELECT COALESCE(SUM(p.amount_paise), 0)
    INTO v_total_repaid
  FROM public.personal_money_repayments p
  WHERE p.record_id = p_record_id
    AND p.user_id = v_user_id;

  v_remaining := v_record.amount_paise::NUMERIC - v_total_repaid;
  IF p_amount_paise::NUMERIC > v_remaining THEN
    RAISE EXCEPTION 'OVERPAYMENT: Repayment exceeds outstanding amount';
  END IF;

  -- Only repayment of money taken is an account outflow.
  IF v_record.direction = 'taken' THEN
    v_balance := public.personal_money_account_balance_as_of(
      v_user_id,
      p_account_id,
      p_repayment_date,
      v_account.opening_balance_paise,
      v_account.opening_balance_date
    );

    IF v_account.account_type = 'cash' AND v_balance < p_amount_paise THEN
      RAISE EXCEPTION 'INSUFFICIENT_FUNDS: Cash account balance is insufficient';
    END IF;

    IF v_account.account_type = 'bank'
       AND v_balance < p_amount_paise
       AND NOT (
         v_account.allow_overdraft
         OR (p_allow_overdraft AND p_repayment_date < CURRENT_DATE)
       ) THEN
      RAISE EXCEPTION 'INSUFFICIENT_FUNDS: Bank account balance is insufficient';
    END IF;
  END IF;

  IF v_record.direction = 'given' THEN
    v_tx_type := 'repayment_received';
    v_tx_desc := 'Repayment Received';
  ELSE
    v_tx_type := 'repayment_paid';
    v_tx_desc := 'Repayment Paid';
  END IF;

  INSERT INTO public.transactions (
    user_id, transaction_date, description, amount_paise,
    transaction_type, account_id
  )
  VALUES (
    v_user_id,
    p_repayment_date,
    left(v_tx_desc || ' - ' || p_record_id::text, 160),
    p_amount_paise,
    v_tx_type,
    p_account_id
  )
  RETURNING id INTO v_tx_id;

  INSERT INTO public.personal_money_repayments (
    user_id, record_id, amount_paise, repayment_date,
    account_id, linked_transaction_id, notes
  )
  VALUES (
    v_user_id, p_record_id, p_amount_paise, p_repayment_date,
    p_account_id, v_tx_id, NULLIF(trim(COALESCE(p_notes, '')), '')
  )
  RETURNING id INTO v_repayment_id;

  v_new_remaining := v_remaining - p_amount_paise::NUMERIC;
  v_settled := (v_new_remaining = 0);

  UPDATE public.personal_money_records
  SET status = CASE WHEN v_settled THEN 'settled' ELSE 'active' END,
      updated_at = now()
  WHERE id = p_record_id
    AND user_id = v_user_id;

  RETURN jsonb_build_object(
    'repayment_id', v_repayment_id,
    'record_id', p_record_id,
    'transaction_id', v_tx_id,
    'amount_paise', p_amount_paise,
    'remaining_paise', v_new_remaining,
    'is_settled', v_settled
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 10. RPC: delete one record, its repayments and all linked ledger rows.
--     Direct DELETE on the Money Tracker tables is not granted.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.delete_personal_money_record(
  p_record_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_record RECORD;
  v_transaction_ids UUID[];
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: Authentication required';
  END IF;

  SELECT r.*
    INTO v_record
  FROM public.personal_money_records r
  WHERE r.id = p_record_id
    AND r.user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RECORD_NOT_FOUND: Money record not found';
  END IF;

  SELECT array_agg(x.transaction_id)
    INTO v_transaction_ids
  FROM (
    SELECT r.linked_transaction_id AS transaction_id
    FROM public.personal_money_records r
    WHERE r.id = p_record_id
      AND r.linked_transaction_id IS NOT NULL

    UNION

    SELECT p.linked_transaction_id AS transaction_id
    FROM public.personal_money_repayments p
    WHERE p.record_id = p_record_id
      AND p.linked_transaction_id IS NOT NULL
  ) x;

  -- Cascades repayment rows and sets linked transaction references to NULL.
  DELETE FROM public.personal_money_records
  WHERE id = p_record_id
    AND user_id = v_user_id;

  -- The protection trigger now permits deletion because the record and
  -- repayment references have been removed within this same transaction.
  IF v_transaction_ids IS NOT NULL THEN
    DELETE FROM public.transactions
    WHERE user_id = v_user_id
      AND id = ANY(v_transaction_ids);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'deleted_record_id', p_record_id
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 11. Cross-module balance integrity: update record_atomic_transfer
--     Ensure internal transfers consider Money Tracker movements.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.record_atomic_transfer(
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

  -- 6. Authoritative balance calculation including Money Tracker movements
  SELECT v_from_acc.opening_balance_paise + COALESCE(SUM(
    CASE
      WHEN transaction_type = 'income' AND account_id = p_from_account_id THEN amount_paise
      WHEN transaction_type = 'expense' AND account_id = p_from_account_id THEN -amount_paise
      WHEN transaction_type = 'transfer' AND to_account_id = p_from_account_id THEN amount_paise
      WHEN transaction_type = 'transfer' AND from_account_id = p_from_account_id THEN -amount_paise
      WHEN transaction_type = 'card_payment' AND from_account_id = p_from_account_id THEN -amount_paise
      WHEN transaction_type = 'money_lent' AND account_id = p_from_account_id THEN -amount_paise
      WHEN transaction_type = 'money_borrowed' AND account_id = p_from_account_id THEN amount_paise
      WHEN transaction_type = 'repayment_received' AND account_id = p_from_account_id THEN amount_paise
      WHEN transaction_type = 'repayment_paid' AND account_id = p_from_account_id THEN -amount_paise
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
  IF v_from_acc.account_type = 'cash' AND v_current_balance_paise < (p_amount_paise + p_fee_paise) THEN
    RAISE EXCEPTION 'INSUFFICIENT_FUNDS: Physical cash accounts cannot be overdrawn (available: % paise, requested: % paise)',
      v_current_balance_paise, (p_amount_paise + p_fee_paise);
  END IF;

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

  -- 9. Atomic Insert: 2. Optional Fee Expense
  IF p_fee_paise > 0 THEN
    SELECT id INTO v_fee_cat_id
    FROM categories
    WHERE user_id = v_user_id
      AND category_type = 'expense'
      AND LOWER(TRIM(name)) = 'bank charges'
    ORDER BY is_archived ASC, id ASC
    LIMIT 1;

    IF v_fee_cat_id IS NOT NULL THEN
      UPDATE categories
      SET is_archived = FALSE
      WHERE id = v_fee_cat_id AND is_archived = TRUE;
    ELSE
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

-- ----------------------------------------------------------------------------
-- 12. Function privileges
-- ----------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.create_personal_money_record(
  TEXT, TEXT, TEXT, BIGINT, UUID, DATE, DATE, TEXT, BOOLEAN
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_personal_money_record(
  TEXT, TEXT, TEXT, BIGINT, UUID, DATE, DATE, TEXT, BOOLEAN
) TO authenticated;

REVOKE ALL ON FUNCTION public.record_personal_money_repayment(
  UUID, BIGINT, UUID, DATE, TEXT, BOOLEAN
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_personal_money_repayment(
  UUID, BIGINT, UUID, DATE, TEXT, BOOLEAN
) TO authenticated;

REVOKE ALL ON FUNCTION public.delete_personal_money_record(UUID)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_personal_money_record(UUID)
  TO authenticated;

REVOKE ALL ON FUNCTION public.record_atomic_transfer(
  UUID, UUID, BIGINT, DATE, TEXT, BIGINT, BOOLEAN
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_atomic_transfer(
  UUID, UUID, BIGINT, DATE, TEXT, BIGINT, BOOLEAN
) TO authenticated;

REVOKE ALL ON FUNCTION public.personal_money_account_balance_as_of(
  UUID, UUID, DATE, BIGINT, DATE
) FROM PUBLIC, anon, authenticated;

COMMIT;

-- ============================================================================
-- MANUAL ROLLBACK (run only if reversing this feature)
-- ============================================================================
-- BEGIN;
-- DROP TRIGGER IF EXISTS trg_protect_personal_money_ledger_transactions ON public.transactions;
-- DROP FUNCTION IF EXISTS public.protect_personal_money_ledger_transactions();
-- DROP FUNCTION IF EXISTS public.delete_personal_money_record(UUID);
-- DROP FUNCTION IF EXISTS public.record_personal_money_repayment(UUID, BIGINT, UUID, DATE, TEXT, BOOLEAN);
-- DROP FUNCTION IF EXISTS public.create_personal_money_record(TEXT, TEXT, TEXT, BIGINT, UUID, DATE, DATE, TEXT, BOOLEAN);
-- DROP FUNCTION IF EXISTS public.personal_money_account_balance_as_of(UUID, UUID, DATE, BIGINT, DATE);
-- DROP TRIGGER IF EXISTS trg_prevent_premature_money_record_settlement ON public.personal_money_records;
-- DROP FUNCTION IF EXISTS public.prevent_premature_money_record_settlement();
-- DROP TRIGGER IF EXISTS trg_validate_money_repayment_integrity ON public.personal_money_repayments;
-- DROP FUNCTION IF EXISTS public.validate_personal_money_repayment_integrity();
-- DROP TRIGGER IF EXISTS trg_validate_money_record_integrity ON public.personal_money_records;
-- DROP FUNCTION IF EXISTS public.validate_personal_money_record_integrity();
-- DROP TABLE IF EXISTS public.personal_money_repayments;
-- DROP TABLE IF EXISTS public.personal_money_records;
-- DROP TABLE IF EXISTS public.people;
-- COMMIT;
