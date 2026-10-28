-- ==============================================================================
-- Migration: 20261028210000_enforce_credit_card_limit.sql
-- Description: Enforce global credit card limit invariant at the database layer
--              with concurrency safety via SELECT ... FOR UPDATE row-level locks.
--
-- Invariant:
--   Projected card outstanding (revolving outstanding + active card-linked EMI principal)
--   must never exceed that card's configured credit_limit_paise when a new charge is recorded.
--
-- Supported transaction types:
--   - 'card_purchase': increases revolving debt (+amount_paise)
--   - 'card_payment': reduces revolving debt (-amount_paise)
--   - 'card_credit': merchant refunds and cash back (-amount_paise)
--
-- Rollback Instructions (at bottom of file):
--   DROP TRIGGER IF EXISTS trg_enforce_credit_card_limit ON transactions;
--   DROP FUNCTION IF EXISTS enforce_credit_card_limit();
-- ==============================================================================

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
  BEGIN
    SELECT COALESCE(SUM(current_outstanding_principal_paise), 0)
    INTO v_blocked_emi_paise
    FROM emi_debts
    WHERE linked_credit_card_id = NEW.credit_card_id
      AND status = 'active';
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

-- Idempotent trigger binding on transactions table
DROP TRIGGER IF EXISTS trg_enforce_credit_card_limit ON transactions;
CREATE TRIGGER trg_enforce_credit_card_limit
  BEFORE INSERT OR UPDATE ON transactions
  FOR EACH ROW
  EXECUTE FUNCTION enforce_credit_card_limit();

-- ==============================================================================
-- ROLLBACK INSTRUCTIONS:
--
-- To safely rollback this trigger and function, execute:
--   DROP TRIGGER IF EXISTS trg_enforce_credit_card_limit ON transactions;
--   DROP FUNCTION IF EXISTS enforce_credit_card_limit();
-- ==============================================================================
