-- Migration: Create category_budgets and budget_alert_events tables
-- Description: Supports monthly category spending limits, progress tracking, and idempotent threshold alerts (50%, 80%, 100%).
-- Reversible: Execute the rollback script at the bottom of this file.
-- Note: DO NOT EXECUTE ON PRODUCTION WITHOUT EXPLICIT USER AUTHORIZATION (Follows frontend/AGENTS.md guidelines).

-- ============================================================================
-- 1. Category Budgets Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS category_budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_id UUID DEFAULT NULL REFERENCES categories(id) ON DELETE SET NULL,
  category_name VARCHAR(80) NOT NULL,
  amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
  month_key VARCHAR(7) DEFAULT NULL CHECK (month_key IS NULL OR month_key ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  alert_50 BOOLEAN NOT NULL DEFAULT TRUE,
  alert_80 BOOLEAN NOT NULL DEFAULT TRUE,
  alert_100 BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes and Constraints for Budgets
-- Default recurring budget uniqueness per category (when month_key is null)
CREATE UNIQUE INDEX IF NOT EXISTS idx_category_budgets_default_uniq
  ON category_budgets (user_id, lower(trim(category_name)))
  WHERE month_key IS NULL;

-- Month-specific override uniqueness per category and month
CREATE UNIQUE INDEX IF NOT EXISTS idx_category_budgets_month_uniq
  ON category_budgets (user_id, lower(trim(category_name)), month_key)
  WHERE month_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_category_budgets_user_active
  ON category_budgets (user_id, is_active);

CREATE INDEX IF NOT EXISTS idx_category_budgets_category_id
  ON category_budgets (category_id);

-- Enable RLS for Category Budgets
ALTER TABLE category_budgets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own category budgets" ON category_budgets;
CREATE POLICY "Users can manage their own category budgets"
  ON category_budgets
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- 2. Budget Alert Events Table (Idempotent Exactly-Once Threshold Alerts)
-- ============================================================================
CREATE TABLE IF NOT EXISTS budget_alert_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  budget_id UUID NOT NULL REFERENCES category_budgets(id) ON DELETE CASCADE,
  category_name VARCHAR(80) NOT NULL,
  month_key VARCHAR(7) NOT NULL CHECK (month_key ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  threshold_percent INT NOT NULL CHECK (threshold_percent IN (50, 80, 100)),
  spending_paise BIGINT NOT NULL,
  budget_paise BIGINT NOT NULL,
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
  acknowledged_at TIMESTAMPTZ DEFAULT NULL
);

-- Unique index prevents duplicate alerts for the same category, month, and threshold
CREATE UNIQUE INDEX IF NOT EXISTS idx_budget_alert_events_uniq
  ON budget_alert_events (user_id, lower(trim(category_name)), month_key, threshold_percent);

CREATE INDEX IF NOT EXISTS idx_budget_alert_events_user_month
  ON budget_alert_events (user_id, month_key, triggered_at DESC);

CREATE INDEX IF NOT EXISTS idx_budget_alert_events_budget_id
  ON budget_alert_events (budget_id);

-- Enable RLS for Budget Alert Events
ALTER TABLE budget_alert_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own budget alert events" ON budget_alert_events;
CREATE POLICY "Users can manage their own budget alert events"
  ON budget_alert_events
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- ROLLBACK SCRIPT (Run only to cleanly revert this migration)
-- ============================================================================
-- DROP POLICY IF EXISTS "Users can manage their own budget alert events" ON budget_alert_events;
-- DROP POLICY IF EXISTS "Users can manage their own category budgets" ON category_budgets;
-- DROP TABLE IF EXISTS budget_alert_events;
-- DROP TABLE IF EXISTS category_budgets;
