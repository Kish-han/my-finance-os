-- Migration: Add schedule_source and official_schedule_metadata to emi_debts
-- Description: Enables persisting lender-provided authoritative repayment schedules alongside calculated estimates.
-- Reversible: Execute the rollback script at the bottom of this file.
-- Note: DO NOT EXECUTE ON PRODUCTION WITHOUT EXPLICIT USER AUTHORIZATION.

ALTER TABLE emi_debts
  ADD COLUMN IF NOT EXISTS schedule_source TEXT DEFAULT 'calculated_reducing_balance',
  ADD COLUMN IF NOT EXISTS official_schedule_metadata JSONB DEFAULT NULL;

-- Enforce allowed schedule sources
ALTER TABLE emi_debts
  DROP CONSTRAINT IF EXISTS emi_debts_schedule_source_check;

ALTER TABLE emi_debts
  ADD CONSTRAINT emi_debts_schedule_source_check
  CHECK (schedule_source IN ('calculated_reducing_balance', 'lender_authoritative'));

COMMENT ON COLUMN emi_debts.schedule_source IS 'Source of amortization schedule: calculated_reducing_balance or lender_authoritative';
COMMENT ON COLUMN emi_debts.official_schedule_metadata IS 'Lender-provided amortization schedule entries and day-count convention metadata (JSONB)';

-- ============================================================================
-- Rollback Instructions:
-- To reverse this migration, execute:
-- ALTER TABLE emi_debts
--   DROP CONSTRAINT IF EXISTS emi_debts_schedule_source_check,
--   DROP COLUMN IF EXISTS schedule_source,
--   DROP COLUMN IF EXISTS official_schedule_metadata;
-- ============================================================================
