-- Migration: Create transaction_templates and user_transaction_preferences tables
-- Description: Supports user-scoped transaction templates (create, edit, reuse, favorite, delete)
--              and persists remembered payment sources and pinned categories.
-- Reversible: Execute the rollback script at the bottom of this file.
-- Note: DO NOT EXECUTE ON PRODUCTION WITHOUT EXPLICIT USER AUTHORIZATION (Follows frontend/AGENTS.md guidelines).

-- ============================================================================
-- 1. Transaction Templates Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS transaction_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN ('income', 'expense')),
  amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
  category_name VARCHAR(80) NOT NULL,
  category_id UUID DEFAULT NULL REFERENCES categories(id) ON DELETE SET NULL,
  source_id VARCHAR(100) NOT NULL, -- e.g. "account:<uuid>" or "card:<uuid>"
  account_id UUID DEFAULT NULL REFERENCES accounts(id) ON DELETE SET NULL,
  credit_card_id UUID DEFAULT NULL REFERENCES credit_cards(id) ON DELETE SET NULL,
  description VARCHAR(255) NOT NULL DEFAULT '',
  memo TEXT DEFAULT NULL,
  is_favorite BOOLEAN NOT NULL DEFAULT FALSE,
  usage_count INT NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT check_template_income_never_card CHECK (
    transaction_type != 'income' OR (credit_card_id IS NULL AND source_id NOT LIKE 'card:%')
  )
);

-- Template Indexes
CREATE INDEX IF NOT EXISTS idx_transaction_templates_user_type
  ON transaction_templates (user_id, transaction_type);

CREATE INDEX IF NOT EXISTS idx_transaction_templates_user_fav
  ON transaction_templates (user_id, is_favorite DESC, updated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_transaction_templates_user_name_uniq
  ON transaction_templates (user_id, lower(trim(name)));

-- Enable RLS for Transaction Templates
ALTER TABLE transaction_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own transaction templates" ON transaction_templates;
CREATE POLICY "Users can manage their own transaction templates"
  ON transaction_templates
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- 2. User Transaction Preferences Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_transaction_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  last_expense_source_id VARCHAR(100) DEFAULT NULL,
  last_income_source_id VARCHAR(100) DEFAULT NULL,
  pinned_category_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  pinned_category_names TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT check_pref_income_never_card CHECK (
    last_income_source_id IS NULL OR last_income_source_id NOT LIKE 'card:%'
  )
);

-- Enable RLS for User Transaction Preferences
ALTER TABLE user_transaction_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own transaction preferences" ON user_transaction_preferences;
CREATE POLICY "Users can manage their own transaction preferences"
  ON user_transaction_preferences
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- 3. Trigger for updated_at Timestamp
-- ============================================================================
CREATE OR REPLACE FUNCTION update_transaction_templates_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_transaction_templates_updated_at ON transaction_templates;
CREATE TRIGGER trg_transaction_templates_updated_at
  BEFORE UPDATE ON transaction_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_transaction_templates_timestamp();

DROP TRIGGER IF EXISTS trg_user_transaction_preferences_updated_at ON user_transaction_preferences;
CREATE TRIGGER trg_user_transaction_preferences_updated_at
  BEFORE UPDATE ON user_transaction_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_transaction_templates_timestamp();

-- ============================================================================
-- ROLLBACK SCRIPT (Run only to reverse this migration)
-- ============================================================================
/*
DROP TRIGGER IF EXISTS trg_user_transaction_preferences_updated_at ON user_transaction_preferences;
DROP TRIGGER IF EXISTS trg_transaction_templates_updated_at ON transaction_templates;
DROP FUNCTION IF EXISTS update_transaction_templates_timestamp();
DROP TABLE IF EXISTS user_transaction_preferences CASCADE;
DROP TABLE IF EXISTS transaction_templates CASCADE;
*/
