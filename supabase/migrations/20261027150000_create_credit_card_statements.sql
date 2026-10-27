-- Migration: Create credit_card_statements table for multi-cycle credit card billing
-- Description: Persistent statement history tracking statement date, payment due date, total statement balance,
--              minimum due, settlement status, and notes. Supports recurring monthly billing cycles.
-- Reversible: Execute the rollback script at the bottom of this file.
-- Note: DO NOT EXECUTE ON PRODUCTION WITHOUT EXPLICIT USER AUTHORIZATION (Follows frontend/AGENTS.md guidelines).

CREATE TABLE IF NOT EXISTS credit_card_statements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  credit_card_id UUID NOT NULL REFERENCES credit_cards(id) ON DELETE CASCADE,
  statement_date DATE NOT NULL,
  payment_due_date DATE NOT NULL,
  statement_balance_paise BIGINT NOT NULL CHECK (statement_balance_paise >= 0),
  minimum_due_paise BIGINT DEFAULT NULL CHECK (minimum_due_paise IS NULL OR minimum_due_paise >= 0),
  is_settled BOOLEAN NOT NULL DEFAULT FALSE,
  settled_at TIMESTAMPTZ DEFAULT NULL,
  settlement_transaction_id UUID DEFAULT NULL REFERENCES transactions(id) ON DELETE SET NULL,
  notes TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT credit_card_statements_date_order CHECK (payment_due_date >= statement_date),
  CONSTRAINT credit_card_statements_min_due CHECK (minimum_due_paise IS NULL OR minimum_due_paise <= statement_balance_paise),
  CONSTRAINT uq_credit_card_statements_card_cycle UNIQUE (credit_card_id, statement_date)
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_credit_card_statements_user_card
  ON credit_card_statements (user_id, credit_card_id, payment_due_date);

CREATE INDEX IF NOT EXISTS idx_credit_card_statements_due_date
  ON credit_card_statements (user_id, payment_due_date);

CREATE INDEX IF NOT EXISTS idx_credit_card_statements_settlement_tx
  ON credit_card_statements (settlement_transaction_id);

-- Enable Row Level Security
ALTER TABLE credit_card_statements ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users manage their own statements only
DROP POLICY IF EXISTS "Users can manage their own credit card statements" ON credit_card_statements;
CREATE POLICY "Users can manage their own credit card statements"
  ON credit_card_statements
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Role Grants
GRANT ALL ON TABLE credit_card_statements TO authenticated;
GRANT ALL ON TABLE credit_card_statements TO service_role;

-- Table and Column Documentation
COMMENT ON TABLE credit_card_statements IS 'Stores monthly credit card statements and billing cycle payment obligations.';
COMMENT ON COLUMN credit_card_statements.statement_date IS 'Billing cycle closing date (YYYY-MM-DD).';
COMMENT ON COLUMN credit_card_statements.payment_due_date IS 'Payment due date for this billing cycle (YYYY-MM-DD).';
COMMENT ON COLUMN credit_card_statements.statement_balance_paise IS 'Total statement amount payable in integer paise (includes billed EMIs, interest, fees, taxes).';
COMMENT ON COLUMN credit_card_statements.minimum_due_paise IS 'Optional minimum amount due in integer paise.';
COMMENT ON COLUMN credit_card_statements.is_settled IS 'True once the full statement balance has been repaid.';
COMMENT ON COLUMN credit_card_statements.settlement_transaction_id IS 'Optional foreign key to the transaction that settled this statement.';

-- Instruct PostgREST to reload schema cache immediately
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- Rollback Instructions:
-- To reverse this migration, execute:
-- DROP TABLE IF EXISTS credit_card_statements CASCADE;
-- NOTIFY pgrst, 'reload schema';
-- ============================================================================
