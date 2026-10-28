-- Migration: Add performance composite indexes for high-frequency financial query patterns
-- Description: Creates B-tree composite indexes on transactions, credit_cards, accounts,
--              emi_debts, and emi_payments to support fast filtered and ordered lookups by user_id.
-- Reversible: Execute the rollback script at the bottom of this file.
-- Note: Follows frontend/AGENTS.md guidelines. DO NOT EXECUTE ON PRODUCTION WITHOUT EXPLICIT USER AUTHORIZATION.

-- 1. Transactions Performance Indexes
-- Supports: .eq("user_id", userId).order("transaction_date", { ascending: false }).order("id", { ascending: false })
CREATE INDEX IF NOT EXISTS idx_transactions_user_date_desc
  ON transactions (user_id, transaction_date DESC, id DESC);

-- Supports: .eq("user_id", userId).eq("credit_card_id", cardId) & card outstanding balance calculations
CREATE INDEX IF NOT EXISTS idx_transactions_user_card_date
  ON transactions (user_id, credit_card_id, transaction_date ASC)
  WHERE credit_card_id IS NOT NULL;

-- Supports: .eq("user_id", userId).eq("account_id", accountId) & account balance calculations
CREATE INDEX IF NOT EXISTS idx_transactions_user_account_date
  ON transactions (user_id, account_id, transaction_date ASC)
  WHERE account_id IS NOT NULL;

-- Supports: .eq("user_id", userId).in("transaction_type", ["card_purchase", "card_payment"])
CREATE INDEX IF NOT EXISTS idx_transactions_user_type_date
  ON transactions (user_id, transaction_type, transaction_date ASC);

-- 2. Credit Cards Performance Indexes
-- Supports: .eq("user_id", userId).eq("is_archived", false).order("name")
CREATE INDEX IF NOT EXISTS idx_credit_cards_user_active
  ON credit_cards (user_id, is_archived, name);

-- 3. Financial Accounts Performance Indexes
-- Supports: .eq("user_id", userId).eq("is_archived", false).order("name")
CREATE INDEX IF NOT EXISTS idx_accounts_user_active
  ON accounts (user_id, is_archived, name);

-- 4. EMI Debts Performance Indexes
-- Supports: .eq("user_id", userId).eq("status", "active").order("next_due_date")
CREATE INDEX IF NOT EXISTS idx_emi_debts_user_status_due
  ON emi_debts (user_id, status, next_due_date ASC);

-- 5. EMI Payments Performance Indexes
-- Supports: .eq("user_id", userId).order("payment_date")
CREATE INDEX IF NOT EXISTS idx_emi_payments_user_date
  ON emi_payments (user_id, payment_date ASC);

-- Supports: .eq("debt_id", debtId).order("payment_date")
CREATE INDEX IF NOT EXISTS idx_emi_payments_debt_date
  ON emi_payments (debt_id, payment_date ASC);

-- Instruct PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- Rollback Instructions:
-- To reverse this migration, execute:
-- DROP INDEX IF EXISTS idx_transactions_user_date_desc;
-- DROP INDEX IF EXISTS idx_transactions_user_card_date;
-- DROP INDEX IF EXISTS idx_transactions_user_account_date;
-- DROP INDEX IF EXISTS idx_transactions_user_type_date;
-- DROP INDEX IF EXISTS idx_credit_cards_user_active;
-- DROP INDEX IF EXISTS idx_accounts_user_active;
-- DROP INDEX IF EXISTS idx_emi_debts_user_status_due;
-- DROP INDEX IF EXISTS idx_emi_payments_user_date;
-- DROP INDEX IF EXISTS idx_emi_payments_debt_date;
-- NOTIFY pgrst, 'reload schema';
-- ============================================================================
