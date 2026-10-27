-- Migration: Add statement accounting fields to credit_cards
-- Description: Adds optional fields for last statement snapshot balance, minimum amount due, and statement date.
--             Distinguishes billed statement balance from real-time total card outstanding.
-- Reversible: Execute the rollback script at the bottom of this file.
-- Note: DO NOT EXECUTE ON PRODUCTION WITHOUT EXPLICIT USER AUTHORIZATION (Follows frontend/AGENTS.md guidelines).

ALTER TABLE credit_cards
  ADD COLUMN IF NOT EXISTS last_statement_balance_paise BIGINT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS minimum_due_paise BIGINT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS last_statement_date DATE DEFAULT NULL;

-- Enforce non-negative amounts for statement balances
ALTER TABLE credit_cards
  DROP CONSTRAINT IF EXISTS credit_cards_last_statement_balance_check;

ALTER TABLE credit_cards
  ADD CONSTRAINT credit_cards_last_statement_balance_check
  CHECK (last_statement_balance_paise IS NULL OR last_statement_balance_paise >= 0);

ALTER TABLE credit_cards
  DROP CONSTRAINT IF EXISTS credit_cards_minimum_due_check;

ALTER TABLE credit_cards
  ADD CONSTRAINT credit_cards_minimum_due_check
  CHECK (minimum_due_paise IS NULL OR minimum_due_paise >= 0);

COMMENT ON COLUMN credit_cards.last_statement_balance_paise IS 'The billed statement balance in integer paise from the most recent statement date. Distinct from current total card outstanding.';
COMMENT ON COLUMN credit_cards.minimum_due_paise IS 'Minimum payment due in integer paise for the current billing cycle.';
COMMENT ON COLUMN credit_cards.last_statement_date IS 'The generation date of the most recent billing statement (YYYY-MM-DD).';

-- ============================================================================
-- Rollback Instructions:
-- To reverse this migration, execute:
-- ALTER TABLE credit_cards
--   DROP CONSTRAINT IF EXISTS credit_cards_minimum_due_check,
--   DROP CONSTRAINT IF EXISTS credit_cards_last_statement_balance_check,
--   DROP COLUMN IF EXISTS last_statement_date,
--   DROP COLUMN IF EXISTS minimum_due_paise,
--   DROP COLUMN IF EXISTS last_statement_balance_paise;
-- ============================================================================
