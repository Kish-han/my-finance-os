-- Migration: Create recurring_schedules and recurring_occurrences tables
-- Description: Supports recurring income and expense templates, expected items, and reminders.
--              Expected occurrences do NOT alter balances until explicitly confirmed into transactions.
-- Reversible: Execute the rollback script at the bottom of this file.
-- Note: DO NOT EXECUTE ON PRODUCTION WITHOUT EXPLICIT USER AUTHORIZATION (Follows frontend/AGENTS.md guidelines).

-- ============================================================================
-- 1. Recurring Schedules Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS recurring_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name VARCHAR(160) NOT NULL,
  description TEXT DEFAULT NULL,
  transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN ('income', 'expense')),
  amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
  is_amount_variable BOOLEAN NOT NULL DEFAULT FALSE,
  account_id UUID DEFAULT NULL REFERENCES accounts(id) ON DELETE SET NULL,
  credit_card_id UUID DEFAULT NULL REFERENCES credit_cards(id) ON DELETE SET NULL,
  category_id UUID DEFAULT NULL REFERENCES categories(id) ON DELETE SET NULL,
  category_name VARCHAR(80) DEFAULT NULL,
  frequency VARCHAR(30) NOT NULL CHECK (
    frequency IN ('weekly', 'biweekly', 'monthly', 'bimonthly', 'quarterly', 'semiannually', 'yearly')
  ),
  day_of_month INT DEFAULT NULL CHECK (day_of_month IS NULL OR (day_of_month >= 1 AND day_of_month <= 31)),
  day_of_week INT DEFAULT NULL CHECK (day_of_week IS NULL OR (day_of_week >= 0 AND day_of_week <= 6)),
  start_date DATE NOT NULL,
  end_date DATE DEFAULT NULL,
  next_due_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'archived')),
  lead_days INT NOT NULL DEFAULT 3 CHECK (lead_days >= 0 AND lead_days <= 30),
  notes TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Guardrails: Income cannot be routed to a credit card
  CONSTRAINT chk_recurring_income_no_card CHECK (
    transaction_type = 'expense' OR credit_card_id IS NULL
  ),
  -- Either an account or a credit card must be linked
  CONSTRAINT chk_recurring_source_required CHECK (
    (account_id IS NOT NULL AND credit_card_id IS NULL) OR
    (account_id IS NULL AND credit_card_id IS NOT NULL)
  ),
  -- End date must be on or after start date if specified
  CONSTRAINT chk_recurring_date_range CHECK (
    end_date IS NULL OR end_date >= start_date
  )
);

-- Performance Indexes for Schedules
CREATE INDEX IF NOT EXISTS idx_recurring_schedules_user_status
  ON recurring_schedules (user_id, status, next_due_date);

CREATE INDEX IF NOT EXISTS idx_recurring_schedules_user_next_due
  ON recurring_schedules (user_id, next_due_date);

CREATE INDEX IF NOT EXISTS idx_recurring_schedules_account
  ON recurring_schedules (account_id);

CREATE INDEX IF NOT EXISTS idx_recurring_schedules_card
  ON recurring_schedules (credit_card_id);

-- Enable RLS for Schedules
ALTER TABLE recurring_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own recurring schedules" ON recurring_schedules;
CREATE POLICY "Users can manage their own recurring schedules"
  ON recurring_schedules
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT ALL ON TABLE recurring_schedules TO authenticated;
GRANT ALL ON TABLE recurring_schedules TO service_role;

-- ============================================================================
-- 2. Recurring Occurrences Table (Expected Items, Reminders & Confirmation History)
-- ============================================================================
CREATE TABLE IF NOT EXISTS recurring_occurrences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  schedule_id UUID NOT NULL REFERENCES recurring_schedules(id) ON DELETE CASCADE,
  due_date DATE NOT NULL,
  expected_amount_paise BIGINT NOT NULL CHECK (expected_amount_paise > 0),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'skipped')),
  snoozed_until_date DATE DEFAULT NULL,
  confirmed_transaction_id UUID DEFAULT NULL REFERENCES transactions(id) ON DELETE SET NULL,
  confirmed_amount_paise BIGINT DEFAULT NULL CHECK (confirmed_amount_paise IS NULL OR confirmed_amount_paise > 0),
  confirmed_at TIMESTAMPTZ DEFAULT NULL,
  notes TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Exactly one occurrence per schedule per due date to prevent duplicate reminders/items
  CONSTRAINT uq_recurring_occurrence_schedule_due UNIQUE (schedule_id, due_date),
  -- Snoozed date cannot precede original due date
  CONSTRAINT chk_recurring_occ_snooze CHECK (
    snoozed_until_date IS NULL OR snoozed_until_date >= due_date
  )
);

-- Performance Indexes for Occurrences
CREATE INDEX IF NOT EXISTS idx_recurring_occurrences_user_status_due
  ON recurring_occurrences (user_id, status, due_date);

CREATE INDEX IF NOT EXISTS idx_recurring_occurrences_schedule
  ON recurring_occurrences (schedule_id, due_date);

CREATE INDEX IF NOT EXISTS idx_recurring_occurrences_tx
  ON recurring_occurrences (confirmed_transaction_id);

-- Enable RLS for Occurrences
ALTER TABLE recurring_occurrences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own recurring occurrences" ON recurring_occurrences;
CREATE POLICY "Users can manage their own recurring occurrences"
  ON recurring_occurrences
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT ALL ON TABLE recurring_occurrences TO authenticated;
GRANT ALL ON TABLE recurring_occurrences TO service_role;

-- ============================================================================
-- 3. Comments and Documentation
-- ============================================================================
COMMENT ON TABLE recurring_schedules IS 'Defines recurring income and expense schedule templates (salary, rent, utilities, subscriptions).';
COMMENT ON COLUMN recurring_schedules.is_amount_variable IS 'True if expected amount fluctuates (e.g. utility bills) and requires user confirmation of actual amount.';
COMMENT ON COLUMN recurring_schedules.day_of_month IS 'Target day of month (1-31). Clamped safely to last day of shorter months (e.g. 31st -> 28/29 Feb, 30 Apr) without drift.';
COMMENT ON COLUMN recurring_schedules.lead_days IS 'Number of days in advance to highlight upcoming reminders.';

COMMENT ON TABLE recurring_occurrences IS 'Tracks discrete expected occurrences of recurring schedules. Only confirmed occurrences become actual transactions.';
COMMENT ON COLUMN recurring_occurrences.status IS 'pending (expected reminder), confirmed (financial transaction created), or skipped (occurrence ignored).';
COMMENT ON COLUMN recurring_occurrences.confirmed_transaction_id IS 'Foreign key link to the actual transaction created upon user confirmation.';

-- Instruct PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- Rollback Instructions:
-- To reverse this migration, execute:
-- DROP TABLE IF EXISTS recurring_occurrences CASCADE;
-- DROP TABLE IF EXISTS recurring_schedules CASCADE;
-- NOTIFY pgrst, 'reload schema';
-- ============================================================================
