-- Migration: Add optional additional charges to emi_debts
-- Description: Stores optional one-time fees (processing fee, EMI conversion charges, administrative fees) distinct from loan principal and interest.
-- Reversible: Execute the rollback script at the bottom of this file.
-- Note: DO NOT EXECUTE ON PRODUCTION WITHOUT EXPLICIT USER AUTHORIZATION.

ALTER TABLE emi_debts
  ADD COLUMN IF NOT EXISTS additional_charges_paise BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS charge_description TEXT DEFAULT NULL;

-- Enforce non-negative additional charges and maximum length for description
ALTER TABLE emi_debts
  DROP CONSTRAINT IF EXISTS emi_debts_additional_charges_paise_check;

ALTER TABLE emi_debts
  ADD CONSTRAINT emi_debts_additional_charges_paise_check
  CHECK (additional_charges_paise >= 0);

ALTER TABLE emi_debts
  DROP CONSTRAINT IF EXISTS emi_debts_charge_description_check;

ALTER TABLE emi_debts
  ADD CONSTRAINT emi_debts_charge_description_check
  CHECK (charge_description IS NULL OR char_length(charge_description) <= 120);

COMMENT ON COLUMN emi_debts.additional_charges_paise IS 'One-time or upfront additional charges (processing fee, conversion charges) in integer paise. Strictly isolated from principal and reducing-balance calculations.';
COMMENT ON COLUMN emi_debts.charge_description IS 'Optional description of the additional charge (e.g. Processing Fee, EMI Conversion Charges, Administrative Fee). Max 120 chars.';

-- ============================================================================
-- Rollback Instructions:
-- To reverse this migration, execute:
-- ALTER TABLE emi_debts
--   DROP CONSTRAINT IF EXISTS emi_debts_charge_description_check,
--   DROP CONSTRAINT IF EXISTS emi_debts_additional_charges_paise_check,
--   DROP COLUMN IF EXISTS charge_description,
--   DROP COLUMN IF EXISTS additional_charges_paise;
-- ============================================================================
