-- ==============================================================================
-- Migration: 20261110020000_add_linked_transaction_to_emi_debts.sql
-- Description: Add linked_transaction_id to emi_debts to cleanly bind Credit Card EMIs
--              to their underlying card_purchase transactions and prevent double-counting.
--
-- Core Accounting Principle:
--   An EMI plan is loan metadata (terms, tenure, interest, installments), NOT a card transaction.
--   The underlying card purchase is the transaction that hits the card ledger.
--   When an EMI is linked to an existing or new card_purchase transaction, that purchase
--   is already recorded in revolving transactions, so it must NOT be added again to
--   blocked EMI principal or card outstanding.
--
-- Rollback Instructions (at bottom of file):
--   ALTER TABLE emi_debts DROP CONSTRAINT IF EXISTS emi_debts_linked_transaction_id_fkey;
--   DROP INDEX IF EXISTS idx_emi_debts_linked_tx;
--   ALTER TABLE emi_debts DROP COLUMN IF EXISTS linked_transaction_id;
-- ==============================================================================

-- 1. Add linked_transaction_id column referencing transactions table
ALTER TABLE emi_debts
  ADD COLUMN IF NOT EXISTS linked_transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL;

-- 2. Index for fast lookup of linked transactions
CREATE INDEX IF NOT EXISTS idx_emi_debts_linked_tx
  ON emi_debts (linked_transaction_id)
  WHERE linked_transaction_id IS NOT NULL;

COMMENT ON COLUMN emi_debts.linked_transaction_id IS
  'Optional reference to the card_purchase transaction that spawned this EMI plan. When present, the purchase is already in the card ledger, preventing double counting.';

-- 3. Update credit card limit enforcement trigger to avoid double counting linked EMIs
CREATE OR REPLACE FUNCTION enforce_credit_card_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_credit_limit_paise BIGINT;
  v_opening_outstanding_paise BIGINT;
  v_opening_outstanding_date DATE;
  v_revolving_net_paise BIGINT;
  v_blocked_emi_paise BIGINT;
  v_current_utilized_paise BIGINT;
  v_projected_utilized_paise BIGINT;
  v_available_paise BIGINT;
  v_exceeded_by_paise BIGINT;
BEGIN
  -- Only validate when a credit card is attached and the transaction represents a charge
  IF NEW.credit_card_id IS NULL OR NEW.transaction_type <> 'card_purchase' THEN
    RETURN NEW;
  END IF;

  -- 1. Acquire row-level lock on credit_cards to serialize concurrent charges on the same card
  SELECT credit_limit_paise, opening_outstanding_paise, opening_outstanding_date
  INTO v_credit_limit_paise, v_opening_outstanding_paise, v_opening_outstanding_date
  FROM credit_cards
  WHERE id = NEW.credit_card_id
  FOR UPDATE;

  -- If the card is not found or has no limit configured, let normal FK/application constraints proceed
  IF NOT FOUND OR v_credit_limit_paise IS NULL OR v_credit_limit_paise <= 0 THEN
    RETURN NEW;
  END IF;

  -- Ensure date is valid for this card
  IF NEW.transaction_date < v_opening_outstanding_date THEN
    RAISE EXCEPTION 'Transaction date (%) cannot precede card opening date (%).',
      NEW.transaction_date, v_opening_outstanding_date
      USING ERRCODE = 'check_violation';
  END IF;

  -- 2. Calculate existing net revolving card transactions (excluding current row if updating)
  SELECT COALESCE(SUM(
    CASE
      WHEN transaction_type = 'card_purchase' THEN amount_paise
      WHEN transaction_type IN ('card_payment', 'card_credit') THEN -amount_paise
      ELSE 0
    END
  ), 0)
  INTO v_revolving_net_paise
  FROM transactions
  WHERE credit_card_id = NEW.credit_card_id
    AND transaction_date >= v_opening_outstanding_date
    AND (TG_OP = 'INSERT' OR id <> NEW.id);

  -- 3. Calculate active card-linked EMI principal currently blocking credit limit
  -- Only count active EMIs that are NOT already represented in transactions
  -- (i.e. unlinked legacy EMIs where linked_transaction_id IS NULL or transaction is absent)
  BEGIN
    SELECT COALESCE(SUM(current_outstanding_principal_paise), 0)
    INTO v_blocked_emi_paise
    FROM emi_debts
    WHERE linked_credit_card_id = NEW.credit_card_id
      AND status = 'active'
      AND (
        linked_transaction_id IS NULL
        OR linked_transaction_id NOT IN (
          SELECT id FROM transactions WHERE credit_card_id = NEW.credit_card_id
        )
      );
  EXCEPTION WHEN undefined_table THEN
    -- In case emi_debts is not yet present in testing harness
    v_blocked_emi_paise := 0;
  END;

  -- 4. Calculate total utilized credit and projected utilization with the new charge
  v_current_utilized_paise := COALESCE(v_opening_outstanding_paise, 0) + v_revolving_net_paise + v_blocked_emi_paise;
  v_available_paise := v_credit_limit_paise - v_current_utilized_paise;
  v_projected_utilized_paise := v_current_utilized_paise + NEW.amount_paise;

  -- 5. Strict Limit Enforcement Check
  IF v_projected_utilized_paise > v_credit_limit_paise THEN
    v_exceeded_by_paise := v_projected_utilized_paise - v_credit_limit_paise;
    RAISE EXCEPTION 'This transaction exceeds your available credit by % paise. Available credit: % paise. Transaction amount: % paise.',
      v_exceeded_by_paise,
      v_available_paise,
      NEW.amount_paise
      USING ERRCODE = 'check_violation',
            HINT = 'Reduce charge amount or record a card payment/refund before attempting this charge.';
  END IF;

  RETURN NEW;
END;
$$;

-- ==============================================================================
-- Rollback Instructions:
--
-- ALTER TABLE emi_debts
--   DROP CONSTRAINT IF EXISTS emi_debts_linked_transaction_id_fkey;
-- DROP INDEX IF EXISTS idx_emi_debts_linked_tx;
-- ALTER TABLE emi_debts
--   DROP COLUMN IF EXISTS linked_transaction_id;
-- ==============================================================================
